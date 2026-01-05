#!/usr/bin/env node

/**
 * Setup Force Update Configuration in Firestore
 *
 * This script creates the app_config/version document needed for force updates.
 *
 * Usage:
 *   node scripts/setup-force-update-config.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'superparty-ai',
});

const db = admin.firestore();

async function setupForceUpdateConfig() {
  console.log('🚀 Setting up Force Update configuration...\n');

  const config = {
    min_version: '1.0.2',
    min_build_number: 3,
    force_update: true,
    update_message: 'Versiune nouă cu pagina Evenimente! Actualizează pentru a continua.',
    release_notes:
      '- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Fix AI Chat\n- Force Update system',
    android_download_url:
      'https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media',
    ios_download_url: null,
    updated_at: new Date().toISOString(),
  };

  console.log('📝 Configuration to be set:');
  console.log(JSON.stringify(config, null, 2));
  console.log('');

  try {
    await db.collection('app_config').doc('version').set(config);
    console.log('✅ Force Update configuration created successfully!\n');

    console.log('📋 Next steps:');
    console.log('1. Wait for APK build to complete');
    console.log('2. Open app on device with old version');
    console.log('3. App should show "Actualizare Obligatorie" dialog');
    console.log('4. User downloads and installs new APK');
    console.log('');

    console.log('🔗 Check Firestore:');
    console.log(
      'https://console.firebase.google.com/project/superparty-ai/firestore/data/app_config/version'
    );
    console.log('');
  } catch (error) {
    console.error('❌ Error setting configuration:', error);
    process.exit(1);
  }

  process.exit(0);
}

setupForceUpdateConfig();
