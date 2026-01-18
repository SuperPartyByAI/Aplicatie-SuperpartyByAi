# Test Plan: WhatsApp Connect + Black Screen + AI Flow

## Prerequisites

### 1. Environment Setup

```bash
# Backend (Railway)
export ADMIN_TOKEN='your-admin-token'
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Functions (Firebase)
firebase functions:secrets:set WHATSAPP_RAILWAY_BASE_URL
# Value: https://whats-upp-production.up.railway.app

# Flutter (Optional - override backend URL)
# flutter run --dart-define=WHATSAPP_BACKEND_URL=https://custom-url.up.railway.app
```

---

## Test 1: WhatsApp Connect Flow (Emulator)

### Setup:
```bash
# Terminal 1: Start emulators
export WHATSAPP_RAILWAY_BASE_URL='https://whats-upp-production.up.railway.app'
firebase emulators:start --only firestore,functions,auth

# Terminal 2: Run Flutter
cd superparty_flutter
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true

# Terminal 3: Watch logs
adb -s emulator-5554 logcat | grep -iE "WhatsApp|whatsapp|515|passive|pairing|timeout|regenerateQr"
```

### Test Steps:

1. **Login & Navigate**
   - ✅ Login cu Firebase Auth
   - ✅ Navigate to WhatsApp Accounts screen
   - ✅ Check logs: `[WhatsAppAccountsScreen] initState: loading accounts`

2. **Add Account**
   - ✅ Tap "Add Account"
   - ✅ Enter name: "Test Account", phone: "+40712345678"
   - ✅ Tap "Add"
   - ✅ Check logs: `[WhatsAppAccountsScreen] _addAccount: starting`
   - ✅ Check logs: `[WhatsAppApiService] addAccount: calling proxy`
   - ✅ Expected: Account created, status = "connecting"

3. **QR Generation**
   - ✅ Wait 2-5 seconds
   - ✅ Check logs: `[accountId] QR Code generated`
   - ✅ Check logs: `[accountId] Connecting timeout cleared (QR generated, pairing phase)`
   - ✅ Expected: QR code appears in UI, status = "qr_ready"

4. **515 Handling (if occurs)**
   - ✅ If 515 occurs, check logs: `[accountId] Reason 515 (restart required) - clearing QR`
   - ✅ Check logs: `[accountId] Pairing phase reconnect in 2000ms (attempt 1/10, reason: 515)`
   - ✅ Expected: QR clears → new QR appears after reconnect

5. **PASSIVE MODE (if backend passive)**
   - ✅ If backend e PASSIVE, check logs: `[add-account] Blocked: PASSIVE mode`
   - ✅ Expected: Purple SnackBar "Backend în mod PASSIVE. Lock nu este achiziționat."
   - ✅ Expected: Retry cu backoff mai lung (15s base, max 60s)

6. **QR Scan**
   - ✅ Scan QR cu WhatsApp mobile
   - ✅ Check logs: `[accountId] connection.update: open`
   - ✅ Expected: Status changes to "connected"

---

## Test 2: Backend Status Verification

### Commands:

```bash
# 1. Health check
curl https://whats-upp-production.up.railway.app/health

# Expected: { "status": "ok", "version": "...", "uptime": ... }

# 2. Status (requires ADMIN_TOKEN)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/longrun/status-now

# Expected:
# {
#   "waMode": "active" | "passive",
#   "waStatus": "RUNNING" | "NOT_RUNNING",
#   "instanceId": "...",
#   "reason": "lock_not_acquired" | null,
#   "accounts": [...],
#   "accountsCount": 2
# }

# 3. Ready endpoint
curl https://whats-upp-production.up.railway.app/ready

# Expected:
# {
#   "ready": true | false,
#   "mode": "active" | "passive",
#   "reason": "lock_not_acquired" | null,
#   "instanceId": "..."
# }
```

---

## Test 3: HTTP Probes (Functions Proxy)

### Setup:
```bash
# Get Firebase ID token (from Flutter app logs or Firebase Console)
export FIREBASE_ID_TOKEN='your-firebase-id-token'
```

### Commands:

```bash
# 1. Get Accounts
curl -X GET \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "X-Request-ID: test_$(date +%s)" \
  https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccounts

# Expected:
# {
#   "success": true,
#   "accounts": [...],
#   "instanceId": "...",
#   "waMode": "active" | "passive",
#   "requestId": "..."
# }

# 2. Add Account (should return 503 if PASSIVE)
curl -X POST \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: test_$(date +%s)" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyAddAccount

# Expected (if ACTIVE):
# { "success": true, "account": {...}, "instanceId": "...", "waMode": "active", "requestId": "..." }

# Expected (if PASSIVE):
# {
#   "success": false,
#   "error": "PASSIVE mode: another instance holds lock; retry shortly",
#   "message": "Backend in PASSIVE mode: lock_not_acquired",
#   "mode": "passive",
#   "instanceId": "...",
#   "waMode": "passive",
#   "requestId": "..."
# }

# 3. Regenerate QR (should return 503 if PASSIVE)
curl -X POST \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "X-Request-ID: test_$(date +%s)" \
  "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyRegenerateQr?accountId=account_xxx"

# Expected (if ACTIVE):
# { "success": true, "message": "QR regeneration started", "instanceId": "...", "waMode": "active", "requestId": "..." }

# Expected (if PASSIVE):
# {
#   "success": false,
#   "error": "PASSIVE mode: another instance holds lock; retry shortly",
#   "message": "Backend in PASSIVE mode: lock_not_acquired",
#   "mode": "passive",
#   "instanceId": "...",
#   "waMode": "passive",
#   "requestId": "..."
# }
```

---

## Test 4: Events Flow

### Test Steps:

1. **Navigate to Events**
   - ✅ Navigate to "Evenimente" screen
   - ✅ Check logs: `[EvenimenteScreen] Loaded X events from Firestore`
   - ✅ Check logs: `[EvenimenteScreen] Events with isArchived=false: Y`
   - ✅ Check logs: `[EvenimenteScreen] Filtered events count: Z`

2. **Empty State**
   - ✅ If no events: See icon + message "Nu există evenimente"
   - ✅ See hint: "Creează evenimente din AI Chat sau folosește seed_evenimente.js"

3. **Filters**
   - ✅ Test date filter (today, yesterday, last7, next7, next30, custom)
   - ✅ Test driver filter (all, yes, open, no)
   - ✅ Test code filter (NEREZOLVATE, REZOLVATE, specific code)
   - ✅ Test noted by filter (`cineNoteaza` field)

---

## Test 5: AI Flow (GM Mode)

### Test Steps:

1. **Navigate to AI Chat**
   - ✅ Navigate to AI Chat screen
   - ✅ Check logs: `[AIChatScreen] Initialized`

2. **Event Creation (Preview)**
   - ✅ Type: "Notează o petrecere pe 15 martie"
   - ✅ Check logs: `[AIChat] Calling chatEventOps (preview): dryRun=true`
   - ✅ Check logs: `[AIChat] chatEventOps preview result: ok=true, action=CREATE`
   - ✅ Expected: Preview card appears with event details

3. **Event Creation (Confirm)**
   - ✅ Tap "Confirm" on preview card
   - ✅ Check logs: `[AIChat] Calling chatEventOps (create): dryRun=false`
   - ✅ Check logs: `[AIChat] chatEventOps create result: ok=true, eventId=...`
   - ✅ Expected: Event created in Firestore

4. **Verify in Events**
   - ✅ Navigate to Events screen
   - ✅ Expected: New event appears in list
   - ✅ Check logs: `[EvenimenteScreen] Loaded X events (new event included)`

---

## Test 6: Black Screen Prevention

### Test Steps:

1. **Start Emulator WITHOUT Firebase Emulators**
   ```bash
   flutter run -d emulator-5554
   # DO NOT start firebase emulators:start
   ```

2. **Expected Behavior:**
   - ✅ Auth stream timeout → fallback la `currentUser` (sau null)
   - ✅ App navigates to Login sau Home (nu black screen)
   - ✅ Check logs: `[AuthWrapper] ⚠️ Auth stream timeout - using currentUser as fallback`
   - ✅ Check logs: `[AppRouter] ⚠️ Auth stream timeout (30s) - emulator may be down`

3. **Firestore Timeout**
   - ✅ If Firestore stream timeout → error handling → show Home
   - ✅ Check logs: `[AuthWrapper] ⚠️ Firestore stream timeout (30s) - emulator may be down`

---

## Expected Logs Summary

### WhatsApp Connect:
```
[WhatsAppAccountsScreen] _addAccount: starting
[WhatsAppApiService] addAccount: calling proxy
[accountId] Connection session #1 started
[accountId] QR Code generated
[accountId] Connecting timeout cleared (QR generated, pairing phase)
[accountId] Pairing phase reconnect in 2000ms (if 515 occurs)
```

### PASSIVE MODE:
```
[add-account] Blocked: PASSIVE mode (instanceId: ..., requestId: ...)
[WhatsAppApiService] addAccount: error=PASSIVE mode, mode=passive
[WhatsAppAccountsScreen] _addAccount: exception - ServiceUnavailableException
# Purple SnackBar: "Backend în mod PASSIVE. Lock nu este achiziționat."
```

### Events:
```
[EvenimenteScreen] Loaded 10 events from Firestore
[EvenimenteScreen] Events with isArchived=false: 8
[EvenimenteScreen] Filtered events count: 5
```

### AI Flow:
```
[AIChat] Calling chatEventOps (preview): dryRun=true
[AIChat] chatEventOps preview result: ok=true, action=CREATE
[AIChat] Calling chatEventOps (create): dryRun=false
[AIChat] chatEventOps create result: ok=true, eventId=...
```

---

## Troubleshooting

### Issue: QR nu apare
- Check: Backend logs pentru `QR Code generated`
- Check: Flutter logs pentru `getAccounts: success, accountsCount=1`
- Check: Account status în Firestore (`accounts/{accountId}`)

### Issue: 515 constant
- Check: Backend logs pentru `Reason 515 (restart required)`
- Check: Reconnect attempts (max 10)
- Action: Regenerate QR manual

### Issue: PASSIVE MODE persistent
- Check: Backend logs pentru `lock_not_acquired`
- Check: `api/longrun/status-now` pentru `waMode: passive`
- Action: Verifică dacă altă instanță ține lock-ul

### Issue: Black screen
- Check: Flutter logs pentru `Auth stream timeout`
- Check: `USE_EMULATORS` flag (trebuie `true` în debug mode)
- Action: Start Firebase emulators sau dezactivează `USE_EMULATORS`

---

## Success Criteria

✅ **WhatsApp Connect:**
- QR apare în < 5 secunde după addAccount
- QR rămâne stabil (nu expiră în < 60s)
- 515 declanșează reconnect automat
- PASSIVE MODE afișează mesaj clar

✅ **Black Screen:**
- App navigates la Login/Home chiar dacă emulators nu rulează
- Timeout handling previne blocaj

✅ **AI Flow:**
- Event creation funcționează (preview → confirm → create)
- Events apar în Evenimente screen
- Logging complet pentru debugging

✅ **Evenimente:**
- Query funcționează corect
- Filters aplică corect
- Empty state informativ
