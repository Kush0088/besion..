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
    // Fetch config.local.json on every page load to ensure freshness.
    // vercel.json ensures this fetch is not cached by the browser/edge.
    let localConfig = null;
    const response = await fetch('/js/config.local.json');
    if (response.ok) {
      localConfig = await response.json();
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
    console.log('Configuration loaded fresh.');
  } catch (err) {
    console.warn('Could not load configuration, using defaults.', err);
    // Dispatch even on failure so UI isn't blocked forever
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
  }
})();
