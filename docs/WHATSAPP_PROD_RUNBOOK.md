# WhatsApp Production Runbook

## Overview

This runbook covers deployment, verification, and troubleshooting for the WhatsApp messaging system with production-stable features:
- Server-only outbox writes (via Functions proxy)
- Distributed leasing for multi-instance safety
- Inbound deduplication
- Observability endpoints

## Required Environment Variables

### Firebase Functions
- `WHATSAPP_RAILWAY_BASE_URL` - Railway backend base URL (e.g., `https://whats-upp-production.up.railway.app`)
- Firebase project ID (from Firebase config)

### WhatsApp Backend (Railway)
- `RAILWAY_DEPLOYMENT_ID` - Unique instance ID (auto-set by Railway)
- `HOSTNAME` - Fallback instance ID if `RAILWAY_DEPLOYMENT_ID` not set
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key (base64 or JSON)
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `BAILEYS_BASE_URL` - Base URL for Baileys endpoints (optional)

## Deployment Steps

### 1. Deploy Firebase Functions

```bash
cd functions
npm install
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
```

### 2. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### 3. Deploy WhatsApp Backend (Railway)

- Push to main branch (Railway auto-deploys)
- OR manually trigger deployment via Railway dashboard

### 4. Configure Railway Environment Variables

In Railway dashboard, set:
- `RAILWAY_DEPLOYMENT_ID` (auto-set, but verify)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`

### 5. Scale Railway Instances

**Single Instance (Recommended for Start):**
- Start with 1 instance
- Monitor metrics before scaling

**Multi-Instance (Requires Leases Enabled):**
- Ensure `RAILWAY_DEPLOYMENT_ID` is unique per instance
- Leases are automatically handled (60s TTL)
- Monitor `/metrics-json` for queue distribution

## Verification Checklist

### 1. Functions Proxy
```bash
# Test send endpoint (requires Firebase ID token)
curl -X POST https://us-central1-<project>.cloudfunctions.net/whatsappProxySend \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "test_thread",
    "accountId": "test_account",
    "toJid": "+40712345678@s.whatsapp.net",
    "text": "Test message",
    "clientMessageId": "test_123"
  }'
```

Expected: `{"success": true, "requestId": "...", "duplicate": false}`

### 2. Firestore Rules
- Attempt to write to `/outbox` from client → Should be denied
- Functions proxy write → Should succeed (uses Admin SDK)

### 3. WhatsApp Backend Health
```bash
curl https://whats-upp-production.up.railway.app/healthz
# Expected: {"status": "ok", "timestamp": "..."}

curl https://whats-upp-production.up.railway.app/readyz
# Expected: {"status": "ready", "checks": {...}}

curl https://whats-upp-production.up.railway.app/metrics-json
# Expected: {"activeAccounts": N, "queuedCount": N, ...}
```

### 4. Outbox Processing
1. Send message via Functions proxy
2. Check Firestore `/outbox/{requestId}`:
   - Status should be `queued` initially
   - After worker processes: `sent` or `failed`
   - `claimedBy` should be set (worker instance ID)
   - `leaseUntil` should be set (60s TTL)

### 5. Inbound Dedupe
1. Send same message twice (same `providerMessageId`)
2. Check Firestore `/inboundDedupe/{accountId}__{messageId}`
3. Second message should be skipped (dedupe)

### 6. Multi-Instance Safety
1. Deploy 2+ Railway instances
2. Send multiple messages
3. Verify:
   - Each message is claimed by only one instance (`claimedBy` field)
   - No duplicate sends (check WhatsApp message IDs)
   - Leases expire after 60s if worker crashes

## Troubleshooting

### Issue: Messages stuck in `queued` status

**Symptoms:**
- Outbox messages remain `queued` for > 5 minutes
- `/metrics-json` shows high `queuedCount`

**Diagnosis:**
1. Check `/readyz` - is Firestore available?
2. Check worker logs for errors
3. Check if account is `connected` (not `disconnected` or `needs_qr`)

**Fix:**
- Ensure WhatsApp account is connected (scan QR if needed)
- Check worker logs for errors
- Verify Firestore connectivity

### Issue: Duplicate sends

**Symptoms:**
- Same message sent twice to WhatsApp
- Multiple `sent` status updates for same `requestId`

**Diagnosis:**
1. Check if flush handlers were removed (should not exist)
2. Check if multiple instances are processing same message
3. Verify lease mechanism is working (`claimedBy` should be unique)

**Fix:**
- Ensure flush handlers are removed (check `whatsapp-backend/server.js`)
- Verify `RAILWAY_DEPLOYMENT_ID` is unique per instance
- Check lease TTL (should be 60s)

### Issue: Functions proxy returns 403

**Symptoms:**
- `POST /whatsappProxySend` returns 403
- Error: "Only thread owner or co-writers can send messages"

**Diagnosis:**
- User is not thread owner or co-writer
- Thread `ownerUid` is set but user doesn't match

**Fix:**
- First sender becomes owner automatically
- Add user to `coWriterUids` array in thread document

### Issue: High outbox lag

**Symptoms:**
- `/metrics-json` shows high `outboxLagSeconds`
- Messages take > 1 minute to send

**Diagnosis:**
1. Check `queuedCount` and `processingCount`
2. Check if accounts are connected
3. Check worker interval (should be ~5s)

**Fix:**
- Scale up Railway instances if queue is large
- Ensure accounts are connected
- Check for worker errors

### Issue: Inbound messages not saved

**Symptoms:**
- Messages received but not in Firestore
- No thread updates

**Diagnosis:**
1. Check Firestore connectivity (`/readyz`)
2. Check dedupe collection (may be skipping duplicates incorrectly)
3. Check `messages.upsert` handler logs

**Fix:**
- Verify Firestore credentials
- Check dedupe logic (should only skip if already processed)
- Review handler logs for errors

## Monitoring

### Key Metrics (from `/metrics-json`)

- `activeAccounts`: Number of connected WhatsApp accounts
- `queuedCount`: Messages waiting to be sent
- `processingCount`: Messages currently being sent
- `sentLast5m`: Messages sent in last 5 minutes
- `failedLast5m`: Messages failed in last 5 minutes
- `reconnectCount`: Total reconnection attempts
- `outboxLagSeconds`: Age of oldest queued message

### Alert Thresholds

- `outboxLagSeconds > 300` (5 minutes) → Investigate worker
- `failedLast5m > 10` → Check account connectivity
- `queuedCount > 100` → Consider scaling
- `activeAccounts === 0` → All accounts disconnected

## Scaling Guidelines

### Single Instance
- Handles ~100 messages/minute
- Suitable for < 10 accounts

### Multi-Instance (2-5 instances)
- Each instance handles ~100 messages/minute
- Leases prevent duplicate processing
- Monitor `/metrics-json` for even distribution

### High Scale (10+ instances)
- Consider sharding by `accountId`
- Monitor lease contention
- Use dedicated queue per account if needed

## Rollback Procedure

If issues occur after deployment:

1. **Rollback Functions:**
   ```bash
   firebase functions:rollback
   ```

2. **Rollback Firestore Rules:**
   ```bash
   git checkout HEAD~1 firestore.rules
   firebase deploy --only firestore:rules
   ```

3. **Rollback Railway:**
   - Use Railway dashboard to rollback to previous deployment
   - OR revert git commit and push

## Support Contacts

- Technical Lead: [Your contact]
- On-Call Engineer: [On-call rotation]
