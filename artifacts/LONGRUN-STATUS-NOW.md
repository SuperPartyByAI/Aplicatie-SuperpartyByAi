# Long-Run Status NOW

**Timestamp:** 2025-12-29T22:33:30Z  
**Commit:** 3d4adc99  
**Deployment:** Production Railway

## STATUS: ✅ READY + COLLECTING

### Jobs Active

- ✅ Heartbeat job (60s, idempotent, distributed lock)
- ✅ Outbound probe (6h)
- ✅ Queue probe (24h)
- ✅ Inbound probe (6h, PROBE_SENDER connected)
- ✅ Lock renew (60s)
- ✅ Daily rollup (midnight UTC)

### Accounts

- Operator accounts: 3 connected
- Probe sender: account_1767047506600 (40786522611) connected

### Firestore Schema

```
wa_metrics/longrun/config/current
wa_metrics/longrun/locks/heartbeat-scheduler
wa_metrics/longrun/heartbeats/{bucketId}
wa_metrics/longrun/probes/{probeKey}
wa_metrics/longrun/rollups/{yyyy-mm-dd}
```

### Data Collection

- Started: 2025-12-29T22:28:37Z
- Heartbeats: Collecting (60s interval)
- Probes: Collecting (6h/24h intervals)

### SLO Windows

- 7D: INSUFFICIENT_DATA (need 7 days)
- 30D: INSUFFICIENT_DATA (need 30 days)
- 90D: INSUFFICIENT_DATA (need 90 days)
- 180D: INSUFFICIENT_DATA (need 180 days)

## Next Steps

1. Wait for dataset accumulation
2. Run verify-longrun-dataquality.js after 1 hour
3. Generate reports after 7/30/90/180 days
4. Monitor alerts (when implemented)
