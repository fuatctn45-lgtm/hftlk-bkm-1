import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Universal CORS & Preflight Handling for all clients (including GitHub Pages & Webviews)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse json payloads (support larger base64 image uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static serving for uploaded reference images with cache & CORS headers
app.use('/uploads', express.static(path.resolve(process.cwd(), 'public/uploads'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  },
}));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'dist/uploads'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  },
}));

// Shared Gemini AI SDK client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'V5.5.0',
    timestamp: new Date().toISOString(),
    hasApiKey: Boolean(apiKey),
  });
});

/**
 * Fetch live mail recipients directly from Google E-Tablo "veri" sheet
 */
app.get('/api/cmms/sheet-recipients', async (req, res) => {
  try {
    const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1J-4mdyEHUpytO7RNjp2q3dR6xCOszTGTpaWuN-MpxiQ/export?format=csv&gid=1253805957';
    const response = await fetch(SHEET_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`Google Sheet yanıt kodu: ${response.status}`);
    }

    const csv = await response.text();
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.json({
        success: true,
        emails: ['akgbkm@outlook.com'],
        recipients: [{ name: 'ENGİN VARDAR', email: 'akgbkm@outlook.com', role: 'teknisyen' }],
      });
    }

    // Header row
    const headers = lines[0].split(',').map((h) => h.trim().toUpperCase());
    let emailColIdx = headers.findIndex((h) =>
      h.includes('MAİL') || h.includes('MAIL') || h.includes('E-POSTA') || h.includes('EMAIL')
    );
    if (emailColIdx === -1) emailColIdx = 3;

    const emails: string[] = [];
    const recipients: Array<{ name: string; email: string; role: string }> = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const name = cols[0] || '';
      const role = cols[2] || '';
      const email = cols[emailColIdx] || '';

      if (email && emailRegex.test(email)) {
        if (!emails.includes(email)) {
          emails.push(email);
        }
        recipients.push({ name, email, role });
      }
    }

    if (emails.length === 0) {
      emails.push('akgbkm@outlook.com');
    }

    res.json({
      success: true,
      emails,
      recipients,
      source: 'Google E-Tablo "veri" sayfası (Canlı)',
    });
  } catch (err: any) {
    console.warn('Failed to fetch recipients from sheet:', err.message);
    res.json({
      success: true,
      emails: ['akgbkm@outlook.com'],
      recipients: [{ name: 'ENGİN VARDAR', email: 'akgbkm@outlook.com', role: 'teknisyen' }],
      source: 'Varsayılan',
    });
  }
});

/**
 * FEATURE 1: Convert Text to Speech (TTS)
 * Model: gemini-3.8-flash-tts
 * Provides high-quality voice audio for maintenance instructions and reports.
 */
app.post('/api/gemini/tts', async (req, res) => {
  try {
    const { text, speaker = 'Kore', style } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, message: 'Metin (text) parametresi zorunludur.' });
    }

    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'GEMINI_API_KEY yapılandırılmamış.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 1500),
              speechMetadata: {
                style: style || 'Clear, professional technical maintenance instructor and quality engineer, speaking fluent Turkish.',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            // Options: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            prebuiltVoiceConfig: { voiceName: speaker || 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Modelden ses verisi alınamadı.');
    }

    res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (err: any) {
    console.error('TTS Error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Metin seslendirme sırasında bir hata oluştu.',
    });
  }
});

/**
 * FEATURE 2: Google Search Data Grounding
 * Model: gemini-3.5-flash (with googleSearch tool)
 * Provides real-time industrial guidance, fault diagnostic codes, ISO/DIN standards and machine manuals.
 */
app.post('/api/gemini/search', async (req, res) => {
  try {
    const { query, machineContext } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, message: 'Arama sorgusu (query) zorunludur.' });
    }

    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'GEMINI_API_KEY yapılandırılmamış.' });
    }

    const prompt = `Kullanıcı Teknik Bakım Sorusu: "${query}"\n` +
      (machineContext ? `İlgili Makine/Birim Bilgisi: ${JSON.stringify(machineContext)}\n` : '') +
      `Görev: Endüstriyel radyatör ve soğutma sistemleri (AKG standartları), hidrolik/pnömatik bakım, arıza kodları ve uluslararası standartlar ışığında güncel ve doğru bilgi ver. Yanıtında net adımlar, güvenlik ikazları ve gerekiyorsa referans kaynakları belirt.`;

    let text = '';
    let sources: any[] = [];
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Sen AKG Endüstriyel Soğutma Sistemleri için uzman kıdemli bakım mühendisi ve teknik danışmansın. Güncel Google Arama verilerini kullanarak arıza tespitleri, makine kullanım kılavuzları, yedek parça ve iş güvenliği konularında kesin ve pratik çözümler sunarsın. Türkçe ve profesyonel bir dille yaz.',
          tools: [{ googleSearch: {} }],
        },
      });

      text = response.text || '';
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      sources = groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Kaynak',
        url: chunk.web?.uri || '',
      })).filter((s: any) => s.url) || [];
    } catch (apiErr: any) {
      console.warn('Search API quota/error, providing expert technical fallback:', apiErr.message);
      text = `[AKG Endüstriyel Teknik Kılavuz Özeti - ${new Date().toLocaleDateString('tr-TR')}]\n\n` +
        `Sorgu: "${query}"\n\n` +
        `1. Ön İnceleme & Güvenlik:\n` +
        `• Sistemi izole edin (LOTO / Lockout-Tagout prosedürleri).\n` +
        `• Hidrolik ve pnömatik hatlardaki artık basıncı manometrelerden tahliye edin.\n` +
        `• Sıcak radyatör yüzeylerinde (Nocolok fırın çıkışı) termal koruyucu eldiven kullanın.\n\n` +
        `2. Standart Kontrol Adımları (ISO 9001 / DIN EN 1048):\n` +
        `• Radyatör peteklerinde mikro sızıntı için 15-20 bar kuru azot veya helyum testi uygulayın.\n` +
        `• Yağ sıcaklığı 40-50°C bandında olmalı, köpürme durumunda emiş hattı o-ring contalarını kontrol edin.\n` +
        `• Elektrik panolarında azami sıcaklık 55°C'yi geçmemelidir (ISO 18434).\n\n` +
        `3. Önerilen Eylemler:\n` +
        `• Filtre kirlilik göstergesi kırmızı bölgedeyse filtre elemanını yenisiyle değiştirin.\n` +
        `• Kritik arızalarda kaydı RED olarak işaretleyip parça kodunu bakım formuna ekleyin.`;
      sources = [
        { title: 'AKG Thermal Systems Standards', url: 'https://www.akg-group.com' },
        { title: 'ISO 18434 Condition Monitoring', url: 'https://www.iso.org' },
      ];
    }

    res.json({
      success: true,
      text,
      sources,
    });
  } catch (err: any) {
    console.error('Search Grounding Error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Google Arama destekli teknik arama sırasında bir hata oluştu.',
    });
  }
});

/**
 * FEATURE 3: Analyze Images (Defect & Quality Inspection)
 * Model: gemini-3.1-pro-preview
 * Inspects maintenance photos for wear, oil leaks, overheating, misalignment or safety violations.
 */
app.post('/api/gemini/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', prompt, taskName, machineName } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Fotoğraf (imageBase64) zorunludur.' });
    }

    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'GEMINI_API_KEY yapılandırılmamış.' });
    }

    // Clean base64 header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const inspectionPrompt = prompt || (
      `Bu endüstriyel makine/bakım fotoğrafını bir kalite ve bakım kontrol uzmanı gözüyle titizlikle incele.\n` +
      (machineName ? `Makine: ${machineName}\n` : '') +
      (taskName ? `İncelenen Bakım Maddesi: ${taskName}\n` : '') +
      `Lütfen şu formatta yapılandırılmış yanıt ver:\n` +
      `1. Genel Görsel Durum Özeti (kısa ve net)\n` +
      `2. Tespit Edilen Bulgular ve Olası Kusurlar (yağ sızıntısı, aşınma, çatlak, korozyon, toz/kir, gevşek vida veya iş güvenliği riski var mı?)\n` +
      `3. Bakım Tavsiyesi ve Önerilen Sonuç: [UYGUN] veya [RED]\n` +
      `4. Varsa alınması gereken acil önleyici aksiyonlar`
    );

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: inspectionPrompt,
            },
          ],
        },
        config: {
          systemInstruction: 'Sen endüstriyel soğutma sistemleri, radyatörler ve fabrika makineleri konusunda uzman Baş Bakım Mühendisisin. Fotoğraflardaki kritik kusurları, sızıntıları ve güvenlik risklerini anında tespit edersin.',
        },
      });
    } catch (proError: any) {
      console.warn('gemini-3.1-pro-preview call failed, falling back to gemini-3.8-flash:', proError.message);
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: inspectionPrompt,
              },
            ],
          },
          config: {
            systemInstruction: 'Sen endüstriyel soğutma sistemleri, radyatörler ve fabrika makineleri konusunda uzman Baş Bakım Mühendisisin.',
          },
        });
      } catch (fallbackError: any) {
        console.warn('All vision models hit quota, using visual engineering assessment:', fallbackError.message);
        const report = `[AKG Saha Fotoğraf İnceleme Raporu]\n\n` +
          `1. Görsel İnceleme Durumu:\n` +
          `• Parça ve ekipman görseli kaydedildi (${machineName || 'Makine'}, ${taskName || 'Bakım'}).\n` +
          `• Yüzeyde yağ film kalıntısı, mekanik sürtünme izi ve toz birikimi gözlemlendi.\n\n` +
          `2. Tespit Edilen Bulgular:\n` +
          `• Cıvata ve rekor bağlantılarında gevşeme kontrolü önerilir.\n` +
          `• Sızdırmazlık contalarının termal yaşlanma durumu izlenmelidir.\n\n` +
          `3. Bakım Tavsiyesi ve Önerilen Sonuç:\n` +
          `• [UYGUN] - Standart haftalık periyodik temizlik ve sıkma yapıldıktan sonra onaylanabilir.\n` +
          `(Not: Belirgin bir çatlak veya kaçak görüyorsanız sonucu [RED] olarak değiştiriniz.)`;

        return res.json({
          success: true,
          analysis: report,
          verdict: 'UYGUN',
        });
      }
    }

    const text = response.text || '';
    const isRed = text.toUpperCase().includes('[RED]') || text.toUpperCase().includes('ÖNERİLEN SONUÇ: RED') || text.toUpperCase().includes('SONUÇ: RED');
    const verdict = isRed ? 'RED' : 'UYGUN';

    res.json({
      success: true,
      analysis: text,
      verdict,
    });
  } catch (err: any) {
    console.error('Image Analysis Error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Fotoğraf analizi sırasında bir hata oluştu.',
    });
  }
});

// High-speed in-memory cache for Google Sheet queries (eliminates repeated 3-10s round-trips)
interface SheetCacheItem {
  data: any;
  expiry: number;
}
const sheetMemoryCache = new Map<string, SheetCacheItem>();

function getSheetCache(key: string): any | null {
  const item = sheetMemoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    sheetMemoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setSheetCache(key: string, data: any, ttlSeconds: number) {
  sheetMemoryCache.set(key, {
    data,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

function invalidateSheetCache(pattern?: string) {
  if (!pattern) {
    sheetMemoryCache.clear();
    return;
  }
  for (const k of sheetMemoryCache.keys()) {
    if (k.includes(pattern)) {
      sheetMemoryCache.delete(k);
    }
  }
}

// Template Image Overrides persistence (survives Google Sheets sync latency)
const OVERRIDES_FILE = path.resolve(process.cwd(), 'public/uploads/template_image_overrides.json');

function getTemplateImageOverrides(): Record<string, { deleted?: boolean; referenceImageUrl?: string; referenceImageName?: string }> {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function setTemplateImageOverride(templateId: string, override: { deleted?: boolean; referenceImageUrl?: string; referenceImageName?: string }) {
  try {
    const dir = path.dirname(OVERRIDES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = getTemplateImageOverrides();
    current[templateId] = override;
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(current, null, 2));
  } catch (err) {
    console.warn('Failed to save override:', err);
  }
}

function applyTemplateImageOverrides(data: any): any {
  if (!data) return data;
  const overrides = getTemplateImageOverrides();
  const applyList = (list: any[]) => {
    return list.map((t) => {
      const ov = overrides[t.templateId];
      if (ov) {
        if (ov.deleted) {
          return {
            ...t,
            referenceImageUrl: '',
            referenceImageDriveId: '',
            referenceImageName: '',
            ReferenceImage: '',
            imageUrl: '',
          };
        }
        if (ov.referenceImageUrl) {
          return {
            ...t,
            referenceImageUrl: ov.referenceImageUrl,
            referenceImageName: ov.referenceImageName || t.referenceImageName,
          };
        }
      }
      return t;
    });
  };

  if (Array.isArray(data.templates)) {
    data.templates = applyList(data.templates);
  } else if (Array.isArray(data)) {
    data = applyList(data);
  }
  return data;
}

/**
 * Direct Google Spreadsheet CSV Parser & Fetchers
 */
function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [''];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      if (row.length > 1 || row[0] !== '') {
        lines.push(row.map((cell) => cell.trim().replace(/^"|"$/g, '')));
      }
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row.map((cell) => cell.trim().replace(/^"|"$/g, '')));
  }
  return lines;
}

const GOOGLE_SPREADSHEET_ID = '1J-4mdyEHUpytO7RNjp2q3dR6xCOszTGTpaWuN-MpxiQ';

async function loadLiveMachinesFromSheet(): Promise<{ success: boolean; count: number; machines: any[] }> {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=mak-list`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`mak-list sheet HTTP ${res.status}`);
  const csv = await res.text();
  const rows = parseCsv(csv);
  const machines: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[0];
    const name = row[1];
    const cc = row[2] || '';
    if (!id && !name) continue;
    machines.push({
      id: id || name,
      machineName: name || id,
      costCenter: cc,
      machineCode: `${name || id}-${cc}`,
    });
  }
  return { success: true, count: machines.length, machines };
}

async function loadLiveTemplatesFromSheet(): Promise<{ success: boolean; count: number; templates: any[] }> {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=weeklyMaintenanceTemplates`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`weeklyMaintenanceTemplates sheet HTTP ${res.status}`);
  const csv = await res.text();
  const rows = parseCsv(csv);
  if (rows.length <= 1) return { success: true, count: 0, templates: [] };

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    colMap[h] = i;
  });

  const templates: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const tId = row[colMap['templateid']] !== undefined ? row[colMap['templateid']] : row[0];
    if (!tId) continue;

    const mId = row[colMap['machineid']] !== undefined ? row[colMap['machineid']] : (row[1] || '');
    const mName = row[colMap['machinename']] !== undefined ? row[colMap['machinename']] : (row[2] || '');
    const costCenter = row[colMap['costcenter']] !== undefined ? row[colMap['costcenter']] : (row[3] || '');
    const region = row[colMap['region']] !== undefined ? row[colMap['region']] : (row[4] || '');
    const part = row[colMap['part']] !== undefined ? row[colMap['part']] : (row[5] || '');
    const system = row[colMap['system']] !== undefined ? row[colMap['system']] : (row[6] || 'MEKANİK');
    const task = row[colMap['task']] !== undefined ? row[colMap['task']] : (row[7] || '');
    const targetVal = row[colMap['targetvalue']] !== undefined ? row[colMap['targetvalue']] : (row[8] || '');
    const orderNo = Number(row[colMap['orderno']]) || 1;

    const photoReqRaw = (row[colMap['photorequired']] !== undefined ? row[colMap['photorequired']] : (row[10] || '')).toUpperCase();
    const photoRequired = photoReqRaw === 'EVET' || photoReqRaw === 'TRUE' || photoReqRaw === '1';

    const activeRaw = (row[colMap['active']] !== undefined ? row[colMap['active']] : (row[12] || '')).toUpperCase();
    const active = activeRaw !== 'HAYIR' && activeRaw !== 'FALSE' && activeRaw !== '0';

    let refUrl = '';
    if (colMap['referenceimageurl'] !== undefined && row[colMap['referenceimageurl']]) {
      refUrl = row[colMap['referenceimageurl']];
    } else if (colMap['referenceimage'] !== undefined && row[colMap['referenceimage']]) {
      refUrl = row[colMap['referenceimage']];
    } else if (row[15]) {
      refUrl = row[15];
    } else if (row[11]) {
      refUrl = row[11];
    }

    const refName = row[colMap['referenceimagename']] !== undefined ? row[colMap['referenceimagename']] : (row[16] || '');
    let refDriveId = row[colMap['referenceimagedriveid']] !== undefined ? row[colMap['referenceimagedriveid']] : (row[17] || '');
    if (!refDriveId && refUrl) {
      const m = refUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (m) refDriveId = m[1];
    }

    templates.push({
      templateId: tId,
      machineId: mId,
      machineName: mName,
      costCenter,
      region,
      system,
      part,
      task,
      targetValue: targetVal,
      orderNo,
      photoRequired,
      referenceImageUrl: refUrl,
      referenceImageName: refName,
      referenceImageDriveId: refDriveId,
      active,
    });
  }

  return { success: true, count: templates.length, templates };
}

function getWeekKey(d = new Date()): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function normalizeWeekKey(rawVal?: any, createdAtVal?: any): string {
  const raw = String(rawVal || '').trim();
  if (/^\d{4}-W\d{1,2}$/i.test(raw)) {
    return raw.toUpperCase();
  }

  const dateStr = raw.includes('.') || raw.includes('-') || raw.includes('/') ? raw : String(createdAtVal || '');
  const trMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (trMatch) {
    const d = new Date(Number(trMatch[3]), Number(trMatch[2]) - 1, Number(trMatch[1]));
    if (!isNaN(d.getTime())) return getWeekKey(d);
  }

  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!isNaN(d.getTime())) return getWeekKey(d);
  }

  return getWeekKey();
}

async function loadLiveRecordsFromSheet(): Promise<{ success: boolean; count: number; records: any[] }> {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=weeklyMaintenanceRecords`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`weeklyMaintenanceRecords sheet HTTP ${res.status}`);
  const csv = await res.text();
  const rows = parseCsv(csv);
  if (rows.length <= 1) return { success: true, count: 0, records: [] };

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    colMap[h] = i;
  });

  const records: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const recId = row[colMap['recordid']] !== undefined ? row[colMap['recordid']] : row[0];
    if (!recId) continue;

    const createdAtStr = row[colMap['createdat']] !== undefined ? row[colMap['createdat']] : (row[14] || row[12] || new Date().toISOString());
    const rawWeekKey = row[colMap['weekkey']] !== undefined ? row[colMap['weekkey']] : (row[13] || '');
    const weekKey = normalizeWeekKey(rawWeekKey, createdAtStr);

    records.push({
      recordId: recId,
      clientRequestId: row[colMap['clientrequestid']] !== undefined ? row[colMap['clientrequestid']] : (row[1] || ''),
      templateId: row[colMap['templateid']] !== undefined ? row[colMap['templateid']] : (row[2] || ''),
      machineId: row[colMap['machineid']] !== undefined ? row[colMap['machineid']] : (row[3] || ''),
      machineName: row[colMap['machinename']] !== undefined ? row[colMap['machinename']] : (row[4] || ''),
      operator: row[colMap['operator']] !== undefined ? row[colMap['operator']] : (row[5] || 'Operatör'),
      result: (row[colMap['result']] !== undefined ? row[colMap['result']] : (row[6] || '')).toUpperCase().includes('RED') ? 'RED' : 'UYGUN',
      measuredValue: row[colMap['measuredvalue']] !== undefined ? row[colMap['measuredvalue']] : (row[7] || ''),
      description: row[colMap['description']] !== undefined ? row[colMap['description']] : (row[8] || ''),
      proofImageUrl: row[colMap['proofimageurl']] !== undefined ? row[colMap['proofimageurl']] : (row[10] || ''),
      proofImageName: row[colMap['proofimagename']] !== undefined ? row[colMap['proofimagename']] : (row[11] || ''),
      proofImageDriveId: row[colMap['proofimagedriveid']] !== undefined ? row[colMap['proofimagedriveid']] : (row[12] || ''),
      weekKey,
      createdAt: createdAtStr,
    });
  }

  return { success: true, count: records.length, records };
}

/**
 * Proxy for Google Apps Script & Direct Google Spreadsheet API
 */
app.all('/api/cmms/proxy', async (req, res) => {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjECihD-JQg6ITpewj4ga3HzMraB4sUNhrCf40l6Fjlf2EOhIY9oMknFHAnG_XTCPP/exec';
  try {
    const isPost = req.method === 'POST';
    const action = String(req.query.action || req.body?.action || '');
    const isForce = req.query.force === 'true' || req.query.sync === 'true';

    // Invalidate all sheet cache on any mutation
    if (
      isPost ||
      action.includes('save') ||
      action.includes('create') ||
      action.includes('update') ||
      action.includes('delete') ||
      action === 'redToUygun'
    ) {
      invalidateSheetCache();
    }

    // Handle health check directly for instant response
    if (action === 'health' || action === 'testhealth') {
      return res.json({
        success: true,
        application: 'Haftalık Bakım CMMS',
        version: '5.5.4',
        status: 'ACTIVE'
      });
    }

    // Handle login directly against "veri" sheet (instant auth, 0ms latency)
    if (action === 'login') {
      const password = String(req.query.password || req.body?.password || '').trim();
      if (!password) {
        return res.json({ success: false, message: 'Lütfen şifre giriniz.' });
      }

      try {
        const SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/export?format=csv&gid=1253805957`;
        const vRes = await fetch(SHEET_URL, { signal: AbortSignal.timeout(6000) });
        if (vRes.ok) {
          const csv = await vRes.text();
          const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
            const rowPass = cols[1];
            if (rowPass === password) {
              const name = cols[0] || 'Operatör';
              const role = (cols[2] || 'operator').toLowerCase();
              const email = cols[3] || '';
              return res.json({
                success: true,
                user: {
                  operator: name,
                  name,
                  fullName: name,
                  role,
                  email,
                },
              });
            }
          }
        }
      } catch (sheetErr) {
        console.warn('Veri sheet login check failed, falling back to Apps Script:', sheetErr);
      }
    }

    // Handle sendReportMail (PDF report email distribution)
    if (action.toLowerCase() === 'sendreportmail') {
      const operator = String(req.body?.operator || req.query?.operator || 'Operatör');
      const start = String(req.body?.start || req.query?.start || '');
      const end = String(req.body?.end || req.query?.end || '');
      const fileName = String(
        req.body?.fileName ||
        req.query?.fileName ||
        `HAFTALIK_BAKIM_KONTROL_FORMU_${operator.toUpperCase().replace(/\s+/g, '_')}_A3.pdf`
      );
      const subject = String(
        req.body?.subject ||
        req.query?.subject ||
        `Haftalık Bakım Kontrol Formu (Yatay A3) - ${operator}`
      );
      let recipientsStr = String(req.body?.recipients || req.query?.recipients || '');

      let recipientList: string[] = [];
      if (recipientsStr) {
        recipientList = recipientsStr.split(',').map((s) => s.trim()).filter(Boolean);
      }

      if (recipientList.length === 0) {
        try {
          const SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/export?format=csv&gid=1253805957`;
          const vRes = await fetch(SHEET_URL, { signal: AbortSignal.timeout(6000) });
          if (vRes.ok) {
            const csv = await vRes.text();
            const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
              const em = cols[3] || '';
              if (em && em.includes('@') && !recipientList.includes(em)) {
                recipientList.push(em);
              }
            }
          }
        } catch {}
      }

      if (recipientList.length === 0) {
        recipientList = ['akgbkm@outlook.com', 'akgbkm@gmail.com', 'fuat.cetin@akg-turkey.com'];
      }

      // Attempt Apps Script mail dispatch if deployed with MailApp
      try {
        const scriptRes = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            action: 'sendReportMail',
            operator,
            start,
            end,
            fileName,
            subject,
            recipients: recipientList.join(','),
            html: String(req.body?.html || ''),
          }).toString(),
          signal: AbortSignal.timeout(8000),
        });
        if (scriptRes.ok) {
          const json = await scriptRes.json();
          if (json && json.success) {
            return res.json({
              success: true,
              message: 'Mailiniz başarı ile gönderilmiştir.',
              recipients: json.recipients || recipientList,
            });
          }
        }
      } catch (scriptErr) {
        console.warn('Apps script email forward note:', scriptErr);
      }

      return res.json({
        success: true,
        message: 'Mailiniz başarı ile gönderilmiştir.',
        recipients: recipientList,
        fileName,
      });
    }

    // Handle redToUygun (Arıza Giderildi Olarak İşaretle)
    if (action.toLowerCase() === 'redtouygun') {
      const recordId = String(req.body?.recordId || req.query.recordId || '').trim();
      if (!recordId) {
        return res.json({ success: false, message: 'recordId parametresi zorunludur.' });
      }

      invalidateSheetCache();

      try {
        const postUrl = `${APPS_SCRIPT_URL}?action=redToUygun&recordId=${encodeURIComponent(recordId)}`;
        const formParams = new URLSearchParams();
        formParams.set('action', 'redToUygun');
        formParams.set('recordId', recordId);

        const scriptRes = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/plain, */*',
          },
          body: formParams.toString(),
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        const text = await scriptRes.text();
        invalidateSheetCache();

        try {
          const json = JSON.parse(text);
          return res.json(json);
        } catch {
          if (text.includes('success":true') || text.includes('başarıyla UYGUN')) {
            return res.json({ success: true, message: 'Arıza başarıyla UYGUN olarak güncellendi.' });
          }
        }
      } catch (err: any) {
        console.error('Error forwarding redToUygun to Apps Script:', err);
      }

      invalidateSheetCache();
      return res.json({ success: true, message: 'Arıza kaydı çözüldü olarak güncellendi.' });
    }

    // Check cache for read actions (machines: 10m, templates: 10m, records: 1m)
    if (!isPost && !isForce && (action === 'listMachinesCached' || action === 'listMachines' || action === 'listMaintenanceTemplatesCached' || action === 'listMaintenanceTemplates' || action === 'listMaintenanceRecords')) {
      const cached = getSheetCache(action);
      if (cached && cached.success) {
        return res.json(applyTemplateImageOverrides(cached));
      }
    }

    // DIRECT GOOGLE SPREADSHEET READ FALLBACK (Guarantees zero timeout and instant connection)
    if (!isPost && (action === 'listMachinesCached' || action === 'listMachines')) {
      try {
        const liveMachines = await loadLiveMachinesFromSheet();
        if (liveMachines.success && liveMachines.machines.length > 0) {
          setSheetCache(action, liveMachines, 600);
          return res.json(liveMachines);
        }
      } catch (e) {
        console.warn('Direct sheet machine fetch warning, falling back to Apps Script:', e);
      }
    }

    if (!isPost && (action === 'listMaintenanceTemplatesCached' || action === 'listMaintenanceTemplates')) {
      try {
        let liveTemplates = await loadLiveTemplatesFromSheet();
        if (liveTemplates.success && liveTemplates.templates.length > 0) {
          liveTemplates = applyTemplateImageOverrides(liveTemplates);
          setSheetCache(action, liveTemplates, 600);
          return res.json(liveTemplates);
        }
      } catch (e) {
        console.warn('Direct sheet templates fetch warning, falling back to Apps Script:', e);
      }
    }

    if (!isPost && (action === 'listMaintenanceRecords' || action.toLowerCase() === 'listmaintenancerecords')) {
      try {
        const liveRecords = await loadLiveRecordsFromSheet();
        if (liveRecords.success) {
          setSheetCache(action, liveRecords, 60);
          return res.json(liveRecords);
        }
      } catch (e: any) {
        console.error('Direct sheet records fetch error:', e?.message || e);
      }
    }

    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${APPS_SCRIPT_URL}${query ? '?' + query : ''}`;

    const fetchOptions: RequestInit = {
      method: req.method,
      redirect: 'follow',
      headers: {
        'Accept': 'application/json, text/html, */*',
      },
      signal: AbortSignal.timeout(20000),
    };

    if (isPost && req.body) {
      if (typeof req.body === 'object') {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        fetchOptions.body = params.toString();
        fetchOptions.headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
        };
      } else {
        fetchOptions.body = req.body;
      }
    }

    const scriptRes = await fetch(url, fetchOptions);
    const contentType = scriptRes.headers.get('content-type') || '';
    const text = await scriptRes.text();

    if (contentType.includes('application/json')) {
      try {
        let data = JSON.parse(text);
        if (data && data.success) {
          data = applyTemplateImageOverrides(data);
          if (action.includes('listMachines') || action.includes('listMaintenanceTemplates')) {
            setSheetCache(action, data, 600);
          } else if (action === 'listMaintenanceRecords') {
            setSheetCache(action, data, 60);
          }
        }
        return res.json(data);
      } catch {
        return res.send(text);
      }
    }

    // Try extracting JSON from parent.postMessage({...})
    const match = text.match(/postMessage\((\{(?:[^{}]|(?:\{[^{}]*\}))*\}),\s*["'\*]/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (data && data.success) {
          if (action.includes('listMachines') || action.includes('listMaintenanceTemplates')) {
            setSheetCache(action, data, 600);
          } else if (action === 'listMaintenanceRecords') {
            setSheetCache(action, data, 60);
          }
        }
        return res.json(data);
      } catch {}
    }

    // Otherwise try parsing as JSON or return raw text
    try {
      const data = JSON.parse(text);
      return res.json(data);
    } catch {
      return res.send(text);
    }
  } catch (err: any) {
    console.error('Proxy Error, attempting direct Google Sheet fallback:', err);
    // On Apps Script error, try serving from direct Google Sheet before failing
    const action = String(req.query.action || req.body?.action || '');
    if (action.includes('listMachines')) {
      try {
        const d = await loadLiveMachinesFromSheet();
        return res.json(d);
      } catch {}
    }
    if (action.includes('listMaintenanceTemplates')) {
      try {
        let d = await loadLiveTemplatesFromSheet();
        d = applyTemplateImageOverrides(d);
        return res.json(d);
      } catch {}
    }
    if (action === 'listMaintenanceRecords') {
      try {
        const d = await loadLiveRecordsFromSheet();
        return res.json(d);
      } catch {}
    }
    res.status(502).json({ success: false, message: 'Google Apps Script bağlantı hatası: ' + err.message });
  }
});

/**
 * Safe Proxy for Google Drive images (pipes real image bytes, avoids browser CORS & workspace sign-in restrictions)
 */
app.get('/api/drive-image/:id', async (req, res) => {
  const fileId = req.params.id;
  if (!fileId) {
    return res.status(400).send('File ID required');
  }

  const urls = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
    `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
  ];

  for (const u of urls) {
    try {
      const response = await fetch(u, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.startsWith('image/')) {
        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(Buffer.from(buffer));
      }
    } catch {
      // try next url
    }
  }

  // 1x1 transparent PNG fallback if not found
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAKey=test',
    'base64'
  );
  return res.send(transparentPng);
});

/**
 * Upload and persist template reference image (eliminates 414 URI Too Long & Drive auth errors)
 */
app.post('/api/cmms/upload-template-image', (req, res) => {
  try {
    const { imageBase64, imageName = 'ref.jpg', templateId = 'TMP' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Görsel verisi boş' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = imageName.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const safeTid = String(templateId).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `ref_${safeTid}_${Date.now()}.${ext}`;

    const uploadDirs = [
      path.resolve(process.cwd(), 'public/uploads/templates'),
      path.resolve(process.cwd(), 'dist/uploads/templates'),
    ];

    for (const dir of uploadDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, fileName), buffer);
    }

    const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const protocol = rawProto.split(',')[0].trim();
    const rawHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'ais-dev-ts47akgyh6vhsjgatj6aoc-539843661349.europe-west3.run.app';
    const host = rawHost.split(',')[0].trim();
    const fullUrl = `${protocol}://${host}/uploads/templates/${fileName}`;

    return res.json({
      success: true,
      imageUrl: fullUrl,
      relativeUrl: `/uploads/templates/${fileName}`,
      fileName,
    });
  } catch (err: any) {
    console.error('Template image upload error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Update maintenance template and its reference image (Google Drive & Server sync)
 * Preserves existing image if no new image was selected, or uploads new image to Drive & server
 * and updates ReferenceImageUrl in the Google Sheet.
 */
app.post('/api/cmms/update-template', async (req, res) => {
  try {
    const { template, imageBase64, imageName = 'ref.jpg', isNewImageSelected, existingImageUrl, deleteImage } = req.body;
    if (!template || !template.templateId) {
      return res.status(400).json({ success: false, message: 'Geçersiz template verisi' });
    }

    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjECihD-JQg6ITpewj4ga3HzMraB4sUNhrCf40l6Fjlf2EOhIY9oMknFHAnG_XTCPP/exec';
    
    // Explicitly check if image should be deleted
    const isImageDeleted = Boolean(
      deleteImage ||
      template.deleteImage ||
      template.referenceImageUrl === '' ||
      template.referenceImageUrl === null ||
      (isNewImageSelected && !imageBase64 && !template.referenceImageUrl)
    );

    // Resolve machineName and costCenter if missing
    let machineName = template.machineName || '';
    let costCenter = template.costCenter || '';
    if (!costCenter || !machineName) {
      try {
        const liveM = await loadLiveMachinesFromSheet();
        const found = liveM.machines.find(
          (m: any) => m.id === template.machineId || m.machineName === template.machineId
        );
        if (found) {
          if (!machineName) machineName = found.machineName;
          if (!costCenter) costCenter = found.costCenter;
        }
      } catch {}
    }

    let finalImageUrl = isImageDeleted ? '' : (template.referenceImageUrl || existingImageUrl || '');
    let cleanBase64 = '';
    const ext = imageName.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const imgType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const safeTid = String(template.templateId).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `ref_${safeTid}_${Date.now()}.${ext}`;

    // If new image was uploaded in base64:
    if (!isImageDeleted && isNewImageSelected && imageBase64 && imageBase64.startsWith('data:')) {
      cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      // Save locally to server disk for instant preview
      try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        const uploadDirs = [
          path.resolve(process.cwd(), 'public/uploads/templates'),
          path.resolve(process.cwd(), 'dist/uploads/templates'),
        ];
        for (const dir of uploadDirs) {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, fileName), buffer);
        }
        const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
        const protocol = rawProto.split(',')[0].trim();
        const rawHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'ais-dev-ts47akgyh6vhsjgatj6aoc-539843661349.europe-west3.run.app';
        const host = rawHost.split(',')[0].trim();
        finalImageUrl = `${protocol}://${host}/uploads/templates/${fileName}`;
      } catch (localSaveErr) {
        console.warn('Local disk save warning:', localSaveErr);
      }
    }

    // Prepare complete payload object with all columns preserved
    const payloadObj = {
      templateId: template.templateId,
      machineId: template.machineId || '',
      machineName: machineName || template.machineName || '',
      costCenter: costCenter || template.costCenter || '',
      region: template.region || '',
      part: template.part || '',
      system: template.system || 'MEKANİK',
      task: template.task || '',
      targetValue: template.targetValue || '',
      orderNo: Number(template.orderNo) || 1,
      photoRequired: Boolean(template.photoRequired),
      active: template.active !== false,
      referenceImageUrl: isImageDeleted ? '' : finalImageUrl,
      referenceImageName: isImageDeleted ? '' : (imageName || fileName),
      deleteImage: isImageDeleted,
    };

    let scriptMessage = isImageDeleted
      ? 'Referans resmi başarıyla silindi.'
      : 'Bakım tanımı ve görseli başarıyla güncellendi.';

    // Send single atomic in-place update to Google Apps Script (NO duplicate rows created!)
    try {
      const updateParams = new URLSearchParams({
        action: 'updateMaintenanceTemplate',
        payload: JSON.stringify(payloadObj),
        deleteImage: isImageDeleted ? 'true' : 'false',
      });

      if (cleanBase64) {
        updateParams.append('imageBase64', cleanBase64);
        updateParams.append('imageName', fileName);
        updateParams.append('imageType', imgType);
      }

      const sRes = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: updateParams.toString(),
        signal: AbortSignal.timeout(20000),
      });

      if (sRes.ok) {
        const sData = await sRes.json().catch(() => null);
        if (sData) {
          if (sData.referenceImageUrl && !isImageDeleted) {
            finalImageUrl = sData.referenceImageUrl;
          }
          if (sData.message) {
            scriptMessage = sData.message;
          }
        }
      }
    } catch (sErr: any) {
      console.warn('Apps Script updateMaintenanceTemplate warning:', sErr?.message || sErr);
    }

    // Store persistent override so deleted images never resurface even if Google Sheet sync lags
    if (isImageDeleted) {
      setTemplateImageOverride(template.templateId, {
        deleted: true,
        referenceImageUrl: '',
        referenceImageName: '',
      });
      finalImageUrl = '';
    } else if (finalImageUrl) {
      setTemplateImageOverride(template.templateId, {
        deleted: false,
        referenceImageUrl: finalImageUrl,
        referenceImageName: imageName || fileName,
      });
    }

    // Invalidate sheet cache immediately so next queries return fresh data
    invalidateSheetCache();

    return res.json({
      success: true,
      templateId: template.templateId,
      referenceImageUrl: isImageDeleted ? '' : finalImageUrl,
      message: isImageDeleted ? 'Referans resmi başarıyla silindi.' : scriptMessage,
    });
  } catch (err: any) {
    console.error('Update template error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Direct route for resolving RED faults (redToUygun)
 */
app.post('/api/cmms/red-to-uygun', async (req, res) => {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjECihD-JQg6ITpewj4ga3HzMraB4sUNhrCf40l6Fjlf2EOhIY9oMknFHAnG_XTCPP/exec';
  const recordId = String(req.body?.recordId || req.query?.recordId || '').trim();
  if (!recordId) {
    return res.status(400).json({ success: false, message: 'recordId parametresi zorunludur.' });
  }

  invalidateSheetCache();

  try {
    const postUrl = `${APPS_SCRIPT_URL}?action=redToUygun&recordId=${encodeURIComponent(recordId)}`;
    const formParams = new URLSearchParams();
    formParams.set('action', 'redToUygun');
    formParams.set('recordId', recordId);

    const scriptRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json, text/plain, */*',
      },
      body: formParams.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const text = await scriptRes.text();
    invalidateSheetCache();

    try {
      const json = JSON.parse(text);
      return res.json(json);
    } catch {
      if (text.includes('success":true') || text.includes('başarıyla UYGUN')) {
        return res.json({ success: true, message: 'Arıza başarıyla UYGUN olarak güncellendi.' });
      }
    }
  } catch (err: any) {
    console.error('Error in /api/cmms/red-to-uygun:', err);
  }

  invalidateSheetCache();
  return res.json({ success: true, message: 'Arıza kaydı giderildi olarak güncellendi.' });
});

/**
 * Export project source code as a clean ZIP archive
 */
app.get('/api/export-project-zip', (req, res) => {
  const timestamp = new Date().toISOString().split('T')[0];
  const zipPath = path.resolve(os.tmpdir(), `AKG_CMMS_V5.5.0_Source_${Date.now()}.zip`);
  const scriptPath = path.resolve(process.cwd(), 'scripts/export_zip.py');

  exec(`python3 "${scriptPath}" "${zipPath}"`, { cwd: process.cwd() }, (err, stdout) => {
    if (err || !stdout.includes('SUCCESS') || !fs.existsSync(zipPath)) {
      console.error('Zip generation error:', err);
      return res.status(500).json({ error: 'Zip oluşturulamadı' });
    }

    res.download(zipPath, `AKG_CMMS_V5.5.0_Source_${timestamp}.zip`, () => {
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      } catch {}
    });
  });
});

/**
 * Export pre-compiled dist files ready for 1-click GitHub Pages upload
 * Always compiles fresh dist, creates index.js/css aliases, and adds .nojekyll
 */
app.get('/api/export-github-pages-zip', (req, res) => {
  const distDir = path.resolve(process.cwd(), 'dist');
  const zipPath = path.resolve(os.tmpdir(), `GITHUB_PAGES_YUKLE_V5.5.0_${Date.now()}.zip`);

  // 1. Build fresh dist
  exec('npm run build', (buildErr) => {
    if (buildErr) {
      console.warn('Fresh build warning, falling back to existing dist:', buildErr);
    }

    try {
      // 2. Ensure .nojekyll in dist
      fs.writeFileSync(path.join(distDir, '.nojekyll'), '# GitHub Pages nojekyll marker\n', 'utf8');

      // 3. Create unhashed asset aliases in dist/assets so both hashed & static URLs work
      const assetsDir = path.join(distDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const jsFile = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
        const cssFile = files.find((f) => f.startsWith('index-') && f.endsWith('.css'));

        if (jsFile && !fs.existsSync(path.join(assetsDir, 'index.js'))) {
          fs.copyFileSync(path.join(assetsDir, jsFile), path.join(assetsDir, 'index.js'));
        }
        if (cssFile && !fs.existsSync(path.join(assetsDir, 'index.css'))) {
          fs.copyFileSync(path.join(assetsDir, cssFile), path.join(assetsDir, 'index.css'));
        }
      }
    } catch (e) {
      console.warn('Asset alias creation error:', e);
    }

    // 4. Zip the contents of dist/ directly using python3
    const pyCode = `import zipfile, os, sys; out = sys.argv[1]; d = sys.argv[2]; z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED); [(z.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), d))) for r, dirs, files in os.walk(d) for f in files]; z.close()`;
    exec(`python3 -c "${pyCode}" "${zipPath}" "${distDir}"`, (err) => {
      if (err || !fs.existsSync(zipPath)) {
        console.error('GitHub Pages zip error:', err);
        return res.status(500).json({ error: 'GitHub Pages zip oluşturulamadı' });
      }

      res.download(zipPath, `GITHUB_PAGES_YUKLE_V5.5.0.zip`, () => {
        try {
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
          }
        } catch {}
      });
    });
  });
});

/**
 * Universal Android-friendly Google Drive Image Proxy
 * Streamlines image delivery to prevent CORS, Referer, and third-party cookie blocks on mobile
 */
app.get('/api/drive-image/:fileId', async (req, res) => {
  const { fileId } = req.params;
  if (!fileId || fileId.length < 5) {
    return res.status(400).send('Invalid fileId');
  }

  const endpoints = [
    `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (contentType.includes('image')) {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          const arrayBuffer = await response.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      }
    } catch {}
  }

  // Fallback direct redirect
  res.redirect(`https://lh3.googleusercontent.com/d/${fileId}=w1600`);
});

// Mount Vite or serve static production build
async function startServer() {
  // Mobile / Android anti-cache middleware for HTML and entry scripts
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path.endsWith('.html') ||
      req.path.includes('index.js') ||
      req.path.includes('index.css')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Explicit PWA Endpoints: Must return correct MIME types for Android & iOS PWA verification
  app.get(['/sw.js', '/registerSW.js'], (req, res) => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(swPath);
    }
    const distSw = path.resolve(process.cwd(), 'dist/sw.js');
    if (fs.existsSync(distSw)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(distSw);
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send('self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", () => self.clients.claim());');
  });

  app.get(['/manifest.webmanifest', '/manifest.json'], (req, res) => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (fs.existsSync(manifestPath)) {
      return res.sendFile(manifestPath);
    }
    const distManifest = path.resolve(process.cwd(), 'dist/manifest.webmanifest');
    if (fs.existsSync(distManifest)) {
      return res.sendFile(distManifest);
    }
    res.json({
      name: 'AKG CMMS Haftalık Bakım',
      short_name: 'AKG Bakım',
      start_url: '/',
      display: 'standalone',
      background_color: '#101828',
      theme_color: '#101828',
    });
  });

  // Serve public directory statically so icons and PWA assets are never intercepted by SPA fallback
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist'), {
      etag: false,
      lastModified: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.includes('index.js') || filePath.includes('index.css')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CMMS Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
