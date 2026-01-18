/**
 * Regression test for 401/logged_out handling
 * 
 * Tests that:
 * 1. On logged_out/401: no reconnect loop scheduled
 * 2. Auth files are cleared (disk + Firestore backup)
 * 3. Account remains visible with needs_qr status
 * 4. Orphan cleanup is safe (moves, doesn't delete by default)
 */

const fs = require('fs');
const path = require('path');

const SERVER_JS_PATH = path.join(__dirname, '..', 'server.js');

describe('401/logged_out handling', () => {
  let serverCode;

  beforeAll(() => {
    serverCode = fs.readFileSync(SERVER_JS_PATH, 'utf8');
  });

  test('Terminal logout does NOT schedule createConnection()', () => {
    // Find terminal logout block
    const terminalLogoutBlock = serverCode.match(/Terminal logout.*401.*loggedOut.*badSession[\s\S]{0,500}?CRITICAL.*DO NOT schedule createConnection/);
    
    expect(terminalLogoutBlock).toBeTruthy();
    
    const block = terminalLogoutBlock[0];
    
    // Check that NO setTimeout(createConnection) exists after terminal logout
    const hasProblematicTimeout = block.match(/setTimeout\([^)]*createConnection[^)]*,\s*\d+\)/);
    expect(hasProblematicTimeout).toBeFalsy();
    
    // Check that clearAccountSession() is called
    expect(block).toMatch(/clearAccountSession\(accountId\)/);
    
    // Check that status is set to needs_qr
    expect(block).toMatch(/status.*['"]needs_qr['"]/);
  });

  test('clearAccountSession() clears disk + Firestore', () => {
    const clearAccountSessionBlock = serverCode.match(/async function clearAccountSession[\s\S]{0,300}/);
    
    expect(clearAccountSessionBlock).toBeTruthy();
    
    const block = clearAccountSessionBlock[0];
    
    // Check disk cleanup
    expect(block).toMatch(/fs\.rmSync\(sessionPath/);
    
    // Check Firestore backup cleanup
    expect(block).toMatch(/db\.collection\(['"]wa_sessions['"]\)/);
    expect(block).toMatch(/\.delete\(\)/);
  });

  test('Account remains visible in API after 401 (queries Firestore)', () => {
    const accountsEndpoint = serverCode.match(/app\.get\(['"]\/api\/whatsapp\/accounts['"][\s\S]{0,1000}/);
    
    expect(accountsEndpoint).toBeTruthy();
    
    const block = accountsEndpoint[0];
    
    // Check that it queries Firestore for accounts not in memory
    expect(block).toMatch(/db\.collection\(['"]accounts['"]\)\.get\(\)/);
    
    // Check that it includes accounts with needs_qr status
    expect(block).toMatch(/status.*needs_qr|accountIdsInMemory/);
  });

  test('Reason comparison is type-safe (normalizes to number)', () => {
    const closeHandler = serverCode.match(/if \(connection === ['"]close['"][\s\S]{0,200}/);
    
    expect(closeHandler).toBeTruthy();
    
    const block = closeHandler[0];
    
    // Check that reason is normalized (can be string or number)
    expect(block).toMatch(/typeof.*number|parseInt\(rawReason/);
    
    // Check that comparison uses normalized reason
    expect(block).toMatch(/reason !== DisconnectReason\.loggedOut/);
  });

  test('Orphan session cleanup moves (does not delete by default)', () => {
    const orphanCleanup = serverCode.match(/Clean up disk sessions.*NOT in Firestore[\s\S]{0,500}/);
    
    expect(orphanCleanup).toBeTruthy();
    
    const block = orphanCleanup[0];
    
    // Check that it moves to _orphaned folder by default
    expect(block).toMatch(/_orphaned/);
    expect(block).toMatch(/fs\.renameSync\(sessionPath/);
    
    // Check that hard delete requires env var
    expect(block).toMatch(/ORPHAN_SESSION_DELETE.*=== ['"]true['"]/);
  });

  test('Terminal logout accounts skip auto-restore', () => {
    const restoreAccounts = serverCode.match(/restoreAccountsFromFirestore[\s\S]{0,1000}?Skip terminal logout/);
    
    expect(restoreAccounts).toBeTruthy();
    
    const block = restoreAccounts[0];
    
    // Check that needs_qr/logged_out accounts are skipped
    expect(block).toMatch(/terminalStatuses.*needs_qr.*logged_out/);
    expect(block).toMatch(/requiresQR.*true/);
  });
});

describe('Account visibility after 401', () => {
  test('Accounts endpoint includes Firestore accounts not in memory', () => {
    const accountsEndpoint = serverCode.match(/app\.get\(['"]\/api\/whatsapp\/accounts['"][\s\S]{0,1500}/);
    
    expect(accountsEndpoint).toBeTruthy();
    
    const block = accountsEndpoint[0];
    
    // Must query Firestore
    expect(block).toMatch(/db\.collection\(['"]accounts['"]\)\.get\(\)/);
    
    // Must add accounts from Firestore that are not in memory
    expect(block).toMatch(/accountIdsInMemory\.has\(accountId\)|if \(!accountIdsInMemory/);
  });
});
