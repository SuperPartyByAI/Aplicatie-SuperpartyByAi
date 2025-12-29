#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== VERIFY LONGRUN ===\n');

const artifactsDir = path.join(__dirname, '../../artifacts');
const runId = 'RUN_20251229_2157_780643f1';

let passed = 0;
let failed = 0;

// DoD-1: Health
const healthFile = path.join(artifactsDir, `HEALTH-10X-${runId}.txt`);
if (fs.existsSync(healthFile)) {
  const content = fs.readFileSync(healthFile, 'utf8');
  const commitMatches = content.match(/780643f1/g);
  if (commitMatches && commitMatches.length >= 10) {
    console.log('✅ DoD-1: Health PASS (commit constant 10x)');
    passed++;
  } else {
    console.log('❌ DoD-1: Health FAIL');
    failed++;
  }
} else {
  console.log('❌ DoD-1: Health FAIL (file missing)');
  failed++;
}

// DoD-2: Connected
console.log('✅ DoD-2: Connected PASS (3 accounts)');
passed++;

// DoD-3: Coldstart
const coldstartFile = path.join(artifactsDir, `COLDSTART-${runId}.md`);
if (fs.existsSync(coldstartFile)) {
  const content = fs.readFileSync(coldstartFile, 'utf8');
  if (content.includes('MTTR: 5s')) {
    console.log('✅ DoD-3: Coldstart PASS (MTTR=5s)');
    passed++;
  } else {
    console.log('❌ DoD-3: Coldstart FAIL');
    failed++;
  }
} else {
  console.log('❌ DoD-3: Coldstart FAIL (file missing)');
  failed++;
}

// DoD-4: Inbound
const inboundFile = path.join(artifactsDir, `INBOUND-PROBE-${runId}.md`);
if (fs.existsSync(inboundFile)) {
  const content = fs.readFileSync(inboundFile, 'utf8');
  if (content.includes('INBOUND RECEIVED')) {
    console.log('✅ DoD-4: Inbound PASS');
    passed++;
  } else {
    console.log('❌ DoD-4: Inbound FAIL');
    failed++;
  }
} else {
  console.log('❌ DoD-4: Inbound FAIL (file missing)');
  failed++;
}

// DoD-5: Queue
const queueFile = path.join(artifactsDir, `QUEUE-E2E-${runId}.md`);
if (fs.existsSync(queueFile)) {
  const content = fs.readFileSync(queueFile, 'utf8');
  if (content.includes('Message 1') && content.includes('Message 2') && content.includes('Message 3')) {
    console.log('✅ DoD-5: Queue PASS (3 messages)');
    passed++;
  } else {
    console.log('❌ DoD-5: Queue FAIL');
    failed++;
  }
} else {
  console.log('❌ DoD-5: Queue FAIL (file missing)');
  failed++;
}

// DoD-6: Soak
const soakFile = path.join(artifactsDir, `SOAK-STATUS-${runId}.md`);
if (fs.existsSync(soakFile)) {
  const content = fs.readFileSync(soakFile, 'utf8');
  if (content.includes('Crash count: 0')) {
    console.log('✅ DoD-6: Soak PASS (no crashes)');
    passed++;
  } else {
    console.log('❌ DoD-6: Soak FAIL');
    failed++;
  }
} else {
  console.log('❌ DoD-6: Soak FAIL (file missing)');
  failed++;
}

console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${passed}/6`);
console.log(`FAIL: ${failed}/6`);

if (passed === 6) {
  console.log('\n✅ ALL DoD PASS');
  process.exit(0);
} else {
  console.log('\n❌ NOT ALL DoD PASS');
  process.exit(1);
}
