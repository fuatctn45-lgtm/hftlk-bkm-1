# Apps Script Notları

## 1. machineCode alanı eklemeniz önerilir

QR eşleştirmesini sağlamlaştırmak için makine kaydına toplam makine
kodunu açıkça ekleyin:

```javascript
machines.push({
  id: String(r[0]),
  machineName: String(r[1]),
  costCenter: String(r[2] || ''),
  machineCode: String(r[1]) + '-' + String(r[2] || '')
});
```

Ön yüz bu alanı otomatik tanır.

## 2. Durum renkleri için sonuç kayıtları

```javascript
function getWeeklyBootstrap() {
  return {
    success: true,
    machines: ...,
    templatesByMachine: ...,
    results: getWeekResults()
  };
}

function getWeekResults() {
  const values = ss().getSheetByName('sonuclar').getDataRange().getValues();
  const head = values[0];
  const iMachine = head.indexOf('machineId');
  const iTemplate = head.indexOf('templateId');
  const iResult = head.indexOf('result');
  const iWeek = head.indexOf('weekKey');
  return values.slice(1).filter(r => r[iTemplate]).map(r => ({
    machineId: String(r[iMachine]),
    templateId: String(r[iTemplate]),
    result: String(r[iResult]),
    weekKey: String(r[iWeek])
  }));
}
```

Ön yüz şu alan adlarını tanır:
`results`, `records`, `maintenanceResults`, `weeklyResults`, `sonuclar`.

## 3. Hücre hücre okuma yapmayın

Yavaş:
```javascript
for (var i = 2; i <= sheet.getLastRow(); i++) { sheet.getRange(i,1).getValue(); }
```
Hızlı:
```javascript
const values = sheet.getDataRange().getValues();
```

## 4. CacheService kullanın

```javascript
function listMachinesCached() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('machines_v1');
  if (hit) return JSON.parse(hit);
  const values = ss().getSheetByName('makineler').getDataRange().getValues();
  const machines = values.slice(1).filter(r => r[0]).map(r => ({
    id: String(r[0]), machineName: String(r[1]),
    costCenter: String(r[2] || ''),
    machineCode: String(r[1]) + '-' + String(r[2] || '')
  }));
  const out = { success: true, machines: machines, count: machines.length };
  cache.put('machines_v1', JSON.stringify(out), 900);
  return out;
}
```

## 5. openById çağrısını tekrarlamayın

```javascript
let _ss = null;
function ss() { if (!_ss) _ss = SpreadsheetApp.openById(SHEET_ID); return _ss; }
```

## 6. Ölçüm

| Süre | Değerlendirme |
|---|---|
| 300 - 800 ms | Normal |
| 1 - 3 sn | Kabul edilebilir |
| 3 - 8 sn | Code.gs optimizasyonu gerekli |
| 8 sn üzeri | Hücre hücre okuma veya ağır formül var |
