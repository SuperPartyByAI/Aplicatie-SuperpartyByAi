#!/usr/bin/env node

/**
 * Create Force Update Config in Firestore
 * Uses Firebase Functions environment (already authenticated)
 */

const https = require('https');

const PROJECT_ID = 'superparty-frontend';
const COLLECTION = 'app_config';
const DOCUMENT = 'version';

const config = {
  force_update: true,
  min_build_number: 22,
  latest_version: '1.2.2',
  latest_build_number: 22,
  android_download_url: 'https://play.google.com/store/apps/details?id=com.superparty.app',
  release_notes: 'AI Chat îmbunătățit\nRăspunsuri mai rapide\nFuncții noi în GM mode\nBug fixes și îmbunătățiri',
  update_message: 'O versiune nouă este disponibilă! Trebuie să actualizezi pentru a continua.',
};

async function createConfig() {
  console.log('🔧 Creating Force Update configuration in Firestore...');
  console.log(`📍 Project: ${PROJECT_ID}`);
  console.log(`📁 Collection: ${COLLECTION}`);
  console.log(`📄 Document: ${DOCUMENT}`);
  console.log('');

  // Get access token from gcloud (if available in Gitpod)
  const { execSync } = require('child_process');
  
  try {
    // Try to get token from environment
    const token = process.env.FIREBASE_TOKEN || 
                  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                  execSync('gcloud auth print-access-token 2>/dev/null', { encoding: 'utf8' }).trim();

    if (!token) {
      throw new Error('No authentication token found');
    }

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${DOCUMENT}`;
    
    const firestoreDoc = {
      fields: {}
    };

    // Convert config to Firestore format
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'boolean') {
        firestoreDoc.fields[key] = { booleanValue: value };
      } else if (typeof value === 'number') {
        firestoreDoc.fields[key] = { integerValue: value };
      } else {
        firestoreDoc.fields[key] = { stringValue: value };
      }
    }

    const data = JSON.stringify(firestoreDoc);

    const options = {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
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

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('⚠️  Manual configuration required:');
    console.log('');
    console.log('1. Go to: https://console.firebase.google.com/project/superparty-frontend/firestore');
    console.log('2. Create collection: app_config');
    console.log('3. Create document: version');
    console.log('4. Add fields:');
    console.log(JSON.stringify(config, null, 2));
    process.exit(1);
  }
}

createConfig().catch(console.error);
