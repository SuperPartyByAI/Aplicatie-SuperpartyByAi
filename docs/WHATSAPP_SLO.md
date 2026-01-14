## WhatsApp SLO/SLI (Definition of “Healthy”)

### Purpose
The connector exports measurable SLIs via `GET /health`, and computes an overall `healthy: true|false` using the thresholds below.

### SLIs
- **heartbeatAgeSec** (per account): seconds since `whatsapp_accounts/{id}.lastSeenAt` (only meaningful when `status == "connected"`).
- **eventAgeSec** (per account): seconds since `whatsapp_accounts/{id}.lastEventAt` (WA activity; receipts, upserts, sends).
- **ingestLagSec**: seconds since the oldest unprocessed WAL event (`whatsapp_ingest where processed=false orderBy(receivedAt asc) limit 500`).
- **outboxBacklog**: count of queued/failed outbox items in the oldest-first window (`whatsapp_outbox where status in ["queued","failed"] limit 500`).
- **reconnectsPerHour** (per account): rolling 1h reconnect counter (`reconnectWindow*` fields).
- **outboxFailureRate** (per account): rolling 1h outbox failure counter (`outboxFailureWindow*` fields).
- **mediaFailureRate** (per account): rolling 1h media failure counter (`mediaFailureWindow*` fields).

### Thresholds (current)
- **heartbeatStaleSec**: 60
- **eventStaleSec**: 600
- **ingestLagWarnSec**: 120
- **outboxBacklogWarn**: 100
- **reconnectsPerHourWarn**: 10
- **outboxFailureRateWarn**: 20
- **mediaFailureRateWarn**: 5

### “healthy” computation (current)
`healthy` is `true` iff:
- no account has `status == "connected"` with `heartbeatAgeSec > heartbeatStaleSec`, AND
- no account has `status == "connected"` with `eventAgeSec > eventStaleSec`, AND
- `ingestLagSec <= ingestLagWarnSec`, AND
- `outboxBacklog <= outboxBacklogWarn`, AND
- no account exceeds `reconnectsPerHourWarn`, AND
- no account exceeds `outboxFailureRateWarn`, AND
- no account exceeds `mediaFailureRateWarn`

### Incident triggers (recommended)
- `healthy == false` for > 5 minutes
- any account enters `degraded == true`
- repeated `needs_qr` / `logged_out` transitions

