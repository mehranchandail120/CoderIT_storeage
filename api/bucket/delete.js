const { getAdmin } = require('../../_admin');
const { requireBucketKey } = require('../../_bucket');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bucket-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireBucketKey(req, res);
  if (!auth) return;

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });

  const fileRef = auth.bucketRef.collection('files').doc(id);
  const fileDoc = await fileRef.get();
  if (!fileDoc.exists) return res.status(404).json({ error: 'File not found' });
  const { telegramMessageId, sizeBytes } = fileDoc.data();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (botToken && chatId && telegramMessageId) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: telegramMessageId }),
      });
    } catch (_) {
      // Non-fatal — still remove our own record even if the Telegram
      // delete call fails (e.g. message already gone).
    }
  }

  await fileRef.delete();
  await auth.bucketRef.update({
    fileCount: getAdmin().firestore.FieldValue.increment(-1),
    totalBytes: getAdmin().firestore.FieldValue.increment(-(sizeBytes || 0)),
  });

  return res.status(200).json({ ok: true });
};
