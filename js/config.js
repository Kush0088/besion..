/**
 * Besion Chemical — Configuration Manager
 * Loads public config (Google Apps Script URL) without relying on Vercel.
 */

// Initial default configuration
window.BESION_SYNC_CONFIG = {
  url: '',
  syncPassword: 'final',
  adminEnabled: true,
  autoPull: true
};

// Fetch config.local.json once per session; subsequent page navigations reuse the
// sessionStorage copy instead of hitting the network again.
const _BESION_CONFIG_SESSION_KEY = 'besion_config_session';

(async function initConfig() {
  try {
    // ── Session Caching Logic ───────────────────────────────────────────
    const isReload = typeof window !== 'undefined' && 
      (window.performance?.navigation?.type === 1 ||
       window.performance?.getEntriesByType("navigation").map(nav => nav.type).includes("reload"));

    const sessionCached = sessionStorage.getItem(_BESION_CONFIG_SESSION_KEY);
    
    if (sessionCached && !isReload) {
      const cached = JSON.parse(sessionCached);
      window.BESION_SYNC_CONFIG = { ...window.BESION_SYNC_CONFIG, ...cached };
      document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
      return;
    }

    // Fetch config.local.json if not cached or if it's a manual reload.
    let localConfig = null;
    const response = await fetch('/js/config.local.json', { cache: 'no-cache' });
    if (response.ok) {
      localConfig = await response.json();
      sessionStorage.setItem(_BESION_CONFIG_SESSION_KEY, JSON.stringify(localConfig));
    } else {
      throw new Error(`Failed to load config.local.json: ${response.status}`);
    }

    window.BESION_SYNC_CONFIG = {
      ...window.BESION_SYNC_CONFIG,
      url: localConfig.url || window.BESION_SYNC_CONFIG.url,
      syncPassword: localConfig.syncPassword || 'final',
      adminEnabled: localConfig.adminEnabled !== false,
      autoPull: localConfig.autoPull !== false
    };
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
  } catch (err) {
    console.warn('Could not load configuration, using defaults.', err);
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
  }
})();
