#!/usr/bin/env node
/**
 * Migrate old messages to include waKeyId and ensure doc.id = waKeyId when possible.
 * 
 * Usage:
 *   ACCOUNT_ID=... DAYS=7 DRY_RUN=1 node scripts/migrate-message-waKeyId.js
 *   ACCOUNT_ID=... DAYS=7 DRY_RUN=0 node scripts/migrate-message-waKeyId.js
 * 
 * Options:
 *   ACCOUNT_ID - Account ID to migrate (required)
 *   DAYS - Number of days to look back (default: 7)
 *   DRY_RUN - 1 for dry run, 0 for real migration (default: 1)
 *   LIMIT_THREADS - Max threads to process (default: 100)
 *   LIMIT_MESSAGES_PER_THREAD - Max messages per thread (default: 1000)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const { extractWaKeyId, extractWaMetadata } = require('../lib/extract-wa-key-id');

// Initialize Firebase Admin with credentials
if (!admin.apps.length) {
  try {
    let initialized = false;
    
    // Try GOOGLE_APPLICATION_CREDENTIALS first
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
    if (gacPath && gacPath !== '/path' && gacPath !== '/path/to/service-account.json') {
      if (fs.existsSync(gacPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(gacPath, 'utf8'));
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        initialized = true;
      } else {
        console.warn(`[WARN] GOOGLE_APPLICATION_CREDENTIALS path does not exist: ${gacPath}`);
      }
    }
    
    // Try FIREBASE_SA_PATH (common in production) if not initialized
    if (!initialized) {
      const saPath = process.env.FIREBASE_SA_PATH || '/etc/whatsapp-backend/firebase-sa.json';
      if (fs.existsSync(saPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        initialized = true;
      }
    }
    
    // Fallback to Application Default Credentials (gcloud auth application-default login)
    if (!initialized) {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    if (error.code === 'ENOENT') {
      console.error(`\n   File not found: ${error.path}`);
    }
    console.error('\nTo fix this, use one of:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json (with real path)');
    console.error('  2. Set FIREBASE_SA_PATH=/path/to/service-account.json (with real path)');
    console.error('  3. Run: gcloud auth application-default login');
    process.exit(1);
  }
}

const db = admin.firestore();

// Parse environment variables
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const DAYS = parseInt(process.env.DAYS || '7', 10);
const DRY_RUN = process.env.DRY_RUN !== '0';
const LIMIT_THREADS = parseInt(process.env.LIMIT_THREADS || '100', 10);
const LIMIT_MESSAGES_PER_THREAD = parseInt(process.env.LIMIT_MESSAGES_PER_THREAD || '1000', 10);

if (!ACCOUNT_ID) {
  console.error('ERROR: ACCOUNT_ID environment variable is required');
  process.exit(1);
}

const summary = {
  threadsScanned: 0,
  messagesScanned: 0,
  messagesUpdated: 0,
  messagesCopiedToNewId: 0,
  messagesStillMissingKeyId: 0,
  errors: 0,
  startTime: new Date().toISOString(),
  dryRun: DRY_RUN,
};

/**
 * Check if thread is canonical (not @lid)
 */
function isCanonicalThread(threadData) {
  const clientJid = threadData.clientJid;
  if (!clientJid || typeof clientJid !== 'string') return false;
  if (clientJid.endsWith('@lid')) return false;
  return clientJid.endsWith('@s.whatsapp.net') || clientJid.endsWith('@g.us') || clientJid === 'status@broadcast';
}

/**
 * Get timestamp cutoff (DAYS ago)
 */
function getCutoffTimestamp() {
  const now = Date.now();
  const cutoffMs = now - (DAYS * 24 * 60 * 60 * 1000);
  return admin.firestore.Timestamp.fromMillis(cutoffMs);
}

/**
 * Process a single message document
 */
async function processMessage(msgDoc, threadId, accountId) {
  summary.messagesScanned++;
  
  const docId = msgDoc.id;
  const docData = msgDoc.data();
  
  // Extract waKeyId
  const { waKeyId, source } = extractWaKeyId(docData, docId);
  
  if (!waKeyId) {
    summary.messagesStillMissingKeyId++;
    return { updated: false, reason: 'no_waKeyId' };
  }

  // Check if doc.id should be waKeyId
  const needsNewDoc = docId !== waKeyId;
  
  // Check if key.id needs to be populated
  const needsKeyUpdate = !docData.key?.id || docData.key.id !== waKeyId;
  
  if (!needsNewDoc && !needsKeyUpdate) {
    return { updated: false, reason: 'already_migrated' };
  }

  if (DRY_RUN) {
    if (needsNewDoc) {
      console.log(`[DRY RUN] Would copy message ${docId} → ${waKeyId} in thread ${threadId}`);
    }
    if (needsKeyUpdate) {
      console.log(`[DRY RUN] Would update key.id for message ${docId} in thread ${threadId}`);
    }
    summary.messagesUpdated++;
    if (needsNewDoc) summary.messagesCopiedToNewId++;
    return { updated: true, reason: 'dry_run' };
  }

  try {
    const threadRef = db.collection('threads').doc(threadId);
    const messagesRef = threadRef.collection('messages');
    
    // Update key.id in existing doc
    if (needsKeyUpdate) {
      await messagesRef.doc(docId).update({
        'key.id': waKeyId,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFrom: source,
      });
    }
    
    // Copy to new doc.id if needed
    if (needsNewDoc) {
      const newDocData = {
        ...docData,
        'key.id': waKeyId,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFrom: source,
        migratedFromDocId: docId,
      };
      
      // Use set with merge to avoid overwriting if already exists
      await messagesRef.doc(waKeyId).set(newDocData, { merge: true });
      
      // Mark old doc (don't delete to avoid data loss)
      await messagesRef.doc(docId).update({
        migratedTo: waKeyId,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      summary.messagesCopiedToNewId++;
    }
    
    summary.messagesUpdated++;
    return { updated: true, reason: needsNewDoc ? 'copied' : 'updated' };
  } catch (error) {
    console.error(`[ERROR] Failed to process message ${docId} in thread ${threadId}:`, error.message);
    summary.errors++;
    return { updated: false, reason: 'error', error: error.message };
  }
}

/**
 * Process messages for a single thread
 */
async function processThread(threadDoc, accountId) {
  const threadId = threadDoc.id;
  const threadData = threadDoc.data();
  
  if (!isCanonicalThread(threadData)) {
    return { processed: false, reason: 'not_canonical' };
  }
  
  summary.threadsScanned++;
  
  const cutoffTs = getCutoffTimestamp();
  const messagesRef = threadDoc.ref.collection('messages');
  
  // Query messages from last DAYS (try orderBy tsClient desc, limit, then filter)
  let messagesQuery = messagesRef
    .orderBy('tsClient', 'desc')
    .limit(LIMIT_MESSAGES_PER_THREAD);
  
  let messagesSnap;
  try {
    messagesSnap = await messagesQuery.get();
  } catch (error) {
    // If orderBy fails, try without orderBy
    console.warn(`[WARN] Thread ${threadId}: orderBy failed, trying without: ${error.message}`);
    messagesSnap = await messagesRef.limit(LIMIT_MESSAGES_PER_THREAD).get();
  }
  
  let processed = 0;
  let skipped = 0;
  
  for (const msgDoc of messagesSnap.docs) {
    const msgData = msgDoc.data();
    const tsClient = msgData.tsClient;
    
    // Filter by cutoff timestamp
    if (tsClient) {
      let tsMs = null;
      if (typeof tsClient.toMillis === 'function') {
        tsMs = tsClient.toMillis();
      } else if (typeof tsClient === 'number') {
        tsMs = tsClient < 1e12 ? tsClient * 1000 : tsClient;
      } else if (tsClient._seconds != null) {
        tsMs = tsClient._seconds * 1000;
      }
      
      if (tsMs && tsMs < cutoffTs.toMillis()) {
        skipped++;
        continue; // Too old
      }
    }
    
    const result = await processMessage(msgDoc, threadId, accountId);
    if (result.updated) {
      processed++;
    }
  }
  
  return { processed, skipped, total: messagesSnap.size };
}

/**
 * Main migration function (exported for use in admin endpoint)
 */
async function runMigration() {
  console.log(`\n🚀 Starting message waKeyId migration`);
  console.log(`   Account: ${ACCOUNT_ID}`);
  console.log(`   Days: ${DAYS}`);
  console.log(`   Dry Run: ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`   Limit Threads: ${LIMIT_THREADS}`);
  console.log(`   Limit Messages/Thread: ${LIMIT_MESSAGES_PER_THREAD}\n`);

  try {
    // Query threads for account
    // Note: isLid field may not exist on old threads (undefined), so we query all and filter
    let threadsSnap;
    try {
      // Try query with isLid filter first (if index exists)
      const threadsQuery = db
        .collection('threads')
        .where('accountId', '==', ACCOUNT_ID)
        .where('isLid', '==', false)
        .limit(LIMIT_THREADS);
      threadsSnap = await threadsQuery.get();
      
      // If query returns 0 results, it might be because isLid is undefined (not false)
      // Use fallback to query all and filter in code
      if (threadsSnap.size === 0) {
        console.warn(`[WARN] isLid==false query returned 0 results, using fallback (isLid may be undefined)`);
        threadsSnap = await db
          .collection('threads')
          .where('accountId', '==', ACCOUNT_ID)
          .limit(LIMIT_THREADS * 2)
          .get();
        console.log(`[INFO] Found ${threadsSnap.size} total threads, filtering for canonical...`);
      } else {
        console.log(`[INFO] Found ${threadsSnap.size} threads with isLid==false`);
      }
    } catch (error) {
      // Fallback: query all and filter in code (isLid index may not exist)
      console.warn(`[WARN] isLid index not available, filtering in code: ${error.message}`);
      threadsSnap = await db
        .collection('threads')
        .where('accountId', '==', ACCOUNT_ID)
        .limit(LIMIT_THREADS * 2)
        .get();
      console.log(`[INFO] Found ${threadsSnap.size} total threads, filtering for canonical...`);
    }
    
    // Process each thread
    let canonicalCount = 0;
    for (const threadDoc of threadsSnap.docs) {
      const threadData = threadDoc.data();
      
      // Skip @lid threads (use isCanonicalThread to determine)
      // If isLid is explicitly true, skip. Otherwise check if it's canonical.
      if (threadData.isLid === true || !isCanonicalThread(threadData)) {
        continue;
      }
      
      canonicalCount++;
      await processThread(threadDoc, ACCOUNT_ID);
    }
    
    console.log(`[INFO] Processed ${canonicalCount} canonical threads (out of ${threadsSnap.size} total)`);
    
    // Save summary to Firestore
    summary.endTime = new Date().toISOString();
    summary.durationMs = new Date(summary.endTime) - new Date(summary.startTime);
    
    if (!DRY_RUN) {
      await db.collection('accounts').doc(ACCOUNT_ID).set({
        lastMessageIdMigrationResult: summary,
        lastMessageIdMigrationAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    
    console.log(`\n✅ Migration complete`);
    console.log(JSON.stringify(summary, null, 2));
    
    if (DRY_RUN) {
      console.log(`\n⚠️  This was a DRY RUN. Set DRY_RUN=0 to perform actual migration.`);
    }
    
  } catch (error) {
    console.error(`\n❌ Migration failed:`, error);
    summary.errors++;
    summary.error = error.message;
    // Only exit if called directly (not imported as module)
    if (require.main === module) {
      process.exit(1);
    }
    throw error; // Re-throw for module usage
  }
}

// Export for use in admin endpoint
module.exports = {
  runMigration,
};

// Run migration if called directly (not imported)
if (require.main === module) {
  runMigration()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
