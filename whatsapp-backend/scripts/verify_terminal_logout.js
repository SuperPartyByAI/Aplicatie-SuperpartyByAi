#!/usr/bin/env node

/**
 * Verification script for terminal logout (401) fix
 * 
 * This script verifies that:
 * 1. clearAccountSession() clears both disk and Firestore sessions
 * 2. Terminal logout (401) does NOT schedule createConnection()
 * 3. Regenerate QR endpoint clears session deterministically
 * 
 * Usage: node scripts/verify_terminal_logout.js
 */

const fs = require('fs');
const path = require('path');

const SERVER_JS_PATH = path.join(__dirname, '..', 'server.js');

console.log('🔍 Verifying terminal logout (401) fix...\n');

// Read server.js
const serverCode = fs.readFileSync(SERVER_JS_PATH, 'utf8');

let errors = [];
let warnings = [];

// 1. Check clearAccountSession() exists
if (!serverCode.includes('function clearAccountSession')) {
  errors.push('❌ clearAccountSession() function not found');
} else {
  console.log('✅ clearAccountSession() function found');
  
  // Check it clears disk session
  if (!serverCode.includes('fs.rmSync(sessionPath')) {
    warnings.push('⚠️  clearAccountSession() may not clear disk session (fs.rmSync not found)');
  } else {
    console.log('✅ clearAccountSession() clears disk session (fs.rmSync found)');
  }
  
  // Check it clears Firestore backup
  if (!serverCode.includes("db.collection('wa_sessions')")) {
    warnings.push('⚠️  clearAccountSession() may not clear Firestore backup (wa_sessions delete not found)');
  } else {
    console.log('✅ clearAccountSession() clears Firestore backup (wa_sessions delete found)');
  }
}

// 2. Check isTerminalLogout() helper exists
if (!serverCode.includes('function isTerminalLogout')) {
  warnings.push('⚠️  isTerminalLogout() helper not found (may use inline checks)');
} else {
  console.log('✅ isTerminalLogout() helper found');
}

// 3. Check terminal logout does NOT schedule createConnection()
// Look for the guard comment
const guardCommentPattern = /DO NOT schedule createConnection.*terminal logout|CRITICAL.*DO NOT.*createConnection/i;
if (!guardCommentPattern.test(serverCode)) {
  warnings.push('⚠️  Guard comment for terminal logout may be missing');
} else {
  console.log('✅ Terminal logout has guard comment (DO NOT schedule createConnection)');
}

// Check for the problematic setTimeout pattern after "Explicit cleanup.*terminal logout"
// This pattern should NOT exist after terminal logout cleanup
const terminalLogoutBlocks = serverCode.match(/Explicit cleanup.*terminal logout[\s\S]{0,200}/g) || [];
let foundProblematicTimeout = false;
for (const block of terminalLogoutBlocks) {
  // Check if setTimeout(createConnection, 5000) appears after "terminal logout - clearing session"
  if (block.includes('terminal logout - clearing session') && block.match(/setTimeout\([^)]*createConnection[^)]*,\s*5000\)/)) {
    foundProblematicTimeout = true;
    break;
  }
}
if (foundProblematicTimeout) {
  errors.push('❌ Found setTimeout(createConnection, 5000) after terminal logout - this causes reconnect loop!');
} else {
  console.log('✅ No setTimeout(createConnection) found after terminal logout');
}

// Verify clearAccountSession is called in terminal logout path
if (!serverCode.includes('terminal logout - clearing session')) {
  warnings.push('⚠️  Terminal logout cleanup message may be missing');
} else {
  // Check if clearAccountSession appears in the same code block as "terminal logout - clearing session"
  const terminalLogoutSections = serverCode.split('// Terminal logout');
  let foundClearInTerminalLogout = false;
  for (const section of terminalLogoutSections) {
    if (section.includes('terminal logout - clearing session') && section.includes('clearAccountSession(accountId)')) {
      foundClearInTerminalLogout = true;
      break;
    }
  }
  
  if (!foundClearInTerminalLogout && !serverCode.includes('clearAccountSession')) {
    errors.push('❌ Terminal logout cleanup does NOT call clearAccountSession()');
  } else if (!foundClearInTerminalLogout) {
    // Check if clearAccountSession exists but might be in a different block
    const blocks = serverCode.match(/Explicit cleanup.*terminal logout[\s\S]{0,500}/g) || [];
    let foundInAnyBlock = false;
    for (const block of blocks) {
      if (block.includes('clearAccountSession')) {
        foundInAnyBlock = true;
        break;
      }
    }
    if (foundInAnyBlock) {
      console.log('✅ Terminal logout cleanup calls clearAccountSession()');
    } else {
      errors.push('❌ Terminal logout cleanup does NOT call clearAccountSession()');
    }
  } else {
    console.log('✅ Terminal logout cleanup calls clearAccountSession()');
  }
}

// 4. Check regenerate-qr endpoint clears session
// Look for the actual endpoint implementation
const regenerateQrStartIndex = serverCode.indexOf("app.post('/api/whatsapp/regenerate-qr/:accountId'");
if (regenerateQrStartIndex === -1) {
  errors.push('❌ regenerate-qr endpoint implementation not found');
} else {
  // Find the matching closing brace for the async function
  let braceCount = 0;
  let inFunction = false;
  let regenerateQrEndIndex = regenerateQrStartIndex;
  
  for (let i = regenerateQrStartIndex; i < Math.min(regenerateQrStartIndex + 3000, serverCode.length); i++) {
    if (serverCode[i] === '{') {
      braceCount++;
      inFunction = true;
    } else if (serverCode[i] === '}') {
      braceCount--;
      if (inFunction && braceCount === 0) {
        regenerateQrEndIndex = i + 1;
        break;
      }
    }
  }
  
  const regenerateQrBlock = serverCode.substring(regenerateQrStartIndex, regenerateQrEndIndex);
  if (regenerateQrBlock.includes('clearAccountSession')) {
    console.log('✅ regenerate-qr endpoint calls clearAccountSession()');
  } else {
    errors.push('❌ regenerate-qr endpoint does NOT call clearAccountSession()');
    console.log('   Debug: Endpoint block length:', regenerateQrBlock.length);
    console.log('   Debug: Contains "Clear session":', regenerateQrBlock.includes('Clear session'));
  }
}

// 5. Check createConnection guard for needs_qr/logged_out
const createConnectionMatch = serverCode.match(/async function createConnection[\s\S]{0,500}/);
if (createConnectionMatch) {
  const createConnectionBlock = createConnectionMatch[0];
  if (createConnectionBlock.includes('terminalStatuses') || 
      createConnectionBlock.includes('needs_qr') && createConnectionBlock.includes('logged_out') ||
      createConnectionBlock.includes('requiresQR') && createConnectionBlock.includes('true')) {
    console.log('✅ createConnection() has guard for terminal status accounts');
  } else {
    warnings.push('⚠️  createConnection() may not have guard for needs_qr/logged_out accounts');
  }
} else {
  warnings.push('⚠️  Could not find createConnection function');
}

// 6. Check account status is set correctly on terminal logout
if (!serverCode.includes("status: 'needs_qr'")) {
  warnings.push('⚠️  Account status may not be set to needs_qr on terminal logout');
} else {
  console.log('✅ Account status set to needs_qr on terminal logout');
}

console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ All checks passed! Terminal logout fix is properly implemented.\n');
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
