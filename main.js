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

    logInfo(`🍕 Aranacak yemek: ${FOOD_NAME}`);
    logInfo(`💰 Fiyat kategorisi: ${PRICE_CATEGORY}`);

    logInfo('🍕 Trendyol Yemek Scraper Başlatılıyor...');

    // 1. Sistemi başlat
    await scraper.initialize();

    // 1.5. Giriş yap (gerekli ise)
    logInfo('🔐 Giriş kontrolü yapılıyor...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      logError('Giriş yapılamadı, devam edilemiyor');
      return;
    }

    logInfo('🎉 Giriş başarılı!');
    logInfo('🏠 Lütfen adresinizi manuel olarak seçin...');
    logInfo('⏳ Adres seçiminiz tamamlandıktan sonra otomatik olarak devam edecek...');

    // Adres seçiminin tamamlanmasını bekle (manuel)
    await delay(15000); // 15 saniye bekle, kullanıcı adres seçsin
    logInfo('🔍 Adres seçimi tamamlandı, arama başlatılıyor...');

    // 2. Yemek ara
    const searchSuccess = await scraper.searchFood(FOOD_NAME);
    if (!searchSuccess) {
      throw new Error('Arama başarısız');
    }
    
    // 3. Restoran fiyatlarını çek
    const restaurants = await scraper.getRestaurantPrices(FOOD_NAME);
    if (restaurants.length === 0) {
      throw new Error('Hiç restoran bulunamadı');
    }
    
    // 4. Kategori bazında restoran seç
    const selectedRestaurant = await scraper.selectRestaurant(PRICE_CATEGORY, restaurants);
    if (!selectedRestaurant) {
      throw new Error('Restoran seçilemedi');
    }
    
    // 5. Sepete ekle
    const addedToCart = await scraper.addToCart();
    if (!addedToCart) {
      throw new Error('Sepete ekleme başarısız');
    }
    
    // 6. Ödeme sayfasına git
    await scraper.goToCheckout();
    
    // 7. Sonuçları kaydet
    const results = restaurants.map(r => ({
      foodName: r.foodName,
      productName: r.name,
      restaurantName: r.restaurantName,
      price: r.price,
      category: r === selectedRestaurant ? PRICE_CATEGORY : 'ucuz',
      timestamp: getCurrentTime()
    }));
    
    await saveResults(results);
    
    logInfo('✅ İşlem başarıyla tamamlandı!');
    
  } catch (error) {
    logError('❌ Ana işlem hatası:', error);
  } finally {
    await scraper.close();
  }
}

// Scripti çalıştır
runFoodScraper();