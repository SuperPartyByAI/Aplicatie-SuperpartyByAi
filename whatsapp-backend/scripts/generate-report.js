#!/usr/bin/env node

/**
 * GENERATE LONG-RUN REPORT
 *
 * Generates markdown report with:
 * - Heartbeat coverage
 * - Probe pass rates
 * - Gap analysis
 * - Incident summary
 * - MTTR statistics
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BAILEYS_BASE_URL || 'http://37.27.34.179:8080';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchHeartbeats(limit = 100) {
  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/heartbeats?limit=${limit}`);
  return response.heartbeats || [];
}

async function fetchProbes() {
  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/probes`);
  return response.probes || [];
}

function calculateCoverage(heartbeats) {
  if (heartbeats.length < 2) {
    return { coverage: 0, gaps: [], expectedHb: 0, actualHb: 0 };
  }

  // Sort by timestamp
  const sorted = heartbeats
    .map(hb => ({ ...hb, ts: new Date(hb.tsIso).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const startTs = sorted[0].ts;
  const endTs = sorted[sorted.length - 1].ts;
  const durationSec = (endTs - startTs) / 1000;
  const expectedHb = Math.floor(durationSec / 60);
  const actualHb = sorted.length;
  const coverage = (actualHb / expectedHb) * 100;

  // Detect gaps
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const intervalSec = (sorted[i].ts - sorted[i - 1].ts) / 1000;
    if (intervalSec > 70) {
      // 60s + 10s drift
      gaps.push({
        startTs: sorted[i - 1].ts,
        endTs: sorted[i].ts,
        durationSec: intervalSec,
        missedHb: Math.floor(intervalSec / 60) - 1,
      });
    }
  }

  return { coverage, gaps, expectedHb, actualHb, startTs, endTs };
}

function calculateProbeStats(probes) {
  const byType = {};

  probes.forEach(probe => {
    if (!byType[probe.type]) {
      byType[probe.type] = { total: 0, pass: 0, fail: 0, avgLatency: 0, latencies: [] };
    }

    byType[probe.type].total++;
    if (probe.result === 'PASS') {
      byType[probe.type].pass++;
    } else {
      byType[probe.type].fail++;
    }

    if (probe.latencyMs) {
      byType[probe.type].latencies.push(probe.latencyMs);
    }
  });

  // Calculate averages
  Object.keys(byType).forEach(type => {
    const latencies = byType[type].latencies;
    if (latencies.length > 0) {
      byType[type].avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      byType[type].p50 = percentile(latencies, 50);
      byType[type].p90 = percentile(latencies, 90);
      byType[type].p95 = percentile(latencies, 95);
    }
    byType[type].passRate = (byType[type].pass / byType[type].total) * 100;
  });

  return byType;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

function generateMarkdown(heartbeats, probes, coverageStats, probeStats) {
  const now = new Date().toISOString();

  let md = `# Long-Run Production Report\n\n`;
  md += `**Generated:** ${now}\n\n`;
  md += `**Base URL:** ${BASE_URL}\n\n`;
  md += `---\n\n`;

  // Heartbeat section
  md += `## Heartbeat Coverage\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| **Period** | ${new Date(coverageStats.startTs).toISOString()} - ${new Date(coverageStats.endTs).toISOString()} |\n`;
  md += `| **Duration** | ${((coverageStats.endTs - coverageStats.startTs) / 3600000).toFixed(1)} hours |\n`;
  md += `| **Expected HB** | ${coverageStats.expectedHb} |\n`;
  md += `| **Actual HB** | ${coverageStats.actualHb} |\n`;
  md += `| **Missed HB** | ${coverageStats.expectedHb - coverageStats.actualHb} |\n`;
  md += `| **Coverage** | ${coverageStats.coverage.toFixed(1)}% |\n`;
  md += `| **Status** | ${coverageStats.coverage >= 80 ? '✅ SUFFICIENT' : '⚠️ INSUFFICIENT'} |\n\n`;

  // Gaps section
  if (coverageStats.gaps.length > 0) {
    md += `### Detected Gaps\n\n`;
    md += `| Start | End | Duration | Missed HB |\n`;
    md += `|-------|-----|----------|----------|\n`;
    coverageStats.gaps.forEach(gap => {
      md += `| ${new Date(gap.startTs).toISOString()} | ${new Date(gap.endTs).toISOString()} | ${gap.durationSec.toFixed(0)}s | ${gap.missedHb} |\n`;
    });
    md += `\n`;
  } else {
    md += `### Gaps\n\n✅ No gaps detected (100% coverage)\n\n`;
  }

  // Probe section
  md += `## Probe Statistics\n\n`;

  Object.keys(probeStats).forEach(type => {
    const stats = probeStats[type];
    md += `### ${type.toUpperCase()} Probes\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| **Total** | ${stats.total} |\n`;
    md += `| **Pass** | ${stats.pass} |\n`;
    md += `| **Fail** | ${stats.fail} |\n`;
    md += `| **Pass Rate** | ${stats.passRate.toFixed(1)}% |\n`;
    md += `| **Avg Latency** | ${stats.avgLatency.toFixed(0)}ms |\n`;
    md += `| **P50 Latency** | ${stats.p50 || 'N/A'}ms |\n`;
    md += `| **P90 Latency** | ${stats.p90 || 'N/A'}ms |\n`;
    md += `| **P95 Latency** | ${stats.p95 || 'N/A'}ms |\n\n`;
  });

  // Instance section
  md += `## Instance Information\n\n`;
  const instances = new Set(heartbeats.map(hb => hb.instanceId));
  md += `**Unique Instances:** ${instances.size}\n\n`;
  instances.forEach(id => {
    const instanceHbs = heartbeats.filter(hb => hb.instanceId === id);
    const firstHb = instanceHbs[instanceHbs.length - 1];
    const lastHb = instanceHbs[0];
    md += `- \`${id}\`\n`;
    md += `  - First HB: ${firstHb.tsIso}\n`;
    md += `  - Last HB: ${lastHb.tsIso}\n`;
    md += `  - Total HB: ${instanceHbs.length}\n`;
  });
  md += `\n`;

  // Summary
  md += `## Summary\n\n`;
  const allProbesPass = Object.values(probeStats).every(s => s.passRate === 100);
  const sufficientCoverage = coverageStats.coverage >= 80;

  if (allProbesPass && sufficientCoverage) {
    md += `✅ **ALL SYSTEMS OPERATIONAL**\n\n`;
  } else {
    md += `⚠️ **ISSUES DETECTED**\n\n`;
    if (!sufficientCoverage) {
      md += `- ⚠️ Insufficient heartbeat coverage (${coverageStats.coverage.toFixed(1)}% < 80%)\n`;
    }
    Object.keys(probeStats).forEach(type => {
      if (probeStats[type].passRate < 100) {
        md += `- ⚠️ ${type} probe failures (${probeStats[type].passRate.toFixed(1)}% pass rate)\n`;
      }
    });
  }

  return md;
}

async function main() {
  console.log('🔍 Fetching data from', BASE_URL);

  const heartbeats = await fetchHeartbeats(100);
  const probes = await fetchProbes();

  console.log(`✅ Fetched ${heartbeats.length} heartbeats, ${probes.length} probes`);

  const coverageStats = calculateCoverage(heartbeats);
  const probeStats = calculateProbeStats(probes);

  const markdown = generateMarkdown(heartbeats, probes, coverageStats, probeStats);

  // Save to file
  const outputPath = path.join(__dirname, '..', 'reports', `longrun-report-${Date.now()}.md`);
  const reportsDir = path.dirname(outputPath);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, markdown);

  console.log(`✅ Report saved to ${outputPath}`);
  console.log(`\n${markdown}`);
}

main().catch(error => {
  console.error('❌ ERROR:', error.message);
  process.exit(1);
});
