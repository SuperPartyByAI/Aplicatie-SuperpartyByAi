const admin = require('firebase-admin');
const serviceAccount = require('../.github/secrets-backup/firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAccount() {
  try {
    const doc = await db.collection('whatsapp_accounts').doc('account_1767014419146').get();
    if (doc.exists) {
      const data = doc.data();
      console.log('✅ Firestore status:', data.status);
      console.log('Phone:', data.phone);
      console.log('Updated:', data.updatedAt?.toDate());
    } else {
      console.log('❌ Account not in Firestore');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkAccount();
