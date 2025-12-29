#!/usr/bin/env node
/**
 * Soak Test with Firestore Metrics
 * Persists heartbeats to Firestore for evidence
 */

const https = require('https');
const admin = require('firebase-admin');

const BASE_URL = 'https://whats-upp-production.up.railway.app';
const RUN_ID = `soak_${Date.now()}`;
const DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60s

// Initialize Firebase
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function initSoakRun() {
  const health = await httpGet(`${BASE_URL}/health`);
  
  await db.collection('wa_metrics').doc(RUN_ID).set({
    runId: RUN_ID,
    startTs: admin.firestore.FieldValue.serverTimestamp(),
    commit: health.data.commit,
    instanceId: health.data.deploymentId,
    baseUrl: BASE_URL,
    status: 'running',
    targetDurationMs: DURATION_MS
  });
  
  console.log(`✅ Soak run initialized: ${RUN_ID}`);
  console.log(`Firestore path: wa_metrics/${RUN_ID}`);
}

async function recordHeartbeat(health, elapsed) {
  const ts = Date.now();
  const heartbeatId = `hb_${ts}`;
  
  await db.collection('wa_metrics').doc(RUN_ID)
    .collection('heartbeats').doc(heartbeatId).set({
      ts: admin.firestore.FieldValue.serverTimestamp(),
      elapsedMs: elapsed,
      success: health.success,
      uptime: health.data?.uptime || null,
      accounts: health.data?.accounts || null,
      memoryRss: process.memoryUsage().rss,
      memoryHeap: process.memoryUsage().heapUsed
    });
  
  return heartbeatId;
}

async function recordIncident(type, details) {
  const incidentId = `incident_${Date.now()}`;
  
  await db.collection('wa_metrics').doc(RUN_ID)
    .collection('incidents').doc(incidentId).set({
      ts: admin.firestore.FieldValue.serverTimestamp(),
      type,
      details
    });
  
  return incidentId;
}

async function finalizeSoakRun(stats) {
  await db.collection('wa_metrics').doc(RUN_ID).update({
    endTs: admin.firestore.FieldValue.serverTimestamp(),
    status: 'completed',
    stats
  });
  
  console.log(`✅ Soak run finalized: ${RUN_ID}`);
}

async function runSoak() {
  await initSoakRun();
  
  const startTime = Date.now();
  let lastStatus = 'unknown';
  let incidentStart = null;
  const stats = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    crashes: 0,
    incidents: []
  };
  
  const interval = setInterval(async () => {
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= DURATION_MS) {
      clearInterval(interval);
      await finalizeSoakRun(stats);
      process.exit(0);
    }
    
    stats.totalChecks++;
    
    try {
      const health = await httpGet(`${BASE_URL}/health`);
      
      if (health.status === 200) {
        stats.successfulChecks++;
        const hbId = await recordHeartbeat(health, elapsed);
        
        console.log(`✅ [${Math.floor(elapsed/1000)}s] Heartbeat ${hbId} - uptime: ${health.data.uptime}s`);
        
        if (lastStatus === 'down' && incidentStart) {
          const mttr = (Date.now() - incidentStart) / 1000;
          stats.incidents[stats.incidents.length - 1].mttr = mttr;
          console.log(`🔄 Recovered - MTTR: ${mttr.toFixed(2)}s`);
          incidentStart = null;
        }
        
        lastStatus = 'up';
      } else {
        throw new Error(`HTTP ${health.status}`);
      }
    } catch (error) {
      stats.failedChecks++;
      
      console.log(`❌ [${Math.floor(elapsed/1000)}s] Health check failed: ${error.message}`);
      
      if (lastStatus !== 'down') {
        incidentStart = Date.now();
        const incidentId = await recordIncident('disconnect', { error: error.message });
        stats.incidents.push({ incidentId, startedAt: Date.now(), mttr: null });
        console.log(`⚠️  Incident ${incidentId}`);
      }
      
      lastStatus = 'down';
    }
  }, HEARTBEAT_INTERVAL_MS);
  
  process.on('SIGINT', async () => {
    clearInterval(interval);
    await finalizeSoakRun(stats);
    process.exit(0);
  });
}

runSoak().catch(error => {
  console.error('❌ Soak test error:', error);
  process.exit(1);
});
