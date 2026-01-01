# Long-Run Stability Runbook

## Overview

Production-grade instrumentation for Baileys WhatsApp service on Railway with Firestore persistence.

## Architecture

- **Provider:** Baileys (@whiskeysockets/baileys)
- **Platform:** Railway
- **Database:** Firestore
- **Monitoring:** Heartbeats (60s) + Probes (6h/24h)

## Jobs

1. **Heartbeat Job (60s)**
   - Writes to: wa_metrics/longrun/heartbeats/{bucketId}
   - Idempotent: bucketId = yyyyMMddTHHmmss
   - Distributed lock: wa_metrics/longrun/locks/heartbeat-scheduler

2. **Outbound Probe (6h)**
   - Writes to: wa*metrics/longrun/probes/OUT*{yyyyMMddHH}
   - Tests: Message send capability

3. **Queue Probe (24h)**
   - Writes to: wa*metrics/longrun/probes/QUEUE*{yyyyMMdd}
   - Tests: Queue/flush mechanism

4. **Inbound Probe (6h)**
   - Writes to: wa*metrics/longrun/probes/IN*{yyyyMMddHH}
   - Requires: PROBE_SENDER account
   - Tests: Message receive capability

5. **Daily Rollup (midnight UTC)**
   - Writes to: wa_metrics/longrun/rollups/{yyyy-mm-dd}
   - Calculates: uptime%, probe pass rates, MTTR

## SLO Definitions

- **Uptime:** >= 99.0% (from heartbeats)
- **Probe Pass Rate:** >= 99.0%
- **MTTR P95:** <= 60s
- **Insufficient Data Threshold:** < 80% coverage

## Verification

```bash
# Data quality (after 1 hour)
node scripts/verify-longrun-dataquality.js

# SLO windows (after 7/30/90/180 days)
node scripts/verify-longrun-windows.js

# Generate reports
node scripts/generate-longrun-report.js
```

## Troubleshooting

- **No heartbeats:** Check distributed lock holder
- **Probe FAIL:** Check account connectivity
- **Gap in data:** Check service uptime/restarts
