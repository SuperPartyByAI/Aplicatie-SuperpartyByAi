## WhatsApp WAL replay (ops tooling)

### Why this exists
Firestore is an **operational mirror**; the WAL (`whatsapp_ingest/*`) is the durable “raw event” log. If projections (`whatsapp_messages/*`, `whatsapp_threads/*`) fall behind or are corrupted by a transient bug, we can **replay WAL** safely because projections are **idempotent**.

### Tool
Script: `whatsapp-connector/scripts/wal_replay.js`

### Required env
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Admin SDK JSON string)
- `FIREBASE_PROJECT_ID` (optional if present in JSON)
- Optional: `LOG_LEVEL=info`

### Usage

Replay a time window for a single account:

```bash
node whatsapp-connector/scripts/wal_replay.js --accountId wa_xxx --since "2026-01-14T00:00:00Z" --until "2026-01-14T23:59:59Z"
```

Dry-run (reads only, prints counts):

```bash
node whatsapp-connector/scripts/wal_replay.js --accountId wa_xxx --since "2026-01-14T00:00:00Z" --until "2026-01-14T23:59:59Z" --dryRun 1
```

### Expected output
- `processed`: number of WAL docs processed
- `skippedAlreadyProcessed`: number skipped because `processed == true` (unless `--force`)
- `dlqMoved`: number moved to `whatsapp_ingest_deadletter`
- `errors`: count of unexpected failures

### Safety properties
- **Deterministic IDs** prevent duplicates (WAL id + message id).
- Projection uses `create()` where applicable and `merge` upserts where safe.
- Can be run multiple times on the same window.

