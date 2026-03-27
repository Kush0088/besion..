/* =============================================
   BESION CHEMICAL — GLOBAL JAVASCRIPT
   ============================================= */

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

const storageAvailable = (() => {
  try {
    if (typeof localStorage === 'undefined') return false;
    const testKey = '__besion_storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    return false;
  }
})();

function storageGet(key) {
  if (!storageAvailable) return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function storageSet(key, value) {
  if (!storageAvailable) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.safeJsonParse = safeJsonParse;
  window.storageGet = storageGet;
  window.storageSet = storageSet;
}

// ── Sync pull cache key (manual-refresh model) ────────────────────────────
// '0' means invalidated (force-fetch on next load). Any timestamp = cached.
const PULL_TS_KEY = 'besion_sync_last_pull';
if (typeof window !== 'undefined') {
  window.BESION_PULL_TS_KEY = PULL_TS_KEY;
}

// Minimum age before a hard-reload is allowed to re-fetch from GAS (5 minutes).
// This prevents habitual F5 presses from hammering the GAS endpoint.
const PULL_MIN_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns true if the current page load should trigger a GAS pull.
 * Fetches on:
 *   1. First ever visit / cache invalidated (besion_sync_last_pull === '0' or missing)
 *   2. Hard reload (F5 / Ctrl+R) — BUT only if data is older than PULL_MIN_AGE_MS
 * Does NOT fetch on:
 *   - Regular page navigation within the site
 *   - Back / forward navigation
 *   - Hard reload when data was fetched less than 5 minutes ago
 */
function shouldFetchOnLoad() {
  if (!isSyncEnabled() || !getSyncConfig().autoPull) return false;
  // Check if cache has been invalidated by admin push
  const ts = storageGet(PULL_TS_KEY);
  if (!ts || ts === '0') return true;
  // Detect hard reload via Navigation Timing API (supported in all modern browsers)
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') {
      // Only re-fetch if data is older than the minimum age window
      const age = Date.now() - parseInt(ts, 10);
      return age > PULL_MIN_AGE_MS;
    }
  } catch (_) { /* ignore in environments without performance API */ }
  return false;
}

async function initialDataFetch() {
  if (!shouldFetchOnLoad()) return;
  const result = await besionSyncPull().catch(() => ({}));
  if (result && result.ok) {
    storageSet(PULL_TS_KEY, String(Date.now()));
  }
}

if (typeof window !== 'undefined') {
  window.besionInitialDataFetch = initialDataFetch;
}

// ── Sync config ──────────────────────────────────────────────────────────
function getSyncConfig() {
  if (typeof window === 'undefined') {
    return {
      url: '',
      apiKey: '',
      adminPassword: '',
      syncPassword: '',
      adminEnabled: false,
      usePlainText: true,
      autoPull: false,
      timeoutMs: 12000
    };
  }
  const raw = window.BESION_SYNC_CONFIG || {};
  return {
    url: String(raw.url || '').trim(),
    apiKey: String(raw.apiKey || '').trim(),
    adminPassword: String(raw.adminPassword || '').trim(),
    syncPassword: String(raw.syncPassword || '').trim(),
    adminEnabled: Boolean(raw.adminEnabled),
    usePlainText: raw.usePlainText !== false,
    autoPull: raw.autoPull === true,
    timeoutMs: Number(raw.timeoutMs) || 12000
  };
}

function isSyncEnabled() {
  const cfg = getSyncConfig();
  if (!cfg.url) return false;
  try {
    // Validate URL format early to avoid throwing later
    const parsed = new URL(cfg.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

async function syncFetch(url, options, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller ? controller.signal : undefined
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (err) {
      json = null;
    }
    if (json && json.ok === false) {
      return { ok: false, error: json.error || 'Sync failed.' };
    }
    if (!res.ok) {
      const msg = (json && json.error) ? json.error : `Sync failed (${res.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true, data: json };
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'Sync timed out.' : 'Network error during sync.';
    return { ok: false, error: msg };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function applySyncData(data) {
  if (!data || typeof data !== 'object') return false;
  let touched = false;

  if (Array.isArray(data.products)) {
    if (typeof normalizeProductOrder === 'function') {
      const normalized = normalizeProductOrder(data.products);
      if (normalized) touched = true;
    }
    if (typeof ADMIN_PRODUCTS !== 'undefined') {
      ADMIN_PRODUCTS = data.products;
    }
    window.ADMIN_PRODUCTS = data.products;
    storageSet('besion_products', JSON.stringify(data.products));
    touched = true;
  }

  if (Array.isArray(data.technicals)) {
    if (typeof ADMIN_TECHNICALS !== 'undefined') {
      ADMIN_TECHNICALS = data.technicals;
    }
    window.ADMIN_TECHNICALS = data.technicals;
    storageSet('besion_technicals', JSON.stringify(data.technicals));
    touched = true;
  }

  if (Array.isArray(data.formulations)) {
    if (typeof ADMIN_FORMULATIONS !== 'undefined') {
      ADMIN_FORMULATIONS = data.formulations;
    }
    window.ADMIN_FORMULATIONS = data.formulations;
    storageSet('besion_formulations', JSON.stringify(data.formulations));
    touched = true;
  }

  if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
    if (typeof ADMIN_SETTINGS !== 'undefined') {
      ADMIN_SETTINGS = data.settings;
    }
    window.ADMIN_SETTINGS = data.settings;
    if (!window.ADMIN_SETTINGS.whatsapp) window.ADMIN_SETTINGS.whatsapp = '919328110822';
    storageSet('besion_admin_settings', JSON.stringify(data.settings));
    touched = true;
  }

  if (data.categories && typeof data.categories === 'object') {
    if (Array.isArray(data.categories.domestic)) {
      storageSet('besion_domestic_categories', JSON.stringify(data.categories.domestic));
      touched = true;
    }
    if (Array.isArray(data.categories.global)) {
      storageSet('besion_global_categories', JSON.stringify(data.categories.global));
      touched = true;
    }
  }

  if (typeof normalizeOrderByCategory === 'function') {
    if (Array.isArray(window.ADMIN_TECHNICALS)) normalizeOrderByCategory(window.ADMIN_TECHNICALS);
    if (Array.isArray(window.ADMIN_FORMULATIONS)) normalizeOrderByCategory(window.ADMIN_FORMULATIONS);
  }

  if (touched && typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('besion-sync:updated', { detail: data }));
  }
  return touched;
}

async function besionSyncPull() {
  if (!isSyncEnabled()) return { ok: false, error: 'Sync is not configured.' };
  const cfg = getSyncConfig();
  const payload = {
    action: 'pull'
  };
  const body = JSON.stringify(payload);
  const contentType = cfg.usePlainText ? 'text/plain;charset=utf-8' : 'application/json';
  const res = await syncFetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  }, cfg.timeoutMs);

  if (res.ok && res.data) {
    if (res.data.ok === false) {
      return { ok: false, error: res.data.error || 'Sync failed.' };
    }
    if (res.data.data) {
      applySyncData(res.data.data);
      return { ok: true, data: res.data.data };
    }
  }
  if (res.ok) return { ok: false, error: 'Invalid sync response format.' };
  return res;
  return res;
}

async function besionSyncAuth(password) {
  if (!isSyncEnabled()) return { ok: false, error: 'Sync is not configured.' };
  const cfg = getSyncConfig();
  const body = JSON.stringify({ action: 'login', password: password || '' });
  const contentType = cfg.usePlainText ? 'text/plain;charset=utf-8' : 'application/json';

  return await syncFetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  }, cfg.timeoutMs);
}

async function besionSyncPush(payload, password) {
  if (!isSyncEnabled()) return { ok: false, error: 'Sync is not configured.' };
  const cfg = getSyncConfig();
  const pwd = password || sessionStorage.getItem('admin_pwd') || '';
  const body = JSON.stringify({
    action: 'sync',
    password: pwd,
    data: payload || {}
  });
  const contentType = cfg.usePlainText ? 'text/plain;charset=utf-8' : 'application/json';
  const res = await syncFetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  }, cfg.timeoutMs);
  if (res.ok && res.data && res.data.data) {
    applySyncData(res.data.data);
    // Invalidate pull cache so next user page reload fetches fresh data
    storageSet(PULL_TS_KEY, '0');
    return { ok: true, data: res.data.data };
  }
  if (res.ok) return { ok: false, error: 'Invalid sync response.' };
  return res;
}

async function besionSyncAll(payload) {
  return besionSyncPush(payload);
}

if (typeof window !== 'undefined') {
  window.besionSyncPull = besionSyncPull;
  window.besionSyncPush = besionSyncPush;
  window.besionSyncAll = besionSyncAll;
  window.besionSyncAuth = besionSyncAuth;
  window.besionSyncEnabled = isSyncEnabled;
}

function besionEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function besionEscapeAttr(value) {
  return besionEscapeHtml(value);
}

function besionSafeUrl(raw, fallback = '#') {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  if (value.startsWith('#')) return value;
  if (/^\s*javascript:/i.test(value)) return fallback;
  if (value.startsWith('//')) return fallback;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || /^[a-z0-9][a-z0-9/_?.=#&%-]*$/i.test(value)) {
    return value;
  }
  return fallback;
}

if (typeof window !== 'undefined') {
  window.besionEscapeHtml = besionEscapeHtml;
  window.besionEscapeAttr = besionEscapeAttr;
  window.besionSafeUrl = besionSafeUrl;
}

// ── Action gating (cooldown + hourly limit) ──────────────────────────────
const ACTION_COOLDOWN_MS = 60000;
const ACTION_HOURLY_LIMIT = 10;
const ACTION_LOG_KEY = 'besion_action_log';
const ACTION_LAST_KEY = 'besion_action_last_ts';
let actionLogMemory = [];
let actionLastMemory = 0;

function readActionLog() {
  if (storageAvailable) {
    return safeJsonParse(storageGet(ACTION_LOG_KEY), []) || [];
  }
  return actionLogMemory;
}

function writeActionLog(log) {
  if (storageAvailable) {
    storageSet(ACTION_LOG_KEY, JSON.stringify(log));
    return;
  }
  actionLogMemory = log;
}

function readLastAction() {
  if (storageAvailable) {
    const value = parseInt(storageGet(ACTION_LAST_KEY) || '0', 10);
    return Number.isFinite(value) ? value : 0;
  }
  return actionLastMemory;
}

function writeLastAction(value) {
  if (storageAvailable) {
    storageSet(ACTION_LAST_KEY, String(value));
    return;
  }
  actionLastMemory = value;
}

function pruneActionLog(log, now) {
  const cutoff = now - 60 * 60 * 1000;
  return log.filter(ts => Number.isFinite(ts) && ts >= cutoff);
}

function getActionGate() {
  const now = Date.now();
  const log = pruneActionLog(readActionLog(), now);
  const last = readLastAction();
  const remaining = last ? Math.max(0, ACTION_COOLDOWN_MS - (now - last)) : 0;

  if (log.length >= ACTION_HOURLY_LIMIT) {
    return { ok: false, reason: 'limit', now, log };
  }

  if (remaining > 0) {
    return { ok: false, reason: 'cooldown', remainingMs: remaining, now, log };
  }

  return { ok: true, now, log };
}

function recordAction(now, log) {
  const cleaned = pruneActionLog(Array.isArray(log) ? log : [], now);
  cleaned.push(now);
  writeActionLog(cleaned);
  writeLastAction(now);
}

let actionHintTimer = null;
let actionHintEl = null;

function showActionHint(message, anchorEl) {
  if (!actionHintEl) {
    actionHintEl = document.createElement('div');
    actionHintEl.className = 'action-hint';
    document.body.appendChild(actionHintEl);
  }

  actionHintEl.textContent = message;

  const rect = anchorEl?.getBoundingClientRect?.() || {
    left: window.innerWidth / 2,
    top: window.innerHeight / 2,
    width: 0,
    height: 0,
    bottom: window.innerHeight / 2
  };

  const isFloat = anchorEl?.classList?.contains('whatsapp-float');
  const centerX = rect.left + rect.width / 2;
  let top = rect.top - 10;
  if (top < 16) top = rect.bottom + 12;

  let boundedX = Math.min(Math.max(centerX, 16), window.innerWidth - 16);
  let boundedY = Math.min(Math.max(top, 16), window.innerHeight - 16);

  if (isFloat) {
    const footerNav = document.querySelector('.bottom-nav');
    if (footerNav) {
      const footerRect = footerNav.getBoundingClientRect();
      boundedY = Math.max(16, footerRect.top - 14);
    } else {
      boundedY = Math.max(16, window.innerHeight - 90);
    }
    boundedX = window.innerWidth / 2;
  }

  actionHintEl.classList.toggle('align-right', false);
  actionHintEl.classList.toggle('align-center', isFloat);
  actionHintEl.style.left = `${boundedX}px`;
  actionHintEl.style.top = `${boundedY}px`;
  actionHintEl.classList.add('show');

  if (actionHintTimer) clearTimeout(actionHintTimer);
  actionHintTimer = setTimeout(() => {
    actionHintEl.classList.remove('show');
  }, 2400);
}

function gateUserAction(anchorEl) {
  const gate = getActionGate();
  if (!gate.ok) {
    if (gate.reason === 'limit') {
      showActionHint('You have reached the hourly limit. Please try again later.', anchorEl);
    } else {
      const seconds = Math.ceil((gate.remainingMs || 0) / 1000);
      showActionHint(`Please wait ${seconds}s before trying again.`, anchorEl);
    }
    return false;
  }
  recordAction(gate.now, gate.log);
  return true;
}

if (typeof window !== 'undefined') {
  window.besionGateAction = gateUserAction;
}

function isWhatsAppAnchor(anchor) {
  if (!anchor || anchor.tagName !== 'A') return false;
  const href = anchor.getAttribute('href') || '';
  return anchor.classList.contains('btn-whatsapp')
    || anchor.classList.contains('whatsapp-float')
    || /wa\.me\//i.test(href);
}

// ── Google Drive image helpers ───────────────────────────────────────────
function isDriveUrl(value) {
  return /(?:drive|docs)\.google\.com/.test(value || '');
}

function extractDriveId(value) {
  if (!value) return '';
  const fileMatch = value.match(/\/file\/d\/([^/]+)/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const openMatch = value.match(/\/d\/([^/]+)/);
  if (openMatch && openMatch[1]) return openMatch[1];
  const idMatch = value.match(/[?&]id=([^&]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return '';
}

function resolveImageUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  if (!isDriveUrl(value)) return value;
  const id = extractDriveId(value);
  if (!id) return value;
  return `https://drive.google.com/uc?export=view&id=${id}`;
}

function getDriveImageCandidates(raw) {
  const value = (raw || '').trim();
  const id = isDriveUrl(value) ? extractDriveId(value) : '';
  if (!id) return [];
  return [
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    `https://lh3.googleusercontent.com/d/${id}`
  ];
}

function getImageSrc(raw, fallback) {
  const resolved = resolveImageUrl(raw);
  return resolved || fallback || '';
}

function handleDriveImageError(imgEl) {
  if (!imgEl) return;
  const raw = imgEl.getAttribute('data-drive-raw') || '';
  const fallback = imgEl.getAttribute('data-fallback') || BESION_FALLBACK_IMAGE;
  const candidates = getDriveImageCandidates(raw);
  let idx = parseInt(imgEl.getAttribute('data-drive-index') || '0', 10);

  if (!imgEl.getAttribute('data-drive-index') && candidates.length) {
    const current = imgEl.getAttribute('src') || '';
    if (current === candidates[0]) idx = 1;
  }

  if (candidates.length && idx < candidates.length) {
    imgEl.setAttribute('data-drive-index', String(idx + 1));
    imgEl.src = candidates[idx];
    return;
  }

  imgEl.onerror = null;
  imgEl.src = fallback;
}

function applyBackgroundImage(el, raw) {
  if (!el || !raw) return;
  const candidates = getDriveImageCandidates(raw);
  if (!candidates.length) {
    el.style.backgroundImage = `url('${raw}')`;
    return;
  }
  let idx = 0;
  const tryNext = () => {
    if (idx >= candidates.length) return;
    const url = candidates[idx++];
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = `url('${url}')`; };
    img.onerror = () => tryNext();
    img.src = url;
  };
  tryNext();
}

// ── Shared image fallback ─────────────────────────────────────────────────
const BESION_FALLBACK_IMAGE = 'images/placeholder.svg';
if (typeof window !== 'undefined') {
  window.BESION_FALLBACK_IMAGE = BESION_FALLBACK_IMAGE;
}

// ── Product image preloader (background fetch) ────────────────────────────
function hashVersion(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getAdminDataVersion() {
  const productsRaw = storageGet('besion_products') || JSON.stringify(ADMIN_PRODUCTS || []);
  const technicalsRaw = storageGet('besion_technicals') || JSON.stringify(ADMIN_TECHNICALS || []);
  const formulationsRaw = storageGet('besion_formulations') || JSON.stringify(ADMIN_FORMULATIONS || []);
  const settingsRaw = storageGet('besion_admin_settings') || JSON.stringify(ADMIN_SETTINGS || {});
  return hashVersion(`${productsRaw}|${technicalsRaw}|${formulationsRaw}|${settingsRaw}`);
}

function appendVersion(url, version) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}

function preloadProductImages() {
  if (typeof window === 'undefined') return;
  if (window.__besionProductPreloadDone) return;
  const version = getAdminDataVersion();
  const preloadKey = `preload:${version}`;
  if (window.__besionProductPreloadKey === preloadKey) return;
  window.__besionProductPreloadKey = preloadKey;
  window.__besionProductPreloadDone = true;

  const sources = new Set();
  const priority = new Set();
  const normalizeUrl = (raw) => {
    const url = resolveImageUrl(raw || '').trim();
    if (!url) return;
    sources.add(appendVersion(url, version));
  };
  const pushPriority = (raw) => {
    const url = resolveImageUrl(raw || '').trim();
    if (!url) return;
    const withVersion = appendVersion(url, version);
    sources.add(withVersion);
    priority.add(withVersion);
  };

  (Array.isArray(ADMIN_PRODUCTS) ? ADMIN_PRODUCTS : []).forEach(p => normalizeUrl(p.image));
  (Array.isArray(ADMIN_TECHNICALS) ? ADMIN_TECHNICALS : []).forEach(t => normalizeUrl(t.image));
  (Array.isArray(ADMIN_FORMULATIONS) ? ADMIN_FORMULATIONS : []).forEach(f => normalizeUrl(f.image));

  // Priority: above-the-fold images (home hero/bg, about image, first few products)
  pushPriority(getHomeHeroImage());
  pushPriority(getHomeAboutImage());
  (Array.isArray(ADMIN_PRODUCTS) ? ADMIN_PRODUCTS : []).slice(0, 4).forEach(p => pushPriority(p.image));

  const urls = Array.from(sources);
  if (!urls.length) return;

  const priorityUrls = Array.from(priority).filter(u => sources.has(u));
  const restUrls = urls.filter(u => !priority.has(u));

  const maxConcurrent = 6;
  let index = 0;

  const loadNext = () => {
    if (index >= (priorityUrls.length + restUrls.length)) return;
    const url = index < priorityUrls.length
      ? priorityUrls[index]
      : restUrls[index - priorityUrls.length];
    index += 1;
    const img = new Image();
    img.decoding = 'async';
    img.onload = loadNext;
    img.onerror = loadNext;
    img.src = url;
  };

  for (let i = 0; i < Math.min(maxConcurrent, urls.length); i += 1) {
    loadNext();
  }
}

// ── Product Data (simulates backend / admin data) ──────────────────────────
const PRODUCTS_DB = [
  {
    id: 'best-man',
    name: 'BEST MAN',
    technical: 'Fipronil 7% + Abamectin 1.25% + Tolfenpyrad 15% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/best-man.svg',
    description: 'BEST MAN is a broad spectrum insecticide combining three active ingredients for superior pest control with fast knockdown and long-lasting residual activity.',
    modeOfAction: 'Blocks GABA-gated chloride channels (Fipronil), binds to glutamate-gated chloride channels (Abamectin), and inhibits mitochondrial complex I (Tolfenpyrad).',
    majorCrops: 'Cotton, Rice, Wheat, Soybean, Vegetables',
    targetPests: 'Thrips, Mites, Whiteflies, Aphids, Bollworm',
    dose: '200–250 ml per acre in 200L water',
    packaging: '100ml, 250ml, 500ml, 1L',
    featured: true
  },
  {
    id: 'fetagen',
    name: 'FETAGEN',
    technical: 'Fipronil 0.4% + Beauveria Bassiana 0.18% w/w GR',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/fetagen.svg',
    description: 'FETAGEN is a bio-chemical granular insecticide effective against soil-dwelling pests.',
    modeOfAction: 'Disrupts insect nervous system and infects via entomopathogenic fungus.',
    majorCrops: 'Rice, Sugarcane, Cotton',
    targetPests: 'Termites, Grubs, Root borers',
    dose: '4 kg per acre',
    packaging: '4kg'
  },
  {
    id: 'reimagen',
    name: 'REIMAGEN',
    technical: 'Fipronil 5% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/reimagen.svg',
    description: 'REIMAGEN provides effective control of sucking and chewing pests on a wide range of crops.',
    modeOfAction: 'Blocks GABA-gated chloride channels in insects.',
    majorCrops: 'Rice, Cotton, Vegetables, Fruits',
    targetPests: 'Stem borer, Brown planthopper, Leaf folder',
    dose: '1L per acre',
    packaging: '250ml, 500ml, 1L'
  },
  {
    id: 'defender',
    name: 'DEFENDER',
    technical: 'Pyrethrins 30% + Deltiferin 10% + Pseudomonas 20% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/defender.svg',
    description: 'DEFENDER is a powerful multi-action insecticide with quick knockdown and residual protection.',
    modeOfAction: 'Acts on voltage-gated sodium channels of the insect nervous system.',
    majorCrops: 'Cotton, Pulses, Oilseeds, Vegetables',
    targetPests: 'Bollworm, Caterpillars, Aphids, Jassids',
    dose: '300 ml per acre',
    packaging: '250ml, 500ml, 1L'
  },
  {
    id: 'warden-extra',
    name: 'WARDEN EXTRA',
    technical: 'Chlorpyrifos 50% + Cypermethrin 5% EC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/warden-extra.svg',
    description: 'A combination insecticide offering broad-spectrum control with quick knockdown.',
    modeOfAction: 'Inhibits acetylcholinesterase enzyme activity.',
    majorCrops: 'Cotton, Rice, Maize, Sorghum',
    targetPests: 'Aphids, Bollworm, Caterpillars, White flies',
    dose: '2 ml per litre of water',
    packaging: '500ml, 1L'
  },
  {
    id: 'fasten',
    name: 'FASTEN',
    technical: 'Fipronil 1.5% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/fasten.svg',
    description: 'FASTEN controls a wide range of insect pests with long-lasting protection.',
    modeOfAction: 'Disrupts insect GABA receptor.',
    majorCrops: 'Rice, Vegetables, Sugarcane',
    targetPests: 'Stem borer, Leaf folder, Gall midge',
    dose: '1.5 L per acre',
    packaging: '1L, 5L'
  },
  {
    id: 'spintocon',
    name: 'SPINTOCON',
    technical: 'Spinosad 45% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/spintocon.svg',
    description: 'SPINTOCON is a bio-derived insecticide with excellent safety profile for beneficial insects.',
    modeOfAction: 'Acts on nicotinic acetylcholine receptor and GABA receptor.',
    majorCrops: 'Cotton, Chilli, Tomato, Grapes',
    targetPests: 'Thrips, Bollworms, Leafminers',
    dose: '90 ml per acre',
    packaging: '120ml, 250ml, 1L'
  },
  {
    id: 'spinosher',
    name: 'SPINOSHER',
    technical: 'Spinosad 45% SC',
    category: 'insecticides',
    market: 'domestic',
    image: 'images/products/spinosher.svg',
    description: 'A premium bio-insecticide for sustainable pest management.',
    modeOfAction: 'Acts at nicotinic acetylcholine receptors.',
    majorCrops: 'Cotton, Vegetables, Orchards',
    targetPests: 'Thrips, Codling moth, Leafminers',
    dose: '80–100 ml per acre',
    packaging: '100ml, 250ml, 500ml'
  },
  // Herbicides
  {
    id: 'herbi-max',
    name: 'HERBI MAX',
    technical: 'Glyphosate 41% SL',
    category: 'herbicides',
    market: 'domestic',
    image: BESION_FALLBACK_IMAGE,
    description: 'HERBI MAX is a non-selective systemic herbicide effective against all types of weeds.',
    modeOfAction: 'Inhibits EPSP synthase enzyme in the shikimate pathway.',
    majorCrops: 'Non-crop areas, Orchards, Plantation crops',
    targetPests: 'Broad leaf weeds, Grasses, Sedges',
    dose: '1.5 L per acre',
    packaging: '500ml, 1L, 5L'
  },
  // Fungicides
  {
    id: 'fungi-shield',
    name: 'FUNGI SHIELD',
    technical: 'Propiconazole 25% EC',
    category: 'fungicides',
    market: 'domestic',
    image: BESION_FALLBACK_IMAGE,
    description: 'FUNGI SHIELD provides preventive and curative control of fungal diseases.',
    modeOfAction: 'Inhibits sterol biosynthesis in fungal cell membrane.',
    majorCrops: 'Wheat, Rice, Maize, Groundnut',
    targetPests: 'Rust, Blast, Leaf spot, Blight',
    dose: '200 ml per acre',
    packaging: '100ml, 250ml, 500ml'
  },
  // Global products
  {
    id: 'global-bio-extract',
    name: 'BIO EXTRACT PRO',
    technical: 'Azadirachtin 1% EC',
    category: 'insecticides',
    market: 'global',
    image: BESION_FALLBACK_IMAGE,
    description: 'A botanical insecticide for organic and sustainable farming.',
    modeOfAction: 'Disrupts moulting hormone (ecdysone) activity.',
    majorCrops: 'Vegetables, Fruits, Tea, Coffee',
    targetPests: 'Caterpillars, Whiteflies, Aphids, Mites',
    dose: '3 ml per litre',
    packaging: '250ml, 1L, 5L'
  },
  {
    id: 'global-thia-200',
    name: 'THIA 200 SC',
    technical: 'Thiamethoxam 200g/L SC',
    category: 'insecticides',
    market: 'global',
    image: BESION_FALLBACK_IMAGE,
    description: 'Systemic insecticide for seed treatment and foliar application.',
    modeOfAction: 'Binds to nicotinic acetylcholine receptors.',
    majorCrops: 'Cereals, Oilseeds, Vegetables',
    targetPests: 'Aphids, Whiteflies, Thrips, BPH',
    dose: '100 ml per 100 kg seed',
    packaging: '1L, 5L, 20L'
  }
];

// ── Admin settings (simulates admin panel config) ──────────────────────────
let ADMIN_SETTINGS = safeJsonParse(storageGet('besion_admin_settings'), {});
if (!ADMIN_SETTINGS || typeof ADMIN_SETTINGS !== 'object' || Array.isArray(ADMIN_SETTINGS)) ADMIN_SETTINGS = {};
if (!ADMIN_SETTINGS.whatsapp) ADMIN_SETTINGS.whatsapp = '919328110822';

function applyContactSettings() {
  if (typeof document === 'undefined') return;
  const settings = (ADMIN_SETTINGS && typeof ADMIN_SETTINGS === 'object') ? ADMIN_SETTINGS : {};
  const phoneRaw = String(settings.phone || '').trim();
  const emailRaw = String(settings.email || '').trim();
  const addressRaw = String(settings.address || '').trim();
  const whatsappRaw = String(settings.whatsapp || '').trim();

  const updateText = (selector, value) => {
    document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  };

  const updateHref = (selector, value) => {
    document.querySelectorAll(selector).forEach(el => {
      if (el.tagName === 'A') el.setAttribute('href', value);
    });
  };

  if (phoneRaw) {
    const cleaned = phoneRaw.replace(/[^\d+]/g, '');
    const tel = `tel:${cleaned || phoneRaw}`;
    updateText('[data-contact="phone"]', phoneRaw);
    updateHref('[data-contact="phone"]', tel);
    updateHref('[data-contact-link="phone"]', tel);
  }

  if (emailRaw) {
    const mailto = `mailto:${emailRaw}`;
    updateText('[data-contact="email"]', emailRaw);
    updateHref('[data-contact="email"]', mailto);
    updateHref('[data-contact-link="email"]', mailto);
  }

  if (addressRaw) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressRaw)}`;
    updateText('[data-contact="address"]', addressRaw);
    updateHref('[data-contact="address"]', maps);
    updateHref('[data-contact-link="address"]', maps);
  }

  if (whatsappRaw) {
    updateText('[data-contact="whatsapp"]', whatsappRaw);
  }
}

function initContactSettings() {
  if (typeof document === 'undefined') return;
  const run = () => applyContactSettings();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  document.addEventListener('besion-sync:updated', run);
}

initContactSettings();

const DEFAULT_HOME_HERO_IMAGE = 'images/banner.jpeg';
const DEFAULT_HOME_ABOUT_IMAGE = 'images/about.png';

function getHomeHeroImage() {
  return DEFAULT_HOME_HERO_IMAGE;
}

function getHomeAboutImage() {
  return DEFAULT_HOME_ABOUT_IMAGE;
}

const rawProducts = storageGet('besion_products');
let ADMIN_PRODUCTS = safeJsonParse(rawProducts, null) || [...PRODUCTS_DB];
if (!Array.isArray(ADMIN_PRODUCTS)) {
  ADMIN_PRODUCTS = [...PRODUCTS_DB];
  storageSet('besion_products', JSON.stringify(ADMIN_PRODUCTS));
}

const placeholderPattern = /via\.placeholder\.com/i;
const legacyRemotePattern = /bestagrolife\.com\/wp-content\/uploads\/2022\/07\//i;
const localProductImageDir = 'images/products';
function getLocalProductImage(product) {
  if (!product || !product.id) return BESION_FALLBACK_IMAGE;
  return `${localProductImageDir}/${product.id}.svg`;
}
let productsTouched = false;
ADMIN_PRODUCTS.forEach(p => {
  if (!p) return;
  if (!p.image || placeholderPattern.test(p.image)) {
    p.image = BESION_FALLBACK_IMAGE;
    productsTouched = true;
  }
  if (p.image && legacyRemotePattern.test(p.image)) {
    p.image = getLocalProductImage(p);
    productsTouched = true;
  }
});
if (productsTouched) {
  storageSet('besion_products', JSON.stringify(ADMIN_PRODUCTS));
}

// ── Global Technicals & Formulations (simulates backend / admin data) ─────
const TECHNICALS_DB = [
  { id: 'tech-abamectin-ec', category: 'insecticides', technical_name: 'Abamectin 1.9% EC', brand_name: 'SHOOTER', order: 1 },
  { id: 'tech-acetamiprid-sp', category: 'insecticides', technical_name: 'Acetamiprid 20% SP', brand_name: 'BESOPRIDE', order: 2 },
  { id: 'tech-bifenthrin-ec', category: 'insecticides', technical_name: 'Bifenthrin 10% EC', brand_name: 'BESOTHRIN 10', order: 3 }
];

const FORMULATIONS_DB = [
  { id: 'form-abamectin-ec', category: 'insecticides', formulation_name: 'ABAMECTIN 1.8%, 1.9% EC', order: 1 },
  { id: 'form-acetamiprid-sl-sp', category: 'insecticides', formulation_name: 'ACETAMIPRID 20% SL, 20% SP', order: 2 },
  { id: 'form-bifenthrin-ec', category: 'insecticides', formulation_name: 'BIFENTHRIN 10% EC', order: 3 },
  { id: 'form-chlorpyrifos-ec', category: 'insecticides', formulation_name: 'CHLORPYRIFOS 20% EC, 50% EC', order: 4 }
];

let ADMIN_TECHNICALS = safeJsonParse(storageGet('besion_technicals'), null) || [...TECHNICALS_DB];
let ADMIN_FORMULATIONS = safeJsonParse(storageGet('besion_formulations'), null) || [...FORMULATIONS_DB];
if (!Array.isArray(ADMIN_TECHNICALS)) ADMIN_TECHNICALS = [...TECHNICALS_DB];
if (!Array.isArray(ADMIN_FORMULATIONS)) ADMIN_FORMULATIONS = [...FORMULATIONS_DB];

if (typeof window !== 'undefined') {
  window.PRODUCTS_DB = PRODUCTS_DB;
  window.TECHNICALS_DB = TECHNICALS_DB;
  window.FORMULATIONS_DB = FORMULATIONS_DB;
  window.ADMIN_PRODUCTS = ADMIN_PRODUCTS;
  window.ADMIN_TECHNICALS = ADMIN_TECHNICALS;
  window.ADMIN_FORMULATIONS = ADMIN_FORMULATIONS;
}

function normalizeOrderByCategory(list) {
  const groups = {};
  list.forEach(item => {
    const cat = item.category || 'uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  Object.values(groups).forEach(group => {
    group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    group.forEach((item, index) => { item.order = index + 1; });
  });
}

function normalizeProductOrder(list) {
  if (!Array.isArray(list)) return false;
  let changed = false;
  list.forEach((item, index) => {
    const raw = Number(item && item.order);
    if (!Number.isFinite(raw) || raw <= 0) {
      item.order = index + 1;
      changed = true;
    }
  });
  return changed;
}

normalizeOrderByCategory(ADMIN_TECHNICALS);
normalizeOrderByCategory(ADMIN_FORMULATIONS);
const productsNormalized = normalizeProductOrder(ADMIN_PRODUCTS);
if (productsNormalized) {
  storageSet('besion_products', JSON.stringify(ADMIN_PRODUCTS));
}

storageSet('besion_technicals', JSON.stringify(ADMIN_TECHNICALS));
storageSet('besion_formulations', JSON.stringify(ADMIN_FORMULATIONS));

// ── WhatsApp Helpers ───────────────────────────────────────────────────────
function getWhatsAppLink(productName = '') {
  const rawNum = ADMIN_SETTINGS.whatsapp || '919328110822';
  const num = String(rawNum).replace(/[^\d]/g, '') || '919328110822';
  const msg = productName
    ? `Hello, I want to inquire about your product: ${productName}`
    : 'Hello, I need help with Besion Chemical products.';
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

// ── Search Functionality ───────────────────────────────────────────────────
function buildSearchText(product) {
  return [
    product.name,
    product.technical,
    product.technical_name,
    product.formulation_name,
    product.brand_name,
    product.category,
    product.description,
    product.modeOfAction,
    product.majorCrops,
    product.targetPests,
    product.dose,
    product.packaging,
    product.market,
    product._type
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getSearchProducts() {
  if (Array.isArray(ADMIN_PRODUCTS) && ADMIN_PRODUCTS.length) return ADMIN_PRODUCTS;
  if (Array.isArray(PRODUCTS_DB) && PRODUCTS_DB.length) return PRODUCTS_DB;
  return [];
}

function getSearchItems() {
  const baseProducts = getSearchProducts().map(p => ({
    ...p,
    _type: 'product',
    _href: `product-details.html?id=${encodeURIComponent(String(p.id || ''))}`
  }));

  const technicals = (Array.isArray(ADMIN_TECHNICALS) ? ADMIN_TECHNICALS : []).map(t => ({
    id: t.id,
    name: t.technical_name,
    technical_name: t.technical_name,
    brand_name: t.brand_name,
    category: t.category,
    market: 'global',
    _type: 'technical',
    _href: `products.html?market=global&cat=${encodeURIComponent(t.category || '')}&focus=technicals&select=${encodeURIComponent(String(t.id || ''))}&selectType=technical`
  }));

  const formulations = (Array.isArray(ADMIN_FORMULATIONS) ? ADMIN_FORMULATIONS : []).map(f => ({
    id: f.id,
    name: f.formulation_name,
    formulation_name: f.formulation_name,
    category: f.category,
    market: 'global',
    _type: 'formulation',
    _href: `products.html?market=global&cat=${encodeURIComponent(f.category || '')}&focus=formulations&select=${encodeURIComponent(String(f.id || ''))}&selectType=formulation`
  }));

  return [...baseProducts, ...technicals, ...formulations].map(item => ({
    ...item,
    _searchText: buildSearchText(item)
  }));
}

function setupSearch() {
  const searchIcon = document.querySelectorAll('.search-toggle');
  const searchBar = document.querySelector('.search-bar');
  if (!searchBar) return;

  const input = searchBar.querySelector('input');
  const resultsBox = searchBar.querySelector('.search-results');
  const closeBtn = searchBar.querySelector('.search-close');
  if (!input || !resultsBox) return;

  let items = getSearchItems();
  const refreshItems = () => { items = getSearchItems(); };

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      searchBar.classList.remove('open');
      resultsBox.classList.remove('show');
    });
  }

  searchIcon.forEach(btn => {
    btn.addEventListener('click', () => {
      searchBar.classList.toggle('open');
      if (searchBar.classList.contains('open')) input.focus();
    });
  });

  input.addEventListener('focus', () => {
    searchBar.classList.add('open');
  });

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsBox.classList.remove('show');
      return;
    }

    if (!searchBar.classList.contains('open')) {
      searchBar.classList.add('open');
    }

    const matches = items.filter(p => p._searchText.includes(q)).slice(0, 8);

    if (matches.length === 0) {
      resultsBox.classList.remove('show');
      return;
    }

    resultsBox.innerHTML = matches.map(p => {
      const href = besionEscapeAttr(besionSafeUrl(p._href, 'products.html'));
      const image = besionEscapeAttr(getImageSrc(p.image, BESION_FALLBACK_IMAGE));
      const name = besionEscapeHtml(p.name || 'Product');
      const meta = p._type === 'technical'
        ? `Technical${p.brand_name ? ` • ${p.brand_name}` : ''}`
        : p._type === 'formulation'
          ? 'Formulation'
          : (p.technical || p.category || p.targetPests || '');

      return `
      <div class="search-result-item" data-href="${href}" role="button" tabindex="0">
        <img src="${image}" alt="${besionEscapeAttr(p.name || 'Product')}" data-drive-raw="${besionEscapeAttr(p.image || '')}" data-fallback="${besionEscapeAttr(BESION_FALLBACK_IMAGE)}">
        <div class="search-result-info">
          <strong>${name}</strong>
          <span>${besionEscapeHtml(meta)}</span>
        </div>
      </div>
    `;
    }).join('');
    resultsBox.classList.add('show');
  });

  const clearSelection = () => {
    resultsBox.querySelectorAll('.search-result-item.selected').forEach(el => {
      el.classList.remove('selected');
      el.removeAttribute('aria-selected');
    });
  };

  const handleResultSelect = (item) => {
    if (!item) return;
    clearSelection();
    item.classList.add('selected');
    item.setAttribute('aria-selected', 'true');
    const href = item.getAttribute('data-href');
    if (href) {
      window.setTimeout(() => {
        window.location.href = href;
      }, 140);
    }
  };

  resultsBox.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    handleResultSelect(item);
  });

  resultsBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    e.preventDefault();
    handleResultSelect(item);
  });

  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !e.target.closest('.search-toggle')) {
      searchBar.classList.remove('open');
      resultsBox.classList.remove('show');
    }
  });

  document.addEventListener('besion-sync:updated', refreshItems);
}

// ── Drawer (mobile) ────────────────────────────────────────────────────────
const DRAWER_DOMESTIC_DEFAULTS = [
  { value: 'insecticides', label: 'Insecticides' },
  { value: 'herbicides', label: 'Herbicides' },
  { value: 'fungicides', label: 'Fungicides' },
  { value: 'pgr', label: 'Plant Growth Regulator' },
  { value: 'biofertilizers', label: 'Bio Fertilizers' }
];

function normalizeCategoryList(list, defaults) {
  const src = Array.isArray(list) ? list : defaults;
  const seen = new Set();
  const normalized = [];
  src.forEach(item => {
    if (!item) return;
    const label = String(item.label || item.value || '').trim();
    const value = String(item.value || '').trim();
    if (!label || !value) return;
    if (seen.has(value)) return;
    seen.add(value);
    normalized.push({ value, label });
  });
  return normalized.length ? normalized : defaults.slice();
}

function getDrawerCategoryIcon(value) {
  const icons = {
    all: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>`,
    insecticides: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path d="M12 2a3 3 0 0 1 3 3" />
      <path d="M9 5a3 3 0 0 1 3-3" />
      <path d="M12 8c-2.5 0-4 1.5-4 4v1c0 2.5 1.5 4 4 4s4-1.5 4-4v-1c0-2.5-1.5-4-4-4Z" />
      <path d="M8 10 4 8" />
      <path d="M8 13 4 13" />
      <path d="M8 16 5 18" />
      <path d="M16 10l4-2" />
      <path d="M16 13h4" />
      <path d="M16 16l3 2" />
    </svg>`,
    herbicides: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path d="M12 22V12M12 12C12 7 17 3 22 3C22 8 18 12 12 12ZM12 12C12 7 7 3 2 3C2 8 6 12 12 12Z" />
    </svg>`,
    fungicides: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path d="M12 2C8 2 5 5 5 9c0 2.5 1.5 4.7 3.7 5.8L8 20h8l-.7-5.2C17.5 13.7 19 11.5 19 9c0-4-3-7-7-7Z" />
      <path d="M9 21h6" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="14" cy="7" r="1" />
      <circle cx="12" cy="12" r="1" />
    </svg>`,
    pgr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path d="M12 22v-7" />
      <path d="M12 15C12 10 16 6 21 5c0 5-3 9-9 10Z" />
      <path d="M12 15C12 10 8 6 3 5c0 5 3 9 9 10Z" />
      <circle cx="12" cy="6" r="3" />
      <path d="M12 9v6" />
    </svg>`,
    biofertilizers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path d="M4 20h16" />
      <path d="M6 20V8l6-5 6 5v12" />
      <rect x="9" y="12" width="6" height="8" rx="1" />
      <path d="M12 8a2 2 0 0 1 2 2" />
    </svg>`
  };
  return icons[value] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>`;
}

function getDrawerCategories() {
  const stored = safeJsonParse(storageGet('besion_domestic_categories'), null);
  return normalizeCategoryList(stored, DRAWER_DOMESTIC_DEFAULTS);
}

function renderDrawerMenu() {
  const menu = document.querySelector('.drawer-menu');
  if (!menu) return;
  const esc = typeof besionEscapeHtml === 'function' ? besionEscapeHtml : (v) => String(v ?? '').replace(/[&<>"']/g, '');
  const escAttr = typeof besionEscapeAttr === 'function' ? besionEscapeAttr : esc;
  const categories = getDrawerCategories();
  const params = new URLSearchParams(window.location.search);
  const currentCat = params.get('cat') || '';
  const path = window.location.pathname.split('/').pop() || '';
  const isProducts = path.startsWith('products');
  const allActive = currentCat === 'all' || (isProducts && !params.get('cat'));

  const allLink = `
    <a href="products.html?cat=all" class="${allActive ? 'active' : ''}">
      ${getDrawerCategoryIcon('all')}
      All Products
    </a>
  `;

  const categoryLinks = categories.map(cat => {
    const value = String(cat.value || '').trim();
    const label = String(cat.label || cat.value || '').trim();
    if (!value || !label) return '';
    const href = `products.html?cat=${encodeURIComponent(value)}`;
    const isActive = currentCat === value;
    return `
      <a href="${escAttr(href)}" class="${isActive ? 'active' : ''}">
        ${getDrawerCategoryIcon(value)}
        ${esc(label)}
      </a>
    `;
  }).join('');

  menu.innerHTML = `${allLink}${categoryLinks}`;
}

function setupDrawer() {
  const hamburger = document.querySelector('.hamburger');
  const drawer = document.querySelector('.drawer');
  const overlay = document.querySelector('.drawer-overlay');
  const closeBtn = document.querySelector('.drawer-close');

  if (!hamburger || !drawer) return;

  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

  hamburger.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
}

// ── Category strip (home) ─────────────────────────────────────────────────
function setupCategoryStrip() {
  const items = document.querySelectorAll('.category-container .category-item');
  if (!items.length) return;

  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ── Toast Notifications ───────────────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.style.color = type === 'success' ? '#1a6b3c' : '#e53935';

  if (type === 'success') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z');
    icon.appendChild(path);
  } else {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '8');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '12');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '16');
    line2.setAttribute('x2', '12.01');
    line2.setAttribute('y2', '16');
    icon.appendChild(circle);
    icon.appendChild(line1);
    icon.appendChild(line2);
  }

  const text = document.createElement('span');
  text.textContent = String(message ?? '');
  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Active nav link ────────────────────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const isProductDetails = path.startsWith('product-details');
  document.querySelectorAll('.nav-links a, .drawer-menu a, .bottom-nav-item').forEach(a => {
    a.classList.remove('active');
    const href = a.getAttribute('href') || '';
    if (
      href === path ||
      (isProductDetails && href === 'products.html') ||
      (path === 'index.html' && href === '#') ||
      (path === '' && href === 'index.html')
    ) {
      a.classList.add('active');
    }
  });
}

// ── Home page images from admin settings ───────────────────────────────────
function applyHomeImages() {
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    applyBackgroundImage(heroBg, getHomeHeroImage());
  }
  const aboutImg = document.querySelector('.about-image img');
  if (aboutImg) {
    const aboutImage = getHomeAboutImage();
    aboutImg.removeAttribute('data-drive-raw');
    aboutImg.removeAttribute('data-drive-index');
    aboutImg.setAttribute('data-fallback', aboutImage);
    aboutImg.onerror = null;
    aboutImg.src = aboutImage;
  }
}

function setupGlobalImageFallback() {
  if (typeof document === 'undefined') return;
  document.addEventListener('error', (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    if (!target.hasAttribute('data-drive-raw')) return;
    handleDriveImageError(target);
  }, true);
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for remote config if it's still being fetched
  if (typeof window !== 'undefined' && window.BESION_SYNC_CONFIG && window.BESION_SYNC_CONFIG.url.includes('_PLACEHOLDER')) {
    await new Promise(resolve => {
      const handler = () => {
        document.removeEventListener('besion:config-ready', handler);
        resolve();
      };
      document.addEventListener('besion:config-ready', handler);
      // Safety timeout
      setTimeout(handler, 3000);
    });
  }

  // Manual-refresh model: only pull from GAS on hard reload or first visit.
  // Navigation between pages reuses localStorage cache (no network call).
  initialDataFetch();
  setupGlobalImageFallback();
  preloadProductImages();
  setupSearch();
  setupDrawer();
  setupCategoryStrip();
  setActiveNav();
  renderDrawerMenu();
  applyHomeImages();

  // WhatsApp float
  const waBtn = document.querySelector('.whatsapp-float');
  if (waBtn) waBtn.href = getWhatsAppLink();

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!isWhatsAppAnchor(link)) return;
    if (!gateUserAction(link)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('besion-sync:updated', () => {
    renderDrawerMenu();
    applyHomeImages();
  });
});

// pageshow forced-reload removed: it was triggering extra GAS fetches on
// every back/forward navigation. Data freshness is now managed via the
// manual-refresh model (hard reload = fresh fetch; navigation = cached data).
