#!/usr/bin/env node
/**
 * Check last INBOUND (received) message and timestamp
 * This filters out outbound (sent) messages
 */

const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set');
  process.exit(1);
}

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('❌ Error parsing service account:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function checkLastInboundMessages(accountId = null) {
  try {
    // Get threads ordered by lastMessageAt
    let query = db.collection('threads')
      .orderBy('lastMessageAt', 'desc')
      .limit(50);

    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log('📭 No threads found');
      return;
    }

    console.log(`\n📊 Checking ${snapshot.size} threads for last INBOUND messages...\n`);

    const results = [];

    for (const doc of snapshot.docs) {
      const threadData = doc.data();
      const threadId = doc.id;
      
      // Get last few messages from this thread
      const messagesQuery = db.collection('threads').doc(threadId)
        .collection('messages')
        .orderBy('tsClient', 'desc')
        .limit(5);
      
      const messagesSnapshot = await messagesQuery.get();
      
      if (messagesSnapshot.empty) continue;

      // Find the last INBOUND message
      let lastInbound = null;
      let lastInboundTime = null;

      for (const msgDoc of messagesSnapshot.docs) {
        const msgData = msgDoc.data();
        const direction = msgData.direction || 'inbound';
        
        if (direction === 'inbound') {
          lastInbound = msgData;
          
          // Get timestamp
          if (msgData.tsClient) {
            if (typeof msgData.tsClient.toMillis === 'function') {
              lastInboundTime = msgData.tsClient.toMillis();
            } else if (msgData.tsClient._seconds) {
              lastInboundTime = msgData.tsClient._seconds * 1000;
            }
          }
          break;
        }
      }

      if (lastInbound && lastInboundTime) {
        const displayName = threadData.displayName || 'N/A';
        const lastMessageText = lastInbound.body || 'N/A';
        const timestamp = new Date(lastInboundTime);

        results.push({
          threadId,
          displayName,
          lastInboundMessage: lastMessageText.substring(0, 100),
          lastInboundTime: timestamp,
          lastInboundTimeMs: lastInboundTime,
          accountId: threadData.accountId || 'N/A',
          clientJid: threadData.clientJid || 'N/A',
        });
      }
    }

    // Sort by inbound message time (most recent first)
    results.sort((a, b) => b.lastInboundTimeMs - a.lastInboundTimeMs);

    console.log('🔝 Top 10 most recent INBOUND (received) messages:\n');
    results.slice(0, 10).forEach((result, index) => {
      const timeStr = result.lastInboundTime.toLocaleString('ro-RO', {
        timeZone: 'Europe/Bucharest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const timeAgo = getTimeAgo(result.lastInboundTimeMs);

      console.log(`${index + 1}. ${result.displayName}`);
      console.log(`   💬 Last INBOUND message: ${result.lastInboundMessage}`);
      console.log(`   🕐 Time: ${timeStr} (${timeAgo})`);
      console.log(`   🆔 Thread ID: ${result.threadId.substring(0, 50)}...`);
      console.log(`   📧 Account: ${result.accountId.substring(0, 20)}...`);
      console.log('');
    });

    if (results.length === 0) {
      console.log('⚠️  No inbound messages found in the last 5 messages of any thread');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function getTimeAgo(timestampMs) {
  const now = Date.now();
  const diff = now - timestampMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} zile în urmă`;
  if (hours > 0) return `${hours} ore în urmă`;
  if (minutes > 0) return `${minutes} minute în urmă`;
  return `${seconds} secunde în urmă`;
}

// Main
const accountId = process.argv[2] || null;
checkLastInboundMessages(accountId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
