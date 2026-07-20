const { requireBucketKey } = require('../../_bucket');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bucket-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireBucketKey(req, res);
  if (!auth) return;

  const prefix = (req.query.prefix || '').replace(/^\/+/, '');
  const snap = await auth.bucketRef.collection('files').orderBy('createdAt', 'desc').limit(500).get();

  const base = `https://${req.headers.host}`;
  const files = snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        fileName: v.fileName,
        path: v.path || v.fileName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        url: `${base}/api/f/${auth.bucketId}/${d.id}`,
        createdAt: v.createdAt ? v.createdAt.toDate().toISOString() : null,
      };
    })
    .filter((f) => !prefix || f.path.startsWith(prefix));

  return res.status(200).json({ bucketId: auth.bucketId, files });
};
