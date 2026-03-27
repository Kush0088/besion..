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
    // Check for an in-session cached copy first
    let localConfig = null;
    try {
      const cached = sessionStorage.getItem(_BESION_CONFIG_SESSION_KEY);
      if (cached) localConfig = JSON.parse(cached);
    } catch (_) { /* ignore parse/storage errors */ }

    if (!localConfig) {
      const response = await fetch('/js/config.local.json');
      if (response.ok) {
        localConfig = await response.json();
        try { sessionStorage.setItem(_BESION_CONFIG_SESSION_KEY, JSON.stringify(localConfig)); } catch (_) {}
      } else {
        throw new Error(`Failed to load config.local.json: ${response.status}`);
      }
    }

    window.BESION_SYNC_CONFIG = {
      ...window.BESION_SYNC_CONFIG,
      url: localConfig.url || window.BESION_SYNC_CONFIG.url,
      syncPassword: localConfig.syncPassword || 'final',
      adminEnabled: localConfig.adminEnabled !== false,
      autoPull: localConfig.autoPull !== false
    };
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
    console.log('Configuration loaded' + (localConfig ? ' (session cache).' : '.'));
  } catch (err) {
    console.warn('Could not load configuration, using defaults.', err);
    // Dispatch even on failure so UI isn't blocked forever
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
  }
})();
