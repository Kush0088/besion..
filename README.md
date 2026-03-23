# Besion Chemical - Deployment & Security Guide

This document provides instructions for deploying the Besion Chemical web application and maintaining its security.

## 🚀 Deployment Steps

### 1. Backend (Google Apps Script)
1. Open the [Google Apps Script](https://script.google.com/home) editor.
2. Copy the contents of `google-apps-script/Code.gs` into a new project.
3. **Change the `API_KEY`** in the `BESION_SYNC` object to a strong, unique secret.
4. Deploy as a **Web App**:
   - Execute as: `Me`
   - Who has access: `Anyone` (The script itself handles authorization via the API Key).
5. Copy the **Web App URL**.

### 2. Frontend Configuration
1. Open `js/config.js`.
2. Paste the **Web App URL** into the `url` field.
3. Paste the **same `API_KEY`** you used in the script into the `apiKey` field.
4. **Change `adminPassword` and `syncPassword`** to strong secrets.
5. Deploy the static files (HTML, CSS, JS, images) to your host (e.g., Netlify, Vercel, GitHub Pages).

## 🔐 Security Best Practices

- **Shared Secrets**: The `adminPassword` and `syncPassword` are used for client-side authentication. While they are protected by a session token, they are technically visible in the source code if someone knows where to look. **Never share your `config.js` publicly.**
- **Google Drive Sharing**: For images and PDFs to work, they must be set to **"Anyone with the link"** in Google Drive.
- **API Rate Limiting**: The app includes a client-side "action gate" to prevent spamming WhatsApp inquiries.

## 🛠 Maintenance
- **Categories**: Manage categories via the Admin Panel to ensure they are consistent across the site.
- **Syncing**: Use the "Sync Database" button in the Admin Panel to back up your local changes to the Google Sheet.
