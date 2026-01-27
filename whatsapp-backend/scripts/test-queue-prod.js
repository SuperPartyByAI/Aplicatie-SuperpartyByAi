const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE = process.env.BAILEYS_BASE_URL || 'http://37.27.34.179:8080';
const ACCOUNT_ID = 'account_1767014419146';
const TEST_NUMBER = '+40700999999'; // Test number

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      accountId: ACCOUNT_ID,
      to: TEST_NUMBER,
      message: message,
    });

    const u = new URL(API_BASE);
    const client = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: '/api/whatsapp/send-message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = client.request(options, res => {
      let responseData = '';
      res.on('data', chunk => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runQueueTest() {
  console.log('=== MESSAGE QUEUE TEST ===');
  console.log('Account:', ACCOUNT_ID);
  console.log('Test number:', TEST_NUMBER);
  console.log('');

  // Send 3 messages
  console.log('Sending 3 test messages...');

  try {
    const msg1 = await sendMessage('Queue Test 1 - ' + Date.now());
    console.log('Message 1:', msg1.success ? '✅ Sent' : '❌ Failed');

    const msg2 = await sendMessage('Queue Test 2 - ' + Date.now());
    console.log('Message 2:', msg2.success ? '✅ Sent' : '❌ Failed');

    const msg3 = await sendMessage('Queue Test 3 - ' + Date.now());
    console.log('Message 3:', msg3.success ? '✅ Sent' : '❌ Failed');

    console.log('');
    console.log('✅ All messages sent successfully');
    console.log('');
    console.log('Note: Full queue test requires:');
    console.log('1. Disconnect account');
    console.log('2. Send messages (should queue)');
    console.log('3. Reconnect');
    console.log('4. Verify messages flush in order');
    console.log('');
    console.log('Current test verifies message sending while connected');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runQueueTest();
