const { getAdmin } = require('../../../_admin');

/// This is the URL that actually gets embedded in end-user apps —
/// `https://<your-proxy>.vercel.app/api/f/{bucketId}/{fileId}` — exactly
/// like a Firebase Storage download URL or an S3 public object URL.
/// Deliberately no auth here: a bucket's files are either meant to be
/// publicly loadable by the app's own users (images, avatars, PDFs the
/// app displays) or the app owner keeps the fileId itself unguessable.
/// Uploading/deleting is what's protected (via the bucket key) — reading
/// a known file URL is not, same tradeoff Firebase/S3 public buckets make.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { bucketId, fileId } = req.query;
  if (!bucketId || !fileId) {
    return res.status(400).json({ error: 'bucketId and fileId are required' });
  }

  const db = getAdmin().firestore();
  const fileDoc = await db
    .collection('buckets')
    .doc(String(bucketId))
    .collection('files')
    .doc(String(fileId))
    .get();

  if (!fileDoc.exists) {
    return res.status(404).json({ error: 'File not found' });
  }
  const { telegramFileId, mimeType, fileName } = fileDoc.data();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'Server missing TELEGRAM_BOT_TOKEN' });

  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${telegramFileId}`);
    const infoJson = await infoRes.json();
    if (!infoJson.ok) {
      return res.status(502).json({ error: infoJson.description || 'File unavailable' });
    }
    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${infoJson.result.file_path}`);
    if (!fileRes.ok) return res.status(502).json({ error: 'Failed to fetch file' });

    const arrayBuffer = await fileRes.arrayBuffer();
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(fileName || 'file').replace(/"/g, '')}"`);
    // Immutable because publicId is randomly generated per upload and
    // never reused — safe for browsers/CDNs to cache indefinitely.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to serve file' });
  }
};
