# QR Etiket Kuralı ve Eşleştirme Mantığı (V5.4.16)

## Tespit edilen sorun

Sahadaki etiket şu bilgileri taşıyor:

```
MAKİNE ADI         : HAAS CNC VF4 / 2
MALİYET MERKEZİ    : 351321-4
TOPLAM MAKİNE KODU : HAAS CNC VF4 / 2-351321-4
```

Sistemdeki iç kayıt ise: `eac54b58`

Eski kod okunan değeri **yalnızca iç ID** ile karşılaştırıyordu.
İki değer hiçbir zaman eşleşemeyeceği için **hiçbir etiket geçmiyordu**.
Ekranda sürekli "Hatalı makine etiketi. Beklenen ID: eac54b58" çıkmasının
nedeni buydu.

## Çözüm: Çoklu kimlik eşleştirme

Artık okunan değer aşağıdaki kimliklerin **herhangi biriyle** eşleşirse
doğrulama başarılıdır:

| Kimlik | Örnek |
|---|---|
| İç ID | `eac54b58` |
| Makine adı | `HAAS CNC VF4 / 2` |
| Maliyet merkezi | `351321-4` |
| Toplam makine kodu (ad + maliyet merkezi) | `HAAS CNC VF4 / 2-351321-4` |
| machineCode / qrCode alanı | varsa |

### Normalleştirme

Karşılaştırmadan önce her iki değer de şu işlemlerden geçer:

1. Türkçe kurallarına göre büyük harfe çevrilir
2. Aksan işaretleri kaldırılır (İ, Ü, Ö, Ş, Ç, Ğ)
3. Harf ve rakam dışındaki tüm karakterler silinir (boşluk, tire, eğik çizgi, nokta)

Böylece şunların hepsi aynı kabul edilir:

```
HAAS CNC VF4 / 2-351321-4
haas cnc vf4/2-351321-4
HAASCNCVF42-3513214
HAAS  CNC  VF4 / 2 - 351321 - 4
```

### URL ve JSON desteği

Etiket şu biçimlerde de olabilir; sistem içinden gerçek değeri çıkarır:

```
https://akg.com/qr?id=eac54b58
{"machineCode":"HAAS CNC VF4 / 2-351321-4"}
```

### Fazladan metin toleransı

Etikette başlık metinleri de okunursa (örneğin "MAKİNE ADI HAAS CNC VF4 / 2
MALİYET MERKEZİ 351321-4"), sistem içerme kontrolü yapar ve yine eşleştirir.

## Yanlış etiket okunduğunda

Sistem okunan değeri **tüm makine listesinde** arar:

- Etiket başka bir makineye aitse: modalda o makinenin adı gösterilir
  ("Bu etiket şu makineye ait: 1600 kva TRAFO")
- Etiket hiçbir makineye ait değilse: kontrol listesi gösterilir

## Test sonuçları

Eşleştirme mantığı 10 senaryoda doğrulandı ve hepsi başarılı:

| Senaryo | Sonuç |
|---|---|
| Etiketteki toplam makine kodu | Geçti |
| İç ID | Geçti |
| Sadece makine adı | Geçti |
| Küçük harf / boşluksuz yazım | Geçti |
| Fazladan başlık metni | Geçti |
| URL içinde ID | Geçti |
| JSON içerik | Geçti |
| Başka makinenin etiketi | Doğru şekilde reddedildi |
| Kendi etiketi | Geçti |
| Alakasız kod | Doğru şekilde reddedildi |

## Öneri: Apps Script tarafı

Eşleştirmeyi daha da sağlamlaştırmak için makine kaydına açık bir
`machineCode` alanı eklemeniz önerilir:

```javascript
machines.push({
  id: String(r[0]),
  machineName: String(r[1]),
  costCenter: String(r[2] || ''),
  machineCode: String(r[1]) + '-' + String(r[2] || '')   // TOPLAM MAKİNE KODU
});
```

Ön yüz bu alanı otomatik tanır ve öncelikli olarak kullanır.
