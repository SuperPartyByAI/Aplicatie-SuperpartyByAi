#!/usr/bin/env node
/**
 * Sync script: Update thread displayName and profilePictureUrl from contacts collection
 * 
 * This script ensures all threads have correct displayName and profilePictureUrl
 * by looking them up in the contacts collection.
 * 
 * Usage:
 *   node scripts/sync-contacts-to-threads.js <accountId> [--dry-run]
 * 
 * Example:
 *   node scripts/sync-contacts-to-threads.js account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443 --dry-run
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    let serviceAccount = null;
    
    // Try FIREBASE_SERVICE_ACCOUNT_JSON (base64 encoded or plain JSON)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'base64').toString();
        serviceAccount = JSON.parse(decoded);
        console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_JSON from environment (base64)');
      } catch (e1) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_JSON from environment (plain JSON)');
        } catch (e2) {
          console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e2.message);
        }
      }
    }
    
    // Try serviceAccountKey.json file
    if (!serviceAccount) {
      const fs = require('fs');
      const path = require('path');
      const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
      if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = require(serviceAccountPath);
        console.log('✅ Using serviceAccountKey.json from file');
      }
    }
    
    // Try GOOGLE_APPLICATION_CREDENTIALS
    if (!serviceAccount && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const fs = require('fs');
      try {
        serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
        console.log('✅ Using GOOGLE_APPLICATION_CREDENTIALS');
      } catch (e) {
        console.error('❌ Failed to read GOOGLE_APPLICATION_CREDENTIALS:', e.message);
      }
    }
    
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // Fallback to Application Default Credentials
      console.log('⚠️  No explicit credentials found, trying Application Default Credentials...');
      admin.initializeApp();
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('   Set FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or provide serviceAccountKey.json');
    process.exit(1);
  }
}

const db = admin.firestore();

async function syncContactsToThreads(accountId, dryRun = false) {
  console.log(`\n🔄 Syncing contacts to threads for account: ${accountId}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}\n`);

  if (!accountId) {
    console.error('❌ accountId is required');
    process.exit(1);
  }

  try {
    // Get all threads for this account
    const threadsSnapshot = await db.collection('threads')
      .where('accountId', '==', accountId)
      .limit(1000)
      .get();

    console.log(`📊 Found ${threadsSnapshot.size} threads to process\n`);

    let processed = 0;
    let updatedDisplayName = 0;
    let updatedPhoto = 0;
    let skipped = 0;
    let errors = 0;
    const results = [];

    for (const threadDoc of threadsSnapshot.docs) {
      const threadData = threadDoc.data();
      const threadId = threadDoc.id;
      const clientJid = threadData.clientJid || null;

      processed++;

      try {
        if (!clientJid) {
          skipped++;
          continue;
        }

        // Look up contact
        const contactRef = db.collection('contacts').doc(`${accountId}__${clientJid}`);
        const contactDoc = await contactRef.get();

        if (!contactDoc.exists) {
          skipped++;
          continue;
        }

        const contactData = contactDoc.data() || {};
        const contactName = contactData.name || contactData.notify || contactData.verifiedName || null;
        const contactPhotoUrl = contactData.imgUrl || null;

        // Check if we need to update
        const currentDisplayName = threadData.displayName || null;
        const currentPhotoUrl = threadData.profilePictureUrl || threadData.photoUrl || null;

        const needsNameUpdate = contactName && 
          contactName.trim().length > 0 && 
          contactName !== currentDisplayName;
        
        const needsPhotoUpdate = contactPhotoUrl && 
          contactPhotoUrl.trim().length > 0 && 
          contactPhotoUrl !== currentPhotoUrl;

        if (!needsNameUpdate && !needsPhotoUpdate) {
          skipped++;
          continue;
        }

        const updateData = {};
        if (needsNameUpdate) {
          updateData.displayName = contactName.trim();
          updateData.displayNameUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
          updatedDisplayName++;
        }
        if (needsPhotoUpdate) {
          updateData.profilePictureUrl = contactPhotoUrl.trim();
          updateData.photoUrl = contactPhotoUrl.trim(); // Also set photoUrl for backward compatibility
          updateData.photoUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
          updatedPhoto++;
        }

        if (!dryRun) {
          await threadDoc.ref.update(updateData);
        }

        results.push({
          threadId: threadId.substring(0, 50),
          clientJid: clientJid.substring(0, 30),
          oldName: currentDisplayName || 'no_name',
          newName: contactName || currentDisplayName || 'no_name',
          hasPhoto: !!contactPhotoUrl,
          action: dryRun ? 'would_update' : 'updated',
        });

        if (results.length <= 10) {
          console.log(`✅ [${processed}] ${clientJid.substring(0, 30)}: ${needsNameUpdate ? `name="${contactName}"` : ''} ${needsPhotoUpdate ? 'photo=yes' : ''}`);
        }
      } catch (error) {
        console.error(`❌ Error processing thread ${threadId}:`, error.message);
        errors++;
      }
    }

    console.log(`\n📊 Sync complete:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Updated displayName: ${updatedDisplayName}`);
    console.log(`   Updated photo: ${updatedPhoto}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE UPDATE'}\n`);

    if (results.length > 0) {
      console.log(`📋 Sample results (first 10):`);
      results.slice(0, 10).forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.clientJid}: "${r.oldName}" -> "${r.newName}" ${r.hasPhoto ? '(has photo)' : ''}`);
      });
      console.log('');
    }

    return {
      success: true,
      dryRun,
      processed,
      updatedDisplayName,
      updatedPhoto,
      skipped,
      errors,
      sampleResults: results.slice(0, 20),
    };
  } catch (error) {
    console.error(`❌ Sync failed:`, error.message);
    throw error;
  }
}

// Main
const args = process.argv.slice(2);
const accountId = args.find(arg => !arg.startsWith('--')) || null;
const dryRun = args.includes('--dry-run');

if (!accountId) {
  console.error('Usage: node scripts/sync-contacts-to-threads.js <accountId> [--dry-run]');
  process.exit(1);
}

syncContactsToThreads(accountId, dryRun)
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
