/**
 * TEST WA STATUS - Simple HTTP test for Windows
 *
 * Tests the status-now endpoint to verify WA stability fields
 */

const https = require('https');

const BASE_URL = process.env.BAILEYS_BASE_URL || 'https://whats-upp-production.up.railway.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token-here';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-Admin-Token': ADMIN_TOKEN,
      },
    };

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', error => {
      reject(error);
    });

    req.end();
  });
}

async function testWAStatus() {
  console.log('========================================');
  console.log('WA STATUS TEST');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Token configured: ${Boolean(ADMIN_TOKEN)}`);
  console.log('');

  try {
    console.log('Fetching status-now...');
    const response = await makeRequest('/api/longrun/status-now');

    if (!response.success) {
      console.error('❌ Request failed:', response.error);
      return;
    }

    console.log('✅ Request successful\n');

    // Check WA fields (DoD-WA-1)
    if (response.wa) {
      console.log('=== WA Connection Status (DoD-WA-1) ===');
      console.log(`waMode: ${response.wa.waMode}`);
      console.log(`waStatus: ${response.wa.waStatus}`);
      console.log(`lastDisconnectReason: ${response.wa.lastDisconnectReason || 'null'}`);
      console.log(`retryCount: ${response.wa.retryCount}`);
      console.log(`nextRetryAt: ${response.wa.nextRetryAt || 'null'}`);
      console.log(`authStore: ${response.wa.authStore}`);
      console.log(`authStateExists: ${response.wa.authStateExists}`);
      console.log(`authKeyCount: ${response.wa.authKeyCount}`);
      console.log(`lockHolder: ${response.wa.lockHolder || 'null'}`);
      console.log('');

      // Verify required fields
      const requiredFields = ['waMode', 'waStatus', 'retryCount', 'authStore'];

      let allPresent = true;
      console.log('=== Field Verification ===');
      for (const field of requiredFields) {
        if (response.wa[field] !== undefined) {
          console.log(`✅ ${field}`);
        } else {
          console.log(`❌ ${field} MISSING`);
          allPresent = false;
        }
      }

      if (allPresent) {
        console.log('\n✅ DoD-WA-1: All required fields present');
      } else {
        console.log('\n❌ DoD-WA-1: Some fields missing');
      }

      // Connection status interpretation
      console.log('\n=== Status Interpretation ===');
      if (response.wa.waMode === 'passive') {
        console.log('⚠️ Instance in PASSIVE mode (lock not acquired)');
        console.log('   Another instance is handling WA connection');
      } else if (response.wa.waStatus === 'CONNECTED') {
        console.log('✅ WhatsApp CONNECTED');
      } else if (response.wa.waStatus === 'DISCONNECTED') {
        console.log(`⚠️ WhatsApp DISCONNECTED (retry #${response.wa.retryCount})`);
        if (response.wa.nextRetryAt) {
          console.log(`   Next retry: ${response.wa.nextRetryAt}`);
        }
      } else if (response.wa.waStatus === 'NEEDS_PAIRING') {
        console.log('❌ WhatsApp NEEDS_PAIRING (logged out)');
        console.log('   QR code scan required');
      }
    } else {
      console.log('❌ No WA status in response');
      console.log('Response keys:', Object.keys(response));
    }

    console.log('\n========================================');
    console.log('Full response saved to wa-status.json');
    console.log('========================================');

    // Save full response
    const fs = require('fs');
    fs.writeFileSync('wa-status.json', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('401')) {
      console.error('\n⚠️ Authentication failed. Check ADMIN_TOKEN environment variable.');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️ Cannot reach server. Check BASE_URL.');
    }
  }
}

// Run test
testWAStatus().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
