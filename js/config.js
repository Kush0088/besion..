window.BESION_SYNC_CONFIG = {
  // Sync service Web App URL (Google Apps Script)
  url: 'BESION_SYNC_URL_PLACEHOLDER',
  // MUST match BESION_SYNC.API_KEY in Code.gs
  apiKey: 'BESION_API_KEY_PLACEHOLDER',
  // Admin panel password (required for aks-admin.html)
  adminPassword: 'BESION_ADMIN_PASSWORD_PLACEHOLDER', // CHANGE THIS BEFORE PROD
  // Extra password gate for the Sync Database action in admin
  syncPassword: 'BESION_SYNC_PASSWORD_PLACEHOLDER',  // CHANGE THIS BEFORE PROD
  // Use text/plain to avoid CORS preflight with Apps Script
  usePlainText: true,
  // Auto-pull data on page load
  autoPull: true,
  // Request timeout in ms
  timeoutMs: 12000,
  // Enable admin panel access
  adminEnabled: true
};
