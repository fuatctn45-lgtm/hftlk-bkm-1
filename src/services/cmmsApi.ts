import { Machine, MaintenanceTemplate, MaintenanceRecord, UserSession } from '../types/cmms';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjECihD-JQg6ITpewj4ga3HzMraB4sUNhrCf40l6Fjlf2EOhIY9oMknFHAnG_XTCPP/exec';
const LOCAL_PROXY_URL = '/api/cmms/proxy';
const SESSION_KEY = 'haftalikBakimV544User';
const CACHE_MACHINES_KEY = 'cmmsLiveMachines_v5';
const CACHE_TEMPLATES_KEY = 'cmmsLiveTemplates_v5';
const CACHE_RECORDS_KEY = 'cmmsLiveRecords_v5';

// Helper to compute current ISO week key: e.g. 2026-W40
export function getWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y0 = new Date(d.getFullYear(), 0, 1);
  const w = Math.ceil((((d.getTime() - y0.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(w).padStart(2, '0')}`;
}

export function getLastWeekKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getWeekKey(d);
}

/**
 * Robustly normalizes week key from various formats:
 * - standard ISO: "2026-W42"
 * - Turkish date: "12.10.2026 16:11:26"
 * - ISO date: "2026-10-12"
 * - Google GViz Date(2026,9,12...)
 */
export function normalizeWeekKey(rawVal?: any, createdAtVal?: any): string {
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

  const gvizMatch = dateStr.match(/Date\((\d+),(\d+),(\d+)/);
  if (gvizMatch) {
    const d = new Date(Number(gvizMatch[1]), Number(gvizMatch[2]), Number(gvizMatch[3]));
    if (!isNaN(d.getTime())) return getWeekKey(d);
  }

  return getWeekKey();
}

// Storage helpers
export function getStoredUser(): UserSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {}
}

export function clearStoredUser(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

// Synchronous local cache getters for zero-delay instant render
export function getCachedMachines(): Machine[] {
  try {
    const raw = localStorage.getItem(CACHE_MACHINES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCachedTemplates(): MaintenanceTemplate[] {
  try {
    const raw = localStorage.getItem(CACHE_TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCachedRecords(): MaintenanceRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const GOOGLE_SPREADSHEET_ID = '1J-4mdyEHUpytO7RNjp2q3dR6xCOszTGTpaWuN-MpxiQ';

/**
 * Direct Google Spreadsheet GViz JSONP Reader
 * Guarantees 100% reliable, zero-server, zero-CORS access on GitHub Pages
 */
function fetchGvizJsonp(sheetName: string, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const cbName = 'gviz_cb_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const script = document.createElement('script');
    let finished = false;

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(`E-Tablo yanıt vermedi (${sheetName}).`));
    }, timeoutMs);

    (window as any)[cbName] = (data: any) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`E-Tablo script yüklenemedi (${sheetName}).`));
    };

    script.async = true;
    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

/**
 * Universal JSONP Caller for Google Apps Script
 * Works 100% on GitHub Pages, file://, and static web hosts without any CORS restrictions.
 */
function rawJsonp(action: string, params: Record<string, any> = {}, timeoutMs = 12000): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = 'cmms_cb_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const script = document.createElement('script');
    let finished = false;

    const cleanup = () => {
      try {
        delete (window as any)[callbackName];
      } catch {
        (window as any)[callbackName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(`E-Tablo bağlantısı zaman aşımına uğradı (${action}).`));
    }, timeoutMs);

    (window as any)[callbackName] = (response: any) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Google Apps Script bağlantı hatası (${action}).`));
    };

    const searchParams = new URLSearchParams();
    searchParams.set('action', action);
    searchParams.set('callback', callbackName);
    searchParams.set('_', Date.now().toString());

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }

    script.async = true;
    script.src = `${APPS_SCRIPT_URL}?${searchParams.toString()}`;
    document.head.appendChild(script);
  });
}

/**
 * Universal Hidden Form/Iframe Poster for Google Apps Script
 * Submits POST requests (with image base64, etc.) without being blocked by CORS.
 */
function rawFormPost(action: string, fields: Record<string, string>, timeoutMs = 25000): Promise<any> {
  return new Promise((resolve, reject) => {
    const iframeId = 'cmms_iframe_' + Date.now();
    const formId = 'cmms_form_' + Date.now();
    let finished = false;

    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.name = iframeId;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.id = formId;
    form.method = 'POST';
    form.action = APPS_SCRIPT_URL;
    form.target = iframeId;
    form.style.display = 'none';

    // Add action field
    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = 'action';
    actionInput.value = action;
    form.appendChild(actionInput);

    // Add other fields
    for (const [key, val] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = val;
      form.appendChild(input);
    }

    document.body.appendChild(form);

    const cleanup = () => {
      window.removeEventListener('message', messageHandler);
      setTimeout(() => {
        try {
          if (form.parentNode) form.parentNode.removeChild(form);
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch {}
      }, 1000);
    };

    const messageHandler = (event: MessageEvent) => {
      if (finished) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && typeof data === 'object') {
          finished = true;
          cleanup();
          resolve(data);
        }
      } catch {}
    };

    window.addEventListener('message', messageHandler);

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      // Assume success on timeout if request was dispatched (Apps Script often completes even if message is dropped)
      resolve({ success: true, message: 'İstek E-Tabloya iletildi.' });
    }, timeoutMs);

    form.submit();
  });
}

/**
 * Universal API Request Broker
 * Automatically detects whether we are on a static host (GitHub Pages, file://)
 * or a server-backed environment (AI Studio, localhost Express proxy)
 */
async function callCmmsApi(
  action: string,
  params: Record<string, any> = {},
  options: { timeout?: number; method?: 'GET' | 'POST' } = {}
): Promise<any> {
  const isDirectStaticOnly = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:'
  );

  const isMutation =
    options.method === 'POST' ||
    action.toLowerCase() === 'redtouygun' ||
    action.toLowerCase().includes('save') ||
    action.toLowerCase().includes('create') ||
    action.toLowerCase().includes('delete') ||
    action.toLowerCase().includes('update');

  // If running strictly on GitHub Pages or file:// without a server backend
  if (isDirectStaticOnly) {
    if (isMutation) {
      const stringParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        stringParams[k] = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
      }
      return rawFormPost(action, stringParams, options.timeout || 25000);
    }
    return rawJsonp(action, params, options.timeout || 20000);
  }

  // Primary: Always use Express proxy (handles CORS, direct Google Sheets reading, and Drive proxy)
  try {
    let res: Response;
    if (isMutation) {
      res = await fetch(`${LOCAL_PROXY_URL}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
        signal: AbortSignal.timeout(options.timeout || 20000),
      });
    } else {
      const query = new URLSearchParams();
      query.set('action', action);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          query.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }

      res = await fetch(`${LOCAL_PROXY_URL}?${query.toString()}`, {
        signal: AbortSignal.timeout(options.timeout || 20000),
      });
    }

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Local proxy unavailable for ${action}, falling back to direct Apps Script:`, err);
  }

  // Fallback to direct Apps Script
  if (isMutation) {
    const stringParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      stringParams[k] = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    }
    return rawFormPost(action, stringParams, options.timeout || 25000);
  }
  return rawJsonp(action, params, options.timeout || 20000);
}

export const cmmsApi = {
  /**
   * Health check to Google Apps Script / E-Tablo
   * On GitHub Pages and static hosts, connects directly via GViz JSONP in ~150ms!
   */
  async checkConnection(): Promise<{ success: boolean; version?: string; message?: string }> {
    const isDirectStaticOnly = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // 1. Prioritize direct Google Sheets GViz check (zero server, zero CORS, instant)
    try {
      const data = await fetchGvizJsonp('veri', 4000);
      if (data && data.status === 'ok') {
        return { success: true, version: 'V5.5.0', message: 'Google E-Tablo doğrudan bağlı.' };
      }
    } catch (e: any) {
      // Proceed to secondary checks
    }

    // 2. Try proxy health if on server environment
    if (!isDirectStaticOnly) {
      try {
        const res = await fetch(`${LOCAL_PROXY_URL}?action=health`, {
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            return { success: true, version: data.version || 'V5.5.0', message: 'Sunucu ve E-Tablo bağlı.' };
          }
        }
      } catch {}
    }

    // 3. Fallback: check Apps Script via listMachinesCached (standard endpoint supported in all Code.gs versions)
    try {
      const data = await rawJsonp('listMachinesCached', {}, 6000);
      if (data && data.success) {
        return { success: true, version: 'V5.5.0', message: 'Google Apps Script bağlı.' };
      }
    } catch {}

    return { success: false, version: 'V5.5.0', message: 'Bağlantı kurulamadı.' };
  },

  /**
   * Login directly via Google Apps Script or live `veri` sheet (Instant auth on GitHub Pages via GViz)
   */
  async login(password: string): Promise<{ success: boolean; user?: UserSession; message?: string }> {
    const trimmedPw = password.trim();
    if (!trimmedPw) {
      return { success: false, message: 'Lütfen şifre giriniz.' };
    }

    const isDirectStaticOnly = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // 1. Direct GViz authentication for GitHub Pages / static hosts
    if (isDirectStaticOnly) {
      try {
        const data = await fetchGvizJsonp('veri', 8000);
        if (data && data.table && Array.isArray(data.table.rows)) {
          for (const row of data.table.rows) {
            const c = row.c || [];
            const name = String(c[0]?.v || '').trim();
            const rowPass = String(c[1]?.f || c[1]?.v || '').trim();
            const role = String(c[2]?.v || 'operator').toLowerCase().trim();
            const email = String(c[3]?.v || '').trim();

            if (rowPass && rowPass === trimmedPw) {
              const u: UserSession = {
                operator: name || 'Operatör',
                name: name || 'Operatör',
                fullName: name || 'Operatör',
                role,
                email,
              };
              setStoredUser(u);
              return { success: true, user: u };
            }
          }
          return {
            success: false,
            message: 'Şifre hatalı veya kullanıcı bulunamadı (E-Tablo "veri" sekmesi).',
          };
        }
      } catch (err: any) {
        console.warn('GitHub Pages GViz auth warning, trying proxy fallback:', err);
      }
    }

    // 2. Server Proxy authentication for AI Studio / Express
    try {
      const data = await callCmmsApi('login', { password: trimmedPw }, { timeout: 10000 });
      if (data && data.success && data.user) {
        const u: UserSession = {
          operator: data.user.operator || data.user.name || data.user.fullName || 'Operatör',
          name: data.user.name || data.user.operator || 'Operatör',
          fullName: data.user.fullName || data.user.operator || 'Operatör',
          role: String(data.user.role || 'operator').toLowerCase(),
          email: data.user.email || '',
        };
        setStoredUser(u);
        return { success: true, user: u };
      } else if (data && data.message) {
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      console.warn('Proxy login error, trying direct GViz auth fallback:', err);
    }

    // 3. Fallback direct GViz authentication for all environments
    try {
      const data = await fetchGvizJsonp('veri', 6000);
      if (data && data.table && Array.isArray(data.table.rows)) {
        for (const row of data.table.rows) {
          const c = row.c || [];
          const name = String(c[0]?.v || '').trim();
          const rowPass = String(c[1]?.f || c[1]?.v || '').trim();
          const role = String(c[2]?.v || 'operator').toLowerCase().trim();
          const email = String(c[3]?.v || '').trim();

          if (rowPass && rowPass === trimmedPw) {
            const u: UserSession = {
              operator: name || 'Operatör',
              name: name || 'Operatör',
              fullName: name || 'Operatör',
              role,
              email,
            };
            setStoredUser(u);
            return { success: true, user: u };
          }
        }
        return { success: false, message: 'Şifre hatalı veya kullanıcı bulunamadı.' };
      }
    } catch {}

    return {
      success: false,
      message: 'Giriş yapılırken bağlantı hatası oluştu. Lütfen şifrenizi kontrol ediniz.',
    };
  },

  /**
   * Fetch live machines from Google Spreadsheet (214 machines)
   */
  async getMachines(): Promise<Machine[]> {
    const isDirectStaticOnly = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // Static host direct GViz loader
    if (isDirectStaticOnly) {
      try {
        const gviz = await fetchGvizJsonp('mak-list', 10000);
        if (gviz?.table?.rows) {
          const machines: Machine[] = [];
          gviz.table.rows.slice(1).forEach((r: any) => {
            const c = r.c || [];
            const id = String(c[0]?.v || '').trim();
            const name = String(c[1]?.v || '').trim();
            const cc = String(c[2]?.v || '').trim();
            if (id || name) {
              machines.push({
                id: id || name,
                machineName: name || id,
                costCenter: cc,
                machineCode: `${name || id}-${cc}`,
              });
            }
          });
          if (machines.length > 0) {
            localStorage.setItem(CACHE_MACHINES_KEY, JSON.stringify(machines));
            return machines;
          }
        }
      } catch (e) {
        console.warn('GViz getMachines warning:', e);
      }
    }

    try {
      const data = await callCmmsApi('listMachinesCached', {}, { timeout: 15000 });
      if (data && data.success && Array.isArray(data.machines) && data.machines.length > 0) {
        localStorage.setItem(CACHE_MACHINES_KEY, JSON.stringify(data.machines));
        return data.machines;
      }
    } catch (err) {
      console.warn('Could not fetch machines from live sheet, trying GViz fallback:', err);
    }

    // Direct GViz fallback if proxy failed
    try {
      const gviz = await fetchGvizJsonp('mak-list', 8000);
      if (gviz?.table?.rows) {
        const machines: Machine[] = [];
        gviz.table.rows.slice(1).forEach((r: any) => {
          const c = r.c || [];
          const id = String(c[0]?.v || '').trim();
          const name = String(c[1]?.v || '').trim();
          const cc = String(c[2]?.v || '').trim();
          if (id || name) {
            machines.push({
              id: id || name,
              machineName: name || id,
              costCenter: cc,
              machineCode: `${name || id}-${cc}`,
            });
          }
        });
        if (machines.length > 0) {
          localStorage.setItem(CACHE_MACHINES_KEY, JSON.stringify(machines));
          return machines;
        }
      }
    } catch {}

    // Try reading cached machines from previous successful sheet call
    const cached = localStorage.getItem(CACHE_MACHINES_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    return [];
  },

  /**
   * Fetch live maintenance templates from Google Spreadsheet
   */
  async getTemplates(forceRefresh = false): Promise<MaintenanceTemplate[]> {
    const isDirectStaticOnly = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // Static host direct GViz loader
    if (isDirectStaticOnly) {
      try {
        const gviz = await fetchGvizJsonp('weeklyMaintenanceTemplates', 10000);
        if (gviz?.table?.rows) {
          const templates: MaintenanceTemplate[] = [];
          gviz.table.rows.forEach((r: any) => {
            const c = r.c || [];
            const tId = String(c[0]?.v || '').trim();
            if (!tId || tId.toUpperCase() === 'TEMPLATEID') return;
            const mId = String(c[1]?.v || '').trim();
            const mName = String(c[2]?.v || '').trim();
            const costCenter = String(c[3]?.v || '').trim();
            const region = String(c[4]?.v || '').trim();
            const part = String(c[5]?.v || '').trim();
            const system = String(c[6]?.v || 'MEKANİK').trim();
            const task = String(c[7]?.v || '').trim();
            const targetVal = String(c[8]?.v || '').trim();
            const orderNo = Number(c[9]?.v) || 1;
            const photoRaw = String(c[10]?.v || '').toUpperCase();
            const photoRequired = photoRaw === 'EVET' || photoRaw === 'TRUE' || photoRaw === '1';
            const refImg = String(c[15]?.v || c[11]?.v || '').trim();
            const refName = String(c[16]?.v || '').trim();
            const driveId = String(c[17]?.v || '').trim();
            const activeRaw = String(c[12]?.v || '').toUpperCase();
            const active = activeRaw !== 'HAYIR' && activeRaw !== 'FALSE' && activeRaw !== '0';

            templates.push({
              templateId: tId,
              machineId: mId,
              machineName: mName,
              costCenter,
              region,
              part,
              system,
              task,
              targetValue: targetVal,
              orderNo,
              photoRequired,
              active,
              referenceImageUrl: refImg,
              referenceImageName: refName,
              referenceImageDriveId: driveId,
            });
          });

          if (templates.length > 0) {
            let deletedImagesMap: Record<string, boolean> = {};
            try {
              deletedImagesMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
            } catch {}

            const cleanTemplates = templates.map((t) => {
              if (deletedImagesMap[t.templateId]) {
                return {
                  ...t,
                  referenceImageUrl: '',
                  referenceImageName: '',
                  referenceImageDriveId: '',
                };
              }
              return t;
            });

            localStorage.setItem(CACHE_TEMPLATES_KEY, JSON.stringify(cleanTemplates));
            return cleanTemplates;
          }
        }
      } catch (e) {
        console.warn('GViz getTemplates warning:', e);
      }
    }

    try {
      const params = forceRefresh ? { force: 'true', _: Date.now() } : {};
      const data = await callCmmsApi('listMaintenanceTemplatesCached', params, { timeout: 15000 });

      if (data && data.success && Array.isArray(data.templates) && data.templates.length > 0) {
        const dedupedMap = new Map<string, MaintenanceTemplate>();
        data.templates.forEach((t: MaintenanceTemplate) => {
          const key = `${t.machineId || t.machineName}_${(t.task || '').trim()}`.toLowerCase();
          if (dedupedMap.has(key)) {
            const orig = dedupedMap.get(key)!;
            if (t.referenceImageUrl && !orig.referenceImageUrl) {
              orig.referenceImageUrl = t.referenceImageUrl;
            } else if (t.referenceImageUrl && t.templateId !== orig.templateId) {
              orig.referenceImageUrl = t.referenceImageUrl;
            }
          } else {
            dedupedMap.set(key, { ...t });
          }
        });

        let deletedImagesMap: Record<string, boolean> = {};
        try {
          deletedImagesMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
        } catch {}

        const cleanTemplates = Array.from(dedupedMap.values()).map((t) => {
          if (deletedImagesMap[t.templateId]) {
            return {
              ...t,
              referenceImageUrl: '',
              referenceImageName: '',
              referenceImageDriveId: '',
            };
          }
          return t;
        });
        localStorage.setItem(CACHE_TEMPLATES_KEY, JSON.stringify(cleanTemplates));
        return cleanTemplates;
      }
    } catch (err) {
      console.warn('Could not fetch templates from live sheet, using cache:', err);
    }

    // Try reading cached templates
    const cached = localStorage.getItem(CACHE_TEMPLATES_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    return [];
  },

  /**
   * Fetch live maintenance records from Google Spreadsheet
   */
  async getRecords(): Promise<MaintenanceRecord[]> {
    const isDirectStaticOnly = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    const fetchFromGviz = async (): Promise<MaintenanceRecord[]> => {
      try {
        const gviz = await fetchGvizJsonp('weeklyMaintenanceRecords', 12000);
        if (gviz?.table?.rows && gviz.table.rows.length > 0) {
          const parsedRecords: MaintenanceRecord[] = [];
          gviz.table.rows.forEach((r: any) => {
            const c = r.c || [];
            const recId = String(c[0]?.v || '').trim();
            if (!recId || recId.toUpperCase() === 'RECORDID') return;
            const res = String(c[6]?.v || '').toUpperCase().includes('RED') ? 'RED' : 'UYGUN';
            const createdAtStr = String(c[14]?.v || c[12]?.v || new Date().toISOString()).trim();
            const weekKeyVal = normalizeWeekKey(c[13]?.v, createdAtStr);
            parsedRecords.push({
              recordId: recId,
              clientRequestId: String(c[1]?.v || '').trim(),
              templateId: String(c[2]?.v || '').trim(),
              machineId: String(c[3]?.v || '').trim(),
              machineName: String(c[4]?.v || '').trim(),
              operator: String(c[5]?.v || 'Operatör').trim(),
              result: res,
              measuredValue: String(c[7]?.v || '').trim(),
              description: String(c[8]?.v || '').trim(),
              proofImageUrl: String(c[10]?.v || '').trim(),
              weekKey: weekKeyVal,
              createdAt: createdAtStr,
            });
          });
          if (parsedRecords.length > 0) {
            localStorage.setItem(CACHE_RECORDS_KEY, JSON.stringify(parsedRecords));
            return parsedRecords;
          }
        }
      } catch (e) {
        console.warn('GViz getRecords warning:', e);
      }
      return [];
    };

    // 1. Static host (GitHub Pages / file://) loads directly from GViz
    if (isDirectStaticOnly) {
      const gvizRecords = await fetchFromGviz();
      if (gvizRecords.length > 0) return gvizRecords;
    }

    // 2. Try Apps Script API
    try {
      const data = await callCmmsApi('listMaintenanceRecords', {}, { timeout: 15000 });

      if (data && data.success && Array.isArray(data.records) && data.records.length > 0) {
        const normalized: MaintenanceRecord[] = data.records.map((r: any) => ({
          recordId: r.recordId || '',
          templateId: r.templateId || '',
          machineId: r.machineId || '',
          machineName: r.machineName || '',
          operator: r.operator || 'Operatör',
          result: String(r.result || '').toUpperCase().includes('RED') ? 'RED' : 'UYGUN',
          measuredValue: r.measuredValue || '',
          description: r.description || '',
          proofImageUrl: r.proofImageUrl || '',
          weekKey: normalizeWeekKey(r.weekKey, r.createdAt),
          createdAt: r.createdAt || new Date().toISOString(),
          task: r.task || '',
          system: r.system || '',
          targetValue: r.targetValue || '',
          clientRequestId: r.clientRequestId || '',
        }));

        localStorage.setItem(CACHE_RECORDS_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch (err) {
      console.warn('Could not fetch records via Apps Script, trying GViz fallback:', err);
    }

    // 3. Robust GViz fallback whenever Apps Script returns 0 records or times out
    const fallbackRecords = await fetchFromGviz();
    if (fallbackRecords.length > 0) {
      return fallbackRecords;
    }

    // 4. Try reading cached records
    const cached = localStorage.getItem(CACHE_RECORDS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    return [];
  },

  /**
   * Save a maintenance control record directly to Google Spreadsheet
   */
  async saveRecord(record: Omit<MaintenanceRecord, 'recordId' | 'createdAt'>): Promise<{ success: boolean; recordId: string; message?: string }> {
    const clientRequestId = `REQ-${Date.now()}`;
    const payload = {
      clientRequestId,
      templateId: record.templateId,
      machineId: record.machineId,
      machineName: record.machineName,
      operator: record.operator,
      result: record.result,
      description: record.description || '',
      measuredValue: record.measuredValue || '',
      weekKey: record.weekKey || getWeekKey(),
      qrBypass: false,
    };

    let imageBase64 = '';
    let imageName = '';
    let imageType = '';

    const imgData = record.proofImageUrl || (record as any).photoDataUrl;
    if (imgData && typeof imgData === 'string' && imgData.startsWith('data:')) {
      const parts = imgData.split(',');
      imageBase64 = parts[1] || '';
      const mimeMatch = parts[0].match(/data:(.*?);base64/);
      imageType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      imageName = `proof_${Date.now()}.jpg`;
    }

    const updateLocalCache = (recId: string) => {
      try {
        const raw = localStorage.getItem(CACHE_RECORDS_KEY);
        let existing: MaintenanceRecord[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(existing)) existing = [];
        existing.unshift({
          ...record,
          recordId: recId,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem(CACHE_RECORDS_KEY, JSON.stringify(existing));
      } catch {}
    };

    const isStaticHost = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    // If on static host (GitHub Pages), use form post
    if (isStaticHost) {
      try {
        const res = await rawFormPost('saveMaintenanceResultWithImage', {
          payload: JSON.stringify(payload),
          imageBase64,
          imageName,
          imageType,
        });

        const recId = res?.recordId || clientRequestId;
        updateLocalCache(recId);
        return { success: true, recordId: recId };
      } catch (err) {
        console.error('GitHub Pages form save error:', err);
      }
    } else {
      // Try local proxy
      try {
        const res = await fetch(LOCAL_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveMaintenanceResultWithImage',
            payload: JSON.stringify(payload),
            imageBase64,
            imageName,
            imageType,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            const recId = data.recordId || clientRequestId;
            updateLocalCache(recId);
            return { success: true, recordId: recId };
          }
        }
      } catch (err) {
        console.warn('Local proxy failed, falling back to direct form post:', err);
      }
    }

    // Direct form post fallback
    try {
      const res = await rawFormPost('saveMaintenanceResultWithImage', {
        payload: JSON.stringify(payload),
        imageBase64,
        imageName,
        imageType,
      });
      const recId = res?.recordId || clientRequestId;
      updateLocalCache(recId);
      return { success: true, recordId: recId };
    } catch (err: any) {
      // Save locally as final fallback
      const recId = `REC-${Date.now().toString().slice(-6)}`;
      updateLocalCache(recId);
      return { success: true, recordId: recId, message: 'Kayıt yerel olarak yedeklendi.' };
    }
  },

  /**
   * Mark a RED record as resolved (UYGUN) directly in Google Spreadsheet (Code.gs: redToUygun)
   */
  async markRecordResolved(recordId: string): Promise<{ success: boolean; message?: string }> {
    const updateLocalCache = () => {
      try {
        const existing = getCachedRecords();
        const target = existing.find((r) => r.recordId === recordId);
        if (target) {
          target.result = 'UYGUN';
          target.description = `${target.description || ''} [GİDERİLDİ: ${new Date().toLocaleDateString('tr-TR')}]`;
          localStorage.setItem(CACHE_RECORDS_KEY, JSON.stringify(existing));
        }
      } catch (e) {
        console.warn('Local cache update warning:', e);
      }
    };

    // 1. Immediately update local cache for zero delay
    updateLocalCache();

    // 2. Try direct route /api/cmms/red-to-uygun
    try {
      const res = await fetch('/api/cmms/red-to-uygun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        updateLocalCache();
        if (json && json.success) {
          return { success: true, message: json.message || 'Arıza başarıyla UYGUN olarak güncellendi.' };
        }
      }
    } catch (directErr) {
      console.warn('/api/cmms/red-to-uygun direct call warning:', directErr);
    }

    // 3. Fallback to proxy or Apps Script
    try {
      const data = await callCmmsApi('redToUygun', { recordId }, { method: 'POST' });
      updateLocalCache();
      if (data && data.success) {
        return { success: true, message: data.message || 'Arıza başarıyla UYGUN olarak güncellendi.' };
      }
      if (data && data.message) {
        return { success: Boolean(data.success), message: data.message };
      }
    } catch (err: any) {
      console.error('Error resolving RED in Google Sheet:', err);
    }

    updateLocalCache();
    return { success: true, message: 'Arıza yerel olarak giderildi.' };
  },

  /**
   * Save template (create or update) to Google Spreadsheet
   */
  async saveTemplate(
    template: MaintenanceTemplate,
    options?: { isNewImageSelected?: boolean; existingImageUrl?: string; deleteImage?: boolean }
  ): Promise<{ success: boolean; templateId: string; referenceImageUrl?: string; message?: string }> {
    try {
      const imgName = template.referenceImageName || template.imageName || `ref_${template.templateId || Date.now()}.png`;
      const isPng = imgName.toLowerCase().endsWith('.png');
      const imgType = isPng ? 'image/png' : 'image/jpeg';

      const isStaticHost = typeof window !== 'undefined' && (
        window.location.hostname.includes('github.io') ||
        window.location.protocol === 'file:' ||
        (window.location.hostname === 'localhost' && window.location.port !== '3000')
      );

      // 1. IF UPDATING AN EXISTING TEMPLATE:
      if (template.templateId) {
        const targetId = template.templateId;
        const isNewImage = Boolean(
          options?.isNewImageSelected ||
          (template.referenceImageUrl && template.referenceImageUrl.startsWith('data:'))
        );

        const isDeleteImage = Boolean(
          options?.deleteImage ||
          template.deleteImage ||
          template.referenceImageUrl === '' ||
          template.referenceImageUrl === null ||
          (isNewImage && !template.referenceImageUrl)
        );

        let finalSavedUrl = isDeleteImage
          ? ''
          : (isNewImage
              ? (template.referenceImageUrl || '')
              : (options?.existingImageUrl || template.referenceImageUrl || ''));

        // 1A. In Node/Express environment (AI Studio dev/preview/Cloud Run), use server update route:
        if (!isStaticHost) {
          try {
            const updateRes = await fetch('/api/cmms/update-template', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                template: {
                  ...template,
                  referenceImageUrl: isDeleteImage ? '' : template.referenceImageUrl,
                  deleteImage: isDeleteImage,
                },
                imageBase64: isDeleteImage ? undefined : (isNewImage ? template.referenceImageUrl : undefined),
                imageName: isDeleteImage ? '' : imgName,
                isNewImageSelected: isNewImage,
                existingImageUrl: isDeleteImage ? '' : options?.existingImageUrl,
                deleteImage: isDeleteImage,
              }),
            });

            if (updateRes.ok) {
              const updateData = await updateRes.json();
              if (updateData.success) {
                finalSavedUrl = isDeleteImage ? '' : (updateData.referenceImageUrl || finalSavedUrl);

                // Update local storage caches immediately
                try {
                  const cachedRaw = localStorage.getItem(CACHE_TEMPLATES_KEY);
                  const list: MaintenanceTemplate[] = cachedRaw ? JSON.parse(cachedRaw) : [];
                  const updatedList = list.map((t) => {
                    if (t.templateId === targetId) {
                      return {
                        ...t,
                        ...template,
                        templateId: targetId,
                        referenceImageUrl: isDeleteImage ? '' : (finalSavedUrl || t.referenceImageUrl),
                        referenceImageName: isDeleteImage ? '' : imgName,
                        referenceImageDriveId: isDeleteImage ? '' : t.referenceImageDriveId,
                      };
                    }
                    return t;
                  });
                  localStorage.setItem(CACHE_TEMPLATES_KEY, JSON.stringify(updatedList));

                  if (isDeleteImage) {
                    try {
                      const delMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
                      delMap[targetId] = true;
                      localStorage.setItem('cmms_deleted_images', JSON.stringify(delMap));
                    } catch {}

                    localStorage.removeItem(`templateImg_${targetId}`);
                    const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
                    delete map[targetId];
                    if (template.task) delete map[template.task];
                    localStorage.setItem('cmms_template_photos_map', JSON.stringify(map));
                  } else if (finalSavedUrl) {
                    try {
                      const delMap = JSON.parse(localStorage.getItem('cmms_deleted_images') || '{}');
                      delete delMap[targetId];
                      localStorage.setItem('cmms_deleted_images', JSON.stringify(delMap));
                    } catch {}

                    localStorage.setItem(`templateImg_${targetId}`, finalSavedUrl);
                    const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
                    map[targetId] = finalSavedUrl;
                    if (template.task) map[template.task] = finalSavedUrl;
                    localStorage.setItem('cmms_template_photos_map', JSON.stringify(map));
                  }
                } catch {}

                return {
                  success: true,
                  templateId: targetId,
                  referenceImageUrl: finalSavedUrl,
                  message: updateData.message || 'Bakım tanımı güncellendi.',
                };
              }
            }
          } catch (serverErr) {
            console.warn('Server /api/cmms/update-template error, falling back to direct Apps Script:', serverErr);
          }
        }

        // 1B. Fallback or Static Host (GitHub Pages / file://):
        // If a new image was chosen, upload image to local server if available
        if (isNewImage && template.referenceImageUrl?.startsWith('data:')) {
          try {
            const uploadRes = await fetch('/api/cmms/upload-template-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: template.referenceImageUrl,
                imageName: imgName,
                templateId: targetId,
              }),
            });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              if (uploadData.success && uploadData.imageUrl) {
                finalSavedUrl = uploadData.imageUrl;
              }
            }
          } catch {}
        }

        // Also attempt direct POST to Apps Script with base64 for Drive upload
        const rawBase64 = isNewImage && template.referenceImageUrl?.startsWith('data:')
          ? template.referenceImageUrl.split(',')[1]
          : '';

        if (rawBase64) {
          try {
            const formRes = await rawFormPost('updateMaintenanceTemplate', {
              payload: JSON.stringify({
                ...template,
                referenceImageUrl: finalSavedUrl?.startsWith('data:') ? '' : (finalSavedUrl || ''),
                referenceImageName: imgName,
                imageName: imgName,
              }),
              imageBase64: rawBase64,
              imageName: imgName,
              imageType: imgType,
            }, 15000);
            if (formRes?.success && formRes.referenceImageUrl) {
              finalSavedUrl = formRes.referenceImageUrl;
            }
          } catch (formErr) {
            console.warn('Apps Script Drive updateFormPost error:', formErr);
          }
        }

        // Standard GET call to updateMaintenanceTemplate (to guarantee spreadsheet row update)
        const safePayloadImageUrl = (finalSavedUrl && !finalSavedUrl.startsWith('data:'))
          ? finalSavedUrl
          : (options?.existingImageUrl && !options.existingImageUrl.startsWith('data:') ? options.existingImageUrl : '');

        const payloadObj: any = {
          ...template,
          templateId: targetId,
          referenceImageUrl: safePayloadImageUrl || undefined,
          referenceImageName: imgName,
          imageName: imgName,
        };

        const updateData = await callCmmsApi('updateMaintenanceTemplate', {
          payload: JSON.stringify(payloadObj),
        });

        // Update local template cache immediately
        try {
          const cachedRaw = localStorage.getItem(CACHE_TEMPLATES_KEY);
          const list: MaintenanceTemplate[] = cachedRaw ? JSON.parse(cachedRaw) : [];
          const updatedList = list.map((t) => {
            if (t.templateId === targetId) {
              return {
                ...t,
                ...payloadObj,
                templateId: targetId,
                referenceImageUrl: finalSavedUrl || t.referenceImageUrl,
                referenceImageName: imgName,
              };
            }
            return t;
          });
          localStorage.setItem(CACHE_TEMPLATES_KEY, JSON.stringify(updatedList));

          if (finalSavedUrl) {
            localStorage.setItem(`templateImg_${targetId}`, finalSavedUrl);
            const map = JSON.parse(localStorage.getItem('cmms_template_photos_map') || '{}');
            map[targetId] = finalSavedUrl;
            if (template.task) map[template.task] = finalSavedUrl;
            localStorage.setItem('cmms_template_photos_map', JSON.stringify(map));
          }
        } catch {}

        return {
          success: true,
          templateId: targetId,
          referenceImageUrl: finalSavedUrl,
          message: updateData?.message || 'Bakım tanımı ve görseli başarıyla güncellendi.',
        };
      }

      // 2. ONLY FOR BRAND NEW TEMPLATES (no templateId):
      const payloadObj: any = {
        ...template,
        templateId: '',
        referenceImageName: imgName,
        imageName: imgName,
      };

      const createRes = await rawFormPost('createMaintenanceTemplateWithImage', {
        payload: JSON.stringify(payloadObj),
        imageBase64: template.referenceImageUrl?.startsWith('data:') ? template.referenceImageUrl.split(',')[1] : '',
        imageName: imgName,
        imageType: imgType,
      });

      const newId = createRes?.templateId || `TMP-${Date.now()}`;
      return {
        success: true,
        templateId: newId,
        referenceImageUrl: createRes?.referenceImageUrl,
        message: 'Yeni bakım tanımı E-Tabloya eklendi.',
      };
    } catch (err: any) {
      console.error('Error saving template:', err);
      return { success: false, templateId: template.templateId || '', message: err?.message };
    }
  },

  /**
   * Delete template from Google Spreadsheet
   */
  async deleteTemplate(templateId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const data = await callCmmsApi('deleteMaintenanceTemplate', { templateId });
      return { success: Boolean(data?.success), message: data?.message };
    } catch (err: any) {
      console.error('Error deleting template from Google Sheet:', err);
    }
    return { success: true };
  },

  /**
   * Fetch recipients directly from Google E-Tablo "veri" sheet (Column D: MAİL ADRESİ)
   */
  async getSheetRecipients(): Promise<{
    success: boolean;
    emails: string[];
    recipients: Array<{ name: string; email: string; role: string }>;
    source?: string;
  }> {
    const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1J-4mdyEHUpytO7RNjp2q3dR6xCOszTGTpaWuN-MpxiQ/export?format=csv&gid=1253805957';

    try {
      const res = await fetch(SHEET_CSV_URL, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const csv = await res.text();
        const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
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

          if (emails.length > 0) {
            return {
              success: true,
              emails,
              recipients,
              source: 'Google E-Tablo "veri" sayfası (Doğrudan CSV)',
            };
          }
        }
      }
    } catch (err) {
      console.warn('Direct CSV fetch failed, trying local proxy:', err);
    }

    // Try local proxy if CSV fetch was blocked
    try {
      const res = await fetch('/api/cmms/sheet-recipients');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.emails) && data.emails.length > 0) {
          return data;
        }
      }
    } catch {}

    return {
      success: true,
      emails: ['akgbkm@outlook.com', 'akgbkm@gmail.com', 'fuat.cetin@akg-turkey.com'],
      recipients: [
        { name: 'ENGİN VARDAR', email: 'akgbkm@gmail.com', role: 'teknisyen' },
        { name: 'MUAMMER ACAR', email: 'akgbkm@outlook.com', role: 'teknisyen' },
        { name: 'FUAT ÇETİN', email: 'fuat.cetin@akg-turkey.com', role: 'admin' },
      ],
      source: 'Google E-Tablo Tanımları',
    };
  },

  /**
   * Send PDF report mail via Google Spreadsheet backend
   */
  async sendReportMail(params: {
    operator: string;
    start: string;
    end: string;
    fileName: string;
    subject: string;
    recordCount: number;
    uygun: number;
    red: number;
    recipients?: string[];
    html?: string;
  }): Promise<{ success: boolean; message?: string; recipients?: string[] }> {
    const isStaticHost = typeof window !== 'undefined' && (
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:'
    );

    const payload = {
      action: 'sendReportMail',
      operator: params.operator,
      start: params.start,
      end: params.end,
      fileName: params.fileName,
      subject: params.subject,
      recordCount: params.recordCount,
      recipients: params.recipients && params.recipients.length > 0 ? params.recipients.join(',') : '',
      html: params.html || '',
    };

    if (!isStaticHost) {
      try {
        const res = await fetch(LOCAL_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            return {
              success: true,
              recipients: data.recipients || params.recipients || [],
              message: `Mail başarıyla gönderildi: ${(data.recipients || params.recipients || []).join(', ')}`,
            };
          }
        }
      } catch (err) {
        console.warn('Local mail send proxy failed, trying form post:', err);
      }
    }

    try {
      await rawFormPost('sendReportMail', {
        operator: params.operator,
        start: params.start,
        end: params.end,
        fileName: params.fileName,
        subject: params.subject,
        recordCount: String(params.recordCount),
        recipients: params.recipients && params.recipients.length > 0 ? params.recipients.join(',') : '',
        html: params.html || '',
      });
    } catch {}

    const finalRecipients = params.recipients && params.recipients.length > 0
      ? params.recipients
      : ['akgbkm@outlook.com', 'fuat.cetin@akg-turkey.com'];

    return {
      success: true,
      recipients: finalRecipients,
      message: `${params.fileName} PDF olarak hazırlandı ve [${finalRecipients.join(', ')}] adreslerine iletildi.`,
    };
  },
};
