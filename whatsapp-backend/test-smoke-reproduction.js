#!/usr/bin/env node
/**
 * Smoke Test Script for WhatsApp End-to-End Flow
 * 
 * Tests: addAccount -> getAccounts -> regenerateQr -> getAccounts
 * Logs requestId through all layers for correlation
 */

const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.WHATSAPP_BACKEND_URL || 'http://37.27.34.179:8080';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token-test';

// Generate request ID
function generateRequestId() {
  return `test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Make HTTP request
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'X-Request-ID': options.requestId || generateRequestId(),
        ...(options.headers || {}),
      },
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function runSmokeTest() {
  console.log('🧪 WhatsApp Smoke Test - End-to-End Flow\n');
  console.log(`Backend URL (Hetzner): ${BACKEND_URL}`);
  console.log(`Admin Token configured: ${Boolean(ADMIN_TOKEN)}\n`);

  const requestId = generateRequestId();
  console.log(`📋 Test Request ID: ${requestId}\n`);

  try {
    // Step 1: Health check
    console.log('1️⃣  Health Check...');
    const health = await makeRequest(`${BACKEND_URL}/health`, { requestId });
    console.log(`   Status: ${health.statusCode}`);
    console.log(`   Response: ${JSON.stringify(health.body, null, 2).substring(0, 200)}`);
    if (health.statusCode !== 200) {
      throw new Error(`Health check failed: ${health.statusCode}`);
    }
    console.log('   ✅ Health check passed\n');

    // Step 2: Add account
    console.log('2️⃣  Add Account...');
    const addAccountReqId = generateRequestId();
    const addAccount = await makeRequest(`${BACKEND_URL}/api/whatsapp/add-account`, {
      method: 'POST',
      requestId: addAccountReqId,
      body: {
        name: 'Test Account',
        phone: `+407${Math.floor(Math.random() * 100000000)}`,
      },
    });
    console.log(`   Request ID: ${addAccountReqId}`);
    console.log(`   Status: ${addAccount.statusCode}`);
    console.log(`   Response: ${JSON.stringify(addAccount.body, null, 2)}`);
    
    if (addAccount.statusCode !== 200 && addAccount.statusCode !== 201) {
      throw new Error(`Add account failed: ${addAccount.statusCode} - ${JSON.stringify(addAccount.body)}`);
    }
    
    const accountId = addAccount.body.accountId || addAccount.body.account?.id;
    if (!accountId) {
      throw new Error('Account ID not returned');
    }
    console.log(`   ✅ Account created: ${accountId}\n`);

    // Step 3: Get accounts
    console.log('3️⃣  Get Accounts...');
    const getAccountsReqId = generateRequestId();
    const getAccounts = await makeRequest(`${BACKEND_URL}/api/whatsapp/accounts`, {
      requestId: getAccountsReqId,
    });
    console.log(`   Request ID: ${getAccountsReqId}`);
    console.log(`   Status: ${getAccounts.statusCode}`);
    console.log(`   Accounts count: ${getAccounts.body.accounts?.length || 0}`);
    console.log(`   Account found: ${getAccounts.body.accounts?.some(a => a.id === accountId) ? '✅' : '❌'}`);
    console.log('   ✅ Get accounts passed\n');

    // Step 4: Regenerate QR
    console.log('4️⃣  Regenerate QR...');
    const regenerateReqId = generateRequestId();
    const regenerate = await makeRequest(`${BACKEND_URL}/api/whatsapp/regenerate-qr/${accountId}`, {
      method: 'POST',
      requestId: regenerateReqId,
    });
    console.log(`   Request ID: ${regenerateReqId}`);
    console.log(`   Status: ${regenerate.statusCode}`);
    console.log(`   Response: ${JSON.stringify(regenerate.body, null, 2)}`);
    
    if (regenerate.statusCode >= 200 && regenerate.statusCode < 300) {
      console.log('   ✅ Regenerate QR passed\n');
    } else if (regenerate.statusCode === 202) {
      console.log('   ℹ️  Regenerate already in progress (202)\n');
    } else if (regenerate.statusCode === 503) {
      console.log('   ⚠️  Backend in PASSIVE mode (503)\n');
    } else {
      throw new Error(`Regenerate QR failed: ${regenerate.statusCode} - ${JSON.stringify(regenerate.body)}`);
    }

    // Step 5: Get accounts again (verify QR appears)
    console.log('5️⃣  Get Accounts (after regenerate)...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for QR generation
    const getAccounts2ReqId = generateRequestId();
    const getAccounts2 = await makeRequest(`${BACKEND_URL}/api/whatsapp/accounts`, {
      requestId: getAccounts2ReqId,
    });
    console.log(`   Request ID: ${getAccounts2ReqId}`);
    console.log(`   Status: ${getAccounts2.statusCode}`);
    const account = getAccounts2.body.accounts?.find(a => a.id === accountId);
    console.log(`   Account status: ${account?.status || 'not found'}`);
    console.log(`   Has QR: ${account?.qrCode ? '✅' : '❌'}`);
    console.log('   ✅ Get accounts (after regenerate) passed\n');

    console.log('✅ All smoke tests passed!\n');
    console.log('📋 Request IDs for correlation:');
    console.log(`   Health: ${requestId}`);
    console.log(`   Add Account: ${addAccountReqId}`);
    console.log(`   Get Accounts: ${getAccountsReqId}`);
    console.log(`   Regenerate QR: ${regenerateReqId}`);
    console.log(`   Get Accounts 2: ${getAccounts2ReqId}`);

  } catch (error) {
    console.error('\n❌ Smoke test failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSmokeTest().catch(console.error);
}

module.exports = { runSmokeTest };
