# WhatsApp Production Runbook

## Overview

This runbook covers deployment, verification, and troubleshooting for the WhatsApp messaging system with production-stable features:
- Server-only outbox writes (via Functions proxy)
- Distributed leasing for multi-instance safety
- Inbound deduplication
- Observability endpoints

## Required Environment Variables

### Firebase Functions
- `WHATSAPP_BACKEND_BASE_URL` - WhatsApp backend base URL (Firebase secret; e.g. Hetzner `http://37.27.34.179:8080`)
- Firebase project ID (from Firebase config)

### WhatsApp Backend (Hetzner or generic)
- `INSTANCE_ID` or `DEPLOYMENT_ID` - Unique instance ID (optional; `HOSTNAME` used as fallback)
- `HOSTNAME` - Fallback instance ID
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key (base64 or JSON)
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `BAILEYS_BASE_URL` - Base URL for Baileys endpoints (optional)

## Deployment Steps

### 1. Deploy Firebase Functions

**Note:** Messages are read only from Firestore `threads/{threadId}/messages`. We do **not** use `whatsappProxyGetMessages`. Deploy `whatsappProxySend` for sending.

```bash
firebase use <alias-proiect>   # e.g. default, production
cd functions
npm install
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyGetAccountsStaff,functions:whatsappProxyGetInbox,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
```

**Verify:**

```bash
firebase functions:list | grep whatsappProxy
# Expect: whatsappProxySend(us-central1), whatsappProxyGetAccountsStaff(us-central1), etc.
```

**Secrets (required for processOutbox / getAccounts proxy → backend):**

```bash
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# Enter value, e.g.: http://37.27.34.179:8080
```

### 1b. Post-Deploy: Cloud Run IAM (Gen2 Functions)

**CRITICAL:** Firebase Functions Gen2 uses Cloud Run, which requires explicit IAM bindings for public access. Without this, you'll see "The request was not authenticated/authorized to invoke this service" errors.

**Option A: Use automated script (recommended)**

```bash
# Linux/Mac
./scripts/cloudrun_make_public.sh

# Windows PowerShell
.\scripts\cloudrun_make_public.ps1
```

**Option B: Manual commands**

```bash
PROJECT_ID="superparty-frontend"
REGION="us-central1"

# List services
gcloud run services list --project="$PROJECT_ID" --region="$REGION" | grep -i whatsappproxy

# Apply IAM for each service
gcloud run services add-iam-policy-binding whatsappproxygetaccountsstaff \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID"

gcloud run services add-iam-policy-binding whatsappproxygetinbox \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID"

# Verify bindings
gcloud run services get-iam-policy whatsappproxygetaccountsstaff --region="$REGION" --project="$PROJECT_ID" | grep -E "allUsers|run.invoker"
gcloud run services get-iam-policy whatsappproxygetinbox --region="$REGION" --project="$PROJECT_ID" | grep -E "allUsers|run.invoker"
```

**Verify IAM is working:**

```bash
# Should get 401 from your app (not Cloud Run "not authenticated" error)
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccountsStaff"
# Expected: 401 with JSON body from your middleware, NOT Cloud Run HTML error page
```

### 2. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### 2b. Deploy Firestore Indexes

Chat streams `threads/{threadId}/messages` with `orderBy('tsClient', descending: true)`. `firestore.indexes.json` includes a `fieldOverrides` entry for collection group `messages`, field `tsClient` (ASC + DESC). Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

**Verify:** `firebase firestore:indexes` (list). New indexes may show "Building" for a few minutes.

**Note:** Chat streams `orderBy('tsClient', descending: true)`. The backend must set `tsClient` on all messages in `threads/{threadId}/messages`. There is no client-side fallback to `createdAt`; missing `tsClient` can cause sort/display issues.

### 3. Deploy WhatsApp Backend (Hetzner / generic)

- Deploy to Hetzner (systemd/Docker) or your host
- Set `WHATSAPP_BACKEND_BASE_URL` in Firebase Functions secrets to backend base URL

### 4. Configure Backend Environment Variables

On the backend host, set:
- `INSTANCE_ID` or `DEPLOYMENT_ID` (optional; `HOSTNAME` fallback)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`

### 5. Scale Backend Instances

**Single Instance (Recommended for Start):**
- Start with 1 instance
- Monitor metrics before scaling

**Multi-Instance (Requires Leases Enabled):**
- Ensure `INSTANCE_ID` or `DEPLOYMENT_ID` is unique per instance
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
# Replace BASE with WHATSAPP_BACKEND_BASE_URL value (e.g. http://37.27.34.179:8080)
curl -s $BASE/health
# Expected: {"ok": true, "status": "healthy", "service": "whatsapp-backend", "version": "...", "commit": "...", "firestore": "connected"|"disabled", ...}

curl $BASE/healthz
# Expected: {"status": "ok", "timestamp": "..."}

curl $BASE/readyz
# Expected: {"status": "ready", "checks": {...}}

curl $BASE/metrics-json
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
1. Deploy 2+ backend instances
2. Send multiple messages
3. Verify:
   - Each message is claimed by only one instance (`claimedBy` field)
   - No duplicate sends (check WhatsApp message IDs)
   - Leases expire after 60s if worker crashes

## E2E validation (production readiness)

**1. Firestore structure**

- Confirm `threads` has documents (e.g. filter by `accountId`).
- For a `threadId`, confirm `threads/{threadId}/messages` has docs with `tsClient`.
- Chat uses `orderBy('tsClient', descending: true)`; index from `firestore.indexes.json` (fieldOverrides `messages` + `tsClient`) must be deployed.

**2. Send flow**

- In app: open a thread → type message → Send.
- Logs: `[ChatScreen] Sending via proxy...` and `[WhatsAppApiService] sendViaProxy: BEFORE request | endpointUrl=.../whatsappProxySend`.
- Response 2xx JSON (not 404 HTML).
- Firestore: `outbox/{requestId}` appears (status `queued`), then `processOutbox` updates to `sent` or `failed`; `threads/{threadId}/messages` gets the outbound message.

**3. No GetMessages proxy**

- No requests to `whatsappProxyGetMessages` (removed from exports).
- Flutter never calls it; messages come only from Firestore `threads/{threadId}/messages`.

**4. Manual checks (require Firebase/backend access)**

| Step | Command / action | Success |
|------|------------------|--------|
| Indexes | `firebase deploy --only firestore:indexes` | `Deploy complete!` |
| List functions | `firebase functions:list \| grep whatsappProxySend` | `whatsappProxySend(us-central1)` |
| Deploy send | `firebase deploy --only functions:whatsappProxySend` | No errors |
| Set secret | `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL` | Secret set |
| Send smoke | `curl -X POST .../whatsappProxySend -H "Authorization: Bearer <token>" ...` | JSON `{"success":true,...}` |

## Troubleshooting

### Issue: 404 or HTML instead of JSON on proxy endpoints

**Symptoms:**
- `GET /whatsappProxyGetAccounts`, `POST /whatsappProxySend`, etc. return 404 or HTML (e.g. Firebase error page)
- Flutter logs: "Expected JSON, got HTML", `bodyPrefix` starts with `<`

**Cause:** Function not deployed in the project/region you are calling, or wrong Firebase project/region.

**Fix:**
1. `firebase use <alias>` — ensure correct project (e.g. `superparty-frontend`)
2. `firebase functions:list | grep whatsappProxySend` — function must appear (e.g. `whatsappProxySend(us-central1)`)
3. Deploy: `firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,...`
4. App must use the same project/region as deployed Functions (Firebase config in Flutter)

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
- Verify `INSTANCE_ID` or `DEPLOYMENT_ID` is unique per instance
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
- Scale up backend instances if queue is large
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

3. **Rollback Backend:**
   - Redeploy previous backend version (Hetzner/systemd or your deploy process)
   - OR revert git commit and push

## Support Contacts

- Technical Lead: [Your contact]
- On-Call Engineer: [On-call rotation]
