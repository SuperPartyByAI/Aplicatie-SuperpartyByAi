#!/usr/bin/env node

/**
 * VERIFY RESTART-SAFE JOBS
 * 
 * Tests:
 * 1. Idempotent writes (deterministic docIds)
 * 2. Gap detection (missed heartbeats)
 * 3. Distributed lock (prevents duplicate schedulers)
 */

const https = require('https');

const BASE_URL = process.env.BAILEYS_BASE_URL || 'https://whats-upp-production.up.railway.app';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function verifyIdempotentWrites() {
  console.log('\n=== TEST 1: IDEMPOTENT WRITES ===\n');
  
  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/heartbeats?limit=20`);
  
  if (!response.success || response.count === 0) {
    console.log('❌ FAIL: No heartbeats found');
    return false;
  }
  
  console.log(`✅ Found ${response.count} heartbeats`);
  
  // Check deterministic docIds (format: YYYY-MM-DDTHH-MM-SS)
  const docIdPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
  let validDocIds = 0;
  
  for (const hb of response.heartbeats) {
    if (docIdPattern.test(hb.id)) {
      validDocIds++;
    } else {
      console.log(`⚠️  Invalid docId format: ${hb.id}`);
    }
  }
  
  console.log(`✅ ${validDocIds}/${response.count} heartbeats have deterministic docIds`);
  
  // Check for duplicates
  const docIds = response.heartbeats.map(hb => hb.id);
  const uniqueDocIds = new Set(docIds);
  
  if (docIds.length === uniqueDocIds.size) {
    console.log('✅ No duplicate docIds (idempotent writes confirmed)');
    return true;
  } else {
    console.log(`❌ FAIL: Found ${docIds.length - uniqueDocIds.size} duplicate docIds`);
    return false;
  }
}

async function verifyGapDetection() {
  console.log('\n=== TEST 2: GAP DETECTION ===\n');
  
  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/heartbeats?limit=100`);
  
  if (!response.success || response.count < 10) {
    console.log('❌ FAIL: Not enough heartbeats for gap detection');
    return false;
  }
  
  console.log(`✅ Found ${response.count} heartbeats for analysis`);
  
  // Parse timestamps and sort
  const timestamps = response.heartbeats
    .map(hb => new Date(hb.tsIso).getTime())
    .sort((a, b) => a - b);
  
  // Calculate intervals
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    const intervalSec = (timestamps[i] - timestamps[i-1]) / 1000;
    intervals.push(intervalSec);
  }
  
  // Expected interval: 60s ± 10s drift
  const expectedInterval = 60;
  const driftSec = 10;
  const minInterval = expectedInterval - driftSec;
  const maxInterval = expectedInterval + driftSec;
  
  let normalIntervals = 0;
  let gaps = [];
  
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i] >= minInterval && intervals[i] <= maxInterval) {
      normalIntervals++;
    } else {
      gaps.push({
        index: i,
        intervalSec: intervals[i],
        missedHeartbeats: Math.floor(intervals[i] / expectedInterval) - 1
      });
    }
  }
  
  console.log(`✅ ${normalIntervals}/${intervals.length} intervals within expected range (${minInterval}-${maxInterval}s)`);
  
  if (gaps.length > 0) {
    console.log(`⚠️  Detected ${gaps.length} gaps:`);
    gaps.forEach(gap => {
      console.log(`   - Gap ${gap.index}: ${gap.intervalSec.toFixed(1)}s (${gap.missedHeartbeats} missed heartbeats)`);
    });
  } else {
    console.log('✅ No gaps detected (100% coverage)');
  }
  
  // Calculate coverage
  const coverage = (normalIntervals / intervals.length) * 100;
  console.log(`✅ Coverage: ${coverage.toFixed(1)}%`);
  
  return coverage >= 80; // 80% threshold
}

async function verifyDistributedLock() {
  console.log('\n=== TEST 3: DISTRIBUTED LOCK ===\n');
  
  // Check if multiple instances are writing heartbeats
  const response = await httpsGet(`${BASE_URL}/api/admin/longrun/heartbeats?limit=50`);
  
  if (!response.success || response.count === 0) {
    console.log('❌ FAIL: No heartbeats found');
    return false;
  }
  
  // Extract unique instanceIds
  const instanceIds = new Set(response.heartbeats.map(hb => hb.instanceId));
  
  console.log(`✅ Found ${instanceIds.size} unique instance(s):`);
  instanceIds.forEach(id => console.log(`   - ${id}`));
  
  if (instanceIds.size === 1) {
    console.log('✅ Single instance writing (distributed lock working)');
    return true;
  } else {
    console.log(`⚠️  Multiple instances detected (${instanceIds.size})`);
    
    // Check if instances overlap in time (would indicate lock failure)
    const instanceTimestamps = {};
    response.heartbeats.forEach(hb => {
      if (!instanceTimestamps[hb.instanceId]) {
        instanceTimestamps[hb.instanceId] = [];
      }
      instanceTimestamps[hb.instanceId].push(new Date(hb.tsIso).getTime());
    });
    
    // Check for overlaps
    const instances = Object.keys(instanceTimestamps);
    let overlaps = 0;
    
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const ts1 = instanceTimestamps[instances[i]];
        const ts2 = instanceTimestamps[instances[j]];
        
        const min1 = Math.min(...ts1);
        const max1 = Math.max(...ts1);
        const min2 = Math.min(...ts2);
        const max2 = Math.max(...ts2);
        
        if ((min1 <= max2 && max1 >= min2)) {
          overlaps++;
          console.log(`❌ OVERLAP: ${instances[i]} and ${instances[j]}`);
        }
      }
    }
    
    if (overlaps === 0) {
      console.log('✅ No overlaps detected (sequential instances, lock working)');
      return true;
    } else {
      console.log(`❌ FAIL: ${overlaps} overlaps detected (lock NOT working)`);
      return false;
    }
  }
}

async function main() {
  console.log('🔍 VERIFYING RESTART-SAFE JOBS');
  console.log(`📍 Base URL: ${BASE_URL}\n`);
  
  try {
    const test1 = await verifyIdempotentWrites();
    const test2 = await verifyGapDetection();
    const test3 = await verifyDistributedLock();
    
    console.log('\n=== SUMMARY ===\n');
    console.log(`Idempotent writes: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Gap detection: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Distributed lock: ${test3 ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = test1 && test2 && test3;
    console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
