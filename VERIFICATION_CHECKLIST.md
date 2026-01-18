# End-to-End Flow Verification Checklist

## Prerequisites

```bash
# 1. Pull repo and install deps
cd Aplicatie-SuperpartyByAi
git pull
cd superparty_flutter && flutter pub get
cd ../functions && npm install
cd ../whatsapp-backend && npm install

# 2. Set environment variables
export WHATSAPP_RAILWAY_BASE_URL=https://whats-upp-production.up.railway.app
# OR for emulator:
export WHATSAPP_RAILWAY_BASE_URL=http://127.0.0.1:3000

# 3. Start Firebase emulators (optional, for local testing)
cd functions
firebase emulators:start --only auth,firestore,functions
```

## Phase 1: WhatsApp Connect Flow

### Test 1.1: Login
- [ ] Open Flutter app in emulator
- [ ] Login with valid credentials
- [ ] Verify: Home screen loads (not black screen)

### Test 1.2: Add Account
- [ ] Navigate to "Manage Accounts" (WhatsApp section)
- [ ] Tap "Add Account"
- [ ] Enter name and phone
- [ ] Verify: Status 200, account appears in list
- [ ] Check logs: `addAccount: success, accountId=...`

### Test 1.3: Get Accounts
- [ ] Refresh accounts list
- [ ] Verify: Status 200, accounts displayed
- [ ] Check logs: `getAccounts: success, accountsCount=...`

### Test 1.4: Regenerate QR (Blocked Test)
- [ ] If account status is `qr_ready` or `connected`
- [ ] Tap "Regenerate QR"
- [ ] Verify: Error message "Cannot regenerate QR: account status is ..."
- [ ] Verify: No HTTP request sent (blocked client-side)

### Test 1.5: Regenerate QR (Success Test)
- [ ] If account status is `needs_qr`
- [ ] Tap "Regenerate QR"
- [ ] Verify: Status 200 or 202, QR code displayed
- [ ] Check logs: `regenerateQr: success`

### Test 1.6: QR Scan → Connected
- [ ] Scan QR code with WhatsApp
- [ ] Verify: Backend logs show `connection.update: open`
- [ ] Verify: Account status becomes `connected` in Flutter
- [ ] Verify: No 401 errors in logs

### Test 1.7: 401 Recovery
- [ ] Simulate 401 (or use account with invalid session)
- [ ] Verify: Backend logs show:
  - `Explicit cleanup (401), terminal logout`
  - `Cleared connectingTimeout on terminal logout`
  - `nextRetryAt=null, retryCount=0`
  - `reconnectScheduled=false`
- [ ] Verify: Account status becomes `needs_qr`
- [ ] Verify: No reconnect loop (no repeated `createConnection` calls)

## Phase 2: Error Handling

### Test 2.1: Functions Proxy 401 Propagation
```bash
# Test with invalid token or expired session
curl -X POST \
  https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyRegenerateQr?accountId=TEST_ID \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -H "X-Request-ID: test_401"
```
- [ ] Verify: Response status is 401 (not 500)
- [ ] Verify: Response body includes `error: 'unauthorized'` or `backendError`

### Test 2.2: Functions Proxy 4xx Propagation
- [ ] Test 403, 404, 409, 429 status codes
- [ ] Verify: Each propagates correctly (not masked as 500)

### Test 2.3: Flutter Error Handling
- [ ] Trigger 401 error in Flutter
- [ ] Verify: Shows error message (not black screen)
- [ ] Verify: Retry loop stops (no infinite retries)

## Phase 3: Black Screen Fix

### Test 3.1: Firebase Init Timeout
- [ ] Stop Firebase emulators (if using)
- [ ] Restart Flutter app
- [ ] Verify: Shows Firebase error screen (not black screen)
- [ ] Verify: Error logged to `/Users/universparty/.cursor/debug.log`

### Test 3.2: Auth State Listener Error
- [ ] Check Flutter logs for auth errors
- [ ] Verify: Errors logged, app continues (not black screen)

### Test 3.3: Navigation Guard Failure
- [ ] Try accessing protected route without auth
- [ ] Verify: Shows auth screen (not black screen)

### Test 3.4: StreamBuilder Error States
- [ ] Navigate to Events screen
- [ ] Stop Firestore emulator (if using)
- [ ] Verify: Shows error widget with retry button (not black screen)

## Phase 4: Events Page

### Test 4.1: Events Load
- [ ] Navigate to Events screen
- [ ] Verify: Events load or shows "Nu există evenimente" (not black screen)
- [ ] Check logs: `[EvenimenteScreen] Loaded X events from Firestore`

### Test 4.2: Events Filtering
- [ ] Apply date filter (e.g., "Azi")
- [ ] Verify: Events filtered correctly
- [ ] Apply driver filter
- [ ] Verify: Events filtered correctly

### Test 4.3: Empty State
- [ ] Apply filters that result in no events
- [ ] Verify: Shows "Nu există evenimente" with icon (not black screen)

### Test 4.4: Firestore Index Error
- [ ] If index missing error occurs
- [ ] Verify: Shows clear error message (not black screen)

## Phase 5: AI Scoring (TBD)

### Test 5.1: Locate Scoring Trigger
- [ ] Identify where AI scoring is computed
- [ ] Verify: Trigger works (client-side or backend)

### Test 5.2: Scoring Persistence
- [ ] Trigger scoring generation
- [ ] Verify: Firestore write succeeds
- [ ] Check Firestore: Scoring doc exists with correct schema

### Test 5.3: Scoring Display
- [ ] Navigate to UI that shows scoring
- [ ] Verify: Scoring data displayed correctly

## Commands for Quick Testing

### Test Reset Endpoint
```bash
curl -X POST \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts/ACCOUNT_ID/reset \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Test Backend Health
```bash
curl https://whats-upp-production.up.railway.app/health
```

### Test Functions Proxy (with correlation ID)
```bash
curl -X GET \
  https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccounts \
  -H "Authorization: Bearer FIREBASE_ID_TOKEN" \
  -H "X-Request-ID: test_$(date +%s)" \
  -H "X-Correlation-Id: test_corr_$(date +%s)"
```

### Flutter Run with Logs
```bash
cd superparty_flutter
flutter run -d emulator-5554 \
  --dart-define=WHATSAPP_BACKEND_URL=https://whats-upp-production.up.railway.app \
  2>&1 | tee /tmp/flutter_run_$(date +%s).log
```

## Expected Log Patterns

### Success Flow
```
[WhatsAppApiService] addAccount: success, accountId=...
[WhatsAppApiService] getAccounts: success, accountsCount=1
[WhatsAppApiService] regenerateQr: success, message=...
[Backend] connection.update: open
[Backend] Connected! Session persisted
```

### 401 Recovery
```
[Backend] Explicit cleanup (401), terminal logout
[Backend] Cleared connectingTimeout on terminal logout
[Backend] 401 handler complete: status=needs_qr, nextRetryAt=null, retryCount=0, reconnectScheduled=false
[Backend] createConnection blocked: firestore status=needs_qr
```

### Error Propagation
```
[Functions] Railway response: status=401, errorId=unauthorized
[Flutter] regenerateQr: error=unauthorized, status=401 (not 500)
```
