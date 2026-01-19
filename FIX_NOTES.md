# Fix Notes: WhatsApp Connect + PASSIVE Mode + Pairing Robustness

## Changes Applied

### 1. PASSIVE Mode Guard Helper (`whatsapp-backend/server.js`)

**Location:** After `getWAStatus()` function (around line 250)

**Added:** `checkPassiveModeGuard(req, res)` helper function
- Returns `null` if ACTIVE mode (proceed)
- Returns `{ blocked: true }` if PASSIVE mode (response already sent)
- Includes `holderInstanceId` and `retryAfterSeconds` in 503 response
- `retryAfterSeconds` calculated from lock lease remaining time (min 5s)

**Applied to:**
- `POST /api/whatsapp/add-account` (line ~3207)
- `POST /api/whatsapp/regenerate-qr/:accountId` (line ~3507)
- `PATCH /api/whatsapp/accounts/:accountId/name` (line ~3465)
- `POST /api/whatsapp/backfill/:accountId` (line ~3621)
- `POST /api/whatsapp/send-message` (line ~3658) - already had custom handling, kept as-is

---

### 2. Reason 428 Handling in Pairing Phase (`whatsapp-backend/server.js`)

**Location:** `connection.update('close')` handler (around line 1375-1530)

**Changes:**
- Added detection for reason code 428 (connection closed)
- Combined with 515 detection: `isTransientError = isRestartRequired || isConnectionClosed`
- For 428: Preserve QR code, set status to `awaiting_scan` (QR still valid)
- For 515: Clear QR code, set status to `connecting` (will regenerate)
- Both trigger reconnect with shorter backoff (2s base vs 1s)

**Logging:**
- Added `isConnectionClosed` and `isTransientError` flags to disconnect logs
- Logs include: `accountId`, `reason`, `currentStatus`, `stateTransition`

---

### 3. Connecting Timeout Skip for Pairing Phase (`whatsapp-backend/server.js`)

**Location:** `createConnection()` function (around line 1139)

**Changes:**
- Timeout skips if status is `qr_ready`, `awaiting_scan`, or `pairing`
- Comment updated: "Cancel/extend timeout when QR is generated or status changes to pairing phase"
- Prevents timeout from transitioning to `disconnected` while waiting for QR scan

---

### 4. regenerateQr Idempotency (`whatsapp-backend/server.js`)

**Location:** `POST /api/whatsapp/regenerate-qr/:accountId` (around line 3548)

**Changes:**
- Checks if account is in `qr_ready` or `awaiting_scan` with valid QR
- If QR exists and status is pairing phase, returns 200 with current state (idempotent)
- Only regenerates if QR expired (>60s) or status is not pairing phase
- Response includes `idempotent: true` flag

---

### 5. Functions Proxy 503 Propagation (`functions/whatsappProxy.js`)

**Location:** 
- `regenerateQrHandler` (around line 870)
- `addAccountHandler` (around line 588)

**Changes:**
- Propagates full 503 response from Railway backend
- Includes: `error`, `message`, `mode`, `instanceId`, `holderInstanceId`, `retryAfterSeconds`, `waMode`, `requestId`
- Does NOT wrap 503 into 500 (propagates as-is)

---

### 6. Flutter Retry with retryAfterSeconds (`superparty_flutter/lib/core/utils/retry.dart`)

**Location:** `retryWithBackoff()` function (around line 114)

**Changes:**
- For `ServiceUnavailableException`, uses `retryAfterSeconds` from exception if available
- Falls back to 15s if not available
- Max delay: 60s for PASSIVE mode retries

---

### 7. Flutter ServiceUnavailableException (`superparty_flutter/lib/core/errors/app_exception.dart`)

**Location:** `ServiceUnavailableException` class (around line 40)

**Changes:**
- Added `holderInstanceId` and `retryAfterSeconds` fields
- `ErrorMapper.fromHttpException()` extracts these from response body
- Stores full `responseBody` as `originalError` for retry logic

---

### 8. Flutter regenerateQr Throttle (`superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`)

**Location:** `_regenerateQr()` method (around line 229)

**Changes:**
- Added `_regenerateThrottle` map: `accountId -> last regenerate timestamp`
- Minimum 5 seconds between regenerates per account
- Shows orange SnackBar if throttled: "Please wait Xs before regenerating QR again"
- Prevents spamming regenerateQr button

---

### 9. Emulator Auth Mapping (`superparty_flutter/lib/services/firebase_service.dart`)

**Status:** ✅ Already Fixed
- Android emulator: Uses `10.0.2.2` when `USE_ADB_REVERSE=false` (automatic, no adb reverse needed)
- iOS simulator: Uses `127.0.0.1` (shares host network)
- Preflight connectivity check with clear error messages
- No changes needed

---

## Response Format Changes

### PASSIVE Mode 503 Response:
```json
{
  "success": false,
  "error": "passive_mode",
  "message": "Backend in PASSIVE mode: lock_not_acquired",
  "mode": "passive",
  "instanceId": "railway_xxx",
  "holderInstanceId": "railway_yyy",
  "retryAfterSeconds": 15,
  "waMode": "passive",
  "requestId": "req_1234567890"
}
```

### regenerateQr Idempotent Response:
```json
{
  "success": true,
  "message": "QR code already available",
  "qrCode": "data:image/png;base64,...",
  "status": "qr_ready",
  "ageSeconds": 5,
  "idempotent": true
}
```

---

## Testing Checklist

- [ ] Test PASSIVE mode guard on all endpoints (addAccount, regenerateQr, sendMessage, etc.)
- [ ] Test reason 428 handling (connection closed during pairing)
- [ ] Test reason 515 handling (restart required during pairing)
- [ ] Test regenerateQr idempotency (call twice, should return same QR)
- [ ] Test regenerateQr throttle (call twice within 5s, should show throttle message)
- [ ] Test Functions proxy 503 propagation (holderInstanceId, retryAfterSeconds)
- [ ] Test Flutter retry with retryAfterSeconds (should wait correct duration)
- [ ] Test emulator Auth mapping (10.0.2.2 for Android, 127.0.0.1 for iOS)

---

## Notes

- **Single Railway Instance Assumption:** The lock mechanism ensures only one instance is ACTIVE at a time. Other instances run in PASSIVE mode and retry lock acquisition every 15s.
- **Lock Lease:** 90s lease, refreshed every 30s by holder instance
- **retryAfterSeconds:** Calculated from lock lease remaining time (min 5s, max 90s)
- **Pairing Phase:** Statuses `qr_ready`, `awaiting_scan`, `pairing`, `connecting` are considered pairing phase
- **Transient Errors:** 515 (restart required) and 428 (connection closed) are treated as transient and trigger reconnect
