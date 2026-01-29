#!/usr/bin/env node

/**
 * One-shot migration: migrate legacy hash-based thread IDs to canonical format (accountId__clientJid).
 *
 * Legacy format: 64d35dbf:73 (8 hex chars + colon + 2 digits)
 * New format: accountId__clientJid (e.g., account_prod_xxx__40768098268@s.whatsapp.net)
 *
 * Usage:
 *   node scripts/migrate-threads.js [--dry-run] [--accountId=ACCOUNT_ID] [--delete-old] [--batch-size=500]
 *
 * Notes:
 * - Idempotent: re-run safe (checks if new thread already exists)
 * - Uses Firestore locks to prevent concurrent runs
 * - Skips @lid threads (they should be handled separately)
 * - Copies messages in batches to avoid memory issues
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DELETE_OLD = args.includes('--delete-old');
const specificAccountId = args.find(arg => arg.startsWith('--accountId='))?.split('=')[1] || null;
const batchSize = Number(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || 500);

console.log('🚀 Thread ID Migration (Hash → Canonical)');
console.log('==========================================');
console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN (no changes)' : '✍️  WRITE MODE'}`);
if (specificAccountId) {
  console.log(`Account filter: ${specificAccountId}`);
}
console.log(`Delete old threads after copy: ${DELETE_OLD ? 'yes' : 'no'}`);
console.log(`Batch size: ${batchSize}`);
console.log('');

// Initialize Firebase Admin
let serviceAccountJson;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccountJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_JSON from environment');
  } catch (e) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }
} else if (process.env.FIREBASE_SA_PATH) {
  const serviceAccountPath = process.env.FIREBASE_SA_PATH;
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccountJson = require(serviceAccountPath);
    console.log(`✅ Using service account from ${serviceAccountPath}`);
  } else {
    console.error(`❌ Service account file not found: ${serviceAccountPath}`);
    process.exit(1);
  }
} else {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccountJson = require(serviceAccountPath);
    console.log('✅ Using serviceAccountKey.json from file');
  } else {
    console.error('❌ No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SA_PATH, or provide serviceAccountKey.json');
    process.exit(1);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountJson),
  });
}

const db = admin.firestore();

/**
 * Check if threadId is in legacy hash format (e.g., 64d35dbf:73)
 */
function isLegacyThreadId(threadId) {
  if (typeof threadId !== 'string') return false;
  // Pattern: 8 hex chars + colon + 2 digits
  return /^[0-9a-f]{8}:[0-9]{2}$/i.test(threadId);
}

/**
 * Check if threadId is already in canonical format (accountId__clientJid)
 */
function isCanonicalThreadId(threadId, accountId) {
  if (typeof threadId !== 'string' || !accountId) return false;
  return threadId.startsWith(`${accountId}__`);
}

/**
 * Check if JID is @lid (should be skipped)
 */
function isLidJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

/**
 * Acquire Firestore lock to prevent concurrent migration runs
 */
async function acquireLock(accountId) {
  const lockId = specificAccountId ? `threadMigration_${accountId}` : 'threadMigration_global';
  const lockRef = db.collection('locks').doc(lockId);
  
  const lockDoc = await lockRef.get();
  if (lockDoc.exists) {
    const lockData = lockDoc.data();
    const lockTime = lockData.timestamp?.toMillis?.() || lockData.timestamp || 0;
    const now = Date.now();
    const lockAge = now - lockTime;
    // If lock is less than 1 hour old, consider it active
    if (lockAge < 3600000) {
      throw new Error(`Migration lock exists (age: ${Math.round(lockAge / 1000)}s). Another migration may be running.`);
    }
  }

  if (!DRY_RUN) {
    await lockRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      accountId: accountId || 'all',
      pid: process.pid,
    });
  }

  return lockRef;
}

/**
 * Release Firestore lock
 */
async function releaseLock(lockRef) {
  if (!DRY_RUN && lockRef) {
    await lockRef.delete();
  }
}

/**
 * Copy messages from old thread to new thread in batches
 */
async function copyMessages(oldThreadRef, newThreadRef, oldThreadId, newThreadId) {
  const oldMessagesRef = oldThreadRef.collection('messages');
  const newMessagesRef = newThreadRef.collection('messages');
  
  let totalCopied = 0;
  let lastDoc = null;
  const BATCH_SIZE = 500; // Firestore batch limit

  while (true) {
    let query = oldMessagesRef.limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchCount = 0;

    for (const msgDoc of snapshot.docs) {
      const msgData = msgDoc.data();
      const newMsgRef = newMessagesRef.doc(msgDoc.id);
      
      // Check if message already exists in new thread
      const existingMsg = await newMsgRef.get();
      if (!existingMsg.exists) {
        batch.set(newMsgRef, msgData);
        batchCount++;
      }
    }

    if (batchCount > 0) {
      if (!DRY_RUN) {
        await batch.commit();
      }
      totalCopied += batchCount;
      console.log(`  📋 Copied ${batchCount} messages (total: ${totalCopied})`);
    }

    if (snapshot.docs.length < BATCH_SIZE) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return totalCopied;
}

/**
 * Migrate a single thread from legacy to canonical format
 */
async function migrateThread(threadDoc) {
  const threadId = threadDoc.id;
  const threadData = threadDoc.data() || {};
  const accountId = threadData.accountId;
  const clientJid = threadData.clientJid;

  // Skip if no accountId or clientJid
  if (!accountId || !clientJid) {
    return { threadId, status: 'skipped', reason: 'missing_accountId_or_clientJid' };
  }

  // Skip @lid threads (they should be handled separately)
  if (isLidJid(clientJid)) {
    return { threadId, status: 'skipped', reason: 'lid_thread' };
  }

  // Skip if already canonical
  if (isCanonicalThreadId(threadId, accountId)) {
    return { threadId, status: 'skipped', reason: 'already_canonical' };
  }

  // Calculate new thread ID
  const newThreadId = `${accountId}__${clientJid}`;

  // Check if new thread already exists
  const newThreadRef = db.collection('threads').doc(newThreadId);
  const newThreadDoc = await newThreadRef.get();
  const newThreadExists = newThreadDoc.exists;

  // Count messages in old thread
  const oldMessagesRef = threadDoc.ref.collection('messages');
  const oldMessagesCount = (await oldMessagesRef.count().get()).data().count;

  if (newThreadExists) {
    console.log(`  ⚠️  New thread ${newThreadId} already exists, skipping migration`);
    return { threadId, newThreadId, status: 'skipped', reason: 'new_thread_exists', messagesCount: oldMessagesCount };
  }

  // Create new thread document
  if (!DRY_RUN) {
    await newThreadRef.set({
      accountId,
      clientJid,
      lastMessageAt: threadData.lastMessageAt || admin.firestore.FieldValue.serverTimestamp(),
      lastMessagePreview: threadData.lastMessagePreview || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      migratedFrom: threadId, // Track migration source
    }, { merge: true });
  }

  // Copy messages
  console.log(`  📦 Copying ${oldMessagesCount} messages from ${threadId} to ${newThreadId}...`);
  const messagesCopied = await copyMessages(threadDoc.ref, newThreadRef, threadId, newThreadId);

  // Delete old thread if requested
  if (DELETE_OLD && !DRY_RUN && messagesCopied > 0) {
    // Delete messages first
    const oldMessagesSnapshot = await oldMessagesRef.get();
    const deleteBatch = db.batch();
    let deleteCount = 0;
    for (const msgDoc of oldMessagesSnapshot.docs) {
      deleteBatch.delete(msgDoc.ref);
      deleteCount++;
      if (deleteCount >= 500) {
        await deleteBatch.commit();
        deleteCount = 0;
      }
    }
    if (deleteCount > 0) {
      await deleteBatch.commit();
    }
    // Delete thread document
    await threadDoc.ref.delete();
    console.log(`  🗑️  Deleted old thread ${threadId}`);
  }

  return {
    threadId,
    newThreadId,
    status: 'migrated',
    messagesCount: oldMessagesCount,
    messagesCopied,
  };
}

/**
 * Main migration function
 */
async function runMigration() {
  let lockRef = null;
  try {
    // Acquire lock
    console.log('🔒 Acquiring migration lock...');
    lockRef = await acquireLock(specificAccountId);
    console.log('✅ Lock acquired\n');

    // Query threads
    console.log('📊 Querying threads...');
    let query = db.collection('threads');
    
    if (specificAccountId) {
      query = query.where('accountId', '==', specificAccountId);
    }

    const threadsSnapshot = await query.get();
    console.log(`Found ${threadsSnapshot.size} total threads\n`);

    // Categorize threads
    const legacy = [];
    const canonical = [];
    const other = [];
    const skipped = [];

    for (const threadDoc of threadsSnapshot.docs) {
      const threadId = threadDoc.id;
      const threadData = threadDoc.data() || {};
      const accountId = threadData.accountId;

      if (!accountId) {
        skipped.push({ threadId, reason: 'no_accountId' });
        continue;
      }

      if (isCanonicalThreadId(threadId, accountId)) {
        canonical.push(threadId);
      } else if (isLegacyThreadId(threadId)) {
        legacy.push(threadDoc);
      } else {
        other.push({ threadId, accountId });
      }
    }

    console.log(`📈 Thread categorization:`);
    console.log(`  ✅ Canonical: ${canonical.length}`);
    console.log(`  🔄 Legacy (to migrate): ${legacy.length}`);
    console.log(`  ❓ Other format: ${other.length}`);
    console.log(`  ⏭️  Skipped: ${skipped.length}`);
    console.log('');

    if (legacy.length === 0) {
      console.log('✅ No legacy threads to migrate!');
      return;
    }

    // Migrate legacy threads
    console.log(`🚀 Starting migration of ${legacy.length} legacy threads...\n`);
    const results = {
      migrated: [],
      skipped: [],
      errors: [],
    };

    for (let i = 0; i < legacy.length; i++) {
      const threadDoc = legacy[i];
      const threadId = threadDoc.id;
      console.log(`[${i + 1}/${legacy.length}] Processing ${threadId}...`);

      try {
        const result = await migrateThread(threadDoc);
        if (result.status === 'migrated') {
          results.migrated.push(result);
          console.log(`  ✅ Migrated to ${result.newThreadId} (${result.messagesCopied} messages)`);
        } else {
          results.skipped.push(result);
          console.log(`  ⏭️  Skipped: ${result.reason}`);
        }
      } catch (error) {
        results.errors.push({ threadId, error: error.message });
        console.error(`  ❌ Error: ${error.message}`);
      }
      console.log('');
    }

    // Summary
    console.log('\n📊 Migration Summary');
    console.log('===================');
    console.log(`✅ Migrated: ${results.migrated.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    
    if (results.migrated.length > 0) {
      const totalMessages = results.migrated.reduce((sum, r) => sum + (r.messagesCopied || 0), 0);
      console.log(`📦 Total messages copied: ${totalMessages}`);
    }

    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(({ threadId, error }) => {
        console.log(`  - ${threadId}: ${error}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Release lock
    if (lockRef) {
      console.log('\n🔓 Releasing lock...');
      await releaseLock(lockRef);
      console.log('✅ Lock released');
    }
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
