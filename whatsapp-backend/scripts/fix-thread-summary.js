#!/usr/bin/env node
/**
 * Fix thread summary: Recalculate lastMessageAt and lastMessageText from real messages
 * 
 * This script finds threads with missing/null lastMessageText and recalculates them
 * from the last real message in threads/{threadId}/messages.
 * 
 * Usage:
 *   node scripts/fix-thread-summary.js <accountId> [--dry-run]
 * 
 * Options:
 *   accountId: Required - Account ID to process threads for
 *   --dry-run: Show what would be updated without making changes
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { loadServiceAccount } = require('../firebaseCredentials');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const { serviceAccount } = loadServiceAccount();
  if (!serviceAccount) {
    console.error('❌ Error: Could not load Firebase service account');
    console.error('   Check FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Pick best timestamp from message data
 * Prefers tsClient (real message timestamp) over createdAt (server timestamp)
 */
function pickTimestamp(msg) {
  // Prefer tsClient (Firestore Timestamp) - this is the real message timestamp
  if (msg.tsClient) {
    if (msg.tsClient.toDate && typeof msg.tsClient.toDate === 'function') {
      return msg.tsClient;
    }
    // If it's already a Timestamp object, return it
    if (msg.tsClient instanceof admin.firestore.Timestamp) {
      return msg.tsClient;
    }
  }
  
  // Fallback to createdAt (server timestamp)
  if (msg.createdAt) {
    if (msg.createdAt.toDate && typeof msg.createdAt.toDate === 'function') {
      return msg.createdAt;
    }
    if (msg.createdAt instanceof admin.firestore.Timestamp) {
      return msg.createdAt;
    }
  }
  
  // Fallback to updatedAt
  if (msg.updatedAt) {
    if (msg.updatedAt.toDate && typeof msg.updatedAt.toDate === 'function') {
      return msg.updatedAt;
    }
    if (msg.updatedAt instanceof admin.firestore.Timestamp) {
      return msg.updatedAt;
    }
  }
  
  return null;
}

/**
 * Check if message is a real message (not protocol message)
 */
function isRealMessage(msg) {
  const body = (msg.body || '').toString().trim();
  
  // Real message has non-empty body
  if (body.length > 0) {
    return true;
  }
  
  // Check for media messages (they might not have body but are real)
  if (msg.messageType && 
      ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.messageType)) {
    return true;
  }
  
  // Check for protocol message indicators
  if (msg.syncSource && msg.syncSource.includes('protocol')) {
    return false;
  }
  
  // If body is empty and no media, likely protocol message
  return false;
}

async function fixThreadSummary(accountId, options = {}) {
  const { dryRun = false } = options;
  
  if (!accountId) {
    console.error('❌ Error: accountId is required');
    console.error('Usage: node scripts/fix-thread-summary.js <accountId> [--dry-run]');
    process.exit(1);
  }
  
  console.log(`\n🔍 Starting thread summary fix${dryRun ? ' (DRY RUN)' : ''}...`);
  console.log(`   AccountId: ${accountId}\n`);
  
  let totalProcessed = 0;
  let candidates = 0;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;
  
  const stats = {
    noLastMessageText: 0,
    emptyLastMessageText: 0,
    foundRealMessage: 0,
    noRealMessage: 0,
  };
  
  try {
    // Get threads for this accountId, ordered by lastMessageAt desc
    // Limit to 500 to avoid memory issues
    let query = db.collection('threads')
      .where('accountId', '==', accountId)
      .orderBy('lastMessageAt', 'desc')
      .limit(500);
    
    const snapshot = await query.get();
    
    console.log(`📊 Found ${snapshot.size} threads to check\n`);
    
    for (const doc of snapshot.docs) {
      totalProcessed++;
      const threadId = doc.id;
      const thread = doc.data() || {};
      
      // Check if thread needs fixing
      const lastMessageText = thread.lastMessageText ?? thread.lastMessagePreview ?? null;
      const needsFix = (lastMessageText == null || String(lastMessageText).trim() === '');
      
      if (!needsFix) {
        skipped++;
        continue;
      }
      
      candidates++;
      if (lastMessageText == null) {
        stats.noLastMessageText++;
      } else {
        stats.emptyLastMessageText++;
      }
      
      // Get messages for this thread
      const msgsRef = db.collection('threads').doc(threadId).collection('messages');
      
      let msgsSnap;
      try {
        // Try to order by tsClient first (real message timestamp)
        msgsSnap = await msgsRef.orderBy('tsClient', 'desc').limit(50).get();
      } catch (e) {
        // Fallback to createdAt if tsClient index/field missing
        try {
          msgsSnap = await msgsRef.orderBy('createdAt', 'desc').limit(50).get();
        } catch (e2) {
          console.log(`⚠️  [SKIP] thread=${threadId.substring(0, 50)}... - cannot query messages: ${e2.message}`);
          errors++;
          continue;
        }
      }
      
      // Find the last real INBOUND message (CRITICAL: only use inbound to show last received message)
      let best = null;
      for (const m of msgsSnap.docs) {
        const data = m.data() || {};
        const direction = (data.direction || 'inbound').toLowerCase();
        // Only use inbound messages for lastMessageText/lastMessageAt
        if (isRealMessage(data) && direction === 'inbound') {
          best = { id: m.id, ...data };
          break;
        }
      }
      
      if (!best) {
        console.log(`[SKIP] thread=${threadId.substring(0, 50)}... - no real INBOUND message found in last 50`);
        stats.noRealMessage++;
        skipped++;
        continue;
      }
      
      stats.foundRealMessage++;
      
      // Extract timestamp and preview
      const ts = pickTimestamp(best);
      const body = (best.body || '').toString().trim();
      const preview = body.slice(0, 100);
      
      // Prepare update
      const update = {
        lastMessageText: preview,
        lastMessagePreview: preview, // Keep for backward compatibility
      };
      
      if (ts) {
        update.lastMessageAt = ts;
      }
      
      // Preserve direction if available
      if (best.direction) {
        // Note: lastMessageDirection was removed from Flutter, but we can keep it for now
        // update.lastMessageDirection = best.direction;
      }
      
      const tsStr = ts ? ts.toDate().toISOString() : 'null';
      console.log(
        `[FIX] thread=${threadId.substring(0, 50)}...\n` +
        `      msg=${best.id.substring(0, 20)}...\n` +
        `      preview="${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}"\n` +
        `      ts=${tsStr}\n` +
        `      direction=${best.direction || 'unknown'}`
      );
      
      if (!dryRun) {
        try {
          await db.collection('threads').doc(threadId).set(update, { merge: true });
          fixed++;
        } catch (error) {
          console.error(`❌ Error updating thread ${threadId}:`, error.message);
          errors++;
        }
      } else {
        fixed++; // Count as "would fix" in dry run
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Candidates (needs fix): ${candidates}`);
    console.log(`  - No lastMessageText: ${stats.noLastMessageText}`);
    console.log(`  - Empty lastMessageText: ${stats.emptyLastMessageText}`);
    console.log(`Found real messages: ${stats.foundRealMessage}`);
    console.log(`No real messages found: ${stats.noRealMessage}`);
    console.log(`Total fixed: ${fixed}`);
    console.log(`Total skipped: ${skipped}`);
    console.log(`Total errors: ${errors}`);
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Fix complete!');
      console.log('   Refresh the Flutter app to see updated thread order');
    }
    
  } catch (error) {
    console.error('\n❌ Error during fix:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const accountId = args.find(arg => !arg.startsWith('--')) || null;
const dryRun = args.includes('--dry-run');

// Run fix
fixThreadSummary(accountId, { dryRun })
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
