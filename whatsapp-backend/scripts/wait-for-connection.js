// Wait for account to become connected, then proceed with tests
const https = require('https');

const ACCOUNT_ID = 'account_1767011755513';
const API_URL =
  'https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV3/api/whatsapp/accounts';
const MAX_WAIT_MS = 300000; // 5 minutes
const POLL_INTERVAL_MS = 5000; // 5 seconds

console.log(`⏳ Waiting for account ${ACCOUNT_ID} to connect...`);
console.log(`📍 Polling: ${API_URL}`);
console.log(`⏰ Max wait: ${MAX_WAIT_MS / 1000}s`);
console.log('');

const startTime = Date.now();

function checkConnection() {
  https
    .get(API_URL, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const account = response.accounts.find(a => a.id === ACCOUNT_ID);

          if (!account) {
            console.error(`❌ Account ${ACCOUNT_ID} not found`);
            process.exit(1);
          }

          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`[${elapsed}s] Status: ${account.status}`);

          if (account.status === 'connected') {
            console.log('');
            console.log(`✅ Account connected after ${elapsed}s`);
            console.log('');
            console.log('Account details:');
            console.log(JSON.stringify(account, null, 2));
            process.exit(0);
          }

          if (Date.now() - startTime > MAX_WAIT_MS) {
            console.error('');
            console.error(`❌ Timeout after ${MAX_WAIT_MS / 1000}s`);
            console.error(`Final status: ${account.status}`);
            process.exit(1);
          }

          setTimeout(checkConnection, POLL_INTERVAL_MS);
        } catch (error) {
          console.error(`❌ Parse error: ${error.message}`);
          process.exit(1);
        }
      });
    })
    .on('error', error => {
      console.error(`❌ Request error: ${error.message}`);
      process.exit(1);
    });
}

checkConnection();
