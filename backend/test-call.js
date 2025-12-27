/**
 * Test script for incoming call flow
 * Simulates Twilio webhook call
 */

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function testIncomingCall() {
  console.log('🧪 Testing incoming call flow...\n');

  // Simulate Twilio incoming call webhook
  const callData = {
    CallSid: 'CA' + Math.random().toString(36).substring(2, 15),
    From: '+40737571397',
    To: '+40123456789',
    CallStatus: 'ringing',
    Direction: 'inbound'
  };

  console.log('📞 Simulating incoming call:');
  console.log(JSON.stringify(callData, null, 2));
  console.log('');

  try {
    // Send webhook to backend
    const response = await axios.post(`${BACKEND_URL}/api/voice/incoming`, callData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('✅ Webhook response received:');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers['content-type']);
    console.log('');
    console.log('TwiML Response:');
    console.log(response.data);
    console.log('');

    // Check active calls
    const activeCallsResponse = await axios.get(`${BACKEND_URL}/api/voice/calls`);
    console.log('📊 Active calls:', activeCallsResponse.data.calls.length);
    console.log(JSON.stringify(activeCallsResponse.data.calls, null, 2));
    console.log('');

    console.log('✅ Test completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check frontend dashboard for incoming call notification');
    console.log('2. Answer or reject the call from UI');
    console.log('3. Check Firestore for call record');

  } catch (error) {
    console.error('❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

// Run test
testIncomingCall();
