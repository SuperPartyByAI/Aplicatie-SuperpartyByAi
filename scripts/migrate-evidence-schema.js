#!/usr/bin/env node

/**
 * Migration script: Add 'category' field to existing evidence documents
 *
 * This script:
 * 1. Finds all documents in evenimente/{eventId}/dovezi that have 'categorie' but not 'category'
 * 2. Copies the value from 'categorie' to 'category'
 * 3. Keeps both fields for backward compatibility
 *
 * Usage:
 *   node scripts/migrate-evidence-schema.js [--dry-run] [--project PROJECT_ID]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectIndex = args.indexOf('--project');
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : null;

// Initialize Firebase Admin
let serviceAccount;
try {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, '../firebase-service-account.json');
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('❌ Error loading service account:', error.message);
  console.error(
    'Set FIREBASE_SERVICE_ACCOUNT_PATH environment variable or place firebase-service-account.json in project root'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: projectId || serviceAccount.project_id,
});

const db = admin.firestore();

async function migrateEvidenceDocuments() {
  console.log('🔍 Starting evidence schema migration...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update documents)'}`);
  console.log('');

  let totalEvents = 0;
  let totalDocs = 0;
  let migratedDocs = 0;
  let skippedDocs = 0;
  let errorDocs = 0;

  try {
    // Get all events
    const eventsSnapshot = await db.collection('evenimente').get();
    totalEvents = eventsSnapshot.size;
    console.log(`📊 Found ${totalEvents} events`);
    console.log('');

    // Process each event
    for (const eventDoc of eventsSnapshot.docs) {
      const eventId = eventDoc.id;
      console.log(`Processing event: ${eventId}`);

      // Get all dovezi for this event
      const doveziSnapshot = await db
        .collection('evenimente')
        .doc(eventId)
        .collection('dovezi')
        .get();

      console.log(`  Found ${doveziSnapshot.size} evidence documents`);
      totalDocs += doveziSnapshot.size;

      // Process each evidence document
      for (const doveziDoc of doveziSnapshot.docs) {
        const data = doveziDoc.data();
        const hasCategorie = 'categorie' in data;
        const hasCategory = 'category' in data;

        if (hasCategorie && !hasCategory) {
          // Needs migration
          console.log(
            `  ✏️  Migrating ${doveziDoc.id}: categorie="${data.categorie}" -> category="${data.categorie}"`
          );

          if (!dryRun) {
            try {
              await doveziDoc.ref.update({
                category: data.categorie,
              });
              migratedDocs++;
            } catch (error) {
              console.error(`  ❌ Error migrating ${doveziDoc.id}:`, error.message);
              errorDocs++;
            }
          } else {
            migratedDocs++;
          }
        } else if (hasCategory) {
          // Already has category field
          skippedDocs++;
        } else {
          // Missing both fields (shouldn't happen)
          console.warn(
            `  ⚠️  Document ${doveziDoc.id} missing both 'categorie' and 'category' fields`
          );
          errorDocs++;
        }
      }

      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('Migration Summary');
    console.log('═══════════════════════════════════════');
    console.log(`Total events processed: ${totalEvents}`);
    console.log(`Total documents found: ${totalDocs}`);
    console.log(`Documents migrated: ${migratedDocs}`);
    console.log(`Documents skipped (already migrated): ${skippedDocs}`);
    console.log(`Documents with errors: ${errorDocs}`);
    console.log('');

    if (dryRun) {
      console.log('🔍 DRY RUN COMPLETE - No changes were made');
      console.log('Run without --dry-run to apply changes');
    } else {
      console.log('✅ MIGRATION COMPLETE');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateEvidenceDocuments()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
