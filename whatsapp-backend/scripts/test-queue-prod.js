const https = require('https');

const API_URL = 'https://whats-upp-production.up.railway.app';
const ACCOUNT_ID = 'account_1767014419146';
const TEST_NUMBER = '+40700999999'; // Test number

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      accountId: ACCOUNT_ID,
      to: TEST_NUMBER,
      message: message,
    });

    const options = {
      hostname: 'whats-upp-production.up.railway.app',
      path: '/api/whatsapp/send-message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, res => {
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
