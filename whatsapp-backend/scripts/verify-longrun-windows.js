#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== VERIFY LONG-RUN WINDOWS ===\n');

const artifactsDir = path.join(__dirname, '../../artifacts');
const windows = ['7D', '30D', '90D', '180D'];

let allPass = true;

for (const window of windows) {
  const filename = `LONGRUN-${window}.md`;
  const filepath = path.join(artifactsDir, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`❌ ${window}: Report missing`);
    allPass = false;
    continue;
  }
  
  const content = fs.readFileSync(filepath, 'utf8');
  
  if (content.includes('INSUFFICIENT_DATA')) {
    console.log(`⚠️  ${window}: INSUFFICIENT_DATA (expected for new deployment)`);
    // Not a failure - just insufficient time passed
  } else if (content.includes('SLO Verdict: PASS')) {
    console.log(`✅ ${window}: PASS`);
  } else if (content.includes('SLO Verdict: FAIL')) {
    console.log(`❌ ${window}: FAIL`);
    allPass = false;
  } else {
    console.log(`❌ ${window}: Unknown status`);
    allPass = false;
  }
}

console.log('\n=== SUMMARY ===');
if (allPass) {
  console.log('✅ All windows verified (PASS or INSUFFICIENT_DATA)');
  process.exit(0);
} else {
  console.log('❌ Some windows FAIL');
  process.exit(1);
}
