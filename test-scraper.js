// test-scraper.js - Adım adım test için
require('dotenv').config();
const TrendyolYemekScraper = require('./src/scraper');
const { logInfo, logError, delay } = require('./src/utils');

async function testScraper() {
  const scraper = new TrendyolYemekScraper();
  
  try {
    logInfo('🧪 TEST MODU BAŞLATILDI');
    logInfo('=' .repeat(50));
    
    // Test 1: Başlatma
    logInfo('\n📌 Test 1: Tarayıcı başlatılıyor...');
    await scraper.initialize();
    logInfo('✅ Tarayıcı başarıyla başlatıldı');
    
    // Test 2: Giriş
    logInfo('\n📌 Test 2: Giriş yapılıyor...');
    const loginSuccess = await scraper.login();
    if (loginSuccess) {
      logInfo('✅ Giriş başarılı');
    } else {
      throw new Error('Giriş başarısız');
    }
    
    // Test 3: Adres seçimi bekle
    logInfo('\n📌 Test 3: Adres seçimi bekleniyor...');
    logInfo('⏳ Lütfen 15 saniye içinde adresinizi seçin...');
    await delay(15000);
    logInfo('✅ Adres seçimi tamamlandı varsayılıyor');
    
    // Test 4: Arama
    logInfo('\n📌 Test 4: Pizza araması yapılıyor...');
    const searchTerm = process.env.TRENDYOL_FOOD_SEARCH || 'margarita pizza';
    const searchSuccess = await scraper.searchFood(searchTerm);
    
    if (searchSuccess) {
      logInfo('✅ Arama başarılı');
    } else {
      logError('❌ Arama başarısız');
      
      // Alternatif: Manuel arama
      logInfo('💡 İpucu: Manuel olarak arama yapıp bir restorana tıklayabilirsiniz');
      logInfo('⏳ 20 saniye bekleniyor...');
      await delay(20000);
    }
    
    // Test 5: Ürün fiyatlarını çek
    logInfo('\n📌 Test 5: Ürün fiyatları çekiliyor...');
    const products = await scraper.getRestaurantPrices(searchTerm);
    
    if (products.length > 0) {
      logInfo(`✅ ${products.length} ürün bulundu`);
      
      // İlk 5 ürünü göster
      logInfo('\n📊 Bulunan ürünler:');
      products.slice(0, 5).forEach((product, index) => {
        logInfo(`  ${index + 1}. ${product.name}: ${product.price} ₺`);
      });
      
      // Fiyat analizi
      const prices = products.map(p => p.price).sort((a, b) => a - b);
      logInfo('\n💰 Fiyat Analizi:');
      logInfo(`  En Ucuz: ${prices[0]} ₺`);
      logInfo(`  En Pahalı: ${prices[prices.length - 1]} ₺`);
      logInfo(`  Ortalama: ${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)} ₺`);
      
    } else {
      logError('❌ Hiç ürün bulunamadı');
      
      // Debug için sayfadaki tüm metni al
      logInfo('\n🔍 Debug: Sayfa içeriği kontrol ediliyor...');
      const pageText = await scraper.page.evaluate(() => document.body.innerText);
      
      if (pageText.includes('pizza') || pageText.includes('Pizza')) {
        logInfo('ℹ️ Sayfada "pizza" kelimesi geçiyor ama ürün çekilemedi');
        logInfo('💡 Selector\'lar güncellenmeli olabilir');
      }
      
      // Screenshot al
      await scraper.page.screenshot({ path: 'test-debug.png' });
      logInfo('📸 Debug screenshot: test-debug.png');
    }
    
    // Test 6: DOM Yapısını Analiz Et
    logInfo('\n📌 Test 6: DOM yapısı analiz ediliyor...');
    
    // Tüm button'ları bul
    const buttons = await scraper.page.locator('button').all();
    logInfo(`  Button sayısı: ${buttons.length}`);
    
    // Tüm linkleri bul
    const links = await scraper.page.locator('a[href]').all();
    logInfo(`  Link sayısı: ${links.length}`);
    
    // Class içinde "product" geçenleri bul
    const productElements = await scraper.page.locator('[class*="product" i]').all();
    logInfo(`  "product" class'lı element sayısı: ${productElements.length}`);
    
    // Class içinde "price" geçenleri bul
    const priceElements = await scraper.page.locator('[class*="price" i]').all();
    logInfo(`  "price" class'lı element sayısı: ${priceElements.length}`);
    
    // İlk 3 price elementi göster
    if (priceElements.length > 0) {
      logInfo('\n💰 İlk 3 fiyat elementi:');
      for (let i = 0; i < Math.min(3, priceElements.length); i++) {
        try {
          const text = await priceElements[i].textContent();
          logInfo(`  ${i + 1}. ${text}`);
        } catch (e) {
          logInfo(`  ${i + 1}. Okunamadı`);
        }
      }
    }
    
    logInfo('\n' + '='.repeat(50));
    logInfo('🎉 TEST TAMAMLANDI');
    logInfo('=' .repeat(50));
    
  } catch (error) {
    logError('❌ Test hatası:', error.message);
    
    // Hata durumunda screenshot
    if (scraper.page) {
      await scraper.page.screenshot({ path: 'test-error.png' });
      logInfo('📸 Hata screenshot: test-error.png');
    }
    
  } finally {
    // Test sonunda tarayıcıyı açık bırak (debug için)
    logInfo('\n⏸️ Tarayıcı 30 saniye açık kalacak (inceleme için)...');
    await delay(30000);
    
    await scraper.close();
    logInfo('🔒 Test sonlandırıldı');
  }
}

// Test'i çalıştır
testScraper().catch(error => {
  logError('❌ Test çalıştırma hatası:', error);
  process.exit(1);
});