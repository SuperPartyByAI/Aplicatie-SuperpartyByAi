/**
 * Test server health - no token needed
 */

const https = require('https');

const BASE_URL = process.env.BAILEYS_BASE_URL || 'http://37.27.34.179:8080';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
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

    req.on('error', reject);
    req.end();
  });
}

async function testHealth() {
  console.log('========================================');
  console.log('SERVER HEALTH TEST');
  console.log('========================================');
  console.log(`URL: ${BASE_URL}/health`);
  console.log('');

  try {
    const health = await makeRequest('/health');

    console.log('✅ Server is UP\n');
    console.log('Status:', health.status);
    console.log('Version:', health.version);
    console.log('Commit:', health.commit);
    console.log('Uptime:', health.uptime, 'seconds');
    console.log('Firestore:', health.firestore);
    console.log('');
    console.log('Accounts:');
    console.log('  Total:', health.accounts.total);
    console.log('  Connected:', health.accounts.connected);
    console.log('  Needs QR:', health.accounts.needs_qr);
    console.log('');

    if (health.commit === 'd521670e') {
      console.log('✅ Latest code deployed (Phase 10 complete)');
    } else {
      console.log('⚠️ Commit mismatch - may need redeploy');
    }

    console.log('\n========================================');
    console.log('Next step: Test WA status with admin token');
    console.log('========================================');
    console.log('');
    console.log('Get your ADMIN_TOKEN from your backend config (e.g. Hetzner env vars):');
    console.log('1. Open your backend project / host');
    console.log('2. Check environment variables');
    console.log('3. Copy ADMIN_TOKEN value');
    console.log('');
    console.log('Then run:');
    console.log('  test-wa-status.bat YOUR_TOKEN_HERE');
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️ Cannot reach server. Check your internet connection.');
    }
  }
}

testHealth().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
