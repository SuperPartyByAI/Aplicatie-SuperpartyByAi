# WhatsApp Production Stability - Implementation Progress

## Completed (PR1 Scope)

### 1. Baseline Audit ✅
- Documented all outbox writers (kyc-app, whatsapp-backend)
- Identified duplicate send paths (flush on connect)
- Documented in `WHATSAPP_BASELINE_AUDIT.md`

### 2. Server-Only Outbox ✅
- **firestore.rules**: Changed `/outbox` to `allow create, update, delete: if false` (server-only)
- **kyc-app**: Updated `ChatClientiRealtime.jsx` to call Functions proxy instead of direct Firestore write
- **Flutter**: Already uses `sendViaProxy` (no changes needed)

### 3. Functions Proxy Send ✅
- **functions/whatsappProxy.js**: Added `POST /whatsappProxySend` endpoint
  - Employee auth required
  - Owner/co-writer policy enforcement
  - AccountId spoofing prevention
  - Deterministic requestId (idempotency)
  - Transaction-based atomic ownerUid setting
  - Fixed `FieldValue.arrayUnion()` bug (no empty args)
- **functions/index.js**: Exported `whatsappProxySend`

### 4. Remove Duplicate Send Paths ✅
- **whatsapp-backend/server.js**: Removed flush outbox on connect handlers (2 locations)
- Single sending path: only outbox worker loop

### 5. Distributed Leasing (Partial) 🔄
- **whatsapp-backend/server.js**: Added distributed leasing to outbox worker
  - Transaction-based claim (status=queued AND lease expired)
  - Lease TTL: 60 seconds
  - Lease refresh every 30s while sending
  - Worker ID from `RAILWAY_DEPLOYMENT_ID` or `HOSTNAME`
- **TODO**: Account connection leasing (not yet implemented)

## Remaining (PR2 Scope)

### 6. Inbound Dedupe ⏳
- Need to add dedupe collection: `inboundDedupe/{accountId}__{providerMessageId}`
- Transaction: create if absent, skip if exists
- TTL or capped retention

### 7. Observability ⏳
- Add `/healthz` endpoint (process alive)
- Add `/readyz` endpoint (firestore available, worker running, leases ok)
- Add `/metrics-json` endpoint:
  - activeAccounts
  - queuedCount, processingCount, sentLast5m, failedLast5m
  - reconnectCount
  - outboxLagSeconds

### 8. Tests ⏳
- Functions: Extend `whatsappProxy.test.js` with send endpoint tests
- whatsapp-backend: Unit tests for lease transaction behavior
- Ensure two workers cannot claim same outbox doc concurrently
- Ensure reconnect does NOT send outbox directly

### 9. CI ⏳
- Update GitHub Actions to run:
  - `functions: npm test`
  - `whatsapp-backend: npm test`
  - Ensure failing tests block PR

### 10. Runbook ⏳
- Create `docs/WHATSAPP_PROD_RUNBOOK.md` with:
  - Required env vars (no values)
  - Railway scaling guidance
  - Deployment steps
  - Verification checklist
  - Troubleshooting guide

## Files Changed (PR1)

1. `firestore.rules` - Server-only outbox writes
2. `kyc-app/kyc-app/src/components/ChatClientiRealtime.jsx` - Use proxy instead of direct write
3. `functions/whatsappProxy.js` - Added send endpoint
4. `functions/index.js` - Export send endpoint
5. `whatsapp-backend/server.js` - Removed flush handlers, added distributed leasing

## Next Steps

1. Complete inbound dedupe
2. Add observability endpoints
3. Write tests
4. Update CI
5. Create runbook
6. Create PR2
