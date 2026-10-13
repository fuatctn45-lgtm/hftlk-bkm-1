# V5.4.22 - Admin ekranı görünüm düzeltmesi

## Değişen dosyalar
- admin-maintenance.html  (yerleşim yeniden düzenlendi)
- mobil-tasma-duzeltme.css (sorunu yaratan iki kural düzeltildi)

Kayıt mantığı V5.4.21 ile birebir aynıdır. Diğer dosyalara dokunulmadı.

## Düzeltilen sorunlar

### 1. Sayfa ekranın tamamına yayılıyordu
mobil-tasma-duzeltme.css içindeki `main { max-width:100% }` kuralı
genişlik sınırını eziyordu. Kural kaldırıldı. Admin ekranı ayrıca kendi
içinde 960 piksel ile sınırlandı ve ortalandı.

### 2. Küçük resimler ince şeritlere dönüşüyordu
`.reference-image { height:auto }` kuralı kare ölçüyü eziyordu.
Admin listesinde küçük resimler artık her durumda 64x64 kare
(telefonda 52x52), `object-fit: cover` ile kırpılıyor.

## Görünüm iyileştirmeleri
- Form iki sütunlu (telefonda tek sütun).
- Resim önizlemesi 170x120 çerçevede.
- Onay kutuları yan yana.
- Liste düğmeleri başlığın yanında, küçük boyutta.
- Makine başlığında bakım sayısı görünüyor.
- Aktif / Pasif / Fotoğraf zorunlu durumları renkli etiketlerle.
- Resmi olmayan kayıtta "Resim yok" kutusu.
- Küçük resme tıklayınca büyük hali açılıyor.
- Hata ayıklama çıktısı (debug) gizlendi.

## Kurulum
İki dosyayı da proje klasöründekilerle değiştirin, ardından Ctrl+Shift+R.
