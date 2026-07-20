const Busboy = require('busboy');
const crypto = require('crypto');
const { getAdmin } = require('../../_admin');
const { requireBucketKey } = require('../../_bucket');

/// Upload endpoint for apps *built with* CoderIT (Flutter/React/Next.js/
/// plain HTML+JS) — called with the bucket's own key, not a CoderIT
/// account login, since the person using the deployed app is an end user
/// who never signs into CoderIT at all. Same Telegram-backed storage as
/// the rest of this proxy, just scoped per bucket instead of per CoderIT
/// account.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bucket-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireBucketKey(req, res);
  if (!auth) return;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Server missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
  }

  try {
    const { fileBuffer, fileName, mimeType, fields } = await parseMultipart(req);
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No file received' });
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', `bucket:${auth.bucketId}`);
    form.append('document', new Blob([fileBuffer], { type: mimeType }), fileName);

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const tgJson = await tgRes.json();
    if (!tgJson.ok) {
      return res.status(502).json({ error: tgJson.description || 'Telegram upload failed' });
    }

    const doc = tgJson.result.document || tgJson.result.video || tgJson.result.audio;
    // Short public id used in the served URL, decoupled from Telegram's
    // own (long, opaque) file_id — this way file_id can be rotated or the
    // backing store swapped later without breaking URLs already handed
    // out to end users.
    const publicId = crypto.randomBytes(9).toString('base64url');
    const sizeBytes = doc.file_size || fileBuffer.length;

    const db = getAdmin().firestore();
    await auth.bucketRef.collection('files').doc(publicId).set({
      fileName,
      mimeType,
      sizeBytes,
      telegramFileId: doc.file_id,
      telegramMessageId: tgJson.result.message_id,
      path: (fields.path || fileName).replace(/^\/+/, ''),
      createdAt: getAdmin().firestore.FieldValue.serverTimestamp(),
    });
    await auth.bucketRef.update({
      fileCount: getAdmin().firestore.FieldValue.increment(1),
      totalBytes: getAdmin().firestore.FieldValue.increment(sizeBytes),
    });

    const base = `https://${req.headers.host}`;
    return res.status(200).json({
      id: publicId,
      fileName,
      sizeBytes,
      mimeType,
      url: `${base}/api/f/${auth.bucketId}/${publicId}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let fileName = 'file';
    let mimeType = 'application/octet-stream';
    const chunks = [];
    const fields = {};

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });
    busboy.on('file', (_name, stream, info) => {
      fileName = info.filename || fileName;
      mimeType = info.mimeType || mimeType;
      stream.on('data', (d) => chunks.push(d));
    });
    busboy.on('finish', () => resolve({ fileBuffer: Buffer.concat(chunks), fileName, mimeType, fields }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
