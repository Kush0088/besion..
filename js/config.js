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

// Asynchronously fetch real URL from config.local.json
(async function initConfig() {
  try {
    const response = await fetch('/js/config.local.json');
    if (response.ok) {
      const localConfig = await response.json();
      window.BESION_SYNC_CONFIG = {
        ...window.BESION_SYNC_CONFIG,
        url: localConfig.url || window.BESION_SYNC_CONFIG.url,
        syncPassword: localConfig.syncPassword || 'final',
        adminEnabled: localConfig.adminEnabled !== false,
        autoPull: localConfig.autoPull !== false
      };
      document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
      console.log('Configuration loaded successfully.');
    } else {
      throw new Error(`Failed to load config.local.json: ${response.status}`);
    }
  } catch (err) {
    console.warn('Could not load configuration, using defaults.', err);
    // Dispatch even on failure so UI isn't blocked forever
    document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: window.BESION_SYNC_CONFIG }));
  }
})();
