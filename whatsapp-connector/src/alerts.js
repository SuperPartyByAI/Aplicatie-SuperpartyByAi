const crypto = require('crypto');
const { getDb, getAdmin } = require('./firestore');

function sha1(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex');
}

async function emitAlert({ type, severity = 'warn', accountId = null, threadId = null, message, meta = {} }) {
  const db = getDb();
  const admin = getAdmin();
  const day = new Date().toISOString().slice(0, 10);
  const id = `wa_${sha1([type, accountId || '', threadId || '', day, message || ''].join('|')).slice(0, 24)}`;

  await db.collection('whatsapp_alerts').doc(id).set(
    {
      type,
      severity,
      accountId,
      threadId,
      message: message || null,
      meta: meta || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return id;
}

module.exports = {
  emitAlert,
};

