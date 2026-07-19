const Busboy = require('busboy');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-api-key'] !== process.env.STORAGE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Server missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
  }

  try {
    const { fileBuffer, fileName, mimeType } = await parseMultipart(req);
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No file received' });
    }

    const form = new FormData();
    form.append('chat_id', chatId);
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
    return res.status(200).json({
      fileId: doc.file_id,
      messageId: tgJson.result.message_id,
      fileSize: doc.file_size || fileBuffer.length,
      fileName,
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

    busboy.on('file', (_name, stream, info) => {
      fileName = info.filename || fileName;
      mimeType = info.mimeType || mimeType;
      stream.on('data', (d) => chunks.push(d));
    });
    busboy.on('finish', () => resolve({ fileBuffer: Buffer.concat(chunks), fileName, mimeType }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
