const { getAdmin } = require('./_admin');

/// Verifies the caller's own Firebase ID token (sent as
/// `Authorization: Bearer <idToken>`) — every user has their own, unique
/// and short-lived, instead of one shared secret baked into the app.
/// Returns the user's uid on success, or writes a 401 and returns null.
async function requireUser(req, res) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match || !match[1]) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <idToken> header' });
    return null;
  }
  try {
    const decoded = await getAdmin().auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired sign-in token' });
    return null;
  }
}

module.exports = { requireUser };
