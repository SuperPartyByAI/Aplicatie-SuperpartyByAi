#!/usr/bin/env node
/**
 * Cleanup script: Remove protocol message pollution from thread displayNames
 * 
 * This script finds threads with displayName that looks like protocol messages
 * (e.g., "INBOUND-PROBE-PROD_20251229_213355_e42ebb-1767044595") and cleans them:
 * - Removes displayName if it's a protocol message
 * - Falls back to phone/clientJid for display
 * 
 * Usage:
 *   node scripts/cleanup-protocol-threads.js [--dry-run] [--accountId=...] [--delete-displayname]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 *   --accountId: Only process threads for specific accountId
 *   --delete-displayname: Delete displayName field instead of setting to empty string
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
 * Check if displayName looks like a protocol message or system message
 */
function looksLikeProtocolMessage(displayName) {
  if (!displayName || typeof displayName !== 'string') {
    return false;
  }
  
  const trimmed = displayName.trim().toUpperCase();
  if (trimmed.length === 0) {
    return false;
  }
  
  // Check for common protocol message patterns
  if (trimmed.startsWith('INBOUND-PROBE') || 
      trimmed.startsWith('INBOUND_PROBE') ||
      trimmed.startsWith('OUTBOUND-PROBE') ||
      trimmed.startsWith('OUTBOUND_PROBE') ||
      trimmed.startsWith('PROTOCOL') ||
      trimmed.startsWith('HISTORY-SYNC') ||
      trimmed.startsWith('HISTORY_SYNC') ||
      trimmed.startsWith('HISTORYSYNC')) {
    return true;
  }
  
  // Check for system message patterns (long alphanumeric strings with underscores/hyphens)
  // Pattern: long strings (20+ chars) with underscores/hyphens that look like IDs
  if (/^[A-Z0-9_-]{20,}$/.test(trimmed) && 
      (trimmed.includes('_') || trimmed.includes('-'))) {
    // Additional check: should have date-like patterns or hash-like patterns
    if (/\d{8}/.test(trimmed) || // Date pattern YYYYMMDD
        /[A-F0-9]{6,}/.test(trimmed) || // Hex hash
        /_\d{10,}/.test(trimmed)) { // Timestamp-like
      return true;
    }
  }
  
  return false;
}

/**
 * Extract phoneE164 from clientJid (only for phone numbers, not groups)
 */
function extractPhoneE164(clientJid) {
  if (!clientJid || typeof clientJid !== 'string') {
    return null;
  }
  
  const isPhoneJid = clientJid.endsWith('@s.whatsapp.net') || clientJid.endsWith('@c.us');
  if (!isPhoneJid) {
    return null; // Not a phone number (group, lid, etc.)
  }
  
  const phoneDigits = clientJid.split('@')[0]?.replace(/\D/g, '') || '';
  if (phoneDigits.length >= 6 && phoneDigits.length <= 15) {
    return `+${phoneDigits}`;
  }
  
  return null;
}

async function cleanupProtocolThreads(options = {}) {
  const { dryRun = false, accountId = null, deleteDisplayName = false } = options;
  
  console.log(`\n🔍 Starting cleanup${dryRun ? ' (DRY RUN)' : ''}...`);
  if (accountId) {
    console.log(`   Filtering by accountId: ${accountId}`);
  }
  if (deleteDisplayName) {
    console.log(`   Mode: Delete displayName field`);
  } else {
    console.log(`   Mode: Set displayName to empty string`);
  }
  console.log('');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  const stats = {
    protocolMessages: 0,
    hasPhoneFallback: 0,
    hasClientJidFallback: 0,
    noFallback: 0,
  };
  
  try {
    let query = db.collection('threads');
    
    // Filter by accountId if provided
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    
    // Get all threads (we need to check displayName, so we fetch all)
    const snapshot = await query.get();
    
    console.log(`📊 Found ${snapshot.size} threads to check\n`);
    
    const batchSize = 500;
    const batches = [];
    let currentBatch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      totalProcessed++;
      const threadData = doc.data();
      const threadId = doc.id;
      const displayName = threadData.displayName;
      
      // Check if displayName looks like protocol message
      if (!looksLikeProtocolMessage(displayName)) {
        totalSkipped++;
        continue;
      }
      
      stats.protocolMessages++;
      
      // Determine fallback
      const clientJid = threadData.clientJid || 
                       (threadId.includes('__') ? threadId.split('__').slice(1).join('__') : null);
      const phoneE164 = threadData.phoneE164 || 
                       threadData.phone || 
                       threadData.phoneNumber ||
                       (clientJid ? extractPhoneE164(clientJid) : null);
      
      if (phoneE164) {
        stats.hasPhoneFallback++;
      } else if (clientJid) {
        stats.hasClientJidFallback++;
      } else {
        stats.noFallback++;
      }
      
      // Prepare update
      const updateData = {};
      if (deleteDisplayName) {
        // Use FieldValue.delete() to remove the field
        updateData.displayName = admin.firestore.FieldValue.delete();
      } else {
        // Set to empty string
        updateData.displayName = '';
      }
      
      console.log(
        `🔧 [${totalProcessed}] Thread: ${threadId.substring(0, 50)}...\n` +
        `   Current displayName: "${displayName}"\n` +
        `   Fallback: ${phoneE164 || clientJid || 'none'}\n` +
        `   Action: ${deleteDisplayName ? 'DELETE' : 'CLEAR'} displayName`
      );
      
      if (!dryRun) {
        const threadRef = db.collection('threads').doc(threadId);
        currentBatch.update(threadRef, updateData);
        batchCount++;
        
        if (batchCount >= batchSize) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          batchCount = 0;
        }
      }
      
      totalUpdated++;
    }
    
    // Add remaining batch
    if (batchCount > 0 && !dryRun) {
      batches.push(currentBatch);
    }
    
    // Commit batches
    if (!dryRun && batches.length > 0) {
      console.log(`\n💾 Committing ${batches.length} batch(es)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        console.log(`   ✅ Batch ${i + 1}/${batches.length} committed`);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Protocol messages found: ${stats.protocolMessages}`);
    console.log(`  - With phone fallback: ${stats.hasPhoneFallback}`);
    console.log(`  - With clientJid fallback: ${stats.hasClientJidFallback}`);
    console.log(`  - No fallback: ${stats.noFallback}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Total skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Cleanup complete!');
    }
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  accountId: args.find(arg => arg.startsWith('--accountId='))?.split('=')[1] || null,
  deleteDisplayName: args.includes('--delete-displayname'),
};

// Run cleanup
cleanupProtocolThreads(options)
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
