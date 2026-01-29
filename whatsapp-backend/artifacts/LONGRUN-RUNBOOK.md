# Long-Run Instrumentation Runbook

**Version:** 2.0.0  
**Last Updated:** 2025-12-30  
**Audience:** Platform Operators, SRE, DevOps

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Normal Operations](#normal-operations)
3. [Monitoring & Alerts](#monitoring--alerts)
4. [Troubleshooting](#troubleshooting)
5. [Recovery Procedures](#recovery-procedures)
6. [Maintenance](#maintenance)
7. [Incident Response](#incident-response)

---

## Architecture Overview

### Components

```
Hetzner Server (Node.js)
  ├── longrun-jobs-v2.js (scheduler)
  │   ├── Heartbeat job (60s interval)
  │   ├── Outbound probe (6h interval)
  │   ├── Queue probe (24h interval)
  │   ├── Inbound probe (6h interval, requires probe sender)
  │   ├── Daily rollup (midnight UTC)
  │   └── Alert monitoring (1h interval)
  │
  └── Firestore (persistence)
      ├── wa_metrics/longrun/config/current
      ├── wa_metrics/longrun/locks/{lockName}
      ├── wa_metrics/longrun/heartbeats/{bucketId}
      ├── wa_metrics/longrun/probes/{probeKey}
      ├── wa_metrics/longrun/incidents/{incidentId}
      └── wa_metrics/longrun/rollups/{yyyy-mm-dd}
```

### Data Flow

```
1. Heartbeat (every 60s)
   → Write to Firestore: wa_metrics/longrun/heartbeats/{bucketId}
   → Include: commitHash, serviceVersion, instanceId, uptime, memory, connectedCount

2. Probes (scheduled)
   → Outbound: 6h → wa_metrics/longrun/probes/OUT_{yyyyMMddHH}
   → Queue: 24h → wa_metrics/longrun/probes/QUEUE_{yyyyMMdd}
   → Inbound: 6h → wa_metrics/longrun/probes/IN_{yyyyMMddHH}

3. Alert Monitoring (every 1h)
   → Check missed heartbeats
   → Check consecutive probe failures
   → Create incident docs if thresholds exceeded

4. Daily Rollup (midnight UTC)
   → Aggregate previous day's data
   → Calculate uptime%, MTTR, probe pass rates
   → Write to wa_metrics/longrun/rollups/{yyyy-mm-dd}
```

---

## Normal Operations

### Starting the System

**Automatic (Hetzner systemd service):**

```bash
# systemd automatically starts server.js on boot
# longrun-jobs-v2.js initializes on boot
# Distributed lock acquired by first instance
```

**Manual (local development):**

```bash
cd whatsapp-backend
export FIREBASE_SERVICE_ACCOUNT_JSON='...'
node server.js
```

**Expected logs:**

```
🔧 Initializing long-run jobs (instanceId: 126d3908-...)
✅ Config initialized
🔒 Lock acquired: heartbeat-scheduler
💓 Heartbeat: 2025-12-30T08-00-00 (uptime=120s, connected=3, drift=0s)
✅ Long-run jobs initialized
✅ Alert monitoring started
📅 Daily rollup scheduled for 2025-12-31T00:00:00.000Z
```

### Stopping the System

**Graceful shutdown:**

```bash
# Send SIGTERM to process
kill -TERM <pid>

# Or via Hetzner SSH
# Click "Stop" on service
```

**Expected behavior:**

- Heartbeat job stops
- Lock released (expires after 120s)
- No data loss (last heartbeat persisted)

### Health Checks

**1. Check heartbeats (last hour):**

```bash
curl https://whats-app-ompro.ro/api/admin/longrun/heartbeats | jq '.count'
# Expected: ~60 (1 per minute)
```

**2. Check config:**

```bash
curl https://whats-app-ompro.ro/api/admin/longrun/config | jq '.config'
```

**3. Check probes:**

```bash
curl https://whats-app-ompro.ro/api/admin/longrun/probes | jq '.count'
```

**4. Check locks:**

```bash
curl https://whats-app-ompro.ro/api/admin/longrun/locks | jq '.locks'
```

---

## Monitoring & Alerts

### Key Metrics

**1. Heartbeat Coverage**

- **What:** Percentage of expected heartbeats written
- **Target:** ≥ 99% (7-day window)
- **Alert:** < 95% for 1 hour
- **Query:**
  ```javascript
  const expectedHb = 60; // last hour
  const actualHb = heartbeatsSnapshot.size;
  const coverage = (actualHb / expectedHb) * 100;
  ```

**2. Max Gap Between Heartbeats**

- **What:** Longest interval between consecutive heartbeats
- **Target:** ≤ 120s
- **Alert:** > 180s
- **Query:** See `verify-longrun-dataquality.js`

**3. Probe Success Rate**

- **What:** Percentage of probes returning PASS
- **Target:** ≥ 95% (outbound/inbound), ≥ 98% (queue)
- **Alert:** < 90% or 2+ consecutive failures

**4. Incident Count**

- **What:** Number of incidents per day
- **Target:** ≤ 5
- **Alert:** > 10

### Alert Channels

**Telegram (if configured):**

- Missed heartbeats > 3 in 1 hour
- Consecutive probe failures ≥ 2
- Daily rollup failures

**Firestore Incidents:**

- All alerts create incident docs
- Query: `wa_metrics/longrun/incidents`

---

## Troubleshooting

### Problem: No Heartbeats Written

**Symptoms:**

- `/api/admin/longrun/heartbeats` returns count=0
- No recent heartbeat docs in Firestore

**Diagnosis:**

```bash
# Check if jobs are running
curl https://whats-app-ompro.ro/health | jq '.uptime'

# Check Hetzner logs
journalctl -u whatsapp-backend --tail 100

# Check lock status
curl https://whats-app-ompro.ro/api/admin/longrun/locks | jq '.locks'
```

**Possible Causes:**

1. **Lock held by another instance**
   - Check `locks` collection
   - If `leaseUntilTs` > now, another instance is active
   - **Fix:** Wait for lease to expire (120s) or manually delete lock

2. **Firestore connection failed**
   - Check `FIREBASE_SERVICE_ACCOUNT_JSON` env var
   - Check Hetzner logs for "Firebase Admin initialization failed"
   - **Fix:** Verify credentials, redeploy

3. **Job initialization failed**
   - Check logs for "Long-run jobs initialized"
   - **Fix:** Restart Hetzner service

**Recovery:**

```bash
# Option 1: Wait for lock expiry (120s)
# Option 2: Manual lock release (Firestore Console)
# Delete doc: wa_metrics/longrun/locks/heartbeat-scheduler

# Option 3: Restart Hetzner service
ssh root@37.27.34.179
sudo systemctl restart whatsapp-backend
```

---

### Problem: Missed Heartbeats (Gaps)

**Symptoms:**

- Heartbeat count < expected
- Max gap > 120s
- Incident docs with type='missed_heartbeat'

**Diagnosis:**

```bash
# Run gap analysis
cd whatsapp-backend
node scripts/verify-longrun-dataquality.js

# Check Hetzner uptime
curl https://whats-app-ompro.ro/health | jq '.uptime'
```

**Possible Causes:**

1. **Hetzner service restart**
   - Check systemd logs for restart events
   - Check `deploymentId` changes in heartbeat docs
   - **Expected:** 30-60s gap during restart

2. **High CPU/memory usage**
   - Check `memoryRss` in heartbeat docs
   - Hetzner server: check available memory
   - **Fix:** Upgrade plan or optimize memory usage

3. **Firestore write throttling**
   - Check Firestore quotas in Firebase Console
   - Free tier: 20k writes/day
   - **Fix:** Upgrade Firestore plan

**Recovery:**

- **If transient:** No action needed, system self-recovers
- **If persistent:** Investigate root cause (memory, CPU, network)

---

### Problem: Probe Failures

**Symptoms:**

- Probe docs with result='FAIL'
- Incident docs with type='probe_fail'
- Consecutive failures ≥ 2

**Diagnosis:**

```bash
# Check recent probes
curl https://whats-app-ompro.ro/api/admin/longrun/probes | jq '.probes[] | select(.result=="FAIL")'

# Check probe type
# - outbound: Firestore write test
# - queue: Queue depth check
# - inbound: Message receive test (requires probe sender)
```

**Possible Causes:**

1. **Outbound probe failure**
   - Firestore write permission denied
   - Network timeout
   - **Fix:** Check Firestore rules, network connectivity

2. **Queue probe failure**
   - Queue depth > threshold (100)
   - **Fix:** Investigate message backlog

3. **Inbound probe failure**
   - Probe sender not configured
   - Message not received within timeout
   - **Fix:** Set up probe sender account (see Inbound Probe Setup)

**Recovery:**

```bash
# Manual probe trigger (for testing)
# Not exposed via API, requires code modification
```

---

### Problem: Daily Rollup Not Created

**Symptoms:**

- No rollup doc for yesterday's date
- Missing data in long-run reports

**Diagnosis:**

```bash
# Check if rollup exists
# Firestore Console: wa_metrics/longrun/rollups/{yyyy-mm-dd}

# Check Hetzner logs for "Running daily rollup"
ssh root@37.27.34.179
sudo journalctl -u whatsapp-backend -f | grep "daily rollup"
```

**Possible Causes:**

1. **Rollup already exists (idempotency)**
   - Check Firestore for doc with date key
   - **Expected:** Log shows "already exists, skipping"

2. **Insufficient data**
   - < 80% heartbeat coverage for the day
   - **Expected:** Rollup created with `insufficientData: true`

3. **Firestore query timeout**
   - Large dataset (> 10k docs)
   - **Fix:** Optimize query with pagination

**Recovery:**

```bash
# Manual rollup trigger (requires code modification)
# Or wait for next midnight UTC
```

---

## Recovery Procedures

### Procedure 1: Reset Distributed Lock

**When:** Lock stuck, no heartbeats for > 5 minutes

**Steps:**

1. Verify lock is stuck:

   ```bash
   curl https://whats-app-ompro.ro/api/admin/longrun/locks | jq '.locks'
   # Check leaseUntilTs > now + 120s
   ```

2. Delete lock manually:
   - Go to Firestore Console
   - Navigate to: `wa_metrics/longrun/locks/heartbeat-scheduler`
   - Click "Delete document"

3. Restart Hetzner service:

   ```bash
   ssh root@37.27.34.179
   sudo systemctl restart whatsapp-backend
   ```

4. Verify heartbeats resume:
   ```bash
   # Wait 2 minutes
   curl https://whats-app-ompro.ro/api/admin/longrun/heartbeats | jq '.heartbeats[0]'
   ```

**Expected time:** 3-5 minutes

---

### Procedure 2: Backfill Missing Heartbeats

**When:** Gap > 1 hour due to outage

**Steps:**

1. **DO NOT backfill** - heartbeats are real-time only
2. Document gap in incident:
   - Create incident doc manually in Firestore
   - Type: `missed_heartbeat`
   - Include: tsStart, tsEnd, reason

3. Update daily rollup (if needed):
   - Recalculate uptime% with gap
   - Mark as `insufficientData: true` if coverage < 80%

**Note:** Backfilling defeats the purpose of real-time monitoring.

---

### Procedure 3: Recover from Firestore Outage

**When:** Firestore unavailable, all writes failing

**Steps:**

1. Check Firestore status:
   - https://status.firebase.google.com/

2. If outage confirmed:
   - Wait for Google to resolve
   - No action needed on our side

3. After recovery:
   - Heartbeats resume automatically
   - Gap will be recorded in next rollup
   - Create incident doc for outage duration

**Expected time:** Depends on Google SLA

---

### Procedure 4: Migrate to New Instance

**When:** Hetzner deployment, new service instance

**Steps:**

1. New instance starts:
   - Attempts to acquire lock
   - If lock held, waits for expiry (120s)

2. Lock expires:
   - New instance acquires lock
   - Heartbeats resume with new `instanceId`

3. Verify migration:
   ```bash
   curl https://whats-app-ompro.ro/api/admin/longrun/heartbeats | jq '.heartbeats[0].instanceId'
   # Should match new deployment instance ID
   ```

**Expected time:** 2-3 minutes (lock expiry + initialization)

---

## Maintenance

### Updating Configuration

**Location:** `wa_metrics/longrun/config/current`

**Editable fields:**

```json
{
  "expectedAccounts": 3,
  "heartbeatIntervalSec": 60,
  "driftSec": 10,
  "insufficientDataThreshold": 0.8,
  "alertThresholds": {
    "missedHbPerHour": 3,
    "consecutiveProbeFails": 2
  }
}
```

**Steps:**

1. Update doc in Firestore Console
2. Changes take effect on next job execution
3. No restart required

**Caution:** Changing `heartbeatIntervalSec` requires code change + redeploy.

---

### Cleaning Old Data

**Retention policy:**

- Heartbeats: Keep 90 days
- Probes: Keep 180 days
- Incidents: Keep 365 days
- Rollups: Keep forever

**Manual cleanup:**

```bash
# Delete heartbeats older than 90 days
# Firestore Console: wa_metrics/longrun/heartbeats
# Filter: tsIso < (now - 90 days)
# Bulk delete
```

**Automated cleanup:** Not implemented (TODO)

---

### Upgrading Service Version

**Steps:**

1. Update `serviceVersion` in code:

   ```javascript
   // lib/longrun-jobs-v2.js
   serviceVersion: '2.1.0';
   ```

2. Commit and push:

   ```bash
   git add lib/longrun-jobs-v2.js
   git commit -m "Bump service version to 2.1.0"
   git push origin main
   ```

3. Hetzner service restarts (systemd)

4. Verify new version in heartbeats:
   ```bash
   curl https://whats-app-ompro.ro/api/admin/longrun/heartbeats | jq '.heartbeats[0].serviceVersion'
   ```

---

## Incident Response

### Incident Types

**1. missed_heartbeat**

- **Severity:** P2 (High)
- **Response time:** 15 minutes
- **Action:** Investigate Hetzner logs, check lock status

**2. probe_fail**

- **Severity:** P3 (Medium)
- **Response time:** 1 hour
- **Action:** Check probe type, investigate failure reason

**3. logged_out**

- **Severity:** P1 (Critical)
- **Response time:** 5 minutes
- **Action:** Reconnect WhatsApp account, check auth state

**4. reconnect_loop**

- **Severity:** P2 (High)
- **Response time:** 15 minutes
- **Action:** Enter safe mode, investigate root cause

---

### Incident Workflow

**1. Detection**

- Telegram alert (if configured)
- Incident doc created in Firestore
- Manual monitoring

**2. Triage**

- Check incident type
- Assess severity
- Assign owner

**3. Investigation**

- Check Hetzner logs (journalctl -u whatsapp-backend)
- Query Firestore for related docs
- Run diagnostic scripts

**4. Resolution**

- Apply recovery procedure
- Verify system health
- Update incident doc with `tsEnd` and `mttrSec`

**5. Post-mortem**

- Document root cause
- Update runbook if needed
- Implement preventive measures

---

### Escalation Path

**Level 1:** Platform Operator

- Handle routine incidents
- Follow runbook procedures

**Level 2:** SRE Team

- Complex incidents requiring code changes
- Firestore schema migrations

**Level 3:** Engineering Team

- Architecture changes
- New feature development

---

## Appendix

### Useful Commands

```bash
# Check system health
curl https://whats-app-ompro.ro/health | jq '.'

# Get heartbeat count (last hour)
curl https://whats-app-ompro.ro/api/admin/longrun/heartbeats | jq '.count'

# Get config
curl https://whats-app-ompro.ro/api/admin/longrun/config | jq '.config'

# Get probes
curl https://whats-app-ompro.ro/api/admin/longrun/probes | jq '.probes'

# Get locks
curl https://whats-app-ompro.ro/api/admin/longrun/locks | jq '.locks'

# Run data quality check
cd whatsapp-backend
node scripts/verify-longrun-dataquality.js

# Generate long-run report
node scripts/generate-longrun-report.js
```

### Firestore Paths

```
wa_metrics/longrun/config/current
wa_metrics/longrun/locks/{lockName}
wa_metrics/longrun/heartbeats/{bucketId}
wa_metrics/longrun/probes/{probeKey}
wa_metrics/longrun/incidents/{incidentId}
wa_metrics/longrun/rollups/{yyyy-mm-dd}
wa_metrics/longrun/state/current
```

### Exit Codes

```
0 = Success
1 = Failure
2 = Insufficient data
```

---

**END OF RUNBOOK**
