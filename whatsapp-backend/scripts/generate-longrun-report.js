#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

async function generateReport(days) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  console.log(`\n=== Generating ${days}d report ===`);
  console.log(`Period: ${startDate.toISOString()} to ${now.toISOString()}`);

  // Get heartbeats
  const heartbeatsSnapshot = await db
    .collection('wa_metrics')
    .doc('longrun')
    .collection('heartbeats')
    .where('tsIso', '>=', startDate.toISOString())
    .get();

  const heartbeatCount = heartbeatsSnapshot.size;
  const expectedHeartbeats = days * 24 * 60; // 1 per minute
  const uptimePercent = (heartbeatCount / expectedHeartbeats) * 100;

  // Get probes
  const probesSnapshot = await db
    .collection('wa_metrics')
    .doc('longrun')
    .collection('probes')
    .where('startTs', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .get();

  let probePass = 0;
  let probeFail = 0;

  probesSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.status === 'PASS') probePass++;
    else probeFail++;
  });

  const probePassRate = probePass + probeFail > 0 ? (probePass / (probePass + probeFail)) * 100 : 0;

  const report = {
    period: `${days}d`,
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    dataAvailable: heartbeatCount > 0,
    heartbeats: {
      collected: heartbeatCount,
      expected: expectedHeartbeats,
      uptimePercent: uptimePercent.toFixed(2),
    },
    probes: {
      total: probePass + probeFail,
      pass: probePass,
      fail: probeFail,
      passRate: probePassRate.toFixed(2),
    },
    slo: {
      uptimeTarget: 99.0,
      probePassRateTarget: 99.0,
      mttrP95Target: 60,
      verdict:
        heartbeatCount > 0 && uptimePercent >= 99.0 && probePassRate >= 99.0
          ? 'PASS'
          : heartbeatCount === 0
            ? 'INSUFFICIENT_DATA'
            : 'FAIL',
    },
  };

  return report;
}

async function main() {
  const reports = {};

  for (const days of [7, 30, 90, 180]) {
    reports[`${days}d`] = await generateReport(days);
  }

  // Write reports
  const artifactsDir = path.join(__dirname, '../../artifacts');

  for (const [period, report] of Object.entries(reports)) {
    const filename = `LONGRUN-${period.toUpperCase()}.md`;
    const content = `# Long-Run Report: ${period}

**Period:** ${report.startDate} to ${report.endDate}

## SLO Verdict: ${report.slo.verdict}

## Metrics

### Uptime
- Heartbeats collected: ${report.heartbeats.collected}
- Heartbeats expected: ${report.heartbeats.expected}
- Uptime: ${report.heartbeats.uptimePercent}%
- Target: ${report.slo.uptimeTarget}%

### Probes
- Total: ${report.probes.total}
- Pass: ${report.probes.pass}
- Fail: ${report.probes.fail}
- Pass rate: ${report.probes.passRate}%
- Target: ${report.slo.probePassRateTarget}%

## Status
${report.dataAvailable ? 'Data available' : '⚠️ INSUFFICIENT_DATA'}
`;

    fs.writeFileSync(path.join(artifactsDir, filename), content);
    console.log(`✅ Generated: ${filename}`);
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(reports, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
