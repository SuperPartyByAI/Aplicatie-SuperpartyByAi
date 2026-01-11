#!/usr/bin/env node

/**
 * Check Firestore Collections and Documents
 * 
 * Verifies what exists in Firestore for V3 EN implementation
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                           path.join(__dirname, '../functions/serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('\nTo use this script, you need to:');
  console.log('1. Download service account key from Firebase Console');
  console.log('2. Save it as functions/serviceAccountKey.json');
  console.log('3. Or set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  process.exit(1);
}

const db = admin.firestore();

async function checkCollection(collectionName, sampleSize = 3) {
  console.log(`\n📁 Collection: ${collectionName}`);
  console.log('─'.repeat(60));
  
  try {
    const snapshot = await db.collection(collectionName).limit(sampleSize).get();
    
    if (snapshot.empty) {
      console.log('   ⚠️  Empty (no documents)');
      return;
    }
    
    console.log(`   ✅ ${snapshot.size} documents found (showing first ${sampleSize})`);
    
    snapshot.forEach((doc, index) => {
      console.log(`\n   Document ${index + 1}: ${doc.id}`);
      const data = doc.data();
      
      // Show key fields
      const keys = Object.keys(data);
      console.log(`   Fields (${keys.length}): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`);
      
      // Show schema version if exists
      if (data.schemaVersion) {
        console.log(`   📋 schemaVersion: ${data.schemaVersion}`);
      }
      
      // Show eventShortId if exists
      if (data.eventShortId !== undefined) {
        console.log(`   🔢 eventShortId: ${data.eventShortId} (${typeof data.eventShortId})`);
      }
      
      // Show shortCode if exists (legacy)
      if (data.shortCode) {
        console.log(`   ⚠️  shortCode (legacy): ${data.shortCode}`);
      }
      
      // Show rolesBySlot keys if exists
      if (data.rolesBySlot) {
        const slots = Object.keys(data.rolesBySlot);
        console.log(`   🎭 rolesBySlot: ${slots.length} roles (${slots.join(', ')})`);
      }
      
      // Show roles array if exists (legacy)
      if (Array.isArray(data.roles)) {
        console.log(`   ⚠️  roles[] (legacy): ${data.roles.length} roles`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function checkCounter() {
  console.log(`\n🔢 Counter: counters/eventShortCode`);
  console.log('─'.repeat(60));
  
  try {
    const doc = await db.collection('counters').doc('eventShortCode').get();
    
    if (!doc.exists) {
      console.log('   ❌ NOT FOUND - Counter needs to be initialized!');
      console.log('   Run: firebase firestore:set counters/eventShortCode \'{"value": 0}\'');
      return;
    }
    
    const data = doc.data();
    console.log(`   ✅ Counter exists`);
    console.log(`   Current value: ${data.value}`);
    if (data.createdAt) {
      console.log(`   Created: ${data.createdAt.toDate().toISOString()}`);
    }
    if (data.updatedAt) {
      console.log(`   Updated: ${data.updatedAt.toDate().toISOString()}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log('\n🔍 FIRESTORE VERIFICATION - V3 EN Implementation');
  console.log('═'.repeat(60));
  
  // Check main collections
  await checkCollection('evenimente', 5);
  await checkCollection('staffProfiles', 3);
  await checkCollection('staffHours', 3);
  await checkCollection('tasks', 3);
  await checkCollection('notifications', 3);
  await checkCounter();
  
  // Check other collections
  await checkCollection('conversationStates', 2);
  await checkCollection('userEventQuota', 2);
  
  console.log('\n═'.repeat(60));
  console.log('✅ Verification complete\n');
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
