#!/usr/bin/env node

/**
 * One-shot migration: merge @lid threads into canonical JID threads.
 *
 * Usage:
 *   node scripts/migrate-lid-threads.js [--dry-run] [--account=ACCOUNT_ID] [--delete-messages]
 *
 * Notes:
 * - Idempotent: re-run safe (uses deterministic dedupe doc IDs).
 * - Does NOT require Railway or hardcoded URLs.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { normalizeJidToE164 } = require('../lib/phone-utils');
const { buildMessageDedupeKey } = require('../lib/message-dedupe');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DELETE_MESSAGES = args.includes('--delete-messages');
const specificAccount = args.find(arg => arg.startsWith('--account='))?.split('=')[1] || null;

console.log('🚀 LID Thread Merge Migration');
console.log('================================');
console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN (no changes)' : '✍️  WRITE MODE'}`);
if (specificAccount) {
  console.log(`Account filter: ${specificAccount}`);
}
console.log(`Delete messages after copy: ${DELETE_MESSAGES ? 'yes' : 'no'}`);
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

function isLidJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

async function resolveCanonicalFromMessages(messagesRef) {
  try {
    let snapshot;
    try {
      snapshot = await messagesRef.orderBy('tsClient', 'desc').limit(50).get();
    } catch (_) {
      snapshot = await messagesRef.limit(50).get();
    }

    for (const msgDoc of snapshot.docs) {
      const data = msgDoc.data() || {};
      const candidates = [
        data.resolvedJid,
        data.clientJid,
        data.senderJid,
        data.rawJid,
      ].filter(Boolean);
      for (const candidate of candidates) {
        if (candidate && !isLidJid(candidate)) {
          return candidate;
        }
      }
    }
  } catch (e) {
    console.log(`⚠️  Failed to scan messages for canonical JID: ${e.message}`);
  }
  return null;
}

async function resolveCanonicalJid(threadDoc) {
  const data = threadDoc.data() || {};
  const candidates = [data.resolvedJid, data.clientJid, data.rawJid].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate && !isLidJid(candidate)) {
      return candidate;
    }
  }

  const messagesRef = threadDoc.ref.collection('messages');
  return resolveCanonicalFromMessages(messagesRef);
}

async function migrateThread(threadDoc) {
  const data = threadDoc.data() || {};
  const threadId = threadDoc.id;
  const accountId = data.accountId;
  const clientJid = data.clientJid || null;
  const rawJid = data.rawJid || clientJid;

  const canonicalJid = await resolveCanonicalJid(threadDoc);
  if (!canonicalJid) {
    return { threadId, status: 'skipped', reason: 'canonical_not_found' };
  }

  const canonicalThreadId = `${accountId}__${canonicalJid}`;
  const canonicalThreadRef = db.collection('threads').doc(canonicalThreadId);
  const canonicalThreadDoc = await canonicalThreadRef.get();
  const normalizedPhone = normalizeJidToE164(canonicalJid).normalizedPhone || null;

  if (!DRY_RUN && !canonicalThreadDoc.exists) {
    await canonicalThreadRef.set(
      {
        accountId,
        clientJid: canonicalJid,
        rawJid: rawJid || null,
        resolvedJid: canonicalJid !== rawJid ? canonicalJid : null,
        normalizedPhone,
        canonicalThreadId,
        isLidThread: isLidJid(rawJid || ''),
        lastMessageAt: data.lastMessageAt || admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: data.lastMessagePreview || data.lastMessageText || null,
        lastMessageText: data.lastMessageText || null,
      },
      { merge: true }
    );
  }

  const messagesRef = threadDoc.ref.collection('messages');
  const messagesSnapshot = await messagesRef.get();

  let merged = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const msgDoc of messagesSnapshot.docs) {
    const msgData = msgDoc.data() || {};
    const dedupeKey = buildMessageDedupeKey({
      waMessageId: msgData.waMessageId,
      requestId: msgData.requestId,
      clientMessageId: msgData.clientMessageId,
      direction: msgData.direction,
      body: msgData.body,
      tsClient: msgData.tsClient,
    });

    const targetRef = canonicalThreadRef.collection('messages').doc(dedupeKey);
    const mergedData = {
      ...msgData,
      accountId,
      clientJid: canonicalJid,
      rawJid: rawJid || msgData.rawJid || null,
      resolvedJid: canonicalJid !== rawJid ? canonicalJid : msgData.resolvedJid || null,
      normalizedPhone,
      canonicalThreadId,
      migratedFromThreadId: threadId,
    };

    if (!DRY_RUN) {
      batch.set(targetRef, mergedData, { merge: true });
      batchOps++;
    }
    merged++;

    if (batchOps >= 400) {
      if (!DRY_RUN) {
        await batch.commit();
      }
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0 && !DRY_RUN) {
    await batch.commit();
  }

  if (!DRY_RUN) {
    await threadDoc.ref.set(
      {
        hidden: true,
        archived: true,
        redirectTo: canonicalThreadId,
        canonicalThreadId,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (DELETE_MESSAGES && !DRY_RUN && messagesSnapshot.size > 0) {
    let deleteBatch = db.batch();
    let deleteOps = 0;
    for (const msgDoc of messagesSnapshot.docs) {
      deleteBatch.delete(msgDoc.ref);
      deleteOps++;
      if (deleteOps >= 400) {
        await deleteBatch.commit();
        deleteBatch = db.batch();
        deleteOps = 0;
      }
    }
    if (deleteOps > 0) {
      await deleteBatch.commit();
    }
  }

  return {
    threadId,
    canonicalThreadId,
    mergedMessages: merged,
    status: 'migrated',
  };
}

async function main() {
  const threadsRef = db.collection('threads');
  const query = specificAccount
    ? threadsRef.where('accountId', '==', specificAccount)
    : threadsRef;

  const snapshot = await query.get();
  console.log(`Found ${snapshot.size} threads in scope`);

  let processed = 0;
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const clientJid = data.clientJid || null;
    const rawJid = data.rawJid || null;
    const isLidThread = isLidJid(clientJid) || isLidJid(rawJid);

    if (!isLidThread) {
      continue;
    }

    processed++;
    try {
      const result = await migrateThread(doc);
      if (result.status === 'migrated') {
        migrated++;
        console.log(
          `✅ [${processed}] ${doc.id.substring(0, 40)} -> ${result.canonicalThreadId} (messages=${result.mergedMessages})`
        );
      } else {
        skipped++;
        console.log(
          `⏭️  [${processed}] ${doc.id.substring(0, 40)} skipped (${result.reason || 'unknown'})`
        );
      }
    } catch (e) {
      errors++;
      console.error(`❌ [${processed}] ${doc.id.substring(0, 40)} error: ${e.message}`);
    }
  }

  console.log('');
  console.log('================================');
  console.log('📊 MIGRATION SUMMARY');
  console.log('================================');
  console.log(`Threads processed: ${processed}`);
  console.log(`✅ Migrated: ${migrated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('🧪 DRY RUN completed - no changes were made');
  } else {
    console.log('✅ Migration completed!');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
