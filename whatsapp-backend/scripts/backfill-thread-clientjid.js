#!/usr/bin/env node
/**
 * Backfill script: Populate missing clientJid and phoneE164 in threads
 * 
 * Usage:
 *   node scripts/backfill-thread-clientjid.js [--dry-run] [--accountId=...]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 *   --accountId: Only process threads for specific accountId
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { loadServiceAccount } = require('../firebaseCredentials');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Extract clientJid from threadId (format: accountId__clientJid)
 */
function extractClientJidFromThreadId(threadId) {
  if (!threadId || typeof threadId !== 'string' || !threadId.includes('__')) {
    return null;
  }
  
  const parts = threadId.split('__');
  if (parts.length < 2) {
    return null;
  }
  
  const candidateJid = parts.slice(1).join('__');
  
  // Validate: candidateJid should look like a JID
  if (candidateJid && typeof candidateJid === 'string' && 
      (candidateJid.endsWith('@s.whatsapp.net') || 
       candidateJid.endsWith('@g.us') || 
       candidateJid.endsWith('@lid') ||
       candidateJid.endsWith('@c.us') ||
       candidateJid.endsWith('@broadcast'))) {
    return candidateJid;
  }
  
  return null;
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

async function backfillThreads(options = {}) {
  const { dryRun = false, accountId = null } = options;
  
  console.log(`\n🔍 Starting backfill${dryRun ? ' (DRY RUN)' : ''}...`);
  if (accountId) {
    console.log(`   Filtering by accountId: ${accountId}`);
  }
  console.log('');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  const stats = {
    missingClientJid: 0,
    missingPhoneE164: 0,
    bothMissing: 0,
    alreadyComplete: 0,
  };
  
  try {
    let query = db.collection('threads');
    
    // Filter by accountId if provided
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    
    const snapshot = await query.get();
    
    console.log(`📊 Found ${snapshot.size} threads to process\n`);
    
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;
    
    for (const doc of snapshot.docs) {
      totalProcessed++;
      const threadId = doc.id;
      const data = doc.data();
      
      const existingClientJid = data.clientJid;
      const existingPhoneE164 = data.phoneE164 || data.phone || data.phoneNumber;
      
      // Extract clientJid from threadId if missing
      const extractedClientJid = !existingClientJid ? extractClientJidFromThreadId(threadId) : null;
      const resolvedClientJid = existingClientJid || extractedClientJid;
      
      // Extract phoneE164 if clientJid is available and phoneE164 is missing
      const extractedPhoneE164 = resolvedClientJid && !existingPhoneE164 
        ? extractPhoneE164(resolvedClientJid) 
        : null;
      
      // Determine what needs to be updated
      const needsClientJid = !existingClientJid && extractedClientJid;
      const needsPhoneE164 = !existingPhoneE164 && extractedPhoneE164;
      
      if (needsClientJid || needsPhoneE164) {
        stats.missingClientJid += needsClientJid ? 1 : 0;
        stats.missingPhoneE164 += needsPhoneE164 ? 1 : 0;
        stats.bothMissing += (needsClientJid && needsPhoneE164) ? 1 : 0;
        
        const updates = {};
        if (needsClientJid) {
          updates.clientJid = extractedClientJid;
        }
        if (needsPhoneE164) {
          updates.phoneE164 = extractedPhoneE164;
          updates.phone = extractedPhoneE164;
          updates.phoneNumber = extractedPhoneE164;
        }
        
        if (!dryRun) {
          const threadRef = db.collection('threads').doc(threadId);
          batch.update(threadRef, updates);
          batchCount++;
          
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`✅ Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        }
        
        totalUpdated++;
        console.log(
          `  ${dryRun ? '[DRY RUN]' : '✅'} Thread ${threadId.substring(0, 20)}...: ` +
          `${needsClientJid ? `clientJid=${extractedClientJid} ` : ''}` +
          `${needsPhoneE164 ? `phoneE164=${extractedPhoneE164}` : ''}`
        );
      } else {
        stats.alreadyComplete++;
        totalSkipped++;
      }
    }
    
    // Commit remaining batch
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} updates`);
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   ${dryRun ? 'Would update' : 'Updated'}: ${totalUpdated}`);
    console.log(`   Skipped (already complete): ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('\n📈 Breakdown:');
    console.log(`   Missing clientJid: ${stats.missingClientJid}`);
    console.log(`   Missing phoneE164: ${stats.missingPhoneE164}`);
    console.log(`   Both missing: ${stats.bothMissing}`);
    console.log(`   Already complete: ${stats.alreadyComplete}`);
    console.log('');
    
    if (dryRun) {
      console.log('⚠️  DRY RUN: No changes were made. Run without --dry-run to apply changes.');
    } else {
      console.log('✅ Backfill complete!');
    }
    
  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  accountId: args.find(arg => arg.startsWith('--accountId='))?.split('=')[1] || null,
};

// Run backfill
backfillThreads(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
