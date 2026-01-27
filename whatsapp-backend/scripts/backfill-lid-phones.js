const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: node scripts/backfill-lid-phones.js <accountId>');
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
const authDir = process.env.SESSIONS_PATH || path.join(__dirname, '..', '.baileys_auth');
const sessionPath = path.join(authDir, accountId);

function extractDigits(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\\D/g, '');
}

function resolvePhoneE164FromLid(lidJid) {
  if (!lidJid || typeof lidJid !== 'string' || !lidJid.endsWith('@lid')) {
    return null;
  }
  const lidDigits = extractDigits(lidJid.split('@')[0] || '');
  if (!lidDigits) return null;
  const filePath = path.join(sessionPath, `lid-mapping-${lidDigits}_reverse.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (typeof data !== 'string') return null;
  const digits = extractDigits(data);
  if (!digits) return null;
  return `+${digits}`;
}

async function run() {
  const threadsSnap = await db.collection('threads')
    .where('accountId', '==', accountId)
    .get();

  let updated = 0;
  for (const doc of threadsSnap.docs) {
    const data = doc.data() || {};
    const clientJid = data.clientJid || doc.id.split('__')[1] || null;
    if (!clientJid || !clientJid.endsWith('@lid')) continue;
    if (data.phoneE164) continue;
    const phoneE164 = resolvePhoneE164FromLid(clientJid);
    if (!phoneE164) continue;
    await doc.ref.set({
      phoneE164,
      phone: phoneE164,
      phoneNumber: phoneE164,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('contacts').doc(`${accountId}__${clientJid}`).set({
      accountId,
      jid: clientJid,
      phoneE164,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    updated += 1;
  }

  console.log(`Updated ${updated} LID threads with phoneE164.`);
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
