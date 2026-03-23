/**
 * Vercel Serverless Function to verify passwords server-side.
 */
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, type } = req.body || {};

  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  let expectedPassword = '';
  if (type === 'admin') {
    expectedPassword = process.env.BESION_ADMIN_PASSWORD;
  } else if (type === 'sync') {
    expectedPassword = process.env.BESION_SYNC_PASSWORD;
  } else {
    return res.status(400).json({ success: false, error: 'Invalid verification type' });
  }

  if (!expectedPassword) {
    return res.status(500).json({ success: false, error: 'Server configuration error: password not set' });
  }

  if (password === expectedPassword) {
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }
}
