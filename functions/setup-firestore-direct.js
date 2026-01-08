#!/usr/bin/env node

const {Firestore} = require('@google-cloud/firestore');

const PROJECT_ID = 'superparty-frontend';
const FIREBASE_TOKEN = '1//03RiX8JiTt51ECgYIARAAGAMSNwF-L9IrrO5zGXhA8Y0HTnnwTd4VctOT1b4WIwnTCzT9eon-5B1ve_87UEOTwe5YVTSJ6OkZMmw';

const config = {
  force_update: true,
  min_build_number: 22,
  latest_version: '1.2.2',
  latest_build_number: 22,
  android_download_url: 'https://play.google.com/store/apps/details?id=com.superparty.app',
  release_notes: 'AI Chat îmbunătățit\nRăspunsuri mai rapide\nFuncții noi în GM mode\nBug fixes și îmbunătățiri',
  update_message: 'O versiune nouă este disponibilă! Trebuie să actualizezi pentru a continua.',
};

async function main() {
  try {
    console.log('🔧 Setting up Force Update configuration...');
    console.log(`📍 Project: ${PROJECT_ID}`);
    console.log('');

    // Initialize Firestore with token
    const firestore = new Firestore({
      projectId: PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    console.log('📝 Creating Firestore document...');
    
    await firestore.collection('app_config').doc('version').set(config);

    console.log('✅ Force Update configuration created successfully!');
    console.log('');
    console.log('📋 Configuration:');
    console.log(`   - Force Update: ${config.force_update}`);
    console.log(`   - Min Build Number: ${config.min_build_number}`);
    console.log(`   - Latest Version: ${config.latest_version} (${config.latest_build_number})`);
    console.log(`   - Download URL: ${config.android_download_url}`);
    console.log('');
    console.log('🎯 Users with build < 22 will be forced to update!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
