# Trendyol Yemek Otomatik Sipariş Sistemi 🍕

Bu proje Trendyol Yemek platformunda otomatik yemek siparişi verebilmenizi sağlar.

## 🚀 Özellikler

- 🔐 Otomatik giriş sistemi (2FA desteği)
- 🍪 Otomatik çerez yönetimi
- 🏠 Adres seçimi
- 🔍 Akıllı yemek arama
- 📊 Fiyat karşılaştırma
- 🛒 Otomatik sepete ekleme
- 📝 CSV sonuçları
- 🧪 Playwright testleri

## 🛠️ Kullanılan Teknolojiler

- **Node.js** - Runtime environment
- **Playwright** - Browser automation
- **dotenv** - Environment variables
- **csv-writer** - CSV export
- **fs-extra** - File operations

## 📋 Gereksinimler

- Node.js (v16+)
- npm veya yarn
- Trendyol Yemek hesabı
- Playwright (otomatik yüklenir)

## ⚡ Hızlı Kurulum

1. **Projeyi klonlayın:**
```bash
git clone https://github.com/last-26/Trendyol-Automotion-Order.git
cd trendyol-yemek-scraper
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Playwright browser'ları yükleyin:**
```bash
npx playwright install
```

4. **Environment değişkenlerini ayarlayın:**
`.env` dosyasını oluşturun:
```bash
TRENDYOL_EMAIL=sizin_email@example.com
TRENDYOL_PASSWORD=sizin_sifreniz
TRENDYOL_FOOD_SEARCH=margarita pizza
TRENDYOL_PRICE_CATEGORY=ucuz
```

5. **Programı çalıştırın:**
```bash
node main.js
```

## 🧪 Testler (Opsiyonel)

Projede Playwright testleri mevcuttur. Testleri çalıştırmak için:

```bash
# Tüm testleri çalıştır
npx playwright test

# Testleri UI modunda çalıştır
npx playwright test --ui

# Test sonuçlarını gör
npx playwright show-report
```

## 🔧 Yapılandırma

### Environment Variables

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `TRENDYOL_EMAIL` | Trendyol e-posta adresi | `user@example.com` |
| `TRENDYOL_PASSWORD` | Trendyol şifresi | `password123` |
| `TRENDYOL_FOOD_SEARCH` | Aranacak yemek | `pizza` |
| `TRENDYOL_PRICE_CATEGORY` | Fiyat kategorisi | `ucuz`, `orta`, `pahalı` |

### Manuel Adres Seçimi

Program adres seçimi sırasında 15 saniye bekler. Bu süre içinde istediğiniz adresi manuel olarak seçebilirsiniz.

## 📊 Sonuçlar

Program çalıştırıldıktan sonra sonuçlar `data/results.csv` dosyasına kaydedilir:

```csv
Aranan Yemek,Ürün Adı,Restoran Adı,Fiyat (₺),Kategori,Tarih
margarita pizza,Margarita Pizza,Pizza House,45.50,ucuz,2025-01-18
```

## 🛠️ Gelişmiş Kullanım

### Farklı Yemek Arama
```javascript
// main.js'te FOOD_NAME değişkenini değiştirin
const FOOD_NAME = 'hamburger'; // Veya 'döner', 'lahmacun' vb.
```

### Farklı Fiyat Kategorisi
```javascript
const PRICE_CATEGORY = 'orta'; // 'ucuz', 'orta', 'pahalı'
```

### Headless Mode
```javascript
// config.js'te
HEADLESS: true // Tarayıcıyı gizle
```

### Playwright Yapılandırması

`playwright.config.js` dosyasında test ayarları bulunur:

```javascript
module.exports = defineConfig({
  testDir: './tests',              // Test klasörü
  timeout: 60000,                  // Test timeout'u
  retries: 2,                      // Başarısız test retry sayısı
  use: {
    headless: false,               // Test sırasında tarayıcı görünür
    screenshot: 'only-on-failure', // Sadece başarısız testlerde screenshot
    video: 'retain-on-failure'     // Başarısız testlerde video kaydet
  }
});
```

## 🔐 Güvenlik

- ⚠️ `.env` dosyasını asla Git'e yüklemeyin
- ⚠️ Hassas bilgilerinizi kimseyle paylaşmayın
- ⚠️ `.gitignore` dosyasında gerekli kurallar mevcut

## 📞 Destek

Herhangi bir sorun yaşarsanız:

1. `.env` dosyasının doğru yapılandırıldığından emin olun
2. İnternet bağlantınızın stabil olduğunu kontrol edin
3. Trendyol Yemek hesabınızın aktif olduğunu doğrulayın

## 📄 Lisans

Bu proje açık kaynak kodludur ve MIT lisansı altında yayınlanmıştır.

---

**Not:** Bu araç eğitim amaçlı geliştirilmiştir. Trendyol Yemek'in kullanım şartlarına uygun şekilde kullanın.
