const crypto = require('crypto');
const { getAdmin } = require('./_admin');

/// Bucket keys look like "ck_<24 random hex chars>". Only their SHA-256
/// hash is ever stored, same principle as an API key or password — if the
/// Firestore data ever leaked, the raw keys wouldn't be recoverable from it.
function generateBucketKey() {
  return 'ck_' + crypto.randomBytes(18).toString('hex');
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/// Verifies the `X-Bucket-Key` header against the bucket doc's stored
/// hash. This is what lets an end-user's *deployed* app (Flutter/React/
/// Next.js/HTML — no Firebase login of its own) talk to its bucket: the
/// app owner generates one key per bucket from inside CoderIT once, bakes
/// it into their generated app's storage SDK config, and every request
/// from that app is scoped to that one bucket only — it can never see or
/// touch any other bucket, signed-in CoderIT users or not.
async function requireBucketKey(req, res) {
  const key = req.headers['x-bucket-key'];
  const bucketId = req.query.bucketId || (req.body && req.body.bucketId);
  if (!key || !bucketId) {
    res.status(401).json({ error: 'Missing X-Bucket-Key header or bucketId' });
    return null;
  }
  const db = getAdmin().firestore();
  const doc = await db.collection('buckets').doc(String(bucketId)).get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Bucket not found' });
    return null;
  }
  const data = doc.data();
  if (data.keyHash !== hashKey(key)) {
    res.status(401).json({ error: 'Invalid bucket key' });
    return null;
  }
  return { bucketId: String(bucketId), bucketRef: doc.ref, bucketData: data };
}

module.exports = { generateBucketKey, hashKey, requireBucketKey };
