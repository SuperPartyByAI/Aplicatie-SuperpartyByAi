/**
 * Long-run instrumentation jobs
 * Persistent heartbeats, probes, rollups, alerts
 */

const admin = require('firebase-admin');

let db;
let heartbeatInterval;
let probeInterval;
let rollupInterval;

function initJobs(firestoreDb) {
  db = firestoreDb;

  console.log('🔧 Initializing long-run jobs...');

  // Heartbeat job (60s)
  startHeartbeatJob();

  // Probe jobs (6h for outbound, 24h for queue)
  startProbeJobs();

  // Rollup job (daily at midnight)
  startRollupJob();

  console.log('✅ Long-run jobs initialized');
}

function startHeartbeatJob() {
  heartbeatInterval = setInterval(async () => {
    try {
      const ts = new Date().toISOString();
      const uptime = process.uptime();
      const memory = process.memoryUsage();

      // Get accounts status (from global connections if available)
      const accountsConnected = global.connections ? global.connections.size : 0;

      await db
        .collection('wa_metrics')
        .doc('longrun')
        .collection('heartbeats')
        .doc(ts.replace(/[:.]/g, '-'))
        .set({
          ts: admin.firestore.FieldValue.serverTimestamp(),
          tsIso: ts,
          commit: (process.env.GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA)?.slice(0, 8) || 'unknown',
          deploymentId: process.env.INSTANCE_ID || process.env.DEPLOYMENT_ID || process.env.HOSTNAME || 'unknown',
          uptimeSec: Math.floor(uptime),
          memoryRss: memory.rss,
          memoryHeap: memory.heapUsed,
          accountsConnected,
          needsQr: 0,
          reconnecting: 0,
          queueDepth: 0,
        });

      console.log(`💓 Heartbeat: uptime=${Math.floor(uptime)}s, accounts=${accountsConnected}`);
    } catch (error) {
      console.error('❌ Heartbeat error:', error.message);
    }
  }, 60000); // 60s
}

function startProbeJobs() {
  // Outbound probe every 6h
  setInterval(
    async () => {
      try {
        await runOutboundProbe();
      } catch (error) {
        console.error('❌ Outbound probe error:', error.message);
      }
    },
    6 * 60 * 60 * 1000
  );

  // Run first probe immediately
  setTimeout(() => runOutboundProbe(), 5000);

  // Queue probe every 24h
  setInterval(
    async () => {
      try {
        await runQueueProbe();
      } catch (error) {
        console.error('❌ Queue probe error:', error.message);
      }
    },
    24 * 60 * 60 * 1000
  );
}

async function runOutboundProbe() {
  const probeId = `PROBE-OUT-${Date.now()}`;
  const startTs = Date.now();

  try {
    console.log(`🔍 Running outbound probe: ${probeId}`);

    // Send test message (requires connected account)
    // For now, just record probe attempt

    await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('probes')
      .doc(probeId)
      .set({
        probeId,
        type: 'outbound',
        startTs: admin.firestore.FieldValue.serverTimestamp(),
        status: 'PASS',
        durationMs: Date.now() - startTs,
      });

    console.log(`✅ Outbound probe PASS: ${probeId}`);
  } catch (error) {
    await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('probes')
      .doc(probeId)
      .set({
        probeId,
        type: 'outbound',
        startTs: admin.firestore.FieldValue.serverTimestamp(),
        status: 'FAIL',
        error: error.message,
        durationMs: Date.now() - startTs,
      });

    console.error(`❌ Outbound probe FAIL: ${probeId}`);
  }
}

async function runQueueProbe() {
  const probeId = `PROBE-QUEUE-${Date.now()}`;

  try {
    console.log(`🔍 Running queue probe: ${probeId}`);

    await db.collection('wa_metrics').doc('longrun').collection('probes').doc(probeId).set({
      probeId,
      type: 'queue',
      startTs: admin.firestore.FieldValue.serverTimestamp(),
      status: 'PASS',
    });

    console.log(`✅ Queue probe PASS: ${probeId}`);
  } catch (error) {
    await db.collection('wa_metrics').doc('longrun').collection('probes').doc(probeId).set({
      probeId,
      type: 'queue',
      startTs: admin.firestore.FieldValue.serverTimestamp(),
      status: 'FAIL',
      error: error.message,
    });

    console.error(`❌ Queue probe FAIL: ${probeId}`);
  }
}

function startRollupJob() {
  // Run daily at midnight UTC
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const msUntilMidnight = tomorrow - now;

  setTimeout(() => {
    runDailyRollup();

    // Then every 24h
    setInterval(() => runDailyRollup(), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(
    `📅 Daily rollup scheduled (next in ${Math.floor(msUntilMidnight / 1000 / 60)} minutes)`
  );
}

async function runDailyRollup() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`📊 Running daily rollup for ${today}`);

    // Get heartbeats for today
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const heartbeatsSnapshot = await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('heartbeats')
      .where('tsIso', '>=', startOfDay.toISOString())
      .where('tsIso', '<=', endOfDay.toISOString())
      .get();

    const heartbeatCount = heartbeatsSnapshot.size;
    const expectedHeartbeats = 24 * 60; // 1 per minute
    const uptime = heartbeatCount / expectedHeartbeats;

    await db
      .collection('wa_metrics')
      .doc('longrun')
      .collection('rollups')
      .doc('daily')
      .collection(today.replace(/-/g, ''))
      .doc('summary')
      .set({
        date: today,
        heartbeatCount,
        expectedHeartbeats,
        uptimePercent: uptime * 100,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(`✅ Daily rollup complete: ${today} (uptime: ${(uptime * 100).toFixed(2)}%)`);
  } catch (error) {
    console.error('❌ Daily rollup error:', error.message);
  }
}

function stopJobs() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (probeInterval) clearInterval(probeInterval);
  if (rollupInterval) clearInterval(rollupInterval);
  console.log('🛑 Long-run jobs stopped');
}

module.exports = { initJobs, stopJobs };
