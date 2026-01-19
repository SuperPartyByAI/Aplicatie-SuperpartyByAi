# WhatsApp Stability Fix - Complete Test Plan

## Prerequisites

### Local Environment
```bash
# Terminal 1: Firebase emulators
cd Aplicatie-SuperpartyByAi
npm run emu:all

# Terminal 2: WhatsApp backend (local)
cd whatsapp-backend
npm start

# Terminal 3: Flutter (Android emulator)
cd superparty_flutter
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```

### Production Environment
```bash
# Set admin token
export ADMIN_TOKEN="dev-token-..."
```

## Test 1: Verify Railway Commit Hash (d4f4998a)

### Steps
```bash
# 1. Check health endpoint for commit hash
curl https://whats-upp-production.up.railway.app/health | jq '.commit, .instanceId, .waMode, .lock'

# Expected:
# - commit: "d4f4998a" (or newer)
# - instanceId: UUID string
# - waMode: "active" | "passive"
# - lock: { holderInstanceId: "UUID", expiresInSeconds: <number>, reason: null | "lock_not_acquired" }
```

### Success Criteria
- ✅ `/health` returns commit hash (matches or newer than d4f4998a)
- ✅ `/health` includes `instanceId`, `waMode`, `lock` (holderInstanceId if lock exists)

## Test 2: PASSIVE Mode Guard (Mutating Endpoints)

### Steps
```bash
# 1. Identify PASSIVE instance (check /health for waMode="passive")
# 2. Call addAccount from PASSIVE instance
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# Expected if PASSIVE:
# Status: 503
# Body: { success:false, error:"instance_passive", code:"passive_mode", message:"Instance is passive...", retryAfterSec:15 }

# 3. Call regenerateQr from PASSIVE instance
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID

# Expected if PASSIVE:
# Status: 503
# Body: { success:false, error:"instance_passive", code:"passive_mode", ... }

# 4. Call deleteAccount from PASSIVE instance
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts/ACCOUNT_ID

# Expected if PASSIVE:
# Status: 503
# Body: { success:false, error:"instance_passive", ... }
```

### Success Criteria
- ✅ PASSIVE instances return 503 for ALL mutating endpoints
- ✅ No connection attempts logged from PASSIVE instance
- ✅ Response includes `retryAfterSec` (lock TTL)

## Test 3: regenerateQr Idempotency

### Steps
```bash
# 1. Add account and wait for QR (status=qr_ready)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# Wait for QR (poll getAccounts until qrCode exists)

# 2. Call regenerateQr immediately (QR is valid < 60s old)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID

# Expected:
# Status: 200
# Body: { success:true, qrCode:"<existing>", status:"qr_ready", idempotent:true, ageSeconds:<number> }

# 3. Call regenerateQr when status=connecting
# (Wait for QR to expire or manually trigger connecting status)

# Expected:
# Status: 202
# Body: { success:true, status:"connecting", message:"QR regeneration already in progress" }

# 4. Rapidly call regenerateQr 5 times within 5 seconds
for i in {1..5}; do
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID &
done
wait

# Expected:
# - First request: 200 (success)
# - Rest: 429 (rate_limited) with retryAfterSeconds: <number>
```

### Success Criteria
- ✅ regenerateQr returns existing QR if valid (< 60s old)
- ✅ regenerateQr returns 202 if status=connecting (not 500)
- ✅ Rapid regenerateQr requests return 429 (throttled) with retryAfterSeconds
- ✅ No 500 errors on regenerateQr spam

## Test 4: addAccount Idempotency

### Steps
```bash
# 1. Add account and wait for QR (status=qr_ready)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# Save accountId from response

# 2. Call addAccount again with same phone (rapidly, 2x within 1s)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# Expected:
# Status: 200
# Body: { success:true, account: { id: "<same_accountId>", status:"qr_ready" }, idempotent:true }

# Verify:
# - Same accountId returned (not new accountId)
# - Only ONE session directory exists for this phone: /app/sessions/account_<hash>
```

### Success Criteria
- ✅ addAccount returns existing accountId if account is in pairing phase
- ✅ No duplicate session directories created for same phone
- ✅ No duplicate accounts in Firestore for same phone

## Test 5: 401/logged_out Handling

### Steps
```bash
# 1. Add account and wait for connected status
# 2. Manually delete session files (simulate 401)
# On Railway:
#   - SSH into instance OR
#   - Delete via API if available
#   OR trigger 401 by invalidating creds

# 3. Wait for disconnect event or trigger reconnect

# 4. Check account status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts

# Expected:
# - Account status = "logged_out" (NOT "needs_qr")
# - Session files deleted (credentials cleared)
# - No auto-reconnect attempts in logs

# 5. Verify UI shows "Session expired - re-link required" + "Delete & Re-add" button
```

### Success Criteria
- ✅ 401 disconnect sets status='logged_out' (not 'needs_qr')
- ✅ Session files cleared (credentials deleted)
- ✅ No auto-reconnect attempts after 401
- ✅ Flutter UI shows "Session expired - re-link required" message

## Test 6: 515/Transient Disconnect Handling

### Steps
```bash
# 1. Add account and wait for QR (status=qr_ready)
# 2. Monitor logs for 515 disconnect (or simulate)
# 3. Check reconnect behavior

# Expected in logs:
# - "Pairing phase reconnect in 2000ms (attempt 1/10, reason: 515 [515 restart required])"
# - "Pairing phase reconnect in 4000ms (attempt 2/10, reason: 515)"
# - Exponential backoff: 2s, 4s, 8s, 16s, 30s (max)

# 4. Verify connecting timeout does NOT fire if status=qr_ready
# (Timeout should skip if status is pairing phase)
```

### Success Criteria
- ✅ 515 disconnect triggers reconnect with exponential backoff
- ✅ Reconnect backoff: 2s, 4s, 8s, 16s, 30s (max)
- ✅ Max reconnect attempts capped (default 10)
- ✅ Connecting timeout does NOT fire when status=qr_ready

## Test 7: Flutter Emulator Connectivity

### Steps
```bash
# 1. Start Firebase emulators
npm run emu:all

# 2. Run Flutter WITHOUT adb reverse
cd superparty_flutter
flutter run -d emulator-5554 \
  --dart-define=USE_EMULATORS=true \
  --dart-define=USE_ADB_REVERSE=false

# 3. Check Flutter logs for Functions URL
# Expected:
# [WhatsAppApiService] Using Android emulator Functions URL: http://10.0.2.2:5002 (no adb reverse)

# 4. Test WhatsApp accounts screen loads
# 5. Test addAccount works
```

### Success Criteria
- ✅ Functions URL = `http://10.0.2.2:5002` when `USE_ADB_REVERSE=false`
- ✅ App can reach Firebase Functions emulator
- ✅ WhatsApp accounts screen loads without errors

## Test 8: Flutter UI Loops Prevention

### Steps
```bash
# 1. Run Flutter in emulator
# 2. Navigate to WhatsApp accounts screen
# 3. Rapidly tap "Regenerate QR" button 5 times

# Expected:
# - Only 1 request sent (others blocked by in-flight guard)
# - Backend returns 202 or 429 (not 500)
# - UI shows friendly message (not error)

# 4. Check Flutter logs for requestId/correlationId
# Expected:
# [WhatsAppApiService] regenerateQr: calling proxy, requestId=<uuid>, correlationId=<uuid>
# [WhatsAppApiService] regenerateQr: response, statusCode=202/429

# 5. Verify backend logs include correlationId
```

### Success Criteria
- ✅ Only 1 regenerateQr request sent (guards work)
- ✅ Backend returns 202/429 (not 500)
- ✅ UI shows friendly message for 202/429
- ✅ CorrelationId propagated end-to-end (Flutter → Functions → Railway)

## Test 9: Negative Tests (Spam Protection)

### Steps
```bash
# 1. Rapid regenerateQr spam (10 requests in 1 second)
for i in {1..10}; do
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "X-Request-ID: spam_$i" \
    https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID &
done
wait

# Expected:
# - First request: 200 (if QR valid) or 202 (if connecting)
# - Rest: 429 (rate_limited) with retryAfterSeconds

# 2. Rapid addAccount spam (5 requests for same phone)
for i in {1..5}; do
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","phone":"+40712345678"}' \
    https://whats-upp-production.up.railway.app/api/whatsapp/add-account &
done
wait

# Expected:
# - First request: 200 (creates account)
# - Rest: 200 with idempotent:true (returns existing account)
```

### Success Criteria
- ✅ No 500 errors on spam
- ✅ Throttle works (429 for rapid regenerateQr)
- ✅ Idempotency works (same accountId for rapid addAccount)

## Test 10: End-to-End Flow (Complete Scenario)

### Steps
```bash
# 1. Login to Flutter app
# 2. Navigate to WhatsApp accounts screen
# 3. Add account: "Test Account", phone "+40712345678"
# 4. Wait for QR code to appear (status=qr_ready)
# 5. Scan QR code with WhatsApp
# 6. Wait for status=connected

# Expected:
# - QR displays correctly
# - No 500 errors during pairing
# - Status transitions: connecting → qr_ready → connecting → connected
# - No regenerateQr spam
```

### Success Criteria
- ✅ Complete flow works: addAccount → QR → scan → connected
- ✅ No 500 errors
- ✅ Status transitions correctly
- ✅ No UI loops or spam

## Verification Checklist

After all tests:
- [ ] Railway commit hash is d4f4998a or newer (check /health)
- [ ] PASSIVE instances return 503 for mutating endpoints
- [ ] regenerateQr returns existing QR if valid (200)
- [ ] regenerateQr returns 202 if connecting (not 500)
- [ ] regenerateQr returns 429 if throttled (not 500)
- [ ] addAccount returns existing account if in pairing phase (idempotent)
- [ ] 401 disconnect sets status='logged_out' (not 'needs_qr')
- [ ] 401 disconnect clears session (no auto-reconnect)
- [ ] 515 disconnect triggers reconnect with backoff (not spam)
- [ ] Flutter Functions URL uses 10.0.2.2 when USE_ADB_REVERSE=false
- [ ] Flutter handles 202/429 gracefully (no error loops)
- [ ] CorrelationId propagated end-to-end

## Commands Summary

```bash
# Verify commit
curl https://whats-upp-production.up.railway.app/health | jq '.commit'

# Test addAccount
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# Test regenerateQr (should return existing QR if valid)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID

# Test spam (should return 429)
for i in {1..5}; do
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID &
done
```
