const { requireUser } = require('../../_auth');
const { getAdmin } = require('../../_admin');
const { generateBucketKey, hashKey } = require('../../_bucket');

/// Invalidates a bucket's current key and issues a new one. Like most
/// API-key systems, the old key stops working the instant this runs, so
/// any already-deployed app using the old key will need to be rebuilt
/// with the new one before it can upload/access files again.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uid = await requireUser(req, res);
  if (!uid) return;

  const { bucketId } = req.body || {};
  if (!bucketId) return res.status(400).json({ error: 'bucketId is required' });

  const db = getAdmin().firestore();
  const ref = db.collection('buckets').doc(bucketId);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: 'Bucket not found' });
  if (doc.data().ownerUid !== uid) {
    return res.status(403).json({ error: 'This bucket belongs to another account' });
  }

  const key = generateBucketKey();
  await ref.update({ keyHash: hashKey(key) });

  return res.status(200).json({ bucketId, key });
};
