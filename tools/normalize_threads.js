#!/usr/bin/env node
const fs = require('fs');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || '/etc/whatsapp-backend/firebase-sa.json';
const ACCOUNT_ID = process.env.ACCOUNT_ID;

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

function normalizeClientJid(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const candidate = value.canonicalJid || value.rawJid || value.jid || value.id || value.value || value.clientJid || null;
  return typeof candidate === 'string' ? candidate : null;
}

async function main() {
  const threadsSnap = await db.collection('threads').where('accountId', '==', ACCOUNT_ID).get();
  let migrated = 0;
  let skipped = 0;
  let movedMessages = 0;

  for (const doc of threadsSnap.docs) {
    const threadId = doc.id;
    const data = doc.data();
    const clientJid = normalizeClientJid(data.clientJid);

    if (!clientJid || typeof data.clientJid === 'string') {
      skipped += 1;
      continue;
    }

    const canonicalThreadId = `${ACCOUNT_ID}__${clientJid}`;
    const targetRef = db.collection('threads').doc(canonicalThreadId);
    const sourceRef = db.collection('threads').doc(threadId);

    const msgsSnap = await sourceRef.collection('messages').get();
    if (!msgsSnap.empty) {
      let batch = db.batch();
      let ops = 0;
      for (const msgDoc of msgsSnap.docs) {
        const destRef = targetRef.collection('messages').doc(msgDoc.id);
        batch.set(destRef, msgDoc.data(), { merge: true });
        ops += 1;
        movedMessages += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    await targetRef.set({
      ...data,
      clientJid,
      accountId: ACCOUNT_ID,
      migratedFrom: threadId,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await sourceRef.set({
      migratedTo: canonicalThreadId,
      archived: true,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    migrated += 1;
  }

  console.log(JSON.stringify({ migrated, skipped, movedMessages, total: threadsSnap.size }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
