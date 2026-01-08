#!/usr/bin/env node

const https = require('https');

const FIREBASE_TOKEN = '1//03RiX8JiTt51ECgYIARAAGAMSNwF-L9IrrO5zGXhA8Y0HTnnwTd4VctOT1b4WIwnTCzT9eon-5B1ve_87UEOTwe5YVTSJ6OkZMmw';
const PROJECT_ID = 'superparty-frontend';

const config = {
  force_update: true,
  min_build_number: 22,
  latest_version: '1.2.2',
  latest_build_number: 22,
  android_download_url: 'https://play.google.com/store/apps/details?id=com.superparty.app',
  release_notes: 'AI Chat îmbunătățit\nRăspunsuri mai rapide\nFuncții noi în GM mode\nBug fixes și îmbunătățiri',
  update_message: 'O versiune nouă este disponibilă! Trebuie să actualizezi pentru a continua.',
};

async function getAccessToken() {
  // Exchange Firebase token for access token
  const data = JSON.stringify({
    token: FIREBASE_TOKEN,
  });

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const json = JSON.parse(body);
          resolve(json.access_token);
        } else {
          reject(new Error(`Failed to get access token: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function createFirestoreDoc(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/app_config?documentId=version`;
  
  const firestoreDoc = {
    fields: {
      force_update: { booleanValue: config.force_update },
      min_build_number: { integerValue: config.min_build_number },
      latest_version: { stringValue: config.latest_version },
      latest_build_number: { integerValue: config.latest_build_number },
      android_download_url: { stringValue: config.android_download_url },
      release_notes: { stringValue: config.release_notes },
      update_message: { stringValue: config.update_message },
    }
  };

  const data = JSON.stringify(firestoreDoc);

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Force Update configuration created successfully!');
          console.log('');
          console.log('📋 Configuration:');
          console.log(`   - Force Update: ${config.force_update}`);
          console.log(`   - Min Build Number: ${config.min_build_number}`);
          console.log(`   - Latest Version: ${config.latest_version} (${config.latest_build_number})`);
          console.log(`   - Download URL: ${config.android_download_url}`);
          console.log('');
          console.log('🎯 Users with build < 22 will be forced to update!');
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    console.log('🔧 Setting up Force Update configuration...');
    console.log(`📍 Project: ${PROJECT_ID}`);
    console.log('');

    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    
    console.log('📝 Creating Firestore document...');
    await createFirestoreDoc(accessToken);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
