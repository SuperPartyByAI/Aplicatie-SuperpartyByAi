#!/usr/bin/env node

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (serviceAccount.project_id) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set');
    process.exit(1);
  }
}

const db = admin.firestore();

async function verifyDataQuality() {
  console.log('=== DATA QUALITY VERIFICATION ===\n');
  
  // Get heartbeats from last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const heartbeatsSnapshot = await db.collection('wa_metrics').doc('longrun').collection('heartbeats')
    .where('tsIso', '>=', oneHourAgo.toISOString())
    .get();
  
  const heartbeatCount = heartbeatsSnapshot.size;
  const expectedHeartbeats = 60; // 1 per minute
  const coverage = heartbeatCount / expectedHeartbeats;
  
  console.log(`Heartbeats (last hour):`);
  console.log(`  Expected: ${expectedHeartbeats}`);
  console.log(`  Written: ${heartbeatCount}`);
  console.log(`  Missed: ${expectedHeartbeats - heartbeatCount}`);
  console.log(`  Coverage: ${(coverage * 100).toFixed(2)}%`);
  
  // Gap analysis
  const timestamps = [];
  heartbeatsSnapshot.forEach(doc => {
    const data = doc.data();
    timestamps.push(new Date(data.tsIso).getTime());
  });
  
  timestamps.sort((a, b) => a - b);
  
  let maxGap = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] - timestamps[i-1]) / 1000;
    if (gap > maxGap) maxGap = gap;
  }
  
  console.log(`\nGap analysis:`);
  console.log(`  Max gap: ${maxGap.toFixed(0)}s`);
  console.log(`  Expected interval: 60s`);
  
  // SLO Validation
  const insufficientData = coverage < 0.8;
  const uptimePct = coverage * 100;
  const driftExceeded = maxGap > 120;
  
  console.log(`\n=== SLO VALIDATION ===`);
  console.log(`  Uptime: ${uptimePct.toFixed(2)}%`);
  console.log(`  Insufficient data: ${insufficientData ? 'YES' : 'NO'}`);
  console.log(`  Max gap acceptable: ${!driftExceeded ? 'YES' : 'NO'}`);
  
  // Verdict
  console.log(`\n=== VERDICT ===`);
  if (insufficientData) {
    console.log('⚠️  INSUFFICIENT_DATA (coverage < 80%)');
    process.exit(2); // Exit code 2 for insufficient data
  } else if (driftExceeded) {
    console.log(`❌ DATA QUALITY FAIL (max gap ${maxGap}s > 120s)`);
    process.exit(1);
  } else {
    console.log('✅ DATA QUALITY PASS');
    process.exit(0);
  }
}

verifyDataQuality().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
