#!/usr/bin/env node

/**
 * Cleanup duplicate message documents in threads/{threadId}/messages.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-messages.js [--dry-run] [--account=ACCOUNT_ID] [--limit-threads=100] [--limit-messages=2000]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const accountFilter = args.find(arg => arg.startsWith('--account='))?.split('=')[1];
const limitThreads = parseInt(
  args.find(arg => arg.startsWith('--limit-threads='))?.split('=')[1] || '0',
  10
);
const limitMessages = parseInt(
  args.find(arg => arg.startsWith('--limit-messages='))?.split('=')[1] || '2000',
  10
);

console.log('🧹 Duplicate Message Cleanup');
console.log('============================');
console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN' : '✍️  WRITE'}`);
if (accountFilter) console.log(`Account filter: ${accountFilter}`);
if (limitThreads) console.log(`Thread limit: ${limitThreads}`);
console.log(`Messages per thread: ${limitMessages}`);
console.log('');

let serviceAccountJson;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccountJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_JSON from environment');
  } catch (e) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }
} else {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccountJson = require(serviceAccountPath);
    console.log('✅ Using serviceAccountKey.json from file');
  } else {
    console.error('❌ No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON or provide serviceAccountKey.json');
    process.exit(1);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountJson),
  });
}

const db = admin.firestore();

function getScore(docId, data) {
  let score = 0;
  if (data?.clientMessageId) score += 3;
  if (data?.status && ['sent', 'delivered', 'read'].includes(data.status)) score += 2;
  if (data?.createdAtMs) score += 1;
  if (docId && docId.length >= 32) score += 1; // requestId hashes are long
  if (data?.waMessageId) score += 2;
  return score;
}

function getInboundFallbackKey(data) {
  const body = (data?.body || '').trim();
  const direction = data?.direction || 'inbound';
  const tsRaw = data?.tsClient || data?.createdAt || null;
  let tsMillis = null;
  if (typeof tsRaw === 'number') tsMillis = tsRaw;
  if (typeof tsRaw === 'string') {
    try {
      tsMillis = new Date(tsRaw).getTime();
    } catch (_) {
      tsMillis = null;
    }
  }
  if (tsRaw?.toMillis) tsMillis = tsRaw.toMillis();
  const tsRounded = tsMillis ? Math.floor(tsMillis / 1000) : 'na';
  return `${direction}|${body}|${tsRounded}`;
}

async function main() {
  let threadsQuery = db.collection('threads');
  if (accountFilter) {
    threadsQuery = threadsQuery.where('accountId', '==', accountFilter);
  }
  if (limitThreads && limitThreads > 0) {
    threadsQuery = threadsQuery.limit(limitThreads);
  }

  const threadsSnapshot = await threadsQuery.get();
  console.log(`📦 Loaded ${threadsSnapshot.size} threads`);

  let totalDeletes = 0;
  let totalProcessed = 0;

  for (const threadDoc of threadsSnapshot.docs) {
    const threadId = threadDoc.id;
    const messagesSnapshot = await db
      .collection('threads')
      .doc(threadId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limitMessages)
      .get();

    if (messagesSnapshot.empty) continue;
    totalProcessed += messagesSnapshot.size;

    const byWa = new Map();
    const byFallback = new Map();
    const toDelete = [];

    for (const msgDoc of messagesSnapshot.docs) {
      const data = msgDoc.data() || {};
      const waMessageId = data.waMessageId || null;

      if (waMessageId) {
        const existing = byWa.get(waMessageId);
        if (!existing) {
          byWa.set(waMessageId, { doc: msgDoc, data });
          continue;
        }
        const existingScore = getScore(existing.doc.id, existing.data);
        const currentScore = getScore(msgDoc.id, data);
        if (currentScore > existingScore) {
          toDelete.push(existing.doc.ref);
          byWa.set(waMessageId, { doc: msgDoc, data });
        } else {
          toDelete.push(msgDoc.ref);
        }
        continue;
      }

      if ((data.direction || 'inbound') === 'inbound') {
        const key = getInboundFallbackKey(data);
        const existing = byFallback.get(key);
        if (!existing) {
          byFallback.set(key, { doc: msgDoc, data });
          continue;
        }
        const existingScore = getScore(existing.doc.id, existing.data);
        const currentScore = getScore(msgDoc.id, data);
        if (currentScore > existingScore) {
          toDelete.push(existing.doc.ref);
          byFallback.set(key, { doc: msgDoc, data });
        } else {
          toDelete.push(msgDoc.ref);
        }
      }
    }

    if (toDelete.length > 0) {
      console.log(`🧼 [${threadId}] duplicates=${toDelete.length}`);
    }

    if (!DRY_RUN) {
      for (let i = 0; i < toDelete.length; i += 400) {
        const batch = db.batch();
        const slice = toDelete.slice(i, i + 400);
        slice.forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }

    totalDeletes += toDelete.length;
  }

  console.log('');
  console.log(`✅ Done. Processed messages: ${totalProcessed}, deleted: ${totalDeletes}`);
  if (DRY_RUN) {
    console.log('🧪 Dry run complete. No changes were written.');
  }
}

main().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
