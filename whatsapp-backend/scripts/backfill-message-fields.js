const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const accountId = process.argv[2];
const threadLimit = Number(process.argv[3] || 50);
const perThreadLimit = Number(process.argv[4] || 200);

if (!accountId) {
  console.error('Usage: node scripts/backfill-message-fields.js <accountId> [threadLimit] [perThreadLimit]');
  process.exit(1);
}

const saPath = process.env.FIREBASE_SA_PATH || '/etc/whatsapp-backend/firebase-sa.json';
if (!admin.apps.length) {
  const raw = fs.readFileSync(saPath, 'utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();

function toTimestamp(value) {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value.toDate && typeof value.toDate === 'function') {
    try {
      return admin.firestore.Timestamp.fromDate(value.toDate());
    } catch (_) {
      return null;
    }
  }
  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  if (typeof value === 'number') {
    return admin.firestore.Timestamp.fromDate(new Date(value));
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return admin.firestore.Timestamp.fromDate(new Date(parsed));
    }
  }
  return null;
}

async function run() {
  const threadsSnap = await db.collection('threads')
    .where('accountId', '==', accountId)
    .orderBy('lastMessageAt', 'desc')
    .limit(threadLimit)
    .get();

  console.log(`Found ${threadsSnap.size} threads for ${accountId}`);

  let updated = 0;
  for (const threadDoc of threadsSnap.docs) {
    const threadId = threadDoc.id;
    const messagesSnap = await db.collection('threads')
      .doc(threadId)
      .collection('messages')
      .orderBy('tsClient', 'desc')
      .limit(perThreadLimit)
      .get();

    if (messagesSnap.empty) continue;

    const batch = db.batch();
    let batchWrites = 0;

    messagesSnap.docs.forEach(msgDoc => {
      const data = msgDoc.data() || {};
      const updates = {};
      if (!data.tsSort) {
        const fallback = data.tsClient || data.tsServer || data.createdAt;
        const tsSort = toTimestamp(fallback);
        if (tsSort) updates.tsSort = tsSort;
      }
      if (data.fromMe === undefined || data.fromMe === null) {
        if (data.direction === 'in' || data.direction === 'out') {
          updates.fromMe = data.direction === 'out';
        }
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.set(msgDoc.ref, updates, { merge: true });
        batchWrites += 1;
      }
    });

    if (batchWrites > 0) {
      await batch.commit();
      updated += batchWrites;
      console.log(`Thread ${threadId}: updated ${batchWrites} messages`);
    }
  }

  console.log(`Done. Updated ${updated} messages.`);
}

run().catch(error => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
