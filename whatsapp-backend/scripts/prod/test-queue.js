const axios = require('axios');
const admin = require('firebase-admin');

async function testQueue(baseUrl, accountId, token) {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    
    const db = admin.firestore();
    
    // Disconnect socket
    console.log(`Disconnecting socket...`);
    await axios.post(`${baseUrl}/api/admin/sockets/restart`, { accountId }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Queue 3 messages
    console.log(`Queueing 3 messages...`);
    const queuedIds = [];
    
    for (let i = 1; i <= 3; i++) {
      const messageId = `test_queue_${Date.now()}_${i}`;
      
      await db.collection('wa_outbox').doc(messageId).set({
        accountId,
        to: '40786522611',
        body: `Queue test ${i}`,
        status: 'queued',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      queuedIds.push(`wa_outbox/${messageId}`);
    }
    
    console.log(`Queued: ${queuedIds.join(', ')}`);
    
    // Wait for reconnect + flush
    console.log(`Waiting 30s for reconnect + flush...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check if sent
    const sentPaths = [];
    for (const path of queuedIds) {
      const docId = path.split('/')[1];
      const doc = await db.collection('wa_outbox').doc(docId).get();
      
      if (doc.exists && doc.data().status === 'sent') {
        sentPaths.push(path);
      }
    }
    
    if (sentPaths.length === 0) {
      return { pass: false, reason: 'no_messages_sent', queuedPaths: queuedIds };
    }
    
    return {
      pass: true,
      queuedPaths: queuedIds,
      sentPaths,
      sentCount: sentPaths.length
    };
  } catch (error) {
    return { pass: false, reason: error.message };
  }
}

module.exports = { testQueue };
