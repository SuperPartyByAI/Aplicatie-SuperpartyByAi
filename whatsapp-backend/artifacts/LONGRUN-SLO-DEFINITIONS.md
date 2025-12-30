# Long-Run SLO Definitions

**Version:** 2.0.0  
**Last Updated:** 2025-12-30  
**Owner:** Platform Team

---

## 1. Uptime SLO

### Definition
Percentage of expected heartbeats successfully written to Firestore within a time window.

### Formula
```
uptime% = (writtenHb / expectedHb) × 100

where:
  writtenHb = count of heartbeat docs in window
  expectedHb = (windowDurationMin / heartbeatIntervalMin)
  heartbeatIntervalMin = 1 (60 seconds)
```

### Targets
| Window | Target | Threshold |
|--------|--------|-----------|
| 7 days | ≥ 99.0% | PASS if ≥ 99.0% |
| 30 days | ≥ 99.5% | PASS if ≥ 99.5% |
| 90 days | ≥ 99.7% | PASS if ≥ 99.7% |
| 180 days | ≥ 99.8% | PASS if ≥ 99.8% |

### INSUFFICIENT_DATA Rule
```
insufficientData = (numericCoverage < insufficientDataThreshold)

where:
  numericCoverage = writtenHb / expectedHb
  insufficientDataThreshold = 0.8 (from config)
```

**Interpretation:**
- If `numericCoverage < 0.8`: Report "INSUFFICIENT_DATA" instead of PASS/FAIL
- Requires at least 80% of expected heartbeats to calculate valid uptime

### Example Calculation (7-day window)
```
windowDurationMin = 7 × 24 × 60 = 10,080 minutes
expectedHb = 10,080 / 1 = 10,080 heartbeats
writtenHb = 9,990 (from Firestore query)
missedHb = 10,080 - 9,990 = 90

uptime% = (9,990 / 10,080) × 100 = 99.11%
numericCoverage = 9,990 / 10,080 = 0.991

Result: PASS (99.11% ≥ 99.0%)
```

---

## 2. MTTR (Mean Time To Recovery)

### Definition
Time elapsed from incident start to resolution, measured in seconds.

### Formula
```
mttrSec = tsEnd - tsStart

where:
  tsStart = incident start timestamp (milliseconds)
  tsEnd = incident resolution timestamp (milliseconds)
  mttrSec = (tsEnd - tsStart) / 1000
```

### Percentiles
```
mttrP50 = median of all mttrSec values in window
mttrP90 = 90th percentile of mttrSec values
mttrP95 = 95th percentile of mttrSec values
```

### Targets
| Metric | Target | Threshold |
|--------|--------|-----------|
| MTTR P50 | ≤ 120s | PASS if ≤ 120s |
| MTTR P90 | ≤ 300s | PASS if ≤ 300s |
| MTTR P95 | ≤ 600s | PASS if ≤ 600s |

### Example Calculation
```
Incidents in window:
  - Incident 1: tsStart=1000, tsEnd=1120 → mttrSec=120
  - Incident 2: tsStart=2000, tsEnd=2050 → mttrSec=50
  - Incident 3: tsStart=3000, tsEnd=3400 → mttrSec=400

Sorted: [50, 120, 400]

mttrP50 = 120 (median)
mttrP90 = 400 (90th percentile, index 2)
mttrP95 = 400 (95th percentile, index 2)

Result: 
  - P50: PASS (120 ≤ 120)
  - P90: FAIL (400 > 300)
  - P95: PASS (400 ≤ 600)
```

---

## 3. Probe Success Rate

### Definition
Percentage of probe executions that returned PASS result.

### Formula
```
probePassRate% = (passCount / totalCount) × 100

where:
  passCount = count of probes with result='PASS'
  totalCount = count of all probes (PASS + FAIL)
```

### Targets (per probe type)
| Probe Type | Target | Threshold |
|------------|--------|-----------|
| Outbound | ≥ 95.0% | PASS if ≥ 95.0% |
| Inbound | ≥ 95.0% | PASS if ≥ 95.0% |
| Queue | ≥ 98.0% | PASS if ≥ 98.0% |

### Example Calculation
```
Outbound probes in 7-day window:
  - PASS: 27
  - FAIL: 1
  - Total: 28

probePassRate% = (27 / 28) × 100 = 96.43%

Result: PASS (96.43% ≥ 95.0%)
```

---

## 4. Missed Heartbeat Detection

### Definition
Gap between consecutive heartbeats exceeding threshold.

### Formula
```
gap = (hb[i].ts - hb[i-1].ts) / 1000  // seconds

missedHeartbeat = (gap > 2 × heartbeatIntervalSec)

where:
  heartbeatIntervalSec = 60 (from config)
  threshold = 2 × 60 = 120 seconds
```

### Alert Threshold
```
missedHbPerHour > alertThresholds.missedHbPerHour

where:
  alertThresholds.missedHbPerHour = 3 (from config)
```

**Action:** Create incident doc when threshold exceeded.

### Example
```
Heartbeats:
  - hb1: ts=1000
  - hb2: ts=1060 → gap=60s (OK)
  - hb3: ts=1180 → gap=120s (OK, at threshold)
  - hb4: ts=1320 → gap=140s (MISSED, gap > 120s)

missedHbCount = 1

If missedHbCount > 3 in last hour:
  → Create incident: type='missed_heartbeat'
```

---

## 5. Consecutive Probe Failures

### Definition
Number of consecutive probe executions with FAIL result.

### Formula
```
consecutiveFails = count of consecutive probes with result='FAIL'
```

### Alert Threshold
```
consecutiveFails >= alertThresholds.consecutiveProbeFails

where:
  alertThresholds.consecutiveProbeFails = 2 (from config)
```

**Action:** Create incident doc when threshold exceeded.

### Example
```
Probes (most recent first):
  - probe1: FAIL
  - probe2: FAIL
  - probe3: PASS
  - probe4: FAIL

consecutiveFails = 2 (probe1 + probe2)

Result: ALERT (2 >= 2)
  → Create incident: type='probe_fail'
```

---

## 6. Data Quality Coverage

### Definition
Ratio of actual data points to expected data points in a window.

### Formula
```
numericCoverage = writtenHb / expectedHb

where:
  writtenHb = count of heartbeat docs in window
  expectedHb = (windowDurationMin / heartbeatIntervalMin)
```

### Thresholds
| Coverage | Status |
|----------|--------|
| ≥ 0.8 | SUFFICIENT_DATA |
| < 0.8 | INSUFFICIENT_DATA |

### Example
```
7-day window:
  expectedHb = 10,080
  writtenHb = 7,500

numericCoverage = 7,500 / 10,080 = 0.744

Result: INSUFFICIENT_DATA (0.744 < 0.8)
  → Cannot calculate valid uptime% for this window
```

---

## 7. Drift Detection

### Definition
Deviation of actual heartbeat interval from expected interval.

### Formula
```
driftSec = |actualIntervalSec - expectedIntervalSec|

where:
  actualIntervalSec = (currentHb.ts - previousHb.ts) / 1000
  expectedIntervalSec = 60 (from config)
```

### Acceptable Drift
```
acceptableDrift = config.driftSec = 10 seconds
```

### Alert Threshold
```
driftSec > acceptableDrift
```

### Example
```
Heartbeats:
  - hb1: ts=1000
  - hb2: ts=1072

actualIntervalSec = (1072 - 1000) / 1000 = 72
driftSec = |72 - 60| = 12

Result: DRIFT_EXCEEDED (12 > 10)
  → Log warning, but no incident (drift is expected occasionally)
```

---

## 8. Window Calculations

### 7-Day Window
```
windowStart = now - (7 × 24 × 60 × 60 × 1000)
windowEnd = now
expectedHb = 7 × 24 × 60 = 10,080
```

### 30-Day Window
```
windowStart = now - (30 × 24 × 60 × 60 × 1000)
windowEnd = now
expectedHb = 30 × 24 × 60 = 43,200
```

### 90-Day Window
```
windowStart = now - (90 × 24 × 60 × 60 × 1000)
windowEnd = now
expectedHb = 90 × 24 × 60 = 129,600
```

### 180-Day Window
```
windowStart = now - (180 × 24 × 60 × 60 × 1000)
windowEnd = now
expectedHb = 180 × 24 × 60 = 259,200
```

---

## 9. Firestore Query Examples

### Get heartbeats for 7-day window
```javascript
const now = Date.now();
const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

const snapshot = await db.collection('wa_metrics')
  .doc('longrun')
  .collection('heartbeats')
  .where('tsIso', '>=', new Date(sevenDaysAgo).toISOString())
  .where('tsIso', '<=', new Date(now).toISOString())
  .get();

const writtenHb = snapshot.size;
const expectedHb = 7 * 24 * 60;
const uptime = (writtenHb / expectedHb) * 100;
```

### Get incidents for MTTR calculation
```javascript
const incidents = [];
const snapshot = await db.collection('wa_metrics')
  .doc('longrun')
  .collection('incidents')
  .where('tsStart', '>=', sevenDaysAgo)
  .where('tsStart', '<=', now)
  .get();

snapshot.forEach(doc => {
  const data = doc.data();
  if (data.mttrSec !== null) {
    incidents.push(data.mttrSec);
  }
});

incidents.sort((a, b) => a - b);
const mttrP50 = incidents[Math.floor(incidents.length * 0.5)];
```

---

## 10. Report Format

### Daily Rollup Document
```json
{
  "date": "2025-12-30",
  "expectedHb": 1440,
  "writtenHb": 1435,
  "missedHb": 5,
  "uptimePct": 99.65,
  "probePassRates": {
    "outbound": 100.0,
    "queue": 100.0,
    "inbound": 95.0
  },
  "mttrP50": 120,
  "mttrP90": 300,
  "mttrP95": 450,
  "incidentsCount": 2,
  "insufficientData": false,
  "numericCoverage": 0.997,
  "commitHash": "cf0ebf49",
  "serviceVersion": "2.0.0",
  "instanceId": "126d3908-fd3d-4616-9e8d-d4aa59a9ba50"
}
```

### Window Report
```json
{
  "window": "7d",
  "status": "PASS",
  "uptime": 99.11,
  "target": 99.0,
  "mttrP50": 120,
  "mttrP90": 280,
  "mttrP95": 450,
  "probePassRates": {
    "outbound": 96.43,
    "queue": 100.0,
    "inbound": "INSUFFICIENT_DATA"
  },
  "insufficientData": false,
  "numericCoverage": 0.991
}
```

---

## 11. Acceptance Criteria

### PASS Conditions
All of the following must be true:
1. `numericCoverage >= 0.8` (sufficient data)
2. `uptime% >= target` (meets SLO)
3. `mttrP50 <= 120s` (fast recovery)
4. `mttrP90 <= 300s` (acceptable worst case)
5. `probePassRate% >= target` (probes healthy)

### INSUFFICIENT_DATA Conditions
Any of the following:
1. `numericCoverage < 0.8`
2. `writtenHb < (expectedHb * 0.8)`
3. Window duration < 24 hours (not enough time)

### FAIL Conditions
1. `numericCoverage >= 0.8` AND
2. `uptime% < target` OR `mttrP90 > 300s` OR `probePassRate% < target`

---

## 12. Configuration Reference

All thresholds configurable via `wa_metrics/longrun/config/current`:

```json
{
  "heartbeatIntervalSec": 60,
  "driftSec": 10,
  "insufficientDataThreshold": 0.8,
  "alertThresholds": {
    "missedHbPerHour": 3,
    "consecutiveProbeFails": 2,
    "queueDepthThreshold": 100,
    "reconnectLoopThreshold": 10
  }
}
```

---

**END OF SLO DEFINITIONS**
