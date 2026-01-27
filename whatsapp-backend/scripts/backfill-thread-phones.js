const admin = require('firebase-admin');
const fs = require('fs');

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: node scripts/backfill-thread-phones.js <accountId>');
  process.exit(1);
}

const saPath = process.env.FIREBASE_SA_PATH || '/etc/whatsapp-backend/firebase-sa.json';
if (!admin.apps.length) {
  const raw = fs.readFileSync(saPath, 'utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) {
    sa.private_key = sa.private_key.replace(/\n/g, '\n');
  }
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();

function phoneFromJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const raw = jid.split('@')[0] || '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

async function run() {
  const threadsSnap = await db.collection('threads')
    .where('accountId', '==', accountId)
    .get();

  console.log(`Threads: ${threadsSnap.size}`);
  let updated = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of threadsSnap.docs) {
    const data = doc.data() || {};
    const clientJid = data.clientJid || doc.id.split('__')[1] || null;
    const isLid = typeof clientJid === 'string' && clientJid.includes('@lid');

    let phoneE164 = data.phoneE164 || data.phone || data.phoneNumber || null;
    if (!phoneE164 && !isLid) {
      phoneE164 = phoneFromJid(clientJid);
    }

    const updates = {
      phoneE164: phoneE164 || null,
      phone: data.phone || phoneE164 || null,
      phoneNumber: data.phoneNumber || phoneE164 || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(doc.ref, updates, { merge: true });
    batchCount += 1;
    updated += 1;

    if (batchCount >= 400) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Updated ${updated} threads.`);
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
