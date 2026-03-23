# Besion Chemical Sync Service (Google Apps Script)

This Apps Script turns a Google Spreadsheet into the live database for the admin panel and website. The admin panel already has a single **Sync Database** button; once this script is deployed and configured, that button will push all data to the spreadsheet and pull the latest data back to the site.

## Setup
1. Create a Google Sheet (or open an existing one).
2. Open **Extensions → Apps Script**.
3. Replace the default `Code.gs` with the content from `google-apps-script/Code.gs`.
4. Update these constants at the top of `Code.gs`:
   - `SHEET_ID`: optional if the script is bound to the same sheet. If the script is standalone, paste your spreadsheet ID.
   - `API_KEY`: set a secret string. Use the same value in `js/config.js`.
5. Deploy as a web app:
   - Execute as: **Me**
   - Who has access: **Anyone** (or Anyone with the link)
6. Copy the web app URL and paste it into `js/config.js` (`window.BESION_SYNC_CONFIG.url`).

## Sheet Structure
The script will create sheets on first sync if they do not exist:
- `Products`
- `Technicals`
- `Formulations`
- `Settings`
- `Categories`

Each sheet has a fixed header row. You can edit the data directly in the sheet, then click **Sync Database** in the admin panel to pull updates.

## Config (Frontend)
Update `js/config.js` with your web app URL, API key, admin password, and sync password:

```js
window.BESION_SYNC_CONFIG = {
  url: 'PASTE_WEB_APP_URL_HERE',
  apiKey: 'PASTE_API_KEY_HERE',
  adminPassword: 'SET_ADMIN_PASSWORD_HERE',
  syncPassword: 'SET_SYNC_PASSWORD_HERE',
  usePlainText: true,
  autoPull: true,
  timeoutMs: 12000
};
```

`usePlainText: true` avoids CORS preflight issues with Apps Script.
