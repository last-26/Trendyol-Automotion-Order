require('dotenv').config();
const { chromium } = require('playwright');
const config = require('./config');
const { analyzePrices, saveResults } = require('./priceAnalyzer');
const { delay, logInfo, logError } = require('./utils');
const fs = require('fs-extra');

class TrendyolYemekScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookiesAccepted = false;
    this.debugMode = true;
    this.allProducts = []; // Tüm restoranlardan toplanan ürünler

    // Process exit handlers
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => {
      logInfo('⚠️  Program kapatılıyor...');
      this.cleanup();
      process.exit(0);
    });
  }

  cleanup() {
    try {
      if (process.stdin && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      if (this.browser) {
        this.browser.close().catch(() => {});
      }
    } catch (error) {
      // Cleanup hatası varsa görmezden gel
    }
  }

  async initialize() {
    try {
      this.browser = await chromium.launch({
        headless: config.HEADLESS,
        slowMo: 100,
        args: ['--disable-blink-features=AutomationControlled']
      });

      this.page = await this.browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'tr-TR'
      });

      // Console mesajlarını dinle
      this.page.on('console', msg => {
        if (this.debugMode && !msg.text().includes('Failed')) {
          console.log('PAGE LOG:', msg.text());
        }
      });

      // API yanıtlarını dinle
      this.page.on('response', response => {
        if (response.url().includes('api') && response.url().includes('search')) {
          logInfo(`API Response: ${response.url()} - Status: ${response.status()}`);
        }
      });

      logInfo('🌐 Trendyol Yemek\'e bağlanılıyor...');

      await this.page.goto(config.TRENDYOL_YEMEK_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      const title = await this.page.title();
      logInfo(`✅ Sayfa açıldı - Başlık: ${title}`);

      await this.acceptCookies();
      return true;

    } catch (error) {
      logError('Initialize hatası:', error);
      throw error;
    }
  }

  async acceptCookies() {
    try {
      if (this.cookiesAccepted) return true;

      logInfo('🍪 Çerez banner\'ı kontrol ediliyor...');
      
      const cookieSelectors = [
        'button:has-text("Kabul Et")',
        'button:has-text("Tümünü Kabul Et")',
        'button:has-text("Tamam")',
        '[data-testid*="accept"]',
        '[class*="accept-all"]'
      ];

      for (const selector of cookieSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            logInfo(`✅ Çerezler kabul edildi`);
            this.cookiesAccepted = true;
            await delay(1000);
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      logInfo('ℹ️ Çerez banner\'ı bulunamadı');
      return false;

    } catch (error) {
      logError('Çerez kabul hatası:', error);
      return false;
    }
  }

  async login() {
    try {
      logInfo('🔐 Giriş işlemi başlatılıyor...');

      const loginButton = await this.page.locator('a:has-text("Giriş"), button:has-text("Giriş Yap")').first();
      await loginButton.click();
      await delay(2000);

      const email = process.env.TRENDYOL_EMAIL;
      const password = process.env.TRENDYOL_PASSWORD;

      if (!email || !password) {
        logError('❌ E-posta ve şifre .env dosyasında tanımlanmamış!');
        return false;
      }

      const emailInput = await this.page.locator('input[type="email"], input[type="text"]').first();
      await emailInput.fill(email);
      await emailInput.press('Enter');
      await delay(2000);

      const passwordInput = await this.page.locator('input[type="password"]').first();
      await passwordInput.fill(password);
      await passwordInput.press('Enter');
      
      await delay(5000);

      const currentUrl = this.page.url();
      if (!currentUrl.includes('login')) {
        logInfo('✅ Giriş başarılı!');
        return true;
      }

      return false;

    } catch (error) {
      logError('Login hatası:', error);
      return false;
    }
  }

  async searchFood(foodName) {
    try {
      logInfo(`🔍 "${foodName}" araması başlatılıyor...`);

      // Arama kutusunu bul
      const searchSelectors = [
        'input[placeholder*="ara"]',
        'input[placeholder*="Ara"]',
        'input[type="search"]',
        'input[class*="search"]',
        'input[data-testid*="search"]',
        '[role="searchbox"]'
      ];

      let searchBox = null;
      for (const selector of searchSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            searchBox = element;
            logInfo(`Arama kutusu bulundu: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!searchBox) {
        logError('Arama kutusu bulunamadı!');
        return false;
      }

      // Arama yap
      await searchBox.click();
      await searchBox.clear();
      await searchBox.fill(foodName);
      await delay(500);
      await searchBox.press('Enter');

      // Sonuçların yüklenmesini bekle
      logInfo('⏳ Arama sonuçları yükleniyor...');
      await delay(3000); // API yanıtı için bekle

      // URL kontrolü
      const currentUrl = this.page.url();
      logInfo(`📍 Mevcut URL: ${currentUrl}`);

      return true;

    } catch (error) {
      logError(`Arama hatası:`, error);
      return false;
    }
  }

  async getAllRestaurantsData(foodName, maxRestaurants = 10) {
    try {
      logInfo(`🏪 Birden fazla restoran analiz ediliyor (max: ${maxRestaurants})...`);

      // Restoran kartlarını bul
      const restaurantSelectors = [
        '[class*="card"]:has(img)',
        '[class*="RestaurantCard"]',
        '[class*="restaurant-card"]',
        '[class*="vendor-card"]',
        'article',
        'a[href*="/restaurant/"]',
        'a[href*="/restoran/"]'
      ];

      let restaurantCards = [];
      for (const selector of restaurantSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          if (elements.length > 0) {
            restaurantCards = elements;
            logInfo(`✅ ${elements.length} restoran kartı bulundu (${selector})`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (restaurantCards.length === 0) {
        logError('Hiç restoran kartı bulunamadı');
        return [];
      }

      const restaurantsToCheck = Math.min(restaurantCards.length, maxRestaurants);
      logInfo(`📊 ${restaurantsToCheck} restoran kontrol edilecek`);

      // Her restoran için veri topla
      for (let i = 0; i < restaurantsToCheck; i++) {
        try {
          logInfo(`\n🏪 Restoran ${i + 1}/${restaurantsToCheck} açılıyor...`);

          // Restoran kartına tıkla
          await restaurantCards[i].click();
          await delay(3000); // Sayfa yüklenmesini bekle

          // Restoran adını al
          const restaurantName = await this.getRestaurantName();
          logInfo(`📍 Restoran: ${restaurantName}`);

          // Bu restorandaki ürünleri çek
          const products = await this.getRestaurantPrices(foodName);
          
          if (products.length > 0) {
            logInfo(`✅ ${products.length} ürün bulundu`);
            
            // Tüm ürünlere restoran indeksini ekle (sıralama için)
            products.forEach(product => {
              product.restaurantIndex = i + 1;
            });
            
            // Ana listeye ekle
            this.allProducts = [...this.allProducts, ...products];
          } else {
            logInfo(`⚠️ Bu restoranda uygun ürün bulunamadı`);
          }

          // Arama sonuçlarına geri dön
          await this.page.goBack();
          await delay(2000);

          // Restoran kartlarını yeniden yükle (DOM değişmiş olabilir)
          restaurantCards = await this.page.locator(restaurantSelectors[0]).all();

        } catch (restaurantError) {
          logError(`Restoran ${i + 1} hatası:`, restaurantError.message);
          
          // Hata durumunda ana sayfaya dön
          try {
            await this.page.goto(this.page.url().split('?')[0] + `?searchQuery=${encodeURIComponent(foodName)}`);
            await delay(2000);
            restaurantCards = await this.page.locator(restaurantSelectors[0]).all();
          } catch (navError) {
            logError('Navigasyon hatası:', navError.message);
          }
        }
      }

      logInfo(`\n📊 TOPLAM: ${this.allProducts.length} ürün ${restaurantsToCheck} restorandan toplandı`);
      
      return this.allProducts;

    } catch (error) {
      logError('Restoran veri toplama hatası:', error);
      return this.allProducts;
    }
  }

  async getRestaurantPrices(foodName) {
    try {
      logInfo('📊 Ürün fiyatları çekiliyor...');
      
      const products = [];
      const restaurantName = await this.getRestaurantName();
      
      // Ürün kartlarını bul
      const productSelectors = [
        'div[class*="item"]:has(button)',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        '[class*="menu-item"]',
        '[class*="food-item"]',
        'article[class*="product"]',
        '[data-testid*="product"]'
      ];

      let productElements = [];
      for (const selector of productSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          if (elements.length > 0) {
            productElements = elements;
            logInfo(`📦 ${elements.length} ürün kartı bulundu`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Her ürünü kontrol et
      for (let i = 0; i < Math.min(productElements.length, 30); i++) {
        try {
          const product = productElements[i];
          
          // Ürün adını çek
          const nameSelectors = ['h3', 'h4', 'h5', '[class*="name"]', '[class*="title"]'];
          let productName = '';
          
          for (const selector of nameSelectors) {
            try {
              const nameEl = product.locator(selector).first();
              if (await nameEl.isVisible({ timeout: 500 })) {
                productName = await nameEl.textContent();
                if (productName) break;
              }
            } catch (e) {
              continue;
            }
          }

          // Fiyatı çek
          const priceSelectors = [
            'span[class*="price"]',
            'div[class*="price"]',
            'p[class*="price"]',
            '[class*="amount"]',
            'span:has-text("₺")',
            'span:has-text("TL")'
          ];
          
          let price = null;
          for (const selector of priceSelectors) {
            try {
              const priceEl = product.locator(selector).first();
              if (await priceEl.isVisible({ timeout: 500 })) {
                const priceText = await priceEl.textContent();
                price = this.extractPrice(priceText);
                if (price) break;
              }
            } catch (e) {
              continue;
            }
          }

          // Pizza ile ilgili ürünleri filtrele
          if (productName && price) {
            const isPizzaRelated = this.isPizzaProduct(productName, foodName);
            
            if (isPizzaRelated) {
              products.push({
                name: productName.trim(),
                price: price,
                restaurantName: restaurantName,
                foodName: foodName,
                element: product
              });
              
              logInfo(`  ✅ ${productName}: ${price} ₺`);
            }
          }
          
        } catch (productError) {
          // Ürün hatası sessizce geç
        }
      }

      return products;

    } catch (error) {
      logError('Fiyat çekme hatası:', error);
      return [];
    }
  }

  async getRestaurantName() {
    const nameSelectors = [
      'h1',
      '[class*="restaurant-name"]',
      '[class*="vendor-name"]',
      '[class*="merchant-name"]',
      'header h1',
      'header h2'
    ];

    for (const selector of nameSelectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          const name = await element.textContent();
          if (name) return name.trim();
        }
      } catch (e) {
        continue;
      }
    }
    
    return 'Bilinmeyen Restoran';
  }

  isPizzaProduct(productName, searchTerm) {
    const name = productName.toLowerCase();
    const search = searchTerm.toLowerCase();
    
    // Arama terimini içeriyor mu?
    if (name.includes(search)) return true;
    
    // Margarita varyasyonları
    if (search.includes('margarita')) {
      if (name.includes('margarita') || name.includes('margherita') || 
          name.includes('margerita') || name.includes('margareta')) {
        return true;
      }
    }
    
    // Genel pizza kelimeleri
    const pizzaKeywords = [
      'pizza', 'margarita', 'margherita', 'peynirli', 
      'sucuklu', 'karışık', 'vejetaryen', 'pepperoni',
      'hawaiian', 'bbq', 'quattro', 'marinara', 'special'
    ];
    
    return pizzaKeywords.some(keyword => name.includes(keyword));
  }

  extractPrice(priceText) {
    if (!priceText) return null;
    
    // Temizle
    priceText = priceText.replace(/[^\d,\.]/g, '');
    priceText = priceText.replace(',', '.');
    
    const price = parseFloat(priceText);
    return isNaN(price) ? null : price;
  }

  async selectAndAddToCart(category) {
    try {
      if (!this.allProducts || this.allProducts.length === 0) {
        logError('Seçilecek ürün yok');
        return null;
      }

      // En ucuz ürünü bul
      const analysis = analyzePrices(this.allProducts);
      let targetProduct;

      switch (category) {
        case config.PRICE_CATEGORIES.CHEAP:
          targetProduct = analysis.cheapest;
          break;
        case config.PRICE_CATEGORIES.MEDIUM:
          targetProduct = analysis.medium;
          break;
        case config.PRICE_CATEGORIES.EXPENSIVE:
          targetProduct = analysis.expensive;
          break;
        default:
          targetProduct = analysis.cheapest;
      }

      if (!targetProduct) {
        logError('Hedef ürün bulunamadı');
        return null;
      }

      logInfo(`\n🎯 ${category.toUpperCase()} KATEGORİSİ SEÇİLDİ:`);
      logInfo(`📍 Restoran: ${targetProduct.restaurantName}`);
      logInfo(`🍕 Ürün: ${targetProduct.name}`);
      logInfo(`💰 Fiyat: ${targetProduct.price} ₺`);
      logInfo(`📊 Sıralama: ${targetProduct.restaurantIndex}. restoran`);

      // En ucuz ürünün olduğu restorana git
      logInfo(`\n🔄 En uygun fiyatlı restorana gidiliyor...`);
      
      // Önce arama sayfasına dön
      const searchUrl = `https://www.trendyolyemek.com/arama?searchQuery=${encodeURIComponent(targetProduct.foodName)}`;
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await delay(3000);

      // Hedef restoranı bul ve tıkla
      const restaurantCards = await this.page.locator('[class*="card"]:has(img)').all();
      
      if (restaurantCards.length >= targetProduct.restaurantIndex) {
        await restaurantCards[targetProduct.restaurantIndex - 1].click();
        await delay(3000);

        logInfo('✅ Hedef restoran açıldı, ürün aranıyor...');

        // Ürünü bul ve sepete ekle
        const productCards = await this.page.locator('div[class*="item"]:has(button)').all();
        
        for (const card of productCards) {
          try {
            const nameEl = await card.locator('h3, h4, h5').first();
            const name = await nameEl.textContent();
            
            if (name && name.trim() === targetProduct.name) {
              // Sepete ekle butonunu bul
              const addButton = await card.locator('button').first();
              await addButton.click();
              logInfo('✅ Ürün sepete eklendi!');
              await delay(2000);
              return targetProduct;
            }
          } catch (e) {
            continue;
          }
        }
      }

      logError('Ürün sepete eklenemedi');
      return targetProduct; // Yine de analiz için döndür

    } catch (error) {
      logError('Sepete ekleme hatası:', error);
      return null;
    }
  }

  async goToCheckout() {
    try {
      logInfo('🛒 Sepete gidiliyor...');
      
      const cartSelectors = [
        '[class*="cart"]',
        '[class*="basket"]',
        'button[class*="cart"]',
        'a[href*="cart"]',
        'a[href*="sepet"]'
      ];

      for (const selector of cartSelectors) {
        try {
          const cartButton = this.page.locator(selector).first();
          if (await cartButton.isVisible({ timeout: 2000 })) {
            await cartButton.click();
            await delay(3000);
            
            const checkoutButton = this.page.locator('button:has-text("Ödeme"), button:has-text("Devam")').first();
            if (await checkoutButton.isVisible({ timeout: 5000 })) {
              await checkoutButton.click();
              logInfo('✅ Ödeme sayfasına yönlendirildi');
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      return false;
      
    } catch (error) {
      logError('Checkout hatası:', error);
      return false;
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logInfo('🔒 Tarayıcı kapatıldı');
      }
    } catch (error) {
      logError('Kapatma hatası:', error);
    } finally {
      this.cleanup();
    }
  }
}

module.exports = TrendyolYemekScraper;