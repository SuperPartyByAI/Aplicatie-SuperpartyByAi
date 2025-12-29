#!/usr/bin/env node

const https = require('https');
const http = require('http');

const BASE_URL = 'https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV3';
const ADMIN_PHONE = '+40737571397';
const CID = `CID-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

let testResults = [];
let exitCode = 0;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
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

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function pass(test, message) {
  testResults.push({ test, status: 'PASS', message });
  log(`✅ PASS: ${test} - ${message}`, 'PASS');
}

function fail(test, message) {
  testResults.push({ test, status: 'FAIL', message });
  log(`❌ FAIL: ${test} - ${message}`, 'FAIL');
  exitCode = 1;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  log(`Starting E2E tests with CID: ${CID}`, 'START');
  
  try {
    // Test 1: Health check + version
    log('Test 1: Health check and version verification');
    const health = await request(`${BASE_URL}/`);
    if (health.status === 200 && health.data.version === '5.2.0') {
      pass('Health Check', `Version 5.2.0 confirmed`);
    } else {
      fail('Health Check', `Expected version 5.2.0, got ${health.data.version}`);
    }
    
    // Test 2: Get accounts
    log('Test 2: Get WhatsApp accounts');
    const accounts = await request(`${BASE_URL}/api/whatsapp/accounts`);
    if (accounts.status === 200 && accounts.data.success) {
      pass('Get Accounts', `Found ${accounts.data.accounts.length} accounts`);
      
      // Check for existing connected account
      const connected = accounts.data.accounts.find(acc => acc.status === 'connected');
      if (connected) {
        log(`Found connected account: ${connected.id}`, 'INFO');
        
        // Test 3: Send message with existing account
        log('Test 3: Send message to admin phone');
        const message = `TEST BACKEND SEND | ${CID}`;
        const send = await request(`${BASE_URL}/api/whatsapp/send-message`, {
          method: 'POST',
          body: {
            accountId: connected.id,
            to: ADMIN_PHONE,
            message: message
          }
        });
        
        if (send.status === 200 && send.data.success) {
          pass('Send Message', `Message sent with CID: ${CID}`);
        } else {
          fail('Send Message', `Failed: ${send.data.error || 'Unknown error'}`);
        }
        
        // Test 4: Verify message in storage (wait for async save)
        await sleep(2000);
        log('Test 4: Verify message persistence');
        const messages = await request(`${BASE_URL}/api/whatsapp/messages`);
        if (messages.status === 200 && messages.data.success) {
          pass('Get Messages', `Messages endpoint functional`);
        } else {
          fail('Get Messages', `Failed to retrieve messages`);
        }
        
      } else {
        log('No connected account found. Need to add account.', 'WARN');
        
        // Test 3: Add account
        log('Test 3: Add new WhatsApp account');
        const addAccount = await request(`${BASE_URL}/api/whatsapp/add-account`, {
          method: 'POST',
          body: {
            name: 'E2E Test Account',
            phone: ADMIN_PHONE
          }
        });
        
        if (addAccount.status === 200 && addAccount.data.success) {
          pass('Add Account', `Account created: ${addAccount.data.account.id}`);
          const accountId = addAccount.data.account.id;
          
          // Wait for QR/pairing generation
          log('Waiting for QR/pairing code generation...');
          await sleep(10000);
          
          // Check account status
          const checkAccount = await request(`${BASE_URL}/api/whatsapp/accounts`);
          const newAccount = checkAccount.data.accounts.find(acc => acc.id === accountId);
          
          if (newAccount && (newAccount.qrCode || newAccount.pairingCode)) {
            pass('QR/Pairing Generation', `Status: ${newAccount.status}, Has QR: ${!!newAccount.qrCode}, Has Pairing: ${!!newAccount.pairingCode}`);
            
            if (newAccount.pairingCode) {
              log(`⚠️  MANUAL ACTION REQUIRED: Enter pairing code in WhatsApp: ${newAccount.pairingCode}`, 'ACTION');
            } else if (newAccount.qrCode) {
              log(`⚠️  MANUAL ACTION REQUIRED: Scan QR code (data URL available in account)`, 'ACTION');
            }
            
            fail('Connection', 'Manual pairing required - cannot complete automated test');
          } else {
            fail('QR/Pairing Generation', `Account status: ${newAccount?.status}, no QR/pairing available`);
          }
        } else {
          fail('Add Account', `Failed: ${addAccount.data.error || 'Unknown error'}`);
        }
      }
    } else {
      fail('Get Accounts', `Status: ${accounts.status}, Success: ${accounts.data.success}`);
    }
    
    // Test 5: Health endpoint
    log('Test 5: Health endpoint');
    const healthCheck = await request(`${BASE_URL}/health`);
    if (healthCheck.status === 200 && healthCheck.data.status === 'healthy') {
      pass('Health Endpoint', 'Healthy');
    } else {
      fail('Health Endpoint', `Status: ${healthCheck.status}`);
    }
    
  } catch (error) {
    fail('Test Execution', `Error: ${error.message}`);
  }
  
  // Summary
  log('', 'SUMMARY');
  log('='.repeat(60), 'SUMMARY');
  log(`CID: ${CID}`, 'SUMMARY');
  log(`Total tests: ${testResults.length}`, 'SUMMARY');
  log(`Passed: ${testResults.filter(t => t.status === 'PASS').length}`, 'SUMMARY');
  log(`Failed: ${testResults.filter(t => t.status === 'FAIL').length}`, 'SUMMARY');
  log('='.repeat(60), 'SUMMARY');
  
  testResults.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    log(`${icon} ${result.test}: ${result.message}`, 'SUMMARY');
  });
  
  process.exit(exitCode);
}

runTests();
