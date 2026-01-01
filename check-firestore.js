const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkMessages() {
  try {
    console.log('Checking Firestore for messages...');

    // Check accounts collection
    const accountsSnapshot = await db.collection('accounts').get();
    console.log(`Found ${accountsSnapshot.size} accounts in Firestore`);

    if (accountsSnapshot.empty) {
      console.log('No accounts found in Firestore');
      return;
    }

    // Check messages in each account
    for (const accountDoc of accountsSnapshot.docs) {
      console.log(`\nAccount: ${accountDoc.id}`);

      const chatsSnapshot = await accountDoc.ref.collection('chats').get();
      console.log(`  Chats: ${chatsSnapshot.size}`);

      for (const chatDoc of chatsSnapshot.docs) {
        console.log(`  Chat: ${chatDoc.id}`);
        const chatData = chatDoc.data();
        console.log(`    Last message: ${chatData.lastMessage}`);

        const messagesSnapshot = await chatDoc.ref
          .collection('messages')
          .orderBy('timestamp', 'desc')
          .limit(5)
          .get();
        console.log(`    Messages: ${messagesSnapshot.size}`);

        messagesSnapshot.forEach(msgDoc => {
          const msg = msgDoc.data();
          console.log(`      - ${msg.body || msg.text || 'No body'} (${msg.timestamp})`);
        });
      }
    }

    // Check whatsapp_sessions
    const sessionsSnapshot = await db.collection('whatsapp_sessions').get();
    console.log(`\nWhatsApp sessions: ${sessionsSnapshot.size}`);

    sessionsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(
        `  ${doc.id}: ${data.metadata?.phone || 'no phone'} (${data.metadata?.status || 'no status'})`
      );
    });
  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

checkMessages();
