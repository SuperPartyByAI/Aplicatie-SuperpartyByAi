#!/usr/bin/env node
/**
 * Check last received message and timestamp
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

async function checkLastMessages(accountId = null) {
  try {
    let query = db.collection('threads')
      .orderBy('lastMessageAt', 'desc')
      .limit(20);

    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log('📭 No threads found');
      return;
    }

    console.log(`\n📊 Found ${snapshot.size} threads with messages (sorted by lastMessageAt desc):\n`);

    const threads = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const lastMessageAt = data.lastMessageAt;
      
      let timestamp = null;
      let timestampMs = null;
      
      if (lastMessageAt) {
        if (typeof lastMessageAt.toMillis === 'function') {
          timestampMs = lastMessageAt.toMillis();
          timestamp = new Date(timestampMs);
        } else if (lastMessageAt._seconds) {
          timestampMs = lastMessageAt._seconds * 1000;
          timestamp = new Date(timestampMs);
        } else if (typeof lastMessageAt === 'number') {
          timestampMs = lastMessageAt > 1e12 ? lastMessageAt : lastMessageAt * 1000;
          timestamp = new Date(timestampMs);
        }
      }

      const lastMessageText = data.lastMessageText || data.lastMessagePreview || 'N/A';
      const displayName = data.displayName || 'N/A';
      const clientJid = data.clientJid || 'N/A';
      const normalizedPhone = data.normalizedPhone || 'N/A';

      threads.push({
        threadId: doc.id,
        displayName,
        clientJid,
        normalizedPhone,
        lastMessageText: lastMessageText.substring(0, 100),
        lastMessageAt: timestamp,
        lastMessageAtMs: timestampMs,
        accountId: data.accountId || 'N/A',
      });
    }

    // Sort by timestamp (most recent first)
    threads.sort((a, b) => {
      const aMs = a.lastMessageAtMs || 0;
      const bMs = b.lastMessageAtMs || 0;
      return bMs - aMs;
    });

    console.log('🔝 Top 10 most recent messages:\n');
    threads.slice(0, 10).forEach((thread, index) => {
      const timeStr = thread.lastMessageAt 
        ? thread.lastMessageAt.toLocaleString('ro-RO', { 
            timeZone: 'Europe/Bucharest',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        : 'N/A';
      
      const timeAgo = thread.lastMessageAtMs 
        ? getTimeAgo(thread.lastMessageAtMs)
        : 'N/A';

      console.log(`${index + 1}. ${thread.displayName}`);
      console.log(`   📱 Phone: ${thread.normalizedPhone}`);
      console.log(`   💬 Message: ${thread.lastMessageText}`);
      console.log(`   🕐 Time: ${timeStr} (${timeAgo})`);
      console.log(`   🆔 Thread ID: ${thread.threadId.substring(0, 50)}...`);
      console.log(`   📧 Account: ${thread.accountId.substring(0, 20)}...`);
      console.log('');
    });

    // Check for threads without lastMessageAt
    const withoutTimestamp = threads.filter(t => !t.lastMessageAt);
    if (withoutTimestamp.length > 0) {
      console.log(`\n⚠️  Found ${withoutTimestamp.length} threads without lastMessageAt timestamp`);
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
checkLastMessages(accountId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
