# Trendyol Yemek Fiyat Analiz ve Otomatik Sepet Aracı 🍕

Trendyol Yemek üzerinde seçtiğiniz ürünü (ör. margarita pizza) arayıp açık restoranları gezer, eşleşen ürünlerin fiyatlarını toplar, sonuçları CSV olarak kaydeder ve seçtiğiniz fiyat kategorisine göre ürünü sepete eklemeyi dener.

## ⚡ Hızlı Kurulum

1. Projeyi klonlayın
```bash
git clone https://github.com/last-26/Trendyol-Automotion-Order.git
cd trendyol-yemek-scraper
```

2. Bağımlılıkları yükleyin
```bash
npm install
```

3. Playwright tarayıcılarını yükleyin
```bash
npx playwright install
```

4. .env dosyasını oluşturun ve düzenleyin
```bash
# .env
TRENDYOL_EMAIL=sizin_email@example.com
TRENDYOL_PASSWORD=sizin_sifreniz
TRENDYOL_FOOD_SEARCH=margarita pizza
TRENDYOL_PRICE_CATEGORY=ucuz   # ucuz | orta | pahalı
MAX_RESTAURANTS=10             # (opsiyonel) kontrol edilecek restoran sayısı
```

5. Uygulamayı çalıştırın
```bash
npm start
# veya
node main.js
```

Not: Girişten sonra adres seçimi için yaklaşık 15 saniye bekleme bulunur; bu sürede adresinizi manuel seçmeniz gerekir.

## 🔧 Yapılandırma (Özet)

- `TRENDYOL_EMAIL` ve `TRENDYOL_PASSWORD`: Giriş bilgileri
- `TRENDYOL_FOOD_SEARCH`: Aranacak yemek (örn: pizza, hamburger)
- `TRENDYOL_PRICE_CATEGORY`: `ucuz`, `orta` veya `pahalı`
- `MAX_RESTAURANTS`: Kaç restoranın gezileceği (varsayılan 10)

## 📊 Sonuçlar

- Çalıştırma sonunda sonuçlar `data/results.csv` içine yazılır.
- Örnek başlıklar: `Aranan Yemek, Ürün Adı, Restoran Adı, Fiyat (₺), Kategori, Tarih`

## 🛠️ İpuçları

- Görünür tarayıcı istemiyorsanız `src/config.js` içinde `HEADLESS: true` yapabilirsiniz.
- Varsayılan yavaşlatmayı (`SLOW_MO`) azaltarak işlemleri hızlandırabilirsiniz.

## ⚠️ Uyarılar

- `.env` dosyasını repoya yüklemeyin.
- Hesap güvenliğiniz için bilgilerinizi üçüncü kişilerle paylaşmayın.
- Bu araç yalnızca eğitim/deney amaçlıdır; kullanırken platform kurallarına uyun.
