const { requireUser } = require('../../_auth');
const { getAdmin } = require('../../_admin');
const { generateBucketKey, hashKey } = require('../../_bucket');

/// Called from inside the CoderIT builder (signed in as the app owner) to
/// provision a bucket for one of their projects — like clicking "Create
/// bucket" in the Firebase console. Body: { bucketId, name }. bucketId is
/// the CoderIT project's own stable id, so every project maps to exactly
/// one bucket. Returns the raw key ONCE; only its hash is stored after
/// this, same as most API-key systems (Stripe, AWS, etc).
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uid = await requireUser(req, res);
  if (!uid) return;

  const { bucketId, name } = req.body || {};
  if (!bucketId || typeof bucketId !== 'string') {
    return res.status(400).json({ error: 'bucketId is required' });
  }

  const db = getAdmin().firestore();
  const ref = db.collection('buckets').doc(bucketId);
  const existing = await ref.get();

  if (existing.exists) {
    if (existing.data().ownerUid !== uid) {
      return res.status(403).json({ error: 'This bucket belongs to another account' });
    }
    // Already provisioned — return its public info, but never the key
    // again (it was only ever shown once, at creation time).
    return res.status(200).json({
      bucketId,
      name: existing.data().name,
      alreadyExists: true,
    });
  }

  const key = generateBucketKey();
  await ref.set({
    ownerUid: uid,
    name: (name && String(name).trim()) || bucketId,
    keyHash: hashKey(key),
    fileCount: 0,
    totalBytes: 0,
    createdAt: getAdmin().firestore.FieldValue.serverTimestamp(),
  });

  return res.status(200).json({ bucketId, name: name || bucketId, key });
};
