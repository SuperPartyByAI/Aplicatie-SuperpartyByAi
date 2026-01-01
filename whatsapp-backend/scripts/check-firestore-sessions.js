#!/usr/bin/env node

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

(async () => {
  console.log('=== FIRESTORE WA_SESSIONS DIAGNOSTIC ===\n');

  // Check wa_sessions
  const sessionsSnapshot = await db.collection('wa_sessions').get();
  console.log(`Total wa_sessions documents: ${sessionsSnapshot.size}\n`);

  for (const doc of sessionsSnapshot.docs) {
    const data = doc.data();
    console.log(`\n--- ${doc.id} ---`);
    console.log(`Fields: ${Object.keys(data).join(', ')}`);

    if (data.creds) {
      const credsKeys = Object.keys(data.creds);
      console.log(`  creds keys: ${credsKeys.join(', ')}`);
      console.log(`  creds._type: ${data.creds._type || 'none'}`);
    } else {
      console.log(`  creds: MISSING`);
    }

    if (data.keys) {
      const keysTypes = Object.keys(data.keys);
      console.log(`  keys types: ${keysTypes.join(', ')}`);
    } else {
      console.log(`  keys: MISSING`);
    }

    console.log(`  updatedAt: ${data.updatedAt ? data.updatedAt.toDate() : 'N/A'}`);
    console.log(`  schemaVersion: ${data.schemaVersion || 'N/A'}`);
  }

  // Check wa_accounts
  console.log('\n\n=== WA_ACCOUNTS ===\n');
  const accountsSnapshot = await db.collection('wa_accounts').get();
  console.log(`Total wa_accounts documents: ${accountsSnapshot.size}\n`);

  for (const doc of accountsSnapshot.docs) {
    const data = doc.data();
    console.log(`${doc.id}: status=${data.status}, phone=${data.phoneE164 || data.phone || 'N/A'}`);
  }

  process.exit(0);
})();
