require('dotenv').config();
const { chromium } = require('playwright');
const config = require('./config');
const { analyzePrices, saveResults } = require('./priceAnalyzer');
const { delay, logInfo, logError } = require('./utils');

class TrendyolYemekScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookiesAccepted = false; // Çerez banner'ı bir kez algılandıktan sonra devre dışı

    // Process exit'te cleanup yap
    process.on('exit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      logInfo('⚠️  Program kapatılıyor...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logInfo('⚠️  Program sonlandırılıyor...');
      this.cleanup();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logError('❌ Beklenmeyen hata:', error);
      this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logError('❌ İşlenmemiş Promise hatası:', reason);
      this.cleanup();
      process.exit(1);
    });
  }

  cleanup() {
    try {
      // Raw mode'dan çık
      if (process.stdin && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }

      // Browser'ı kapat
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
        slowMo: 50 // Yavaş çalışma için
      });

      // Daha gerçekçi user agent ile sayfa oluştur
      this.page = await this.browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        locale: 'tr-TR'
      });

      // Network dinleme (API çağrılarını yakalamak için)
      await this.page.route('**/*', route => {
        if (route.request().url().includes('api/restaurants')) {
          logInfo('Restaurant API call intercepted:', route.request().url());
        }
        route.continue();
      });

      // Sayfaya bağlanmayı dene - farklı timeout stratejileri ile
      logInfo('🌐 Trendyol Yemek\'e bağlanılıyor...');

      // Ağ bağlantısını test et
      try {
        const response = await this.page.request.get('https://www.google.com');
        if (!response.ok()) {
          logInfo('⚠️ Ağ bağlantısı zayıf olabilir');
        }
      } catch (networkError) {
        logInfo('⚠️ Ağ bağlantısı kontrol edilemedi, devam ediliyor...');
      }

      const connectStrategies = [
        { waitUntil: 'load', timeout: 45000, name: 'load' },
        { waitUntil: 'domcontentloaded', timeout: 30000, name: 'domcontentloaded' },
        { waitUntil: 'networkidle', timeout: 60000, name: 'networkidle' },
        { waitUntil: 'commit', timeout: 20000, name: 'commit' }
      ];

      let connected = false;

      for (let i = 0; i < connectStrategies.length; i++) {
        const strategy = connectStrategies[i];

        try {
          logInfo(`🔄 Bağlantı denemesi ${i + 1}/${connectStrategies.length} (${strategy.name})...`);

          await this.page.goto(config.TRENDYOL_YEMEK_URL, {
            waitUntil: strategy.waitUntil,
            timeout: strategy.timeout
          });

          // Sayfa yüklenip yüklenmediğini kontrol et
          const title = await this.page.title();
          if (title && title.length > 0) {
            logInfo(`✅ Trendyol Yemek sayfası açıldı (${strategy.name}) - Başlık: ${title}`);
            connected = true;
            break;
          } else {
            throw new Error('Sayfa başlığı alınamadı');
          }

        } catch (error) {
          logInfo(`⚠️ ${strategy.name} stratejisi başarısız: ${error.message}`);

          if (i < connectStrategies.length - 1) {
            logInfo('⏳ Bir sonraki strateji deneniyor...');
            await delay(2000);
          }
        }
      }

      if (!connected) {
        throw new Error('❌ Tüm bağlantı stratejileri başarısız oldu');
      }

      // Çerez banner'ını kabul et
      await this.acceptCookies();

    } catch (error) {
      logError('Initialize hatası:', error);
      throw error;
    }
  }

  async acceptCookies() {
    try {
      // Eğer çerezler zaten kabul edilmişse tekrar kontrol etme
      if (this.cookiesAccepted) {
        return true;
      }

      logInfo('🍪 Çerez banner\'ı kontrol ediliyor...');

      // Sayfanın altına kaydır (çerez banner'ı genellikle altta olur)
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await delay(500);

      // Alternatif: Yavaş yavaş kaydır
      await this.page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
      await delay(1000);

      // Çerez kabul butonlarını ara
      const cookieSelectors = [
        // Temel kabul butonları
        'button:has-text("Tümünü Kabul Et")',
        'button:has-text("Kabul Et")',
        'button:has-text("Accept All")',
        'button:has-text("Hepsi")',
        'button:has-text("Tamam")',
        'button:has-text("Kabul Et ve Devam Et")',
        'button:has-text("Devam Et")',

        // Özelleştirme seçenekleri
        'button:has-text("Bu Deneyimi Özelleştirin")',
        'button:has-text("Tüm Çerezleri Kabul Et")',
        'button:has-text("Çerezleri Kabul Et")',
        'button:has-text("Çerez Kabul")',

        // Yaygın data-testid'ler
        '[data-testid="accept-all-cookies"]',
        '[data-testid="accept-cookies"]',
        '[data-testid="cookie-accept-all"]',
        '[data-testid="cookie-consent-accept"]',
        '[data-testid="gdpr-accept-all"]',

        // CSS class selector'ları
        '.cookie-accept-all',
        '.accept-all-cookies',
        '.cookie-consent-accept',
        '.gdpr-accept-all',
        '.cookie-banner-accept',
        '.consent-accept-all',
        '.accept-all-button',

        // Aria-label selector'ları
        '[aria-label*="kabul"]',
        '[aria-label*="accept"]',
        '[aria-label*="çerez"]',
        '[aria-label*="cookie"]',
        '[aria-label*="hepsi"]',
        '[aria-label*="all"]',

        // Genel selector'lar
        'button[class*="accept"]',
        'a[class*="accept"]',
        'button[id*="accept"]',
        'a[id*="accept"]',
        'button[data-action*="accept"]',
        'button[data-cy*="accept"]',

        // Footer/bottom banner selector'ları
        '.cookie-footer-accept',
        '.bottom-cookie-accept',
        '.cookie-bottom-banner button',
        '.gdpr-footer-accept'
      ];

      let cookieButton = null;
      for (const selector of cookieSelectors) {
        try {
          cookieButton = this.page.locator(selector).first();
          if (await cookieButton.isVisible({ timeout: 3000 })) {
            // Butona tıklamadan önce görünür hale getir
            await cookieButton.scrollIntoViewIfNeeded();
            await delay(200);

            await cookieButton.click();
            logInfo(`✅ Çerezler kabul edildi (${selector})`);
            this.cookiesAccepted = true; // Çerezler kabul edildi flag'ı
            await delay(1000);
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Çerez banner popup'ını kapatmayı dene (sadece çerez ile ilgili olanlar)
      const closeSelectors = [
        // Sadece çerez banner'ı için spesifik close butonları
        'button:has-text("×").cookie-close',
        'button:has-text("✕").cookie-close',
        'button:has-text("X").cookie-close',
        'button:has-text("Kapat").cookie-banner',
        'button:has-text("Close").gdpr',
        'button[class*="cookie-banner-close"]',
        'button[class*="gdpr-close"]',
        'button[data-testid*="cookie-close"]',
        '.cookie-banner-close',
        '.gdpr-close',
        '.cookie-close-button',
        '.consent-close',
        '[aria-label*="cookie-close"]',
        '[aria-label*="gdpr-close"]',
        '[data-action*="cookie-close"]',
        '[data-cy*="cookie-close"]'
      ];

      for (const selector of closeSelectors) {
        try {
          const closeButton = this.page.locator(selector).first();
          if (await closeButton.isVisible({ timeout: 2000 })) {
            await closeButton.click();
            logInfo(`✅ Çerez banner\'ı kapatıldı (${selector})`);
            this.cookiesAccepted = true; // Çerez banner'ı kapatıldıysa da flag'ı true yap
            await delay(1000);
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      logInfo('ℹ️ Çerez banner\'ı bulunamadı veya zaten kabul edilmiş');
      return false;

    } catch (error) {
      logError('Çerez kabul hatası:', error);
      return false;
    }
  }

  async login() {
    try {
      logInfo('🔐 Giriş işlemi başlatılıyor...');

      // Giriş butonunu bul ve tıkla
      const loginSelectors = [
        '[data-testid="login-button"]',
        'a:has-text("Giriş")',
        'button:has-text("Giriş Yap")',
        '.login-button',
        '[data-testid="header-login"]',
        'a[href*="login"]',
        'button[class*="login"]'
      ];

      let loginButton = null;
      for (const selector of loginSelectors) {
        try {
          loginButton = this.page.locator(selector).first();
          await loginButton.waitFor({ timeout: 2000 });
          break;
        } catch (e) {
          continue;
        }
      }

      if (!loginButton) {
        logError('Giriş butonu bulunamadı');
        return false;
      }

      await loginButton.click();
      logInfo('Giriş butonuna tıklandı');

      // Sayfa yüklenmesini bekle
      await delay(2000);

      // Kullanıcıdan giriş bilgilerini al
      const readline = require('readline');

      // Environment variable'lardan bilgileri al
      const email = process.env.TRENDYOL_EMAIL;
      const password = process.env.TRENDYOL_PASSWORD;

      if (!email || !password) {
        logError('❌ TRENDYOL_EMAIL ve TRENDYOL_PASSWORD environment variable\'ları tanımlanmamış!');
        logError('📝 .env dosyasına şu değişkenleri ekleyin:');
        logError('   TRENDYOL_EMAIL=your_email@example.com');
        logError('   TRENDYOL_PASSWORD=your_password');
        return false;
      }

      logInfo(`📧 Kullanıcı: ${email}`);
      logInfo('🔒 Şifre yüklendi (gizli)');

      // Promise yapısını koru
      return new Promise(async (resolve) => {

          try {
            // E-posta/telefon giriş alanını bul
            const emailSelectors = [
              'input[type="email"]',
              'input[placeholder*="mail"]',
              'input[placeholder*="telefon"]',
              'input[name*="email"]',
              'input[name*="phone"]',
              'input[id*="email"]',
              'input[id*="phone"]',
              'input[class*="email"]',
              'input[class*="phone"]'
            ];

            let emailInput = null;
            for (const selector of emailSelectors) {
              try {
                emailInput = this.page.locator(selector).first();
                await emailInput.waitFor({ timeout: 2000 });
                break;
              } catch (e) {
                continue;
              }
            }

            if (!emailInput) {
              logError('E-posta/telefon giriş alanı bulunamadı');
              resolve(false);
              return;
            }

            // E-posta/telefonu gir
            await emailInput.fill(email);
            await emailInput.press('Enter'); // Enter ile devam et
            logInfo('E-posta/telefon girildi');

            await delay(2000);

            // Şifre alanını bul
            const passwordSelectors = [
              'input[type="password"]',
              'input[placeholder*="şifre"]',
              'input[name*="password"]',
              'input[id*="password"]',
              'input[class*="password"]'
            ];

            let passwordInput = null;
            for (const selector of passwordSelectors) {
              try {
                passwordInput = this.page.locator(selector).first();
                await passwordInput.waitFor({ timeout: 2000 });
                break;
              } catch (e) {
                continue;
              }
            }

            if (!passwordInput) {
              logError('Şifre giriş alanı bulunamadı');
              resolve(false);
              return;
            }

            await passwordInput.fill(password);
            logInfo('Şifre girildi');

            // Giriş yap butonunu bul ve tıkla
            const submitSelectors = [
              'button:has-text("Giriş")',
              'button:has-text("Oturum Aç")',
              'button[type="submit"]',
              '[data-testid="submit-login"]',
              'button[class*="submit"]',
              'button[class*="login"]',
              'input[type="submit"]'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
              try {
                submitButton = this.page.locator(selector).first();
                await submitButton.waitFor({ timeout: 2000 });
                break;
              } catch (e) {
                continue;
              }
            }

            if (submitButton) {
              await submitButton.click();
            } else {
              // Submit butonu bulunamazsa Enter'a bas
              await passwordInput.press('Enter');
            }

            logInfo('Giriş butonuna tıklandı');

            // Giriş işleminin tamamlanmasını bekle (2FA için daha uzun)
            await delay(8000);

            // 2FA kontrolü - daha uzun bekleme süresi ile
            logInfo('🔄 2FA kontrolü yapılıyor...');

            const twoFactorSelectors = [
              'input[placeholder*="kod"]',
              'input[name*="code"]',
              'input[id*="code"]',
              'input[class*="code"]',
              'input[placeholder*="doğrulama"]',
              'input[name*="verification"]',
              'input[placeholder*="sms"]',
              'input[placeholder*="mail"]',
              'input[type="text"][maxlength="6"]' // Genellikle 6 haneli kod
            ];

            let twoFactorInput = null;
            let twoFactorFound = false;

            // 2FA input'unu 30 saniye boyunca ara (daha uzun bekleme)
            for (let i = 0; i < 30; i++) {
              for (const selector of twoFactorSelectors) {
                try {
                  const element = this.page.locator(selector).first();
                  if (await element.isVisible({ timeout: 500 })) {
                    twoFactorInput = element;
                    twoFactorFound = true;
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
              if (twoFactorFound) break;

              await delay(500); // 500ms bekle ve tekrar dene
            }

            if (twoFactorFound && twoFactorInput) {
              logInfo('🔐 2FA kodu gerekli - lütfen kodunuzu girin');
              logInfo('⏳ 2FA input alanı hazır, kodunuzu girebilirsiniz...');

              // 2FA input alanının tamamen yüklenmesini bekle
              await delay(3000);

              try {
                // 2FA kodu için maskeli input
                const maskTwoFactorCode = () => {
                  return new Promise((resolve, reject) => {
                    try {
                      process.stdout.write('📱 2FA kodunu girin (SMS/e-posta): ');

                      const stdin = process.stdin;
                      const stdout = process.stdout;

                      // Raw mode'u güvenli şekilde ayarla
                      stdin.setRawMode(true);
                      stdin.resume();
                      stdin.setEncoding('utf8');

                      let codeChars = [];

                      const onData = (char) => {
                        try {
                          char = char + '';

                          switch(char) {
                            case '\n':
                            case '\r':
                              // Raw mode'dan çık
                              stdin.setRawMode(false);
                              stdin.pause();
                              stdin.removeListener('data', onData);
                              stdout.write('\n');

                              const code = codeChars.join('');
                              if (code.length > 0) {
                                resolve(code);
                              } else {
                                reject(new Error('2FA kodu boş'));
                              }
                              break;
                            case '\u0003': // Ctrl+C
                              stdin.setRawMode(false);
                              stdin.pause();
                              stdin.removeListener('data', onData);
                              stdout.write('\n');
                              reject(new Error('2FA girişi iptal edildi'));
                              break;
                            case '\u0008': // Backspace
                            case '\u007f': // Delete
                              if (codeChars.length > 0) {
                                codeChars.pop();
                                stdout.write('\b \b');
                              }
                              break;
                            default:
                              // Sadece rakam ve harf karakterleri kabul et
                              if (char && char.length === 1 && /[a-zA-Z0-9]/.test(char)) {
                                codeChars.push(char);
                                stdout.write('*');
                              }
                              break;
                          }
                        } catch (charError) {
                          reject(charError);
                        }
                      };

                      // Timeout ekle - 5 dakika (daha güvenli)
                      const timeout = setTimeout(() => {
                        stdin.setRawMode(false);
                        stdin.pause();
                        stdin.removeListener('data', onData);
                        stdout.write('\n');
                        reject(new Error('2FA kodu girişi zaman aşımına uğradı'));
                      }, 300000); // 5 dakika

                      stdin.on('data', onData);

                      // Promise tamamlandığında timeout'u temizle
                      const originalResolve = resolve;
                      const originalReject = reject;

                      resolve = (value) => {
                        clearTimeout(timeout);
                        originalResolve(value);
                      };

                      reject = (error) => {
                        clearTimeout(timeout);
                        originalReject(error);
                      };

                    } catch (setupError) {
                      reject(setupError);
                    }
                  });
                };

                const twoFactorCode = await maskTwoFactorCode();
                logInfo(`2FA kodu alındı (${twoFactorCode.length} karakter)`);

                // 2FA input'unu tekrar kontrol et (hala mevcut mu?)
                if (await twoFactorInput.isVisible({ timeout: 2000 })) {
                  await twoFactorInput.fill(twoFactorCode);
                  logInfo('2FA kodu girildi');

                  // Doğrula butonunu bul ve tıkla
                  const verifySelectors = [
                    'button:has-text("Doğrula")',
                    'button:has-text("Onayla")',
                    'button:has-text("Gönder")',
                    'button:has-text("Devam")',
                    '[data-testid="verify"]',
                    'button[type="submit"]',
                    'input[type="submit"]'
                  ];

                  let verifyButton = null;
                  for (const selector of verifySelectors) {
                    try {
                      verifyButton = this.page.locator(selector).first();
                      if (await verifyButton.isVisible({ timeout: 1000 })) {
                        break;
                      }
                    } catch (e) {
                      continue;
                    }
                  }

                  if (verifyButton) {
                    await verifyButton.click();
                    logInfo('Doğrula butonuna tıklandı');
                  } else {
                    // Enter ile gönder
                    await twoFactorInput.press('Enter');
                    logInfo('Enter ile gönderildi');
                  }

                  // 2FA doğrulama sonrası bekle
                  await delay(3000);

                  // Giriş başarılı mı kontrol et
                  const isLoggedIn = await this.checkLoginStatus();

                  if (isLoggedIn) {
                    logInfo('✅ Giriş başarılı! Diğer işlemlere devam ediliyor...');
                    resolve(true);
                  } else {
                    logError('❌ 2FA doğrulaması başarısız');
                    resolve(false);
                  }
                } else {
                  logError('❌ 2FA input alanı kayboldu');
                  resolve(false);
                }

              } catch (twoFactorError) {
                logError('❌ 2FA işlemi hatası:', twoFactorError.message);

                // Raw mode'dan çıkmayı garantile
                try {
                  process.stdin.setRawMode(false);
                  process.stdin.pause();
                } catch (cleanupError) {
                  // Cleanup hatası varsa görmezden gel
                }

                resolve(false);
              }
            } else {
              // 2FA olmadan giriş başarılı mı kontrol et
              await delay(3000);
              const isLoggedIn = await this.checkLoginStatus();

              if (isLoggedIn) {
                logInfo('✅ Giriş başarılı! Diğer işlemlere devam ediliyor...');
                resolve(true);
              } else {
                logError('❌ Giriş başarısız');
                resolve(false);
              }
            }

          } catch (loginError) {
            logError('Giriş işlemi hatası:', loginError);
            resolve(false);
          }
        });

    } catch (error) {
      logError('Login fonksiyonu hatası:', error);
      return false;
    }
  }

  async checkLoginStatus() {
    try {
      // Sayfa URL'ini kontrol et - login sayfası mı değil mi?
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
        return false;
      }

      // Hata mesajlarını kontrol et
      const errorSelectors = [
        '[data-testid="error-message"]',
        '.error-message',
        '.login-error',
        'div:has-text("Hatalı")',
        'div:has-text("yanlış")',
        'div:has-text("geçersiz")'
      ];

      for (const selector of errorSelectors) {
        try {
          const errorElement = this.page.locator(selector).first();
          if (await errorElement.isVisible({ timeout: 1000 })) {
            return false;
          }
        } catch (e) {
          continue;
        }
      }

      // Kullanıcı profili elementlerini kontrol et
      const profileSelectors = [
        '[data-testid="user-profile"]',
        '.user-menu',
        '.account-menu',
        '[data-testid="user-avatar"]',
        '.user-avatar',
        'a:has-text("Hesabım")',
        'a:has-text("Profil")',
        '[data-testid="account"]',
        '.account-link'
      ];

      for (const selector of profileSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Çıkış butonunu kontrol et
      const logoutSelectors = [
        '[data-testid="logout"]',
        'a:has-text("Çıkış")',
        'button:has-text("Çıkış")',
        'a:has-text("Oturumu Kapat")',
        'button:has-text("Oturumu Kapat")'
      ];

      for (const selector of logoutSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Arama kutusu veya ana sayfa elementlerini kontrol et
      const mainPageSelectors = [
        '[data-testid="search-input"]',
        'input[placeholder*="ara"]',
        '.search-input',
        '[data-testid="main-content"]',
        '.restaurant-list',
        '.vendor-list'
      ];

      for (const selector of mainPageSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      return false;
    } catch (error) {
      logError('Login durumu kontrol hatası:', error);
      return false;
    }
  }

  async selectAddress(addressName = 'Eskişehir Ev') {
    try {
      logInfo('🏠 Kayıtlı adres seçimi başlatılıyor...');

      // Sayfa yüklenmesini bekle
      await delay(2000);

      // Kayıtlı adresler sekmesini ara
      const addressTabSelectors = [
        '[data-testid="saved-addresses"]',
        'button:has-text("Kayıtlı Adresler")',
        'a:has-text("Kayıtlı Adresler")',
        '.saved-addresses',
        '.address-tab',
        '[data-testid="address-selection"]',
        '.address-modal'
      ];

      let addressTab = null;
      for (const selector of addressTabSelectors) {
        try {
          addressTab = this.page.locator(selector).first();
          if (await addressTab.isVisible({ timeout: 3000 })) {
            await addressTab.click();
            logInfo('Kayıtlı adresler sekmesine tıklandı');
            await delay(500);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Eğer adres sekmesi otomatik açılmamışsa, adres seçiciyi ara
      if (!addressTab) {
        const addressSelectorSelectors = [
          '[data-testid="address-selector"]',
          '.address-selector',
          'button:has-text("Adres Seç")',
          '.location-selector',
          '[data-testid="location-picker"]'
        ];

        for (const selector of addressSelectorSelectors) {
          try {
            const element = this.page.locator(selector).first();
            if (await element.isVisible({ timeout: 2000 })) {
              await element.click();
              logInfo('Adres seçici açıldı');
              await delay(500);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Eskişehir Ev adresini ara ve seç
      const eskişehirEvSelectors = [
        `text="${addressName}"`,
        `button:has-text("${addressName}")`,
        `a:has-text("${addressName}")`,
        `[data-testid*="address"]:has-text("${addressName}")`,
        `.address-item:has-text("${addressName}")`,
        `[data-testid="address-option"]:has-text("${addressName}")`
      ];

      let addressSelected = false;
      for (const selector of eskişehirEvSelectors) {
        try {
          const addressElement = this.page.locator(selector).first();
          if (await addressElement.isVisible({ timeout: 2000 })) {
            await addressElement.click();
            logInfo(`✅ "${addressName}" adresi seçildi`);
            addressSelected = true;
            await delay(1000);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!addressSelected) {
        logError(`❌ "${addressName}" adresi bulunamadı`);
        return false;
      }

      // Adres seçiminin başarılı olup olmadığını kontrol et
      await delay(1000);

      // Adres seçildikten sonra sayfada arama kutusu görünüyor mu kontrol et
      const searchSelectors = [
        '[data-testid="search-input"]',
        'input[placeholder*="ara"]',
        '.search-input'
      ];

      for (const selector of searchSelectors) {
        try {
          const searchElement = this.page.locator(selector).first();
          if (await searchElement.isVisible({ timeout: 3000 })) {
            logInfo('✅ Adres seçimi başarılı, arama kutusu görünüyor');
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Alternatif olarak ana sayfa elementlerini kontrol et
      const mainPageSelectors = [
        '[data-testid="main-content"]',
        '.restaurant-list',
        '.vendor-list',
        '.home-content'
      ];

      for (const selector of mainPageSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            logInfo('✅ Adres seçimi başarılı, ana sayfa yüklendi');
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      logError('❌ Adres seçimi sonrası sayfa yüklenemedi');
      return false;

    } catch (error) {
      logError('Adres seçimi hatası:', error);
      return false;
    }
  }

  async searchFood(foodName) {
    try {
      logInfo(`"${foodName}" araması başlatılıyor...`);

      // Arama kutusunu bul ve yemeği yaz
      const searchBox = this.page.locator('[data-testid="search-input"], input[placeholder*="ara"], .search-input');
      await searchBox.waitFor({ timeout: 15000 }); // 15 saniye timeout
      await searchBox.fill(foodName);
      await searchBox.press('Enter');

      // Arama sonuçlarının yüklenmesini bekle
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch (error) {
        logInfo('Network idle timeout - devam ediliyor...');
      }
      await delay(2000);

      logInfo(`"${foodName}" araması tamamlandı`);

      // Arama sonuçlarının yüklenip yüklenmediğini kontrol et
      await delay(2000);

      // Sayfa içeriğini genel olarak kontrol et
      const pageTitle = await this.page.title();
      logInfo(`Sayfa başlığı: ${pageTitle}`);

      const url = this.page.url();
      logInfo(`Mevcut URL: ${url}`);

      // Tüm arama sonuçlarını logla
      const allResults = await this.page.locator('[data-testid*="result"], .result, .search-result, .vendor, .restaurant, .product, .item').all();
      logInfo(`Toplam ${allResults.length} arama sonucu bulundu`);

      // Sayfa kaynak kodundan arama sonuçları ara
      const pageContent = await this.page.content();
      const hasRestaurant = pageContent.includes('restaurant') || pageContent.includes('vendor');
      const hasProduct = pageContent.includes('product') || pageContent.includes('menu');
      logInfo(`Sayfa içeriği kontrolü: Restaurant=${hasRestaurant}, Product=${hasProduct}`);

      // İlk 5 sonucu detaylı logla
      for (let i = 0; i < Math.min(5, allResults.length); i++) {
        try {
          const result = allResults[i];
          const text = await result.textContent();
          logInfo(`Sonuç ${i + 1}: ${text.substring(0, 100)}...`);
        } catch (e) {
          logInfo(`Sonuç ${i + 1}: Okunamadı`);
        }
      }

      // Arama sonuçlarından ilk restorana tıkla
      const restaurantSelectors = [
        // Ana selector'lar
        '[data-testid="restaurant-card"]',
        '.restaurant-card',
        '.vendor-card',
        '.restaurant-item',
        '[data-testid*="restaurant"]',
        '[class*="restaurant"]',
        '[data-testid*="vendor"]',
        '[class*="vendor"]',

        // Link selector'ları
        'a[href*="restaurant"]',
        'a[href*="vendor"]',
        'a[href*="menu"]',
        'a[href*="food"]',

        // Genel selector'lar
        '.search-result a',
        '.result-item a',
        '.product-link',
        '.vendor-link',

        // Alternatif selector'lar
        '[data-testid*="result"] a',
        '.search-item a',
        '.listing-item a',
        '[class*="result"] a',

        // Fallback selector'lar
        'h3 a', 'h4 a', 'h2 a', // Başlıklardaki linkler
        '.title a',
        '.name a'
      ];

      for (const selector of restaurantSelectors) {
        try {
          const restaurantResult = this.page.locator(selector).first();
          if (await restaurantResult.isVisible({ timeout: 3000 })) {
            logInfo(`İlk restorana tıklanıyor (${selector})...`);
            await restaurantResult.click();

            // Restoran sayfasının yüklenmesini bekle
            await this.page.waitForLoadState('networkidle', { timeout: 15000 });
            await delay(3000);

            logInfo('Restoran sayfası açıldı');
            return true;
          }
        } catch (e) {
          logInfo(`Selector ${selector} çalışmadı, devam ediliyor...`);
          continue;
        }
      }

      logError('Hiçbir restoran selector\'ı çalışmadı');
      return false;

    } catch (error) {
      logError(`Arama hatası (${foodName}):`, error);
      return false;
    }
  }

  async getRestaurantPrices(foodName) {
    try {
      const products = [];

      // Restoran içindeki pizza ürünlerini bul
      const productSelectors = [
        '[data-testid="product-item"]',
        '.product-item',
        '.menu-item',
        '.food-item',
        '[data-testid="menu-item"]',
        '.product-card',
        '.item-card'
      ];

      let productElements = [];
      for (const selector of productSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          if (elements.length > 0) {
            productElements = elements;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      logInfo(`${productElements.length} ürün bulundu`);

      // Restoran adını al
      const restaurantNameSelectors = [
        '[data-testid="restaurant-name"]',
        '.restaurant-name',
        '.vendor-name',
        'h1',
        '.restaurant-title'
      ];

      let restaurantName = 'Bilinmeyen Restoran';
      for (const selector of restaurantNameSelectors) {
        try {
          const nameElement = this.page.locator(selector).first();
          if (await nameElement.isVisible({ timeout: 2000 })) {
            restaurantName = await nameElement.textContent();
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Ürünleri işle
      for (let i = 0; i < Math.min(productElements.length, 10); i++) { // İlk 10 ürünü al
        const product = productElements[i];

        try {
          // Ürün adını al
          const productNameSelectors = [
            '.product-name',
            '.item-name',
            '.food-name',
            'h3',
            'h4',
            '[data-testid="product-name"]'
          ];

          let productName = '';
          for (const selector of productNameSelectors) {
            try {
              const nameElement = await product.locator(selector).first();
              if (await nameElement.isVisible({ timeout: 1000 })) {
                productName = await nameElement.textContent();
                break;
              }
            } catch (e) {
              continue;
            }
          }

          // Ürün fiyatını al
          const priceSelectors = [
            '.product-price',
            '.item-price',
            '.price',
            '[data-testid="product-price"]',
            '.price-text',
            '[class*="price"]'
          ];

          let price = null;
          for (const selector of priceSelectors) {
            try {
              const priceElement = await product.locator(selector).first();
              if (await priceElement.isVisible({ timeout: 1000 })) {
                const priceText = await priceElement.textContent();
                price = this.extractPrice(priceText);
                if (price) break;
              }
            } catch (e) {
              continue;
            }
          }

          // Pizza ile ilgili ürünleri filtrele
          const pizzaKeywords = ['pizza', 'margarita', 'peynirli', 'sucuklu', 'tonno', 'karışık', 'vejetaryen'];
          const isPizza = pizzaKeywords.some(keyword =>
            productName.toLowerCase().includes(keyword.toLowerCase())
          );

          if (productName && price && isPizza) {
            products.push({
              name: productName.trim(),
              price: price,
              restaurantName: restaurantName.trim(),
              foodName: foodName
            });

            logInfo(`📦 ${productName}: ${price} ₺`);
          }

        } catch (productError) {
          logError(`Ürün ${i+1} işlenirken hata:`, productError);
          continue;
        }
      }

      logInfo(`✅ Toplam ${products.length} pizza ürünü bulundu`);
      return products;

    } catch (error) {
      logError('Ürün fiyatları çekerken hata:', error);
      return [];
    }
  }

  extractPrice(priceText) {
    if (!priceText) return null;
    
    // Sayısal değerleri çıkar (25,50 ₺ -> 25.50)
    const match = priceText.match(/[\d,]+/);
    if (match) {
      return parseFloat(match[0].replace(',', '.'));
    }
    return null;
  }

  async selectRestaurant(category, products) {
    try {
      const analysis = analyzePrices(products);
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
          targetProduct = analysis.cheapest; // Varsayılan olarak en ucuz
      }

      if (!targetProduct) {
        logError('Seçilecek ürün bulunamadı');
        return null;
      }

      logInfo(`${category} kategorisinde seçilen ürün: ${targetProduct.name} (${targetProduct.price} ₺)`);

      // Ürünü sepete ekle butonunu bul ve tıkla
      const addToCartSelectors = [
        `text="${targetProduct.name}"`,
        `[data-testid*="add-to-cart"]`,
        '.add-to-cart',
        'button:has-text("Sepete Ekle")',
        'button:has-text("Ekle")',
        '[data-testid*="add"]'
      ];

      let addButton = null;
      for (const selector of addToCartSelectors) {
        try {
          addButton = this.page.locator(selector).first();
          if (await addButton.isVisible({ timeout: 2000 })) {
            await addButton.click();
            logInfo('Ürün sepete eklendi');
            await delay(1000);
            return targetProduct;
          }
        } catch (e) {
          continue;
        }
      }

      logError('Sepete ekleme butonu bulunamadı');
      return null;

    } catch (error) {
      logError('Ürün seçiminde hata:', error);
      return null;
    }
  }

  async addToCart() {
    try {
      // Bu fonksiyon artık selectRestaurant içinde kullanılıyor
      // Ekstra bir işlem yapmaya gerek yok
      logInfo('Sepete ekleme işlemi tamamlandı');
      return true;

    } catch (error) {
      logError('Sepete ekleme hatası:', error);
      return false;
    }
  }

  async goToCheckout() {
    try {
      // Sepete git
      const cartButton = this.page.locator('[data-testid="cart"], .cart, .basket').first();
      await cartButton.click();
      
      await delay(2000);
      
      // Ödeme sayfasına git
      const checkoutButton = this.page.locator('button:has-text("Ödeme"), [data-testid="checkout"]').first();
      await checkoutButton.waitFor({ timeout: config.WAIT_TIMEOUT });
      await checkoutButton.click();
      
      logInfo('Ödeme sayfasına yönlendirildi');
      return true;
      
    } catch (error) {
      logError('Ödeme sayfasına gitme hatası:', error);
      return false;
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logInfo('Tarayıcı kapatıldı');
      }
    } catch (error) {
      logError('Tarayıcı kapatma hatası:', error);
    } finally {
      // Her durumda cleanup yap
      this.cleanup();
    }
  }
}

module.exports = TrendyolYemekScraper;