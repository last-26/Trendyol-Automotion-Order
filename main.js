require('dotenv').config();
const TrendyolYemekScraper = require('./src/scraper');
const { saveResults } = require('./src/priceAnalyzer');
const { logInfo, logError, getCurrentTime, delay } = require('./src/utils');

async function runFoodScraper() {
  const scraper = new TrendyolYemekScraper();

  try {
    // Environment variable'lardan bilgileri al
    const FOOD_NAME = process.env.TRENDYOL_FOOD_SEARCH || 'margarita pizza';
    const PRICE_CATEGORY = process.env.TRENDYOL_PRICE_CATEGORY || 'ucuz';
    const MAX_RESTAURANTS = parseInt(process.env.MAX_RESTAURANTS) || 10;

    logInfo(`🍕 Aranacak yemek: ${FOOD_NAME}`);
    logInfo(`💰 Fiyat kategorisi: ${PRICE_CATEGORY}`);
    logInfo(`🏪 Maksimum restoran sayısı: ${MAX_RESTAURANTS}`);
    logInfo('🚀 Trendyol Yemek Scraper Başlatılıyor...');

    // 1. Sistemi başlat
    await scraper.initialize();

    // 2. Giriş yap
    logInfo('🔐 Giriş kontrolü yapılıyor...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      logError('❌ Giriş yapılamadı, devam edilemiyor');
      return;
    }

    logInfo('✅ Giriş başarılı!');
    logInfo('🏠 Lütfen adresinizi manuel olarak seçin...');
    logInfo('⏳ 15 saniye içinde adres seçiminizi tamamlayın...');

    // Adres seçimi için bekleme (manuel işlem)
    await delay(15000);
    logInfo('🔍 Adres seçimi tamamlandı varsayılıyor, devam ediliyor...');

    // 3. Yemek ara
    let searchSuccess = await scraper.searchFood(FOOD_NAME);
    if (!searchSuccess) {
      logError('❌ İlk arama denemesi başarısız');
      
      // Sayfa yenile ve tekrar dene
      logInfo('🔄 Sayfa yenileniyor...');
      await scraper.page.reload({ waitUntil: 'domcontentloaded' });
      await delay(3000);
      
      searchSuccess = await scraper.searchFood(FOOD_NAME);
      if (!searchSuccess) {
        throw new Error('Arama başarısız - tüm yöntemler denendi');
      }
    }
    
    logInfo('✅ Arama başarılı!');
    
    // 4. TÜM RESTORANLARI DOLAŞ VE FİYAT VERİLERİNİ TOPLA
    logInfo('\n' + '='.repeat(50));
    logInfo('📊 TÜM RESTORANLAR ANALİZ EDİLİYOR...');
    logInfo('='.repeat(50));
    
    const allProducts = await scraper.getAllRestaurantsData(FOOD_NAME, MAX_RESTAURANTS);
    
    if (allProducts.length === 0) {
      throw new Error('Hiçbir restoranda ürün bulunamadı');
    }
    
    // 5. En uygun ürünü seç ve sepete ekle
    const selectedProduct = await scraper.selectAndAddToCart(PRICE_CATEGORY);
    
    // 6. Ödeme sayfasına git (opsiyonel)
    if (selectedProduct) {
      const checkoutSuccess = await scraper.goToCheckout();
      if (checkoutSuccess) {
        logInfo('✅ Ödeme sayfasına yönlendirildi');
      }
    }
    
    // 7. Sonuçları kaydet
    const results = allProducts.map(product => ({
      foodName: product.foodName,
      productName: product.name,
      restaurantName: product.restaurantName,
      price: product.price,
      category: product === selectedProduct ? PRICE_CATEGORY : 
                product.price <= selectedProduct?.price * 1.1 ? 'ucuz' :
                product.price <= selectedProduct?.price * 1.5 ? 'orta' : 'pahalı',
      timestamp: getCurrentTime()
    }));
    
    await saveResults(results);
    
    // 8. DETAYLI RAPOR
    logInfo('\n' + '='.repeat(60));
    logInfo('📊 DETAYLI ANALİZ RAPORU');
    logInfo('='.repeat(60));
    logInfo(`🔍 Aranan Yemek: ${FOOD_NAME}`);
    logInfo(`🏪 Kontrol Edilen Restoran Sayısı: ${Math.max(...allProducts.map(p => p.restaurantIndex || 1))}`);
    logInfo(`📦 Toplam Eşleşen Ürün Sayısı: ${allProducts.length}`);
    
    if (allProducts.length > 0) {
      const prices = allProducts.map(p => p.price).sort((a, b) => a - b);
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      
      logInfo('\n💰 FİYAT İSTATİSTİKLERİ:');
      logInfo(`  En Ucuz: ${prices[0]} ₺`);
      logInfo(`  En Pahalı: ${prices[prices.length - 1]} ₺`);
      logInfo(`  Ortalama: ${avgPrice.toFixed(2)} ₺`);
      logInfo(`  Medyan: ${prices[Math.floor(prices.length / 2)]} ₺`);
      
      // En ucuz 5 ürün
      logInfo('\n🏆 EN UCUZ 5 MARGARITA PIZZA:');
      const cheapest5 = [...allProducts].sort((a, b) => a.price - b.price).slice(0, 5);
      cheapest5.forEach((product, index) => {
        logInfo(`  ${index + 1}. ${product.price} ₺ - ${product.name}`);
        logInfo(`     📍 ${product.restaurantName}`);
      });
      
      // Restoran bazlı özet
      logInfo('\n🏪 RESTORAN BAZLI ÖZET:');
      const restaurantSummary = {};
      allProducts.forEach(product => {
        if (!restaurantSummary[product.restaurantName]) {
          restaurantSummary[product.restaurantName] = {
            products: [],
            minPrice: Infinity,
            maxPrice: 0,
            avgPrice: 0
          };
        }
        restaurantSummary[product.restaurantName].products.push(product);
        restaurantSummary[product.restaurantName].minPrice = 
          Math.min(restaurantSummary[product.restaurantName].minPrice, product.price);
        restaurantSummary[product.restaurantName].maxPrice = 
          Math.max(restaurantSummary[product.restaurantName].maxPrice, product.price);
      });
      
      // Ortalama fiyatları hesapla ve sırala
      Object.keys(restaurantSummary).forEach(restaurantName => {
        const summary = restaurantSummary[restaurantName];
        summary.avgPrice = summary.products.reduce((sum, p) => sum + p.price, 0) / summary.products.length;
      });
      
      // En ucuz ortalamaya sahip 5 restoran
      const sortedRestaurants = Object.entries(restaurantSummary)
        .sort((a, b) => a[1].avgPrice - b[1].avgPrice)
        .slice(0, 5);
      
      sortedRestaurants.forEach(([restaurantName, summary]) => {
        logInfo(`  ${restaurantName}:`);
        logInfo(`    Ürün Sayısı: ${summary.products.length}`);
        logInfo(`    Fiyat Aralığı: ${summary.minPrice} - ${summary.maxPrice} ₺`);
        logInfo(`    Ortalama: ${summary.avgPrice.toFixed(2)} ₺`);
      });
      
      if (selectedProduct) {
        logInfo('\n✨ SEÇİLEN ÜRÜN:');
        logInfo(`  🍕 Ürün: ${selectedProduct.name}`);
        logInfo(`  💰 Fiyat: ${selectedProduct.price} ₺`);
        logInfo(`  📍 Restoran: ${selectedProduct.restaurantName}`);
        logInfo(`  🏆 Kategori: ${PRICE_CATEGORY.toUpperCase()}`);
        
        // Kaç TL tasarruf sağlandı?
        const savings = prices[prices.length - 1] - selectedProduct.price;
        const savingsPercent = (savings / prices[prices.length - 1] * 100).toFixed(1);
        logInfo(`  💵 Tasarruf: ${savings.toFixed(2)} ₺ (%${savingsPercent})`);
      }
    }
    
    logInfo('='.repeat(60));
    logInfo('✅ İşlem başarıyla tamamlandı!');
    logInfo(`📁 Sonuçlar data/results.csv dosyasına kaydedildi`);
    
  } catch (error) {
    logError('❌ Ana işlem hatası:', error.message);
    
    // Hata durumunda debug screenshot
    if (scraper.page) {
      try {
        await scraper.page.screenshot({ path: 'error-screenshot.png' });
        logInfo('📸 Hata screenshot\'ı: error-screenshot.png');
      } catch (screenshotError) {
        // Screenshot hatası önemsiz
      }
    }
  } finally {
    // Tarayıcıyı kapat
    await delay(5000); // Sonuçları görmek için bekle
    await scraper.close();
  }
}

// Programı başlat
runFoodScraper().catch(error => {
  logError('❌ Program çalıştırma hatası:', error);
  process.exit(1);
});