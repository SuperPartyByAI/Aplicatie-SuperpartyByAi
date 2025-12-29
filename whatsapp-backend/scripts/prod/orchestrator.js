#!/usr/bin/env node

const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BAILEYS_BASE_URL || 'https://whats-upp-production.up.railway.app';
const TEST_TOKEN = process.env.ONE_TIME_TEST_TOKEN;

if (!TEST_TOKEN) {
  console.error('❌ ONE_TIME_TEST_TOKEN not set');
  process.exit(1);
}

// Initialize Firebase
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  const runId = `PROD_${new Date().toISOString().replace(/[:.]/g, '-')}_${Math.random().toString(36).substr(2, 6)}`;
  
  console.log(`\n=== ORCHESTRATOR START ===`);
  console.log(`runId: ${runId}`);
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`timestamp: ${new Date().toISOString()}\n`);
  
  // Get health
  const health = await axios.get(`${BASE_URL}/health`).then(r => r.data);
  console.log(`commit: ${health.commit}`);
  console.log(`bootTimestamp: ${health.bootTimestamp}`);
  console.log(`deploymentId: ${health.deploymentId}\n`);
  
  // Write run metadata
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').set({
    runId,
    startTs: admin.firestore.FieldValue.serverTimestamp(),
    commit: health.commit,
    bootTimestamp: health.bootTimestamp,
    baseUrl: BASE_URL,
    status: 'running'
  });
  
  console.log(`✅ Firestore: wa_metrics/runs/${runId}/metadata\n`);
  
  // Wait for connected account
  console.log(`STEP 1: Wait for connected account (max 180s)...`);
  const accountId = await require('./wait-connected').waitConnected(BASE_URL, 180);
  
  if (!accountId) {
    console.error(`❌ No connected account after 180s`);
    await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').update({
      status: 'FAIL',
      reason: 'no_connected_account',
      endTs: admin.firestore.FieldValue.serverTimestamp()
    });
    process.exit(1);
  }
  
  console.log(`✅ Account connected: ${accountId}\n`);
  
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('steps').set({
    connect: { status: 'PASS', accountId, ts: admin.firestore.FieldValue.serverTimestamp() }
  }, { merge: true });
  
  // Verify wa_sessions
  console.log(`STEP 2: Verify Firestore session...`);
  const sessionDoc = await db.collection('wa_sessions').doc(accountId).get();
  
  if (!sessionDoc.exists) {
    console.error(`❌ wa_sessions/${accountId} not found`);
    await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').update({ status: 'FAIL', reason: 'no_session' });
    process.exit(1);
  }
  
  const sessionData = sessionDoc.data();
  console.log(`✅ wa_sessions/${accountId} exists`);
  console.log(`   files: ${sessionData.files ? Object.keys(sessionData.files).length : 0}`);
  console.log(`   updatedAt: ${sessionData.updatedAt ? sessionData.updatedAt.toDate().toISOString() : 'N/A'}\n`);
  
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('steps').set({
    session: { status: 'PASS', filesCount: sessionData.files ? Object.keys(sessionData.files).length : 0, ts: admin.firestore.FieldValue.serverTimestamp() }
  }, { merge: true });
  
  // Coldstart test
  console.log(`STEP 3: Coldstart test (socket restart)...`);
  const coldstartResult = await require('./test-coldstart').testColdstart(BASE_URL, accountId, TEST_TOKEN);
  
  if (!coldstartResult.pass) {
    console.error(`❌ Coldstart FAIL: ${coldstartResult.reason}`);
    await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').update({ status: 'FAIL', reason: 'coldstart_fail' });
    process.exit(1);
  }
  
  console.log(`✅ Coldstart PASS\n`);
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('steps').set({
    coldstart: { status: 'PASS', ...coldstartResult, ts: admin.firestore.FieldValue.serverTimestamp() }
  }, { merge: true });
  
  // Inbound test
  console.log(`STEP 4: Inbound test...`);
  const inboundResult = await require('./test-inbound').testInbound(BASE_URL, accountId, TEST_TOKEN);
  
  if (!inboundResult.pass) {
    console.error(`❌ Inbound FAIL: ${inboundResult.reason}`);
    await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').update({ status: 'FAIL', reason: 'inbound_fail' });
    process.exit(1);
  }
  
  console.log(`✅ Inbound PASS`);
  console.log(`   wa_messages path: ${inboundResult.messagePath}\n`);
  
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('steps').set({
    inbound: { status: 'PASS', ...inboundResult, ts: admin.firestore.FieldValue.serverTimestamp() }
  }, { merge: true });
  
  // Queue test
  console.log(`STEP 5: Queue test...`);
  const queueResult = await require('./test-queue').testQueue(BASE_URL, accountId, TEST_TOKEN);
  
  if (!queueResult.pass) {
    console.error(`❌ Queue FAIL: ${queueResult.reason}`);
    await db.collection('wa_metrics').doc('runs').collection(runId).doc('metadata').update({ status: 'FAIL', reason: 'queue_fail' });
    process.exit(1);
  }
  
  console.log(`✅ Queue PASS`);
  console.log(`   queued: ${queueResult.queuedPaths.join(', ')}`);
  console.log(`   sent: ${queueResult.sentPaths.join(', ')}\n`);
  
  await db.collection('wa_metrics').doc('runs').collection(runId).doc('steps').set({
    queue: { status: 'PASS', ...queueResult, ts: admin.firestore.FieldValue.serverTimestamp() }
  }, { merge: true });
  
  // Soak test (2h)
  console.log(`STEP 6: Soak test (2h)...`);
  console.log(`Starting soak test in background...\n`);
  
  require('./soak-2h').startSoak(BASE_URL, accountId, runId, TEST_TOKEN);
  
  // Generate intermediate evidence (10 heartbeats)
  console.log(`Waiting 10 minutes for 10 heartbeats...`);
  await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
  
  const heartbeatsSnapshot = await db.collection('wa_metrics').doc('runs').collection(runId).doc('soak').collection('heartbeats').orderBy('ts', 'desc').limit(10).get();
  
  console.log(`\n=== 10 HEARTBEATS ===`);
  heartbeatsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`${doc.id}: ts=${data.ts.toDate().toISOString()}, uptime=${data.uptime}s, crash=${data.crash || 0}`);
  });
  
  console.log(`\n✅ Intermediate evidence generated`);
  console.log(`Soak test continues for 2h total...\n`);
  
  // Final verdict at 2h
  console.log(`Orchestrator will finalize at 2h mark.`);
  console.log(`runId: ${runId}`);
  console.log(`Firestore: wa_metrics/runs/${runId}/metadata\n`);
}

main().catch(err => {
  console.error('❌ Orchestrator error:', err.message);
  process.exit(1);
});
