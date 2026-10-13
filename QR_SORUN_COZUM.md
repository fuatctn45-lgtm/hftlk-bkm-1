# QR Kamera Sorun Çözüm Rehberi

## Kamera hiç açılmıyor

### Sayfa HTTPS değil
Tarayıcılar kamerayı yalnızca güvenli adreslerde açar.
Dosyayı çift tıklayarak açtıysanız (`file:///C:/...`) kamera çalışmaz.

Yerel test için:
```
cd proje_klasoru
python -m http.server 8000
```
Sonra `http://localhost:8000` açın. (localhost güvenli sayılır.)

Yayın için: GitHub Pages, Netlify, Google Sites veya şirket HTTPS sunucusu.

### Kamera izni reddedilmiş
- **Android Chrome:** Kilit simgesi > İzinler > Kamera > İzin ver
- **iPhone Safari:** Ayarlar > Safari > Kamera > Sor
- **Masaüstü:** Adres çubuğundaki kamera simgesi > İzin ver > Yenile

### Uygulama içi tarayıcı
WhatsApp, Teams veya Instagram içinden açılan bağlantılarda kamera engellenir.
Bağlantıyı kopyalayıp Chrome veya Safari'de açın.

### Kamera başka uygulamada açık
Teams, Zoom veya kamera uygulamasını kapatın.

## Kamera açık ama QR okumuyor

- Etiketi çerçeveye yaklaştırın, çerçeveyi dolduracak kadar.
- Ortam çok karanlıksa okuma başarısız olur.
- Yansıma varsa açıyı değiştirin.
- **Kamerayı Değiştir** ile arka kameraya geçin.
- Etiket buruşuk, kirli veya çizikse yenileyin.

## "Hatalı Makine Etiketi" uyarısı çıkıyor

V5.4.16 ile eşleştirme mantığı düzeltildi. Yine de çıkıyorsa:

1. Modalda **Okunan etiket** satırındaki değere bakın.
2. Modal "Bu etiket şu makineye ait" diyorsa yanlış makinenin
   başındasınız demektir.
3. Hiçbir makineye ait değilse etiket sistemde tanımlı değildir.
   Admin panelinden makine kaydını kontrol edin.

Ayrıntılı eşleştirme kuralları: **QR_ETIKET_KURALI.md**

## Etiket basarken

QR içeriği şunlardan biri olmalıdır:
- İç ID (`eac54b58`)
- Makine adı (`HAAS CNC VF4 / 2`)
- Toplam makine kodu (`HAAS CNC VF4 / 2-351321-4`)

Üçü de sistem tarafından kabul edilir.
