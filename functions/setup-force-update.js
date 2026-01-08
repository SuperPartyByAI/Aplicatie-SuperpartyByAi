/**
 * Setup Force Update Configuration in Firestore
 * 
 * This script creates/updates the app_config/version document
 * to enable force update for older app versions.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function setupForceUpdate() {
  try {
    console.log('🔧 Setting up Force Update configuration...');

    const config = {
      // Force update enabled
      force_update: true,
      
      // Minimum build number required (users below this MUST update)
      min_build_number: 22,
      
      // Current latest version info
      latest_version: '1.2.2',
      latest_build_number: 22,
      
      // Download URLs
      android_download_url: 'https://play.google.com/store/apps/details?id=com.superparty.app',
      
      // Release notes
      release_notes: '• AI Chat îmbunătățit\n• Răspunsuri mai rapide\n• Funcții noi în GM mode\n• Bug fixes și îmbunătățiri',
      
      // Update message
      update_message: 'O versiune nouă este disponibilă! Trebuie să actualizezi pentru a continua.',
      
      // Metadata
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: 'setup-script',
    };

    await db.collection('app_config').doc('version').set(config, { merge: true });

    console.log('✅ Force Update configuration created successfully!');
    console.log('📋 Configuration:');
    console.log(`   - Force Update: ${config.force_update}`);
    console.log(`   - Min Build Number: ${config.min_build_number}`);
    console.log(`   - Latest Version: ${config.latest_version} (${config.latest_build_number})`);
    console.log(`   - Download URL: ${config.android_download_url}`);
    console.log('');
    console.log('🎯 Users with build < 22 will be forced to update!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up Force Update:', error);
    process.exit(1);
  }
}

setupForceUpdate();
