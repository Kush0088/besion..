/**
 * Vercel Serverless Function to serve environment variables to the frontend.
 */
export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return selected environment variables
  res.status(200).json({
    url: process.env.BESION_SYNC_URL || null,
    apiKey: process.env.BESION_API_KEY || null,
    adminPassword: process.env.BESION_ADMIN_PASSWORD || null,
    syncPassword: process.env.BESION_SYNC_PASSWORD || null,
    // Add other non-sensitive config here if needed
    usePlainText: true,
    autoPull: true,
    timeoutMs: 12000,
    adminEnabled: true
  });
}
