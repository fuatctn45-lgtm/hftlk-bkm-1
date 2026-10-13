'use strict';
/* =====================================================================
   Haftalık Bakım CMMS - Ortak Bağlantı Katmanı
   Sürüm: V5.4.21
   ===================================================================== */
const CMMS = (function () {
  const VERSION = 'V5.4.21';
  const API_URL = 'https://script.google.com/macros/s/AKfycbwjECihD-JQg6ITpewj4ga3HzMraB4sUNhrCf40l6Fjlf2EOhIY9oMknFHAnG_XTCPP/exec';
  const SESSION = 'haftalikBakimV544User';
  const TIMEOUT_MS = 12000, RETRY_COUNT = 1;
  const CACHE_PREFIX = 'cmmsCache_' + VERSION + '_';
  const inflight = new Map();

  function rawJsonp(action, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const cb = 'cmms_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const s = document.createElement('script');
      let done = false;
      const clean = function () {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      };
      const timer = setTimeout(function () {
        if (done) return; done = true; clean();
        reject(new Error('Bağlantı zaman aşımına uğradı.'));
      }, timeoutMs || TIMEOUT_MS);
      window[cb] = function (r) { if (done) return; done = true; clearTimeout(timer); clean(); resolve(r); };
      s.onerror = function () { if (done) return; done = true; clearTimeout(timer); clean(); reject(new Error('Apps Script bağlantısı kurulamadı.')); };
      s.async = true;
      s.src = API_URL + '?' + new URLSearchParams(Object.assign({ action: action, callback: cb, _: Date.now() }, params || {}));
      document.head.appendChild(s);
    });
  }

  function call(action, params, options) {
    params = params || {}; options = options || {};
    const key = action + '|' + JSON.stringify(params);
    if (inflight.has(key)) return inflight.get(key);
    const retries = options.retries === undefined ? RETRY_COUNT : options.retries;
    const timeout = options.timeout || TIMEOUT_MS;
    const run = function (left) {
      return rawJsonp(action, params, timeout).catch(function (err) {
        if (left > 0) return run(left - 1); throw err;
      });
    };
    const p = run(retries).finally(function () { inflight.delete(key); });
    inflight.set(key, p); return p;
  }

  function cacheRead(name, ttlMs) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + name);
      if (!raw) return null;
      const box = JSON.parse(raw);
      if (!box || !box.t) return null;
      return { data: box.d, age: Date.now() - box.t, fresh: (Date.now() - box.t) < ttlMs };
    } catch (e) { return null; }
  }

  function cacheWrite(name, data) {
    try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  }

  function cacheClear() {
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf('cmmsCache_') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  function cachedCall(action, params, opt) {
    opt = opt || {};
    const name = opt.name || action, ttl = opt.ttl || 300000;
    const hit = cacheRead(name, ttl);
    const network = call(action, params, opt).then(function (r) {
      if (r && r.success) cacheWrite(name, r); return r;
    });
    if (hit && hit.data) {
      network.then(function (r) {
        if (r && r.success && typeof opt.onFresh === 'function') opt.onFresh(r, hit.age);
      }).catch(function () {});
      return Promise.resolve(hit.data);
    }
    return network;
  }

  /* ISO hafta anahtarı: 2026-W40 */
  function weekKey(date) {
    const d = new Date(date || new Date());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const y0 = new Date(d.getFullYear(), 0, 1);
    const w = Math.ceil((((d - y0) / 86400000) + 1) / 7);
    return d.getFullYear() + '-W' + String(w).padStart(2, '0');
  }

  let warmed = false;
  function warmUp() { if (warmed) return; warmed = true; call('health', {}, { retries: 0, timeout: 8000 }).catch(function () {}); }

  return { VERSION, API_URL, SESSION, call, cachedCall, cacheClear, cacheWrite, cacheRead, warmUp, weekKey };
})();
