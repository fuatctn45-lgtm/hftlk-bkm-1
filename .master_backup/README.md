# Haftalık Bakım CMMS V5.4.21

## Bu sürümdeki değişiklik

Admin panelindeki **"Kayıt yanıtı alınamadı"** sorunu çözüldü.

### Sorunun nedeni

`createMaintenanceTemplateWithImage` işlemi sunucuda beş adım yapar:
makine listesini okur, Drive klasörünü bulur, Base64 resmi çözüp dosya
oluşturur, dosyayı paylaşıma açar ve E-Tabloya satır ekler.

`DriveApp.createFile` ve `setSharing` çağrıları yavaştır. Büyük bir
resimle bu adımlar 25 saniyeyi aşabiliyordu. Süre dolduğunda kayıt
sunucuda devam ederken ekranda hata mesajı çıkıyordu.

Yani kayıt çoğu zaman başarılı oluyordu, yalnızca cevap geç geliyordu.

### Yapılan üç düzeltme

**1. Bekleme süresi 60 saniyeye çıkarıldı**

Önceki değer 25 saniyeydi. Drive işlemlerinin tamamlanması için
yeterli süre tanınıyor.

**2. Süre dolduğunda kayıt doğrulanıyor**

Artık süre dolunca hemen hata verilmiyor. Sistem sunucuya sorup
kaydın gerçekten oluşup oluşmadığını kontrol ediyor:

- Kayıt bulunduysa: "Bakım tanımı kaydedildi. (Yanıt gecikmeli geldi.)"
  mesajı çıkıyor, form temizleniyor ve liste yenileniyor.
- Kayıt bulunamadıysa: "Kayıt doğrulanamadı." uyarısı veriliyor.

**3. Referans resim daha küçük gönderiliyor**

| Ayar | Önceki | Yeni |
|---|---|---|
| En büyük kenar | 1400 piksel | 1000 piksel |
| JPEG kalitesi | 0.78 | 0.70 |

Gönderim boyutu yaklaşık yarıya iniyor, Drive işlemi hızlanıyor.
Referans resmi için 1000 piksel fazlasıyla yeterlidir.

**Ek olarak:** Resim seçildiğinde gönderilecek boyut ekranda gösteriliyor
(örneğin "Seçilen dosya: 1850 KB → gönderilecek: 240 KB"). 900 KB üzerinde
uyarı rengiyle vurgulanıyor.

### Değişen dosya

Yalnızca **admin-maintenance.html** işlevsel olarak değişti.
Diğer dosyalarda sadece sürüm numarası güncellendi.

---

## Dosya listesi

| Dosya | Açıklama |
|---|---|
| index.html | Giriş ve ana menü, üst menüde RED düğmesi |
| weekly-maintenance.html | Operatör bakım paneli |
| red-list.html | RED verilen bakımlar ekranı |
| admin-maintenance.html | Admin bakım tanımlama paneli (bu sürümde değişti) |
| net.js | Ortak bağlantı katmanı |
| app.js | Eski giriş mantığı (kullanılmıyor) |
| style.css | Ana stil dosyası |
| mobil-tasma-duzeltme.css | Android ekran taşma düzeltmesi |
| AKGLOG.png | Logo |

---

## Sistemin yetenekleri

### Giriş ve yetkilendirme
- Google E-Tablo `veri` sayfasından şifre doğrulaması.
- Admin paneli yalnızca yönetici yetkisi olanlara açılır.

### Ana menü
- Üst menüde RED Verilen Bakımlar düğmesi.
- Düğme üzerinde bu haftaki RED sayısı rozet olarak görünür.

### Operatör bakım paneli
- Makine kartında yalnızca makine adı görünür.
- Bakımlar 1, 2, 3 şeklinde numaralı renkli bar olarak listelenir.
- Bekleyen #FFB733, Tamamlanan #99FF99, Red #FF9999.
- "x / y bakım tamamlandı" ilerleme sayacı.

### QR doğrulama
- Makine önce listeden seçilir, QR yalnızca doğrulama amaçlıdır.
- Çoklu kimlik eşleştirme: iç ID, makine adı, maliyet merkezi, toplam kod.
- Manuel ID girişi yoktur.
- Hatalı etiket okunduğunda ait olduğu makine bildirilir.

### Kontrol kaydı
- Sonuç: UYGUN veya RED.
- RED seçilirse açıklama zorunludur (en az 10 karakter).
- Canlı karakter sayacı ve uyarı kutusu.

### RED Verilen Bakımlar ekranı
- Açıklama sarı vurgulu kutuda, kanıt fotoğrafı büyütülebilir.
- Dönem, makine ve serbest arama filtreleri.

---

## Sunucu tarafı

`Code.gs` bu pakette yer almaz. Apps Script üzerinde **V5.4.17**
dağıtılmıştır ve bu ön yüzle uyumludur. Değişiklik gerekmez.

---

## Kurulum

1. Tüm dosyaları aynı klasöre koyun.
2. Klasörü HTTPS bir adreste yayınlayın.
3. index.html adresini açın.

**Önemli:** Güncelleme sonrası tarayıcı önbelleğini temizleyin.
Masaüstünde Ctrl+Shift+R, telefonda site verilerini temizleyin.

---

## Sorun devam ederse

Kayıt hâlâ oluşmuyorsa:

1. **Listeyi Yenile** ile kaydın gerçekten oluşup oluşmadığına bakın.
2. Apps Script düzenleyicisinde **Yürütmeler** bölümünü açın.
3. Son `doPost` çalışmasının durumuna ve hata mesajına bakın.

Sık görülen hatalar:

- "Seçilen makine mak-list sayfasında bulunamadı" → makine önbelleği eski.
- "Referans resim zorunludur" → resim sunucuya ulaşmamış.
- Zaman aşımı → Drive işlemi çok uzun sürmüş.
