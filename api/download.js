module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-api-key'] !== process.env.STORAGE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).json({ error: 'fileId is required' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'Server missing TELEGRAM_BOT_TOKEN' });

  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const infoJson = await infoRes.json();
    if (!infoJson.ok) {
      return res.status(404).json({ error: infoJson.description || 'File not found' });
    }

    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${infoJson.result.file_path}`);
    if (!fileRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch file from Telegram' });
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    res.setHeader('Content-Type', fileRes.headers.get('content-type') || 'application/octet-stream');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Download failed' });
  }
};
