const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
    const serviceAccount = JSON.parse(
      raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

module.exports = { getAdmin };
