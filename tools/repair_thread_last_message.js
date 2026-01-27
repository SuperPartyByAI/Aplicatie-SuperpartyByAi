#!/usr/bin/env node
const fs = require('fs');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || '/etc/whatsapp-backend/firebase-sa.json';
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const LIMIT = parseInt(process.env.LIMIT || '200', 10);

if (!ACCOUNT_ID) {
  console.error('Missing ACCOUNT_ID');
  process.exit(1);
}

if (!admin.apps.length) {
  const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

async function main() {
  const threadsSnap = await db.collection('threads')
    .where('accountId', '==', ACCOUNT_ID)
    .orderBy('lastMessageAt', 'desc')
    .limit(LIMIT)
    .get();

  let updated = 0;
  let skipped = 0;

  for (const doc of threadsSnap.docs) {
    const threadId = doc.id;
    const messagesSnap = await db.collection('threads')
      .doc(threadId)
      .collection('messages')
      .orderBy('tsClient', 'desc')
      .limit(1)
      .get();

    if (messagesSnap.empty) {
      skipped += 1;
      continue;
    }

    const msg = messagesSnap.docs[0].data();
    const ts = toDate(msg.tsClient) || toDate(msg.tsServer) || new Date();
    const preview = (msg.body || msg.text || '').toString().substring(0, 120);

    await doc.ref.set({
      lastMessageAt: admin.firestore.Timestamp.fromDate(ts),
      lastMessagePreview: preview,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    updated += 1;
  }

  console.log(JSON.stringify({ updated, skipped, total: threadsSnap.size }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
