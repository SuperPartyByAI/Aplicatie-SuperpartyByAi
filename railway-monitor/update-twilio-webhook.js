#!/usr/bin/env node
/**
 * Update Twilio webhook with new URL
 */

const https = require('https');

// Secrets MUST come from environment variables; never hardcode.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+12182204425';

const newUrl = process.argv[2];

if (!newUrl) {
  console.error('Usage: node update-twilio-webhook.js <new-url>');
  process.exit(1);
}

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN env vars');
  process.exit(1);
}

const WEBHOOK_URL = `${newUrl}/api/voice/incoming`;

async function updateTwilio() {
  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    // Get phone number SID
    const searchUrl = `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(TWILIO_PHONE_NUMBER)}`;

    const phoneData = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.twilio.com',
          path: searchUrl,
          method: 'GET',
          headers: { Authorization: `Basic ${auth}` },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => resolve(JSON.parse(data)));
        }
      );
      req.on('error', reject);
      req.end();
    });

    const phoneSid = phoneData.incoming_phone_numbers[0].sid;

    // Update webhook
    const updateData = `VoiceUrl=${encodeURIComponent(WEBHOOK_URL)}&VoiceMethod=POST`;
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
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(updateData);
      req.end();
    });

    console.log(`✅ Twilio webhook updated: ${WEBHOOK_URL}`);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

updateTwilio().then(success => {
  process.exit(success ? 0 : 1);
});
