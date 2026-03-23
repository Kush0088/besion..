/**
 * Besion Chemical — Configuration Manager
 * Fetches secrets from Vercel environment variables via /api/config
 */

// Initial default configuration (placeholders/fallback)
window.BESION_SYNC_CONFIG = {
  url: 'BESION_SYNC_URL_PLACEHOLDER',
  apiKey: 'BESION_API_KEY_PLACEHOLDER',
  adminPassword: 'BESION_ADMIN_PASSWORD_PLACEHOLDER',
  syncPassword: 'BESION_SYNC_PASSWORD_PLACEHOLDER',
  usePlainText: true,
  autoPull: true,
  timeoutMs: 12000,
  adminEnabled: true
};

// Asynchronously fetch real secrets from Vercel API
(async function initConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const remoteConfig = await response.json();
      // Merge remote config into the global object
      window.BESION_SYNC_CONFIG = {
        ...window.BESION_SYNC_CONFIG,
        ...remoteConfig
      };
      // Dispatch event so other scripts know config is ready
      document.dispatchEvent(new CustomEvent('besion:config-ready', { detail: remoteConfig }));
      console.log('Remote configuration loaded successfully.');
    }
  } catch (err) {
    console.warn('Could not load remote config, using defaults.', err);
  }
})();
