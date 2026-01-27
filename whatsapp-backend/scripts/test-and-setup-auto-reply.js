#!/usr/bin/env node
/**
 * Test and Setup Auto-Reply
 * 
 * This script:
 * 1. Checks if GROQ_API_KEY is set
 * 2. Checks if autoReplyEnabled and autoReplyPrompt are set in Firestore
 * 3. Sets them if missing
 * 4. Tests the configuration
 */

require('dotenv').config({ path: '/etc/whatsapp-backend/groq-api-key.env' });
const admin = require('firebase-admin');
const { loadServiceAccount } = require('../firebaseCredentials');

const ACCOUNT_ID = 'account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443';
const DEFAULT_PROMPT = 'Ești un asistent WhatsApp. Răspunzi politicos, scurt și clar în română. Nu inventezi informații. Dacă nu știi ceva, spui clar că nu știi.';

async function main() {
  try {
    // Initialize Firebase
    const creds = loadServiceAccount();
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    const db = admin.firestore();

    console.log('\n🔍 Checking Auto-Reply Configuration...\n');

    // 1. Check GROQ_API_KEY
    const groqKey = process.env.GROQ_API_KEY;
    console.log(`1. GROQ_API_KEY: ${groqKey ? '✅ Set (' + groqKey.substring(0, 10) + '...)' : '❌ NOT SET'}`);

    // 2. Check Firestore settings
    const accountDoc = await db.collection('accounts').doc(ACCOUNT_ID).get();
    const accountData = accountDoc.data() || {};
    const autoReplyEnabled = accountData.autoReplyEnabled === true;
    const autoReplyPrompt = accountData.autoReplyPrompt || '';

    console.log(`2. autoReplyEnabled: ${autoReplyEnabled ? '✅ true' : '❌ false (not set)'}`);
    console.log(`3. autoReplyPrompt: ${autoReplyPrompt ? '✅ Set (' + autoReplyPrompt.substring(0, 50) + '...)' : '❌ NOT SET'}`);

    // 3. Set if missing
    if (!autoReplyEnabled || !autoReplyPrompt) {
      console.log('\n🔧 Setting up auto-reply configuration...\n');
      
      const updateData = {
        autoReplyEnabled: true,
        autoReplyPrompt: DEFAULT_PROMPT,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection('accounts').doc(ACCOUNT_ID).set(updateData, { merge: true });
      console.log('✅ Auto-reply configuration set successfully!');
      console.log(`   - autoReplyEnabled: true`);
      console.log(`   - autoReplyPrompt: "${DEFAULT_PROMPT.substring(0, 50)}..."`);
    } else {
      console.log('\n✅ Auto-reply is already configured correctly!');
    }

    // 4. Final verification
    const verifyDoc = await db.collection('accounts').doc(ACCOUNT_ID).get();
    const verifyData = verifyDoc.data() || {};
    console.log('\n📋 Final Configuration:');
    console.log(`   - autoReplyEnabled: ${verifyData.autoReplyEnabled === true ? '✅ true' : '❌ false'}`);
    console.log(`   - autoReplyPrompt: ${verifyData.autoReplyPrompt ? '✅ Set' : '❌ Not set'}`);
    console.log(`   - GROQ_API_KEY: ${groqKey ? '✅ Set' : '❌ Not set'}`);

    if (verifyData.autoReplyEnabled === true && verifyData.autoReplyPrompt && groqKey) {
      console.log('\n🎉 Auto-reply is ready! Send a test message to WhatsApp and check logs.');
      console.log('   Monitor logs: ssh ... "sudo journalctl -u whatsapp-backend -f | grep AutoReply"');
    } else {
      console.log('\n⚠️  Auto-reply is NOT ready. Please fix the issues above.');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
