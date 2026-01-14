## WhatsApp SLO/SLI (Definition of “Healthy”)

### Purpose
The connector exports measurable SLIs via `GET /health`, and computes an overall `healthy: true|false` using the thresholds below.

### SLIs
- **heartbeatAgeSec** (per account): seconds since `whatsapp_accounts/{id}.lastSeenAt` (only meaningful when `status == "connected"`).
- **ingestLagSec**: seconds since the oldest unprocessed WAL event (`whatsapp_ingest where processed=false orderBy(receivedAt asc) limit 1`).
- **outboxBacklog**: count of queued/failed outbox items in the oldest-first window (`whatsapp_outbox where status in ["queued","failed"] limit 50`).

### Thresholds (current)
- **heartbeatStaleSec**: 60
- **ingestLagWarnSec**: 120
- **outboxBacklogWarn**: 100

### “healthy” computation (current)
`healthy` is `true` iff:
- no account has `status == "connected"` with `heartbeatAgeSec > heartbeatStaleSec`, AND
- `ingestLagSec <= ingestLagWarnSec`, AND
- `outboxBacklog <= outboxBacklogWarn`

### Incident triggers (recommended)
- `healthy == false` for > 5 minutes
- any account enters `degraded == true`
- repeated `needs_qr` / `logged_out` transitions

