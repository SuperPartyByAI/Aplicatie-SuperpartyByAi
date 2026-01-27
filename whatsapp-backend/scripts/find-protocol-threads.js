#!/usr/bin/env node
/**
 * Find threads with protocol-like displayNames
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { loadServiceAccount } = require('../firebaseCredentials');

if (!admin.apps.length) {
  const { serviceAccount } = loadServiceAccount();
  if (!serviceAccount) {
    console.error('❌ Error: Could not load Firebase service account');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function findProtocolThreads(accountId) {
  const snapshot = await db.collection('threads')
    .where('accountId', '==', accountId)
    .limit(500)
    .get();

  console.log(`\n🔍 Checking ${snapshot.size} threads for protocol-like displayNames...\n`);

  const found = [];
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const displayName = data.displayName || '';
    const dn = displayName.toUpperCase();
    
    if (dn.includes('INBOUND') || dn.includes('PROBE') || dn.includes('PROTOCOL') || 
        dn.includes('HISTORY') || dn.includes('OUTBOUND')) {
      found.push({
        threadId: doc.id,
        displayName: displayName,
        clientJid: data.clientJid || 'N/A',
        lastMessageText: data.lastMessageText || data.lastMessagePreview || 'N/A',
      });
    }
  });

  console.log(`📊 Found ${found.length} threads with protocol-like displayNames:\n`);
  found.forEach((t, i) => {
    console.log(`${i + 1}. Thread: ${t.threadId.substring(0, 60)}...`);
    console.log(`   displayName: "${t.displayName}"`);
    console.log(`   clientJid: ${t.clientJid}`);
    console.log(`   lastMessageText: ${t.lastMessageText.substring(0, 50)}...`);
    console.log('');
  });

  return found;
}

const accountId = process.argv[2] || 'account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443';
findProtocolThreads(accountId)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
