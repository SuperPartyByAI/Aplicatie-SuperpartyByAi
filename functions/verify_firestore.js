#!/usr/bin/env node

/**
 * Verify Firestore Collections and Data
 * 
 * Usage:
 *   node verify_firestore.js
 * 
 * Requires service account key in one of:
 *   - functions/serviceAccountKey.json
 *   - GOOGLE_APPLICATION_CREDENTIALS env var
 *   - FIREBASE_SERVICE_ACCOUNT env var (JSON string)
 */

const admin = require('firebase-admin');
const path = require('path');

console.log('🔍 FIRESTORE VERIFICATION SCRIPT');
console.log('═'.repeat(70));
console.log('');

// Try to initialize Firebase Admin
let initialized = false;

// Method 1: Service account from file
const serviceAccountPaths = [
  path.join(__dirname, '../functions/serviceAccountKey.json'),
  path.join(__dirname, '../serviceAccountKey.json'),
  path.join(__dirname, '../../serviceAccountKey.json'),
];

for (const serviceAccountPath of serviceAccountPaths) {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log(`✅ Initialized with service account: ${serviceAccountPath}`);
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    initialized = true;
    break;
  } catch (error) {
    // Try next path
  }
}

// Method 2: Service account from environment variable (JSON string)
if (!initialized && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Initialized with FIREBASE_SERVICE_ACCOUNT env var');
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    initialized = true;
  } catch (error) {
    console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT:', error.message);
  }
}

// Method 3: Application Default Credentials
if (!initialized && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    console.log('✅ Initialized with GOOGLE_APPLICATION_CREDENTIALS');
    initialized = true;
  } catch (error) {
    console.error('❌ Error with GOOGLE_APPLICATION_CREDENTIALS:', error.message);
  }
}

if (!initialized) {
  console.error('❌ Could not initialize Firebase Admin');
  console.log('');
  console.log('📝 To use this script, you need Firebase credentials:');
  console.log('');
  console.log('Option 1: Download Service Account Key');
  console.log('  1. Go to: https://console.firebase.google.com/project/superparty-frontend/settings/serviceaccounts/adminsdk');
  console.log('  2. Click "Generate new private key"');
  console.log('  3. Save as: functions/serviceAccountKey.json');
  console.log('  4. Run: node scripts/verify_firestore.js');
  console.log('');
  console.log('Option 2: Use Environment Variable');
  console.log('  export FIREBASE_SERVICE_ACCOUNT=\'{"type":"service_account",...}\'');
  console.log('  node scripts/verify_firestore.js');
  console.log('');
  console.log('Option 3: Use Firebase CLI');
  console.log('  firebase login');
  console.log('  firebase firestore:get counters/eventShortCode');
  console.log('');
  process.exit(1);
}

const db = admin.firestore();

console.log('');
console.log('─'.repeat(70));
console.log('');

async function checkCollection(collectionName, limit = 5) {
  console.log(`📁 Collection: ${collectionName}`);
  
  try {
    const snapshot = await db.collection(collectionName).limit(limit).get();
    
    if (snapshot.empty) {
      console.log('   ⚠️  Empty (0 documents)');
      console.log('');
      return { exists: true, count: 0, documents: [] };
    }
    
    console.log(`   ✅ Found ${snapshot.size} documents (showing first ${limit})`);
    console.log('');
    
    const documents = [];
    
    snapshot.forEach((doc, index) => {
      const data = doc.data();
      documents.push({ id: doc.id, data });
      
      console.log(`   📄 Document ${index + 1}: ${doc.id}`);
      
      // Show key fields
      const keys = Object.keys(data);
      console.log(`      Fields (${keys.length}): ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}`);
      
      // V3 specific fields
      if (data.schemaVersion !== undefined) {
        console.log(`      📋 schemaVersion: ${data.schemaVersion}`);
      }
      
      if (data.eventShortId !== undefined) {
        console.log(`      🔢 eventShortId: ${data.eventShortId} (${typeof data.eventShortId})`);
      }
      
      if (data.shortCode !== undefined) {
        console.log(`      ⚠️  shortCode (legacy): "${data.shortCode}"`);
      }
      
      if (data.rolesBySlot) {
        const slots = Object.keys(data.rolesBySlot);
        console.log(`      🎭 rolesBySlot: ${slots.length} roles [${slots.slice(0, 3).join(', ')}${slots.length > 3 ? '...' : ''}]`);
      }
      
      if (Array.isArray(data.roles)) {
        console.log(`      ⚠️  roles[] (legacy): ${data.roles.length} roles`);
      }
      
      if (data.date) {
        console.log(`      📅 date: ${data.date}`);
      }
      
      if (data.childName || data.sarbatoritNume) {
        console.log(`      👤 child: ${data.childName || data.sarbatoritNume}`);
      }
      
      console.log('');
    });
    
    return { exists: true, count: snapshot.size, documents };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log('');
    return { exists: false, error: error.message };
  }
}

async function checkCounter() {
  console.log('🔢 Counter: counters/eventShortCode');
  
  try {
    const doc = await db.collection('counters').doc('eventShortCode').get();
    
    if (!doc.exists) {
      console.log('   ❌ NOT FOUND');
      console.log('   ⚠️  Counter needs to be initialized!');
      console.log('');
      console.log('   To initialize:');
      console.log('   1. Go to Firestore Console');
      console.log('   2. Create collection: counters');
      console.log('   3. Create document: eventShortCode');
      console.log('   4. Add field: value (number) = 0');
      console.log('');
      return { exists: false };
    }
    
    const data = doc.data();
    console.log('   ✅ Counter exists');
    console.log(`      Current value: ${data.value}`);
    
    if (data.createdAt) {
      const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      console.log(`      Created: ${date.toISOString()}`);
    }
    
    if (data.updatedAt) {
      const date = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
      console.log(`      Updated: ${date.toISOString()}`);
    }
    
    console.log('');
    return { exists: true, value: data.value, data };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log('');
    return { exists: false, error: error.message };
  }
}

async function main() {
  const results = {};
  
  // Check V3 collections
  console.log('🔍 V3 EN COLLECTIONS');
  console.log('─'.repeat(70));
  console.log('');
  
  results.evenimente = await checkCollection('evenimente', 5);
  results.staffProfiles = await checkCollection('staffProfiles', 3);
  results.staffHours = await checkCollection('staffHours', 3);
  results.tasks = await checkCollection('tasks', 3);
  results.notifications = await checkCollection('notifications', 3);
  results.counter = await checkCounter();
  
  // Check other collections
  console.log('─'.repeat(70));
  console.log('');
  console.log('📚 OTHER COLLECTIONS');
  console.log('─'.repeat(70));
  console.log('');
  
  results.conversationStates = await checkCollection('conversationStates', 2);
  results.userEventQuota = await checkCollection('userEventQuota', 2);
  
  // Summary
  console.log('═'.repeat(70));
  console.log('');
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log('');
  
  const collections = [
    'evenimente',
    'staffProfiles',
    'staffHours',
    'tasks',
    'notifications',
    'conversationStates',
    'userEventQuota'
  ];
  
  collections.forEach(name => {
    const result = results[name];
    if (result && result.exists) {
      console.log(`✅ ${name.padEnd(25)} ${result.count} documents`);
    } else if (result && !result.exists && !result.error) {
      console.log(`⚠️  ${name.padEnd(25)} 0 documents (empty)`);
    } else {
      console.log(`❌ ${name.padEnd(25)} Error or not accessible`);
    }
  });
  
  console.log('');
  
  if (results.counter && results.counter.exists) {
    console.log(`✅ Counter initialized       value: ${results.counter.value}`);
  } else {
    console.log('❌ Counter NOT initialized   ⚠️  NEEDS SETUP');
  }
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  console.log('✅ Verification complete');
  console.log('');
  
  process.exit(0);
}

main().catch(error => {
  console.error('');
  console.error('❌ Fatal error:', error.message);
  console.error('');
  process.exit(1);
});
