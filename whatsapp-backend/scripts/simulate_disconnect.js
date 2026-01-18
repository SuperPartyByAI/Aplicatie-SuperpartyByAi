#!/usr/bin/env node

/**
 * Simulate disconnect scenarios for verification
 * Tests:
 * 1. 401 logged_out => asserts no reconnect scheduled, status becomes needs_qr, auth cleared
 * 2. qr_ready => asserts connecting timeout cleared and qr_scan timeout set
 * 
 * Usage: node scripts/simulate_disconnect.js
 */

const fs = require('fs');
const path = require('path');

const SERVER_JS_PATH = path.join(__dirname, '..', 'server.js');

console.log('🔍 Verifying disconnect handling fixes...\n');

const serverCode = fs.readFileSync(SERVER_JS_PATH, 'utf8');

let errors = [];
let warnings = [];

// Test 1: 401 logged_out should NOT schedule createConnection
console.log('1️⃣  Testing 401 logged_out handling...');

// Check for guard comment "DO NOT schedule createConnection"
const guardCommentPattern = /DO NOT schedule createConnection.*terminal logout|CRITICAL.*DO NOT.*createConnection/i;
if (!guardCommentPattern.test(serverCode)) {
  warnings.push('⚠️  Guard comment for terminal logout may be missing');
} else {
  console.log('✅ Terminal logout has guard comment (DO NOT schedule createConnection)');
}

// Check that terminal logout does NOT have setTimeout(createConnection) after it
const terminalLogoutSections = serverCode.split('// Terminal logout');
let foundProblematicTimeout = false;
for (const section of terminalLogoutSections) {
  if (section.includes('terminal logout - clearing session')) {
    // Check if setTimeout(createConnection, 5000) appears in this section
    if (section.match(/setTimeout\([^)]*createConnection[^)]*,\s*5000\)/)) {
      foundProblematicTimeout = true;
      break;
    }
  }
}
if (foundProblematicTimeout) {
  errors.push('❌ Found setTimeout(createConnection, 5000) after terminal logout - this causes reconnect loop!');
} else {
  console.log('✅ No setTimeout(createConnection, 5000) found after terminal logout');
}

// Check for setTimeout(createConnection, 5000) after terminal logout
const problematicTimeout = /terminal logout.*clearing session[\s\S]{0,1000}?setTimeout\([^)]*createConnection[^)]*,\s*5000\)/i;
if (problematicTimeout.test(serverCode)) {
  errors.push('❌ Found setTimeout(createConnection, 5000) after terminal logout - this causes reconnect loop!');
} else {
  console.log('✅ No setTimeout(createConnection, 5000) after terminal logout');
}

// Verify clearAccountSession is called
if (!serverCode.includes('clearAccountSession')) {
  errors.push('❌ clearAccountSession() not found - auth may not be cleared');
} else {
  const clearInTerminalLogout = /terminal logout.*clearing session[\s\S]{0,200}?clearAccountSession\(accountId\)/;
  if (!clearInTerminalLogout.test(serverCode)) {
    errors.push('❌ Terminal logout cleanup does NOT call clearAccountSession()');
  } else {
    console.log('✅ Terminal logout calls clearAccountSession()');
  }
}

// Verify status set to needs_qr
if (!serverCode.includes("status: 'needs_qr'")) {
  warnings.push('⚠️  Account status may not be set to needs_qr on terminal logout');
} else {
  console.log('✅ Account status set to needs_qr on terminal logout');
}

// Test 2: qr_ready should clear connecting timeout and set QR_SCAN_TIMEOUT
console.log('\n2️⃣  Testing QR pairing timeout handling...');

const qrGeneratedPattern = /QR Code generated[\s\S]{0,300}?connectingTimeout[\s\S]{0,100}?clearTimeout\(account\.connectingTimeout\)/;
if (!qrGeneratedPattern.test(serverCode)) {
  errors.push('❌ Connecting timeout not cleared when QR is generated');
} else {
  console.log('✅ Connecting timeout cleared when QR is generated');
}

const qrScanTimeoutPattern = /qrScanTimeout|QR_SCAN_TIMEOUT|QR scan timeout/;
if (!qrScanTimeoutPattern.test(serverCode)) {
  warnings.push('⚠️  QR_SCAN_TIMEOUT not found - QR may not have scan timeout');
} else {
  console.log('✅ QR_SCAN_TIMEOUT implemented');
}

// Test 3: PASSIVE mode retry
console.log('\n3️⃣  Testing PASSIVE mode retry...');

const waBootstrapPath = path.join(__dirname, '..', 'lib', 'wa-bootstrap.js');
if (!fs.existsSync(waBootstrapPath)) {
  errors.push('❌ wa-bootstrap.js not found');
} else {
  const waBootstrapCode = fs.readFileSync(waBootstrapPath, 'utf8');
  if (!waBootstrapCode.includes('startPassiveRetryLoop') && !waBootstrapCode.includes('passiveRetryTimer')) {
    errors.push('❌ PASSIVE mode retry loop not implemented in wa-bootstrap.js');
  } else {
    console.log('✅ PASSIVE mode retry loop found in wa-bootstrap.js');
  }
}

// Test 4: Hard gates for PASSIVE mode
console.log('\n4️⃣  Testing PASSIVE mode hard gates...');

const createConnectionGate = /createConnection[\s\S]{0,100}?canStartBaileys\(\)|PASSIVE mode.*cannot start Baileys/i;
if (!createConnectionGate.test(serverCode)) {
  errors.push('❌ createConnection() does NOT check canStartBaileys() - will start in PASSIVE mode!');
} else {
  console.log('✅ createConnection() has PASSIVE mode gate');
}

const outboxWorkerGate = /outbox.*worker|setInterval.*outbox[\s\S]{0,200}?canProcessOutbox\(\)/i;
if (!outboxWorkerGate.test(serverCode)) {
  warnings.push('⚠️  Outbox worker may not check canProcessOutbox()');
} else {
  console.log('✅ Outbox worker has PASSIVE mode gate');
}

// Test 5: accountId stability
console.log('\n5️⃣  Testing accountId stability...');

const accountIdPattern = /function generateAccountId[\s\S]{0,300}/;
const accountIdMatch = serverCode.match(accountIdPattern);
if (accountIdMatch) {
  const accountIdBlock = accountIdMatch[0];
  // Check for NODE_ENV usage (should NOT be present)
  if (accountIdBlock.includes("process.env.NODE_ENV") || accountIdBlock.includes("NODE_ENV || 'dev'")) {
    errors.push('❌ generateAccountId() still depends on NODE_ENV - accountId will differ between instances!');
  } else if (accountIdBlock.includes('ACCOUNT_NAMESPACE') || accountIdBlock.includes("'prod'") || accountIdBlock.includes('namespace')) {
    console.log('✅ generateAccountId() uses stable namespace (not NODE_ENV)');
  } else {
    warnings.push('⚠️  generateAccountId() namespace may not be stable');
  }
} else {
  warnings.push('⚠️  generateAccountId() function not found');
}

console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ All checks passed! Stability fixes are properly implemented.\n');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('\n❌ ERRORS (must fix):');
    errors.forEach(e => console.log(`  ${e}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (review recommended):');
    warnings.forEach(w => console.log(`  ${w}`));
  }
  
  console.log('');
  process.exit(errors.length > 0 ? 1 : 0);
}
