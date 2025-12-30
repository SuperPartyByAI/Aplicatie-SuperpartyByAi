const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized');
    } else {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function checkCollections() {
  console.log('\n📊 Checking Firestore collections...\n');
  
  try {
    // Check whatsappConversations
    const conversationsSnapshot = await db.collection('whatsappConversations').limit(5).get();
    console.log(`📱 whatsappConversations: ${conversationsSnapshot.size} documents (showing first 5)`);
    if (conversationsSnapshot.size > 0) {
      conversationsSnapshot.forEach(doc => {
        console.log(`  - ${doc.id}:`, doc.data());
      });
    } else {
      console.log('  ⚠️  Collection is empty');
    }
    
    console.log('');
    
    // Check whatsappMessages
    const messagesSnapshot = await db.collection('whatsappMessages').limit(5).get();
    console.log(`💬 whatsappMessages: ${messagesSnapshot.size} documents (showing first 5)`);
    if (messagesSnapshot.size > 0) {
      messagesSnapshot.forEach(doc => {
        console.log(`  - ${doc.id}:`, doc.data());
      });
    } else {
      console.log('  ⚠️  Collection is empty');
    }
    
    console.log('');
    
    // Check staffProfiles
    const staffSnapshot = await db.collection('staffProfiles').limit(5).get();
    console.log(`👥 staffProfiles: ${staffSnapshot.size} documents (showing first 5)`);
    if (staffSnapshot.size > 0) {
      staffSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - ${doc.id}: ${data.email} (code: ${data.code})`);
      });
    } else {
      console.log('  ⚠️  Collection is empty');
    }
    
    console.log('\n✅ Check complete\n');
    
  } catch (error) {
    console.error('❌ Error checking collections:', error);
  }
  
  process.exit(0);
}

checkCollections();
