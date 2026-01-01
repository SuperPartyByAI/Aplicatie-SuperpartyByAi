#!/usr/bin/env node

/**
 * Soak Test Runner - 2 Hour Production Stability Test
 *
 * Monitors:
 * - Service uptime (heartbeat every 60s)
 * - Disconnect/reconnect events
 * - MTTR (Mean Time To Recovery)
 * - Crash detection
 *
 * Outputs:
 * - artifacts/SOAK-REPORT.md
 * - artifacts/MTTR-REPORT.md
 * - artifacts/evidence.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://whats-upp-production.up.railway.app';
const DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds
const RUN_ID = `soak_${Date.now()}`;

const metrics = {
  runId: RUN_ID,
  startTime: new Date().toISOString(),
  endTime: null,
  duration: DURATION_MS,
  heartbeats: [],
  incidents: [],
  crashes: 0,
  totalChecks: 0,
  successfulChecks: 0,
  failedChecks: 0,
};

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      })
      .on('error', reject);
  });
}

async function checkHealth() {
  try {
    const result = await httpGet(`${BASE_URL}/health`);
    return {
      success: result.status === 200,
      status: result.status,
      data: result.data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function runSoakTest() {
  console.log(`🚀 Starting soak test: ${RUN_ID}`);
  console.log(`Duration: 2 hours`);
  console.log(`Heartbeat: every 60s`);
  console.log(`Start time: ${metrics.startTime}`);
  console.log('');

  const startTime = Date.now();
  let lastStatus = 'unknown';
  let incidentStart = null;

  const interval = setInterval(async () => {
    const elapsed = Date.now() - startTime;

    if (elapsed >= DURATION_MS) {
      clearInterval(interval);
      await finalizeSoakTest();
      return;
    }

    metrics.totalChecks++;
    const health = await checkHealth();

    if (health.success) {
      metrics.successfulChecks++;

      const heartbeat = {
        timestamp: health.timestamp,
        uptime: health.data.uptime,
        accounts: health.data.accounts,
        commit: health.data.commit,
      };

      metrics.heartbeats.push(heartbeat);

      console.log(
        `✅ [${Math.floor(elapsed / 1000)}s] Healthy - uptime: ${health.data.uptime}s, accounts: ${health.data.accounts.total}`
      );

      // Check if recovering from incident
      if (lastStatus === 'down' && incidentStart) {
        const mttr = (Date.now() - incidentStart) / 1000;
        metrics.incidents[metrics.incidents.length - 1].mttr = mttr;
        metrics.incidents[metrics.incidents.length - 1].recoveredAt = health.timestamp;
        console.log(`🔄 Recovered from incident - MTTR: ${mttr.toFixed(2)}s`);
        incidentStart = null;
      }

      lastStatus = 'up';
    } else {
      metrics.failedChecks++;

      console.log(
        `❌ [${Math.floor(elapsed / 1000)}s] Health check failed: ${health.error || health.status}`
      );

      // Detect new incident
      if (lastStatus !== 'down') {
        incidentStart = Date.now();
        metrics.incidents.push({
          type: 'disconnect',
          startedAt: health.timestamp,
          recoveredAt: null,
          mttr: null,
        });
        console.log(`⚠️  Incident detected`);
      }

      lastStatus = 'down';
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('\n⚠️  Soak test interrupted');
    clearInterval(interval);
    await finalizeSoakTest();
    process.exit(0);
  });
}

async function finalizeSoakTest() {
  metrics.endTime = new Date().toISOString();

  const actualDuration = Date.now() - new Date(metrics.startTime).getTime();
  const uptimePercent = (metrics.successfulChecks / metrics.totalChecks) * 100;

  console.log('');
  console.log('='.repeat(60));
  console.log('SOAK TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`Duration: ${(actualDuration / 1000 / 60).toFixed(2)} minutes`);
  console.log(`Total checks: ${metrics.totalChecks}`);
  console.log(`Successful: ${metrics.successfulChecks}`);
  console.log(`Failed: ${metrics.failedChecks}`);
  console.log(`Uptime: ${uptimePercent.toFixed(2)}%`);
  console.log(`Incidents: ${metrics.incidents.length}`);
  console.log(`Crashes: ${metrics.crashes}`);

  // Calculate MTTR
  const mttrValues = metrics.incidents
    .filter(i => i.mttr !== null)
    .map(i => i.mttr)
    .sort((a, b) => a - b);

  const mttrStats = calculateMTTRStats(mttrValues);

  // Generate reports
  await generateSoakReport(metrics, uptimePercent, actualDuration);
  await generateMTTRReport(mttrValues, mttrStats);
  await generateEvidence(metrics, mttrValues, mttrStats);

  console.log('');
  console.log('📊 Reports generated:');
  console.log('  - artifacts/SOAK-REPORT.md');
  console.log('  - artifacts/MTTR-REPORT.md');
  console.log('  - artifacts/evidence.json');
}

function calculateMTTRStats(values) {
  if (values.length === 0) {
    return { p50: 0, p90: 0, p95: 0, mean: 0, min: 0, max: 0 };
  }

  const p50 = percentile(values, 50);
  const p90 = percentile(values, 90);
  const p95 = percentile(values, 95);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = values[0];
  const max = values[values.length - 1];

  return { p50, p90, p95, mean, min, max };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const index = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, index)];
}

async function generateSoakReport(metrics, uptimePercent, actualDuration) {
  const report = `# SOAK TEST REPORT

**Run ID:** ${metrics.runId}  
**Start Time:** ${metrics.startTime}  
**End Time:** ${metrics.endTime}  
**Duration:** ${(actualDuration / 1000 / 60).toFixed(2)} minutes (target: 120 minutes)

---

## RESULTS

**Uptime:** ${uptimePercent.toFixed(2)}% (target: >= 99%)  
**Crash Count:** ${metrics.crashes} (target: 0)  
**Total Checks:** ${metrics.totalChecks}  
**Successful Checks:** ${metrics.successfulChecks}  
**Failed Checks:** ${metrics.failedChecks}  
**Incidents:** ${metrics.incidents.length}

---

## PASS/FAIL CRITERIA

- ✅ Duration >= 2 hours: ${actualDuration >= DURATION_MS ? 'PASS' : 'FAIL'}
- ${uptimePercent >= 99 ? '✅' : '❌'} Uptime >= 99%: ${uptimePercent >= 99 ? 'PASS' : 'FAIL'}
- ✅ Crash count = 0: ${metrics.crashes === 0 ? 'PASS' : 'FAIL'}

**Overall:** ${actualDuration >= DURATION_MS && uptimePercent >= 99 && metrics.crashes === 0 ? '✅ PASS' : '❌ FAIL'}

---

## INCIDENTS

${
  metrics.incidents.length === 0
    ? 'No incidents detected.'
    : metrics.incidents
        .map(
          (inc, i) => `
### Incident ${i + 1}
- Type: ${inc.type}
- Started: ${inc.startedAt}
- Recovered: ${inc.recoveredAt || 'N/A'}
- MTTR: ${inc.mttr ? inc.mttr.toFixed(2) + 's' : 'N/A'}
`
        )
        .join('\n')
}

---

**Report End**
`;

  fs.writeFileSync(path.join(__dirname, 'SOAK-REPORT.md'), report);
}

async function generateMTTRReport(values, stats) {
  const report = `# MTTR REPORT

**Mean Time To Recovery Analysis**

---

## DATASET

**Total Incidents:** ${values.length}  
**MTTR Values (seconds):** ${values.length > 0 ? values.map(v => v.toFixed(2)).join(', ') : 'N/A'}

---

## STATISTICS

**P50 (Median):** ${stats.p50.toFixed(2)}s  
**P90:** ${stats.p90.toFixed(2)}s  
**P95:** ${stats.p95.toFixed(2)}s (target: <= 60s)  
**Mean:** ${stats.mean.toFixed(2)}s  
**Min:** ${stats.min.toFixed(2)}s  
**Max:** ${stats.max.toFixed(2)}s

---

## CALCULATION

Percentile calculation formula:
\`\`\`
index = ceil((percentile / 100) * array.length) - 1
value = sorted_array[index]
\`\`\`

For P95 with ${values.length} values:
\`\`\`
index = ceil((95 / 100) * ${values.length}) - 1 = ${Math.ceil((95 / 100) * values.length) - 1}
P95 = ${stats.p95.toFixed(2)}s
\`\`\`

---

## PASS/FAIL

${stats.p95 <= 60 ? '✅' : '❌'} P95 <= 60s: ${stats.p95 <= 60 ? 'PASS' : 'FAIL'}

---

**Report End**
`;

  fs.writeFileSync(path.join(__dirname, 'MTTR-REPORT.md'), report);
}

async function generateEvidence(metrics, mttrValues, mttrStats) {
  const evidence = {
    runId: metrics.runId,
    startTime: metrics.startTime,
    endTime: metrics.endTime,
    durationMs: Date.now() - new Date(metrics.startTime).getTime(),
    totalChecks: metrics.totalChecks,
    successfulChecks: metrics.successfulChecks,
    failedChecks: metrics.failedChecks,
    uptimePercent: (metrics.successfulChecks / metrics.totalChecks) * 100,
    crashes: metrics.crashes,
    incidents: metrics.incidents,
    mttr: {
      values: mttrValues,
      stats: mttrStats,
    },
    heartbeats: metrics.heartbeats,
  };

  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2));
}

// Start soak test
runSoakTest().catch(error => {
  console.error('❌ Soak test error:', error);
  process.exit(1);
});
