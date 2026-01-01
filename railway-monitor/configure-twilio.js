/**
 * v7.0 - Configure Twilio Webhook Automatically
 */

const https = require('https');

const TWILIO_ACCOUNT_SID = 'AC17c88873d670aab4aa4a50fae230d2df';
const TWILIO_AUTH_TOKEN = '5c6670d39a1dbf46d47ecdaa244b91d9';
const TWILIO_PHONE_NUMBER = '+12182204425';
const WEBHOOK_URL = 'https://web-production-f0714.up.railway.app/api/voice/incoming';

async function configureTwilio() {
  console.log('');
  console.log('📞 Configurez Twilio webhook...');
  console.log('');

  try {
    // Get phone number SID
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    // Search for phone number
    const searchUrl = `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(TWILIO_PHONE_NUMBER)}`;

    const phoneData = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.twilio.com',
          path: searchUrl,
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });

    if (!phoneData.incoming_phone_numbers || phoneData.incoming_phone_numbers.length === 0) {
      console.log('❌ Phone number not found');
      return false;
    }

    const phoneSid = phoneData.incoming_phone_numbers[0].sid;
    console.log(`✅ Found phone number SID: ${phoneSid}`);

    // Update webhook
    const updateData = `VoiceUrl=${encodeURIComponent(WEBHOOK_URL)}&VoiceMethod=POST&StatusCallback=${encodeURIComponent(WEBHOOK_URL.replace('/incoming', '/status'))}&StatusCallbackMethod=POST`;

    const updateUrl = `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${phoneSid}.json`;

    await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.twilio.com',
          path: updateUrl,
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': updateData.length,
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(updateData);
      req.end();
    });

    console.log('✅ Twilio webhook configurat!');
    console.log('');
    console.log(`   Voice URL: ${WEBHOOK_URL}`);
    console.log(`   Status URL: ${WEBHOOK_URL.replace('/incoming', '/status')}`);
    console.log('');

    return true;
  } catch (error) {
    console.error('❌ Eroare Twilio:', error.message);
    return false;
  }
}

if (require.main === module) {
  configureTwilio().then(success => {
    if (success) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ TOTUL CONFIGURAT!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('Sună acum la: +1 (218) 220-4425');
      console.log('Voce: Kasya (Coqui XTTS)');
      console.log('');
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = { configureTwilio };
