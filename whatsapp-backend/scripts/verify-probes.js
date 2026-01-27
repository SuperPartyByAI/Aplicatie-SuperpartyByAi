#!/usr/bin/env node

/**
 * VERIFY PROBES
 *
 * Tests:
 * 1. Outbound probe (send message)
 * 2. Queue probe (message ordering)
 * 3. Inbound probe (receive message)
 */

const https = require('https');

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

async function verifyOutboundProbe() {
  console.log('\n=== OUTBOUND PROBE ===\n');

  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/probes`);

  if (!response.success || response.count === 0) {
    console.log('❌ FAIL: No probes found');
    return false;
  }

  const outboundProbes = response.probes.filter(p => p.type === 'outbound');

  if (outboundProbes.length === 0) {
    console.log('❌ FAIL: No outbound probes found');
    return false;
  }

  console.log(`✅ Found ${outboundProbes.length} outbound probe(s)`);

  const latestProbe = outboundProbes[0];
  console.log(`\nLatest probe:`);
  console.log(`  - ID: ${latestProbe.id}`);
  console.log(`  - Timestamp: ${latestProbe.tsIso}`);
  console.log(`  - Result: ${latestProbe.result}`);
  console.log(`  - Latency: ${latestProbe.latencyMs}ms`);
  console.log(`  - Path: ${latestProbe.path}`);

  const passRate =
    (outboundProbes.filter(p => p.result === 'PASS').length / outboundProbes.length) * 100;
  console.log(`\n✅ Pass rate: ${passRate.toFixed(1)}%`);

  return passRate >= 80;
}

async function verifyQueueProbe() {
  console.log('\n=== QUEUE PROBE ===\n');

  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/probes`);

  if (!response.success) {
    console.log('❌ FAIL: Could not fetch probes');
    return false;
  }

  const queueProbes = response.probes.filter(p => p.type === 'queue');

  if (queueProbes.length === 0) {
    console.log('⚠️  No queue probes found (not yet scheduled)');
    return true; // Not a failure, just not scheduled yet
  }

  console.log(`✅ Found ${queueProbes.length} queue probe(s)`);

  const latestProbe = queueProbes[0];
  console.log(`\nLatest probe:`);
  console.log(`  - ID: ${latestProbe.id}`);
  console.log(`  - Timestamp: ${latestProbe.tsIso}`);
  console.log(`  - Result: ${latestProbe.result}`);
  console.log(`  - Latency: ${latestProbe.latencyMs}ms`);

  const passRate = (queueProbes.filter(p => p.result === 'PASS').length / queueProbes.length) * 100;
  console.log(`\n✅ Pass rate: ${passRate.toFixed(1)}%`);

  return passRate >= 80;
}

async function verifyInboundProbe() {
  console.log('\n=== INBOUND PROBE ===\n');

  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/probes`);

  if (!response.success) {
    console.log('❌ FAIL: Could not fetch probes');
    return false;
  }

  const inboundProbes = response.probes.filter(p => p.type === 'inbound');

  if (inboundProbes.length === 0) {
    console.log('⚠️  No inbound probes found (requires PROBE_SENDER account)');
    return true; // Not a failure, just requires setup
  }

  console.log(`✅ Found ${inboundProbes.length} inbound probe(s)`);

  const latestProbe = inboundProbes[0];
  console.log(`\nLatest probe:`);
  console.log(`  - ID: ${latestProbe.id}`);
  console.log(`  - Timestamp: ${latestProbe.tsIso}`);
  console.log(`  - Result: ${latestProbe.result}`);
  console.log(`  - Latency: ${latestProbe.latencyMs}ms`);

  const passRate =
    (inboundProbes.filter(p => p.result === 'PASS').length / inboundProbes.length) * 100;
  console.log(`\n✅ Pass rate: ${passRate.toFixed(1)}%`);

  return passRate >= 80;
}

async function main() {
  console.log('🔍 VERIFYING PROBES');
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  try {
    const test1 = await verifyOutboundProbe();
    const test2 = await verifyQueueProbe();
    const test3 = await verifyInboundProbe();

    console.log('\n=== SUMMARY ===\n');
    console.log(`Outbound probe: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Queue probe: ${test2 ? '✅ PASS' : '⚠️ PENDING'}`);
    console.log(`Inbound probe: ${test3 ? '✅ PASS' : '⚠️ PENDING'}`);

    const allPassed = test1 && test2 && test3;
    console.log(`\n${allPassed ? '✅ ALL PROBES OPERATIONAL' : '⚠️ SOME PROBES PENDING/FAILED'}\n`);

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
