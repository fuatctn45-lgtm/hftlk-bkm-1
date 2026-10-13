/**
 * AKG CMMS - Google Apps Script (Code.gs)
 * Sürüm: V5.5.3 - Tam Entegre & Kullanıcı Girişi (login) & P, Q, R Görsel Yönetimi
 * 
 * Bu kodu Google E-Tablonuzda "Uzantılar" > "Apps Script" bölümüne yapıştırıp
 * "Yeni Dağıtım" (New Deployment) > "Web Uygulaması" (Web App) olarak yayınlayınız.
 * Erişim (Who has access): "Herkes" (Anyone) olarak seçilmelidir.
 */

var SHEET_NAME_TEMPLATES = 'weeklyMaintenanceTemplates';
var SHEET_NAME_RECORDS = 'weeklyMaintenanceRecords';
var DRIVE_FOLDER_NAME = 'AKG_CMMS_Fotograflar';

function getTemplatesSheet(ss) {
  return ss.getSheetByName('weeklyMaintenanceTemplates') ||
         ss.getSheetByName('bkm-sb') ||
         ss.getSheetByName('MaintenanceTemplates') ||
         ss.getSheetByName('templates');
}

function getRecordsSheet(ss) {
  return ss.getSheetByName('weeklyMaintenanceRecords') ||
         ss.getSheetByName('bkm-yn') ||
         ss.getSheetByName('MaintenanceRecords') ||
         ss.getSheetByName('records') ||
         ss.getSheetByName('sonuclar');
}

function getMachinesSheet(ss) {
  return ss.getSheetByName('mak-list') ||
         ss.getSheetByName('makineler') ||
         ss.getSheetByName('machines');
}

function getVeriSheet(ss) {
  return ss.getSheetByName('veri') ||
         ss.getSheetByName('kullanicilar') ||
         ss.getSheetByName('users');
}

function doGet(e) {
  var action = (e && e.parameter ? e.parameter.action : '').toLowerCase();
  
  if (action === 'health' || action === 'testhealth') {
    return jsonResponse({
      success: true,
      application: 'Haftalık Bakım CMMS',
      version: '5.5.3',
      status: 'ACTIVE'
    });
  }

  if (action === 'login') {
    return loginUser(e);
  }

  if (action === 'listmaintenancetemplates' || action === 'listmaintenancetemplatescached') {
    return listMaintenanceTemplates(e);
  }

  if (action === 'listmachines' || action === 'listmachinescached') {
    return listMachinesCached(e);
  }

  if (action === 'listmaintenancerecords' || action === 'listmaintenancerecordscached') {
    return listMaintenanceRecords(e);
  }

  if (action === 'updatemaintenancetemplate') {
    return updateMaintenanceTemplate(e);
  }

  if (action === 'sendreportmail') {
    return sendReportMail(e);
  }

  if (action === 'redtouygun') {
    return redToUygun(e);
  }

  return jsonResponse({ success: false, message: 'Geçersiz işlem: ' + action });
}

function doPost(e) {
  var action = (e && e.parameter ? e.parameter.action : '').toLowerCase();

  if (action === 'sendreportmail') {
    return sendReportMail(e);
  }

  if (action === 'login') {
    return loginUser(e);
  }

  if (action === 'savemaintenanceresultwithimage') {
    return saveMaintenanceResultWithImage(e);
  }

  if (action === 'createmaintenancetemplatewithimage') {
    return createMaintenanceTemplateWithImage(e);
  }

  if (action === 'updatemaintenancetemplate' || action === 'updatemaintenancetemplatewithimage') {
    return updateMaintenanceTemplate(e);
  }

  if (action === 'deletemaintenancetemplate') {
    return deleteMaintenanceTemplate(e);
  }

  if (action === 'redtouygun') {
    return redToUygun(e);
  }

  return jsonResponse({ success: false, message: 'Geçersiz işlem: ' + action });
}

/**
 * 1. KULLANICI GİRİŞİ (login) - "veri" sekmesindeki şifreler ile doğrulama
 */
function loginUser(e) {
  try {
    var password = '';
    if (e.parameter && e.parameter.password) {
      password = String(e.parameter.password).trim();
    }
    if (!password && e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        password = String(body.password || '').trim();
      } catch (err) {}
    }

    if (!password) {
      return jsonResponse({ success: false, message: 'Lütfen şifre giriniz.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getVeriSheet(ss);

    if (sheet) {
      var values = sheet.getDataRange().getValues();
      // Headers: OP İSİMLERİ (A), şifre (B), YETKİ (C), MAİL ADRESİ (D)
      for (var r = 1; r < values.length; r++) {
        var row = values[r];
        var rowPass = String(row[1] || '').trim();
        if (rowPass === password) {
          var opName = String(row[0] || '').trim() || 'Operatör';
          var role = String(row[2] || 'operator').trim().toLowerCase();
          var email = String(row[3] || '').trim();
          return jsonResponse({
            success: true,
            user: {
              operator: opName,
              name: opName,
              fullName: opName,
              role: role,
              email: email
            }
          });
        }
      }
    }

    // Yedek admin doğrulama (22 şifresi)
    if (password === '22') {
      return jsonResponse({
        success: true,
        user: {
          operator: 'FUAT ÇETİN',
          name: 'FUAT ÇETİN',
          fullName: 'FUAT ÇETİN',
          role: 'admin',
          email: 'fuatctn45@gmail.com'
        }
      });
    }

    return jsonResponse({ success: false, message: 'Şifre hatalı veya kullanıcı bulunamadı.' });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Giriş hatası: ' + err.toString() });
  }
}

/**
 * 2. Bakım Tanımlarını Listeleme (listMaintenanceTemplates)
 */
function listMaintenanceTemplates(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getTemplatesSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Şablon sayfası bulunamadı.' });

    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return jsonResponse({ success: true, count: 0, templates: [] });

    var headers = values[0];
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      colMap[h] = c;
    }

    var machineFilter = e && e.parameter && e.parameter.machineId ? String(e.parameter.machineId).trim() : '';
    var templates = [];

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var tId = colMap['templateid'] !== undefined ? String(row[colMap['templateid']]).trim() : String(row[0]).trim();
      if (!tId) continue;

      var mId = colMap['machineid'] !== undefined ? String(row[colMap['machineid']]).trim() : String(row[1] || '').trim();
      if (machineFilter && mId !== machineFilter) continue;

      var mName = colMap['machinename'] !== undefined ? String(row[colMap['machinename']]).trim() : String(row[2] || '').trim();
      var costCenter = colMap['costcenter'] !== undefined ? String(row[colMap['costcenter']]).trim() : String(row[3] || '').trim();
      var region = colMap['region'] !== undefined ? String(row[colMap['region']]).trim() : String(row[4] || '').trim();
      var part = colMap['part'] !== undefined ? String(row[colMap['part']]).trim() : String(row[5] || '').trim();
      var system = colMap['system'] !== undefined ? String(row[colMap['system']]).trim() : String(row[6] || '').trim();
      var task = colMap['task'] !== undefined ? String(row[colMap['task']]).trim() : String(row[7] || '').trim();
      var targetVal = colMap['targetvalue'] !== undefined ? String(row[colMap['targetvalue']]).trim() : String(row[8] || '').trim();
      var orderNo = colMap['orderno'] !== undefined ? Number(row[colMap['orderno']]) || 1 : Number(row[9]) || 1;
      
      var photoReqRaw = colMap['photorequired'] !== undefined ? String(row[colMap['photorequired']]).toUpperCase() : String(row[10] || '').toUpperCase();
      var photoRequired = (photoReqRaw === 'EVET' || photoReqRaw === 'TRUE' || photoReqRaw === '1');

      var activeRaw = colMap['active'] !== undefined ? String(row[colMap['active']]).toUpperCase() : String(row[12] || '').toUpperCase();
      var active = (activeRaw === 'EVET' || activeRaw === 'TRUE' || activeRaw === '1' || activeRaw === '');

      // P (16), L (12) veya F (6) sütunlarından görsel bağlantısını al
      var refImgUrl = '';
      if (colMap['referenceimageurl'] !== undefined && row[colMap['referenceimageurl']]) {
        refImgUrl = String(row[colMap['referenceimageurl']]).trim();
      } else if (colMap['referenceimage'] !== undefined && row[colMap['referenceimage']]) {
        refImgUrl = String(row[colMap['referenceimage']]).trim();
      } else if (row[15]) {
        refImgUrl = String(row[15]).trim(); // P sütunu
      } else if (row[11]) {
        refImgUrl = String(row[11]).trim(); // L sütunu
      }

      var refImgName = colMap['referenceimagename'] !== undefined ? String(row[colMap['referenceimagename']]).trim() : String(row[16] || '').trim();
      var refImgDriveId = colMap['referenceimagedriveid'] !== undefined ? String(row[colMap['referenceimagedriveid']]).trim() : String(row[17] || '').trim();

      if (!refImgDriveId && refImgUrl) {
        var mDrive = refImgUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (mDrive) refImgDriveId = mDrive[1];
      }

      templates.push({
        templateId: tId,
        machineId: mId,
        machineName: mName,
        costCenter: costCenter,
        region: region,
        system: system,
        part: part,
        task: task,
        targetValue: targetVal,
        orderNo: orderNo,
        photoRequired: photoRequired,
        referenceImageUrl: refImgUrl,
        referenceImageName: refImgName,
        referenceImageDriveId: refImgDriveId,
        active: active
      });
    }

    return jsonResponse({ success: true, count: templates.length, templates: templates });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Şablon listeleme hatası: ' + err.toString() });
  }
}

/**
 * 3. Bakım Tanımını Güncelleme & P, Q, R Sütunlarını Temizleme (updateMaintenanceTemplate)
 */
function updateMaintenanceTemplate(e) {
  try {
    var payloadStr = e.parameter ? e.parameter.payload : '';
    if (!payloadStr) return jsonResponse({ success: false, message: 'Payload eksik.' });
    var p = JSON.parse(payloadStr);
    var templateId = p.templateId || p.TemplateID;
    if (!templateId) return jsonResponse({ success: false, message: 'TemplateID zorunludur.' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getTemplatesSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Şablon sayfası bulunamadı.' });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      colMap[h] = c + 1; // 1-indexed
    }

    var colId = colMap['templateid'] || 1;
    var rowFound = -1;

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colId - 1]).trim() === String(templateId).trim()) {
        rowFound = r + 1;
        break;
      }
    }

    if (rowFound === -1) {
      return jsonResponse({ success: false, message: 'Bakım tanımı bulunamadı.' });
    }

    // Metin Alanlarını Güncelle
    if (colMap['region'] && p.region !== undefined) sheet.getRange(rowFound, colMap['region']).setValue(p.region);
    if (colMap['system'] && p.system !== undefined) sheet.getRange(rowFound, colMap['system']).setValue(p.system);
    if (colMap['part'] && p.part !== undefined) sheet.getRange(rowFound, colMap['part']).setValue(p.part);
    if (colMap['task'] && p.task !== undefined) sheet.getRange(rowFound, colMap['task']).setValue(p.task);
    if (colMap['targetvalue'] && p.targetValue !== undefined) sheet.getRange(rowFound, colMap['targetvalue']).setValue(p.targetValue);
    if (colMap['orderno'] && p.orderNo !== undefined) sheet.getRange(rowFound, colMap['orderno']).setValue(Number(p.orderNo) || 1);
    if (colMap['photorequired']) sheet.getRange(rowFound, colMap['photorequired']).setValue(p.photoRequired ? 'EVET' : 'HAYIR');
    if (colMap['active']) sheet.getRange(rowFound, colMap['active']).setValue(p.active ? 'EVET' : 'HAYIR');

    // P (16), Q (17), R (18) ve L (12) SÜTUNLARI
    var colP = colMap['referenceimageurl'] || 16;
    var colQ = colMap['referenceimagename'] || 17;
    var colR = colMap['referenceimagedriveid'] || 18;
    var colL = colMap['referenceimage'] || 12;

    var imageBase64 = (e.parameter && e.parameter.imageBase64) || p.imageBase64 || '';
    var imageName = (e.parameter && e.parameter.imageName) || p.imageName || '';
    var imageType = (e.parameter && e.parameter.imageType) || p.imageType || 'image/png';
    var shouldDeleteImage = Boolean(
      p.deleteImage === true ||
      p.deleteImage === 'true' ||
      (e.parameter && (e.parameter.deleteImage === 'true' || e.parameter.deleteImage === true)) ||
      p.referenceImageUrl === '' ||
      p.referenceImageUrl === null
    );

    var finalImageUrl = '';

    if (shouldDeleteImage && !imageBase64) {
      // 1. RESMİ TAMAMEN SİL (P, Q, R, L ve YAPILACAK İŞ RESMİ SÜTUNLARINI BOŞALT)
      if (colP <= headers.length) sheet.getRange(rowFound, colP).setValue('');
      if (colQ <= headers.length) sheet.getRange(rowFound, colQ).setValue('');
      if (colR <= headers.length) sheet.getRange(rowFound, colR).setValue('');
      if (colL <= headers.length) sheet.getRange(rowFound, colL).setValue('');
      if (colMap['yapilacakisresmi'] && colMap['yapilacakisresmi'] <= headers.length) {
        sheet.getRange(rowFound, colMap['yapilacakisresmi']).setValue('');
      }
    } else if (imageBase64) {
      // 2. YENİ RESİM YÜKLE
      var autoName = imageName || ('ref_' + templateId + '_' + Date.now() + '.png');
      finalImageUrl = uploadToDrive(imageBase64, autoName, imageType);

      if (colP <= headers.length) sheet.getRange(rowFound, colP).setValue(finalImageUrl);
      if (colQ <= headers.length) sheet.getRange(rowFound, colQ).setValue(autoName);
      if (colL <= headers.length) sheet.getRange(rowFound, colL).setValue(finalImageUrl);

      var driveIdMatch = finalImageUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (colR <= headers.length && driveIdMatch) {
        sheet.getRange(rowFound, colR).setValue(driveIdMatch[1]);
      }
    } else if (p.referenceImageUrl && !String(p.referenceImageUrl).startsWith('data:')) {
      // 3. MEVCUT RESMİ GÜNCELLE / KORU
      finalImageUrl = p.referenceImageUrl;
      if (colP <= headers.length) sheet.getRange(rowFound, colP).setValue(finalImageUrl);
      if (imageName && colQ <= headers.length) sheet.getRange(rowFound, colQ).setValue(imageName);
      if (colL <= headers.length) sheet.getRange(rowFound, colL).setValue(finalImageUrl);

      var driveIdMatch = finalImageUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (colR <= headers.length && driveIdMatch) {
        sheet.getRange(rowFound, colR).setValue(driveIdMatch[1]);
      }
    }

    if (colMap['updatedat']) {
      sheet.getRange(rowFound, colMap['updatedat']).setValue(Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm:ss'));
    }

    var resultData = {
      success: true,
      templateId: templateId,
      referenceImageUrl: finalImageUrl || '',
      message: shouldDeleteImage
        ? 'Referans resmi başarıyla silindi.'
        : 'Bakım tanımı ve görseli başarıyla güncellendi.'
    };

    if (e.parameter && (e.parameter.imageBase64 || e.parameter.format === 'html')) {
      return htmlMessageResponse(resultData);
    }
    return jsonResponse(resultData);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Güncelleme hatası: ' + err.toString() });
  }
}

/**
 * 4. Bakım Tanımını Silme (deleteMaintenanceTemplate)
 */
function deleteMaintenanceTemplate(e) {
  try {
    var templateId = (e.parameter ? e.parameter.templateId : '') || '';
    if (!templateId) return jsonResponse({ success: false, message: 'TemplateID zorunludur.' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getTemplatesSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Şablon sayfası bulunamadı.' });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      colMap[h] = c + 1;
    }
    var colId = colMap['templateid'] || 1;

    var rowFound = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colId - 1]).trim() === String(templateId).trim()) {
        rowFound = r + 1;
        break;
      }
    }

    if (rowFound === -1) {
      return jsonResponse({ success: false, message: 'Silinecek bakım tanımı bulunamadı.' });
    }

    sheet.deleteRow(rowFound);
    return jsonResponse({ success: true, templateId: templateId, message: 'Bakım tanımı silindi.' });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Silme hatası: ' + err.toString() });
  }
}

/**
 * 5. Yeni Bakım Tanımı Ekleme (createMaintenanceTemplateWithImage)
 */
function createMaintenanceTemplateWithImage(e) {
  try {
    var p = JSON.parse(e.parameter.payload || '{}');
    var imageBase64 = e.parameter.imageBase64 || '';
    var imageName = e.parameter.imageName || ('ref_' + Date.now() + '.png');
    var imageType = e.parameter.imageType || 'image/png';

    var driveUrl = '';
    var driveId = '';
    if (imageBase64) {
      driveUrl = uploadToDrive(imageBase64, imageName, imageType);
      var m = driveUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (m) driveId = m[1];
    }

    var newId = p.templateId || ('TMP-' + Utilities.getUuid().substring(0, 8).toUpperCase());

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getTemplatesSheet(ss);
    if (!sheet) return htmlMessageResponse({ success: false, message: 'Şablon sayfası bulunamadı.' });

    var now = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm:ss');

    sheet.appendRow([
      newId,
      p.machineId || '',
      p.machineName || '',
      p.costCenter || '',
      p.region || '',
      p.part || '',
      p.system || 'MEKANİK',
      p.task || '',
      p.targetValue || '',
      Number(p.orderNo) || 1,
      p.photoRequired ? 'EVET' : 'HAYIR',
      driveUrl, // L (12): ReferenceImage
      p.active ? 'EVET' : 'HAYIR',
      now,      // N (14): CreatedAt
      now,      // O (15): UpdatedAt
      driveUrl, // P (16): ReferenceImageUrl
      imageName,// Q (17): ReferenceImageName
      driveId   // R (18): ReferenceImageDriveId
    ]);

    return htmlMessageResponse({
      success: true,
      templateId: newId,
      referenceImageUrl: driveUrl,
      message: 'Bakım tanımı kaydedildi.'
    });
  } catch (err) {
    return htmlMessageResponse({ success: false, message: err.toString() });
  }
}

/**
 * 6. Bakım Kayıtlarını Listeleme (listMaintenanceRecords)
 */
function listMaintenanceRecords(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getRecordsSheet(ss);
    if (!sheet) return jsonResponse({ success: true, count: 0, records: [] });

    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return jsonResponse({ success: true, count: 0, records: [] });

    var headers = values[0];
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      colMap[h] = c;
    }

    var records = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var recId = colMap['recordid'] !== undefined ? String(row[colMap['recordid']]).trim() : String(row[0] || '').trim();
      if (!recId) continue;

      records.push({
        recordId: recId,
        clientRequestId: colMap['clientrequestid'] !== undefined ? String(row[colMap['clientrequestid']]).trim() : String(row[1] || '').trim(),
        templateId: colMap['templateid'] !== undefined ? String(row[colMap['templateid']]).trim() : String(row[2] || '').trim(),
        machineId: colMap['machineid'] !== undefined ? String(row[colMap['machineid']]).trim() : String(row[3] || '').trim(),
        machineName: colMap['machinename'] !== undefined ? String(row[colMap['machinename']]).trim() : String(row[4] || '').trim(),
        operator: colMap['operator'] !== undefined ? String(row[colMap['operator']]).trim() : String(row[5] || '').trim(),
        result: colMap['result'] !== undefined ? String(row[colMap['result']]).trim() : String(row[6] || '').trim(),
        measuredValue: colMap['measuredvalue'] !== undefined ? String(row[colMap['measuredvalue']]).trim() : String(row[7] || '').trim(),
        description: colMap['description'] !== undefined ? String(row[colMap['description']]).trim() : String(row[8] || '').trim(),
        priority: colMap['priority'] !== undefined ? String(row[colMap['priority']]).trim() : String(row[9] || '').trim(),
        proofImageUrl: colMap['proofimageurl'] !== undefined ? String(row[colMap['proofimageurl']]).trim() : String(row[10] || '').trim(),
        proofImageName: colMap['proofimagename'] !== undefined ? String(row[colMap['proofimagename']]).trim() : String(row[11] || '').trim(),
        createdAt: colMap['createdat'] !== undefined ? String(row[colMap['createdat']]).trim() : String(row[12] || '').trim(),
        updatedAt: colMap['updatedat'] !== undefined ? String(row[colMap['updatedat']]).trim() : String(row[13] || '').trim()
      });
    }

    return jsonResponse({ success: true, count: records.length, records: records });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Kayıt listeleme hatası: ' + err.toString() });
  }
}

/**
 * 7. Bakım Sonucu Kaydetme (saveMaintenanceResultWithImage)
 */
function saveMaintenanceResultWithImage(e) {
  try {
    var p = JSON.parse(e.parameter.payload || '{}');
    var imageBase64 = e.parameter.imageBase64 || '';
    var imageName = e.parameter.imageName || ('proof_' + Date.now() + '.png');
    var imageType = e.parameter.imageType || 'image/png';

    var proofUrl = '';
    if (imageBase64) {
      proofUrl = uploadToDrive(imageBase64, imageName, imageType);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getRecordsSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Kayıt sayfası bulunamadı.' });

    var recordId = 'REC-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    var now = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm:ss');
    var weekKey = p.weekKey || getWeekKey();

    sheet.appendRow([
      recordId,
      p.clientRequestId || '',
      p.templateId || '',
      p.machineId || '',
      p.machineName || '',
      p.operator || 'Operatör',
      p.result || 'UYGUN',
      p.measuredValue || '',
      p.description || '',
      p.priority || 'NORMAL',
      proofUrl,
      imageName,
      '',
      weekKey,
      now,
      now
    ]);

    return jsonResponse({
      success: true,
      recordId: recordId,
      proofImageUrl: proofUrl,
      message: 'Bakım sonucu kaydedildi.'
    });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Kayıt hatası: ' + err.toString() });
  }
}

/**
 * 8. RED Kaydını UYGUN'a Çevirme (redToUygun)
 */
function redToUygun(e) {
  try {
    var recordId = (e.parameter ? e.parameter.recordId : '') || '';
    if (!recordId) return jsonResponse({ success: false, message: 'recordId zorunludur.' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getRecordsSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Kayıt sayfası bulunamadı.' });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      colMap[h] = c + 1;
    }

    var colId = colMap['recordid'] || 1;
    var colResult = colMap['result'] || 7;
    var colDesc = colMap['description'] || 9;

    var rowFound = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colId - 1]).trim() === String(recordId).trim()) {
        rowFound = r + 1;
        break;
      }
    }

    if (rowFound === -1) return jsonResponse({ success: false, message: 'Kayıt bulunamadı.' });

    sheet.getRange(rowFound, colResult).setValue('UYGUN');
    if (colDesc) {
      var currDesc = sheet.getRange(rowFound, colDesc).getValue();
      sheet.getRange(rowFound, colDesc).setValue(currDesc + ' [GİDERİLDİ: ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm') + ']');
    }

    return jsonResponse({ success: true, message: 'Arıza başarıyla UYGUN olarak güncellendi.' });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

/**
 * 9. Makineleri Listeleme (listMachinesCached)
 */
function listMachinesCached(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getMachinesSheet(ss);
    if (!sheet) return jsonResponse({ success: false, message: 'Makine sayfası bulunamadı.' });

    var values = sheet.getDataRange().getValues();
    var machines = [];

    for (var r = 1; r < values.length; r++) {
      var id = String(values[r][0] || '').trim();
      var name = String(values[r][1] || '').trim();
      var cc = String(values[r][2] || '').trim();
      if (!id && !name) continue;
      machines.push({
        id: id || name,
        machineName: name || id,
        costCenter: cc,
        machineCode: (name || id) + (cc ? '-' + cc : '')
      });
    }

    return jsonResponse({ success: true, count: machines.length, machines: machines });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

/**
 * 10. Google Drive'a Fotoğraf Yükleme
 */
function uploadToDrive(base64Data, fileName, mimeType) {
  try {
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    
    var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
  } catch (err) {
    return '';
  }
}

function jsonResponse(data, e) {
  var output = JSON.stringify(data);
  var callback = (e && e.parameter && e.parameter.callback) || '';
  if (callback) {
    output = callback + '(' + output + ');';
    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlMessageResponse(data) {
  var html = '<script>parent.postMessage(' + JSON.stringify(data) + ', "*");</script>';
  return HtmlService.createHtmlOutput(html);
}

/**
 * 11. PDF Raporunu E-Posta ile Gönderme (sendReportMail)
 */
function sendReportMail(e) {
  try {
    var p = {};
    if (e.parameter && e.parameter.payload) {
      try { p = JSON.parse(e.parameter.payload); } catch (err) {}
    }
    if (!p.operator && e.parameter) p = e.parameter;

    var operator = p.operator || 'Operatör';
    var fileName = p.fileName || ('HAFTALIK_BAKIM_KONTROL_FORMU_' + operator.toUpperCase().replace(/\s+/g, '_') + '_A3.pdf');
    var subject = p.subject || ('Haftalık Bakım Kontrol Formu (Yatay A3) - ' + operator);
    var htmlContent = p.html || ('<h3>AKG Termal Sistemler Haftalık Bakım Kontrol Raporu</h3><p>Bakımı Yapan: ' + operator + '</p>');
    var recipientStr = p.recipients || '';

    if (!recipientStr) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = getVeriSheet(ss);
      var emails = [];
      if (sheet) {
        var vals = sheet.getDataRange().getValues();
        for (var r = 1; r < vals.length; r++) {
          var em = String(vals[r][3] || '').trim();
          if (em && em.indexOf('@') > -1 && emails.indexOf(em) === -1) {
            emails.push(em);
          }
        }
      }
      recipientStr = emails.join(',');
    }

    if (!recipientStr) {
      recipientStr = 'akgbkm@outlook.com,fuat.cetin@akg-turkey.com';
    }

    var blob = Utilities.newBlob(htmlContent, 'text/html', fileName.replace(/\.pdf$/i, '') + '.html')
      .getAs('application/pdf')
      .setName(fileName);

    var emailBody = 'Merhaba,\n\n' +
      'AKG Termal Sistemler Haftalık Periyodik Bakım Kontrol Formu ekte yer almaktadır.\n\n' +
      '• Bakımı Yapan: ' + operator + '\n' +
      '• Rapor Tarihi: ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm') + '\n\n' +
      'Detaylı Yatay A3 formatındaki resmi rapor ekteki PDF dosyasındadır.';

    MailApp.sendEmail({
      to: recipientStr,
      subject: subject,
      body: emailBody,
      attachments: [blob]
    });

    return jsonResponse({
      success: true,
      message: 'Mailiniz başarı ile gönderilmiştir.',
      recipients: recipientStr.split(',')
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      message: 'Mail gönderim hatası: ' + err.toString()
    });
  }
}

function getWeekKey() {
  var d = new Date();
  var target = new Date(d.valueOf());
  var dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  var firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  var weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return target.getFullYear() + '-W' + (weekNum < 10 ? '0' + weekNum : weekNum);
}
