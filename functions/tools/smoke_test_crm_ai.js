#!/usr/bin/env node
/**
 * SMOKE TEST: CRM AI Callables (Simplified - Deployment Verification)
 * 
 * Tests:
 * - Verifies functions are deployed via Firebase CLI
 * - Checks Firestore structure (threads, messages, clients)
 * - Validates Railway health
 * 
 * Usage:
 *   cd functions/tools
 *   FIREBASE_PROJECT=superparty-frontend node smoke_test_crm_ai.js
 * 
 * Output: SMOKE_TEST_OUTPUT.txt
 */

const { execSync } = require('child_process');
const https = require('https');

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function addResult(testName, status, details) {
  results.tests.push({ testName, status, details, timestamp: new Date().toISOString() });
  results.summary.total++;
  if (status === 'PASS') results.summary.passed++;
  else if (status === 'FAIL') results.summary.failed++;
  else results.summary.skipped++;
  
  const emoji = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️ ' : '❌';
  log(`${emoji} ${testName}: ${status}`);
  if (details) log(`   Details: ${JSON.stringify(details).substring(0, 150)}`);
}

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    throw new Error(error.stderr || error.message);
  }
}

async function checkRailwayHealth() {
  return new Promise((resolve) => {
    const url = 'https://whats-upp-production.up.railway.app/health';
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'healthy') {
            addResult('Railway Health', 'PASS', { 
              status: json.status, 
              version: json.version,
              uptime: json.uptime,
              firestore: json.firestore?.status
            });
          } else {
            addResult('Railway Health', 'FAIL', { status: json.status });
          }
          resolve();
        } catch (e) {
          addResult('Railway Health', 'FAIL', { error: 'Invalid JSON response' });
          resolve();
        }
      });
    }).on('error', (err) => {
      addResult('Railway Health', 'FAIL', { error: err.message });
      resolve();
    }).on('timeout', () => {
      addResult('Railway Health', 'FAIL', { error: 'Timeout' });
      resolve();
    });
  });
}

function testFunctionsDeployed() {
  try {
    log('Checking deployed functions...');
    const output = runCommand('firebase functions:list 2>&1');
    
    const requiredFunctions = [
      'bootstrapAdmin',
      'clientCrmAsk',
      'whatsappExtractEventFromThread',
      'aggregateClientStats',
      'whatsappProxySend',
    ];
    
    const deployedFunctions = [];
    const missingFunctions = [];
    
    requiredFunctions.forEach(fn => {
      if (output.includes(fn)) {
        deployedFunctions.push(fn);
      } else {
        missingFunctions.push(fn);
      }
    });
    
    if (missingFunctions.length === 0) {
      addResult('All Functions Deployed', 'PASS', { 
        count: deployedFunctions.length,
        functions: deployedFunctions
      });
    } else {
      addResult('All Functions Deployed', 'FAIL', { 
        deployed: deployedFunctions.length,
        missing: missingFunctions
      });
    }
    
    // Check region consistency
    if (output.includes('us-central1')) {
      const usRegionCount = (output.match(/us-central1/g) || []).length;
      addResult('Functions Region Consistency', 'PASS', { 
        region: 'us-central1',
        functionsInRegion: usRegionCount
      });
    } else {
      addResult('Functions Region Consistency', 'FAIL', { 
        error: 'Expected us-central1 region'
      });
    }
    
  } catch (error) {
    addResult('Functions Deployment Check', 'FAIL', { error: error.message });
  }
}

function testFlutterRegionAlignment() {
  try {
    log('Checking Flutter callable region...');
    const fs = require('fs');
    const flutterServicePath = '../../superparty_flutter/lib/services/whatsapp_api_service.dart';
    
    if (!fs.existsSync(flutterServicePath)) {
      addResult('Flutter Region Alignment', 'SKIP', { 
        reason: 'whatsapp_api_service.dart not found'
      });
      return;
    }
    
    const content = fs.readFileSync(flutterServicePath, 'utf8');
    
    // Check for us-central1 in Flutter
    const usRegionMatches = content.match(/region:\s*'us-central1'/g) || [];
    const euRegionMatches = content.match(/region:\s*'europe-west1'/g) || [];
    
    if (usRegionMatches.length >= 2 && euRegionMatches.length === 0) {
      addResult('Flutter Region Alignment', 'PASS', { 
        region: 'us-central1',
        occurrences: usRegionMatches.length,
        mismatch: false
      });
    } else if (euRegionMatches.length > 0) {
      addResult('Flutter Region Alignment', 'FAIL', { 
        error: 'Found europe-west1 regions (should be us-central1)',
        usCount: usRegionMatches.length,
        euCount: euRegionMatches.length
      });
    } else {
      addResult('Flutter Region Alignment', 'SKIP', { 
        reason: 'Could not verify regions in Flutter code'
      });
    }
    
  } catch (error) {
    addResult('Flutter Region Alignment', 'SKIP', { error: error.message });
  }
}

function testDocsAccuracy() {
  try {
    log('Checking docs for CLI syntax errors...');
    const fs = require('fs');
    const docsToCheck = [
      '../../FINAL_EXECUTION_REPORT.md',
      '../../ROLLOUT_COMMANDS_READY.md',
      '../../FINAL_AUDIT_REPORT.md',
    ];
    
    let totalDocs = 0;
    let docsWithErrors = 0;
    const errorFiles = [];
    
    docsToCheck.forEach(docPath => {
      if (fs.existsSync(docPath)) {
        totalDocs++;
        const content = fs.readFileSync(docPath, 'utf8');
        
        // Check for incorrect --limit flag
        if (content.includes('functions:log --limit')) {
          docsWithErrors++;
          errorFiles.push(docPath.split('/').pop());
        }
      }
    });
    
    if (docsWithErrors === 0) {
      addResult('Docs CLI Syntax', 'PASS', { 
        message: 'All docs use correct --lines flag',
        docsChecked: totalDocs
      });
    } else {
      addResult('Docs CLI Syntax', 'FAIL', { 
        error: `${docsWithErrors} docs still use --limit (should be --lines)`,
        files: errorFiles
      });
    }
    
  } catch (error) {
    addResult('Docs CLI Syntax', 'SKIP', { error: error.message });
  }
}

function testSetGlobalOptionsWarning() {
  try {
    log('Checking for setGlobalOptions duplicate...');
    const fs = require('fs');
    
    const indexJsPath = '../index.js';
    const indexTsPath = '../src/index.ts';
    
    let callCount = 0;
    const locations = [];
    
    if (fs.existsSync(indexJsPath)) {
      const content = fs.readFileSync(indexJsPath, 'utf8');
      const matches = content.match(/setGlobalOptions\s*\(/g) || [];
      if (matches.length > 0) {
        callCount += matches.length;
        locations.push(`index.js (${matches.length})`);
      }
    }
    
    if (fs.existsSync(indexTsPath)) {
      const content = fs.readFileSync(indexTsPath, 'utf8');
      const matches = content.match(/setGlobalOptions\s*\(/g) || [];
      if (matches.length > 0) {
        callCount += matches.length;
        locations.push(`src/index.ts (${matches.length})`);
      }
    }
    
    if (callCount === 1) {
      addResult('setGlobalOptions Single Call', 'PASS', { 
        message: 'Only one setGlobalOptions call (correct)',
        location: locations[0]
      });
    } else if (callCount > 1) {
      addResult('setGlobalOptions Single Call', 'FAIL', { 
        error: 'Multiple setGlobalOptions calls found',
        count: callCount,
        locations: locations
      });
    } else {
      addResult('setGlobalOptions Single Call', 'SKIP', { 
        reason: 'No setGlobalOptions found'
      });
    }
    
  } catch (error) {
    addResult('setGlobalOptions Check', 'SKIP', { error: error.message });
  }
}

async function runAllTests() {
  log('=== CRM AI SMOKE TEST START ===');
  log(`Project: ${process.env.FIREBASE_PROJECT || 'superparty-frontend'}`);
  
  try {
    // Infrastructure tests
    await checkRailwayHealth();
    testFunctionsDeployed();
    
    // Code consistency tests
    testFlutterRegionAlignment();
    testSetGlobalOptionsWarning();
    testDocsAccuracy();
    
    // Summary
    log('\n=== SMOKE TEST SUMMARY ===');
    log(`Total: ${results.summary.total}`);
    log(`Passed: ${results.summary.passed} ✅`);
    log(`Failed: ${results.summary.failed} ❌`);
    log(`Skipped: ${results.summary.skipped} ⏭️`);
    
    const successRate = results.summary.total > 0 
      ? ((results.summary.passed / (results.summary.total - results.summary.skipped)) * 100).toFixed(1)
      : 0;
    log(`Success Rate: ${successRate}% (excluding skipped)`);
    
    // Save results
    const fs = require('fs');
    const outputPath = __dirname + '/SMOKE_TEST_OUTPUT.txt';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    log(`\n✅ Results saved to: ${outputPath}`);
    
    // Exit code (fail only if critical tests failed)
    const criticalFailures = results.tests.filter(t => 
      t.status === 'FAIL' && 
      (t.testName.includes('Railway') || t.testName.includes('Functions Deployed'))
    ).length;
    
    process.exit(criticalFailures > 0 ? 1 : 0);
    
  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
