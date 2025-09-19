module.exports = {
  // URL yapılandırması
  TRENDYOL_YEMEK_URL: 'https://www.trendyolyemek.com',
  
  // Timeout süreleri (milisaniye)
  WAIT_TIMEOUT: 30000,
  SEARCH_TIMEOUT: 15000,
  CLICK_TIMEOUT: 5000,
  
  // Fiyat kategorileri
  PRICE_CATEGORIES: {
    CHEAP: 'ucuz',
    MEDIUM: 'orta',
    EXPENSIVE: 'pahalı'
  },
  
  // Scraping ayarları
  MAX_RESTAURANTS: 10, // Analiz edilecek maksimum restoran sayısı (varsayılan)
  MAX_PRODUCTS_PER_RESTAURANT: 100, // Her restorandan kontrol edilecek maksimum ürün
  MIN_VALID_PRICE: 10, // Minimum geçerli fiyat (TL) - Daha düşük fiyatlar hatalı olabilir
  MAX_VALID_PRICE: 2000, // Maximum geçerli fiyat (TL) - Daha yüksek fiyatlar hatalı olabilir
  
  // Browser ayarları
  HEADLESS: false, // Geliştirme sırasında false, production'da true yapın
  SLOW_MO: 100, // Milisaniye cinsinden yavaşlatma (0 = yavaşlatma yok)
  
  // Debug ayarları
  DEBUG_MODE: true, // Debug logları ve screenshot'lar için
  TAKE_SCREENSHOTS: true, // Her adımda screenshot al
  
  // Retry ayarları
  MAX_RETRIES: 3, // Başarısız işlemler için maksimum deneme sayısı
  RETRY_DELAY: 2000, // Denemeler arası bekleme süresi (ms)
  
  // Adres seçimi bekleme süresi
  ADDRESS_SELECTION_WAIT: 15000, // 15 saniye
  
  // Pizza anahtar kelimeleri (ürün filtreleme için)
  PIZZA_KEYWORDS: [
    'pizza', 'margarita', 'margherita', 'peynirli', 
    'sucuklu', 'karışık', 'vejetaryen', 'pepperoni',
    'hawaiian', 'bbq', 'quattro', 'marinara', 'tonno',
    'mexicano', 'chicken', 'mantarlı', 'sosisli',
    'salamlı', 'italiano', 'special', 'özel'
  ],
  
  // Selector öncelik listesi
  SELECTORS: {
    // Arama kutusu selector'ları
    SEARCH_BOX: [
      'input[placeholder*="ara"]',
      'input[placeholder*="Ara"]',
      'input[type="search"]',
      'input[class*="search"]',
      'input[data-testid*="search"]',
      '[role="searchbox"]',
      'input[name*="search"]',
      'input[aria-label*="ara"]'
    ],
    
    // Restoran kartı selector'ları
    RESTAURANT_CARD: [
      '[class*="RestaurantCard"]',
      '[class*="restaurant-card"]',
      '[class*="vendor-card"]',
      '[class*="merchant-card"]',
      'article',
      '[role="article"]',
      'a[href*="/restaurant/"]',
      'a[href*="/restoran/"]',
      'a[href*="/merchant/"]'
    ],
    
    // Ürün kartı selector'ları
    PRODUCT_CARD: [
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      '[class*="menu-item"]',
      '[class*="food-item"]',
      '[class*="dish-card"]',
      'article[class*="product"]',
      '[data-testid*="product"]',
      '[data-testid*="menu-item"]'
    ],
    
    // Fiyat selector'ları
    PRICE: [
      'span[class*="price"]',
      'div[class*="price"]',
      'p[class*="price"]',
      '[class*="amount"]',
      'span:has-text("₺")',
      'span:has-text("TL")'
    ],
    
    // Sepete ekle butonu selector'ları
    ADD_TO_CART: [
      'button[class*="add"]',
      'button:has-text("Sepete Ekle")',
      'button:has-text("Ekle")',
      'button:has-text("Add")',
      'button:has(svg)',
      '[data-testid*="add-to-cart"]',
      '[data-testid*="add-button"]'
    ]
  }
};