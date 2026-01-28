# WhatsApp Stability Fix - Complete Implementation

## Root Causes Identified

### 1. PASSIVE Mode Instances Still Attempting Connections
**Problem**: Instanțe PASSIVE (lock nu e achiziționat) tot încearcă să creeze conexiuni Baileys prin endpoint-uri mutate
**Root Cause**: `checkPassiveModeGuard()` există dar:
- Nu e aplicat la toate endpoint-urile mutate (delete account lipsea)
- `addAccount` avea check duplicat (guard + manual check)
- Request-urile puteau bypassa guard-ul dacă erau trimise rapid după start

### 2. regenerateQr/addAccount Non-Idempotent
**Problem**: Multiple requests generate 500 errors când account e deja "connecting" sau QR e valid
**Root Cause**: Nu exista idempotency checks pentru QR valid sau status "connecting"

### 3. 401/logged_out Cleanup Incorrect
**Problem**: 401 handler setează status='needs_qr' în loc de 'logged_out'
**Root Cause**: Status greșit - 'needs_qr' e pentru QR expirat, 'logged_out' e pentru sesiune invalidă

### 4. Flutter Emulator Functions URL Hardcoded
**Problem**: Functions URL hardcodat la `127.0.0.1:5002`, nu funcționează în Android emulator fără adb reverse
**Root Cause**: Nu folosea logica din `firebase_service.dart` pentru host selection (10.0.2.2)

### 5. Flutter UI Loops on 500/429
**Problem**: Flutter nu gestionează 202/429/503 ca non-fatal, cauzând loops
**Root Cause**: Error handling nu distingea între fatal și non-fatal errors (202/429)

## Fixes Implemented

### A) Backend: Enforce Single-Active-Instance ✅

#### A1. Add checkPassiveModeGuard to Delete Account
**File**: `whatsapp-backend/server.js` - `DELETE /api/whatsapp/accounts/:id` (line 4417)

**Change**: Adăugat `checkPassiveModeGuard` la începutul handler-ului pentru delete account

```javascript
app.delete('/api/whatsapp/accounts/:id', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT mutate account state
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  
  // ... rest of handler
});
```

#### A2. Remove Duplicate Check in addAccount
**File**: `whatsapp-backend/server.js` - `POST /api/whatsapp/add-account` (line 3574)

**Change**: Eliminat duplicate check PASSIVE mode (guard-ul la line 3485 e suficient)

```javascript
// BEFORE: Had duplicate check at line 3575
// AFTER: Removed duplicate, only checkPassiveModeGuard at line 3485
```

**Status**: ✅ `checkPassiveModeGuard` aplicat la toate mutating endpoints:
- ✅ `add-account` (line 3485)
- ✅ `regenerate-qr` (line 3793)
- ✅ `delete-account` (line 4419 - FIXED)
- ✅ `send-message` (line 4109)

### B) Backend: Make regenerateQr Idempotent + Throttle ✅

#### B1. Return Existing QR if Valid (Idempotent)
**File**: `whatsapp-backend/server.js` - `POST /api/whatsapp/regenerate-qr/:accountId` (lines 3879-3905)

**Change**: Adăugat check pentru QR valid (< 60s) și returnează QR existent cu 200

```javascript
// IDEMPOTENCY: Check if account is already in pairing phase with valid QR
const hasValidQR = (currentStatus === 'qr_ready' || currentStatus === 'awaiting_scan') && account.qrCode;
if (hasValidQR) {
  const qrAge = /* ... calculate age ... */;
  if (qrAge < QR_EXPIRY_MS) {
    return res.json({ success: true, qrCode: account.qrCode, status: currentStatus, idempotent: true });
  }
}
```

#### B2. Return 202 if Already Connecting (Non-Fatal)
**File**: `whatsapp-backend/server.js` (lines 3863-3873)

**Change**: Returnează 202 cu `status: 'connecting'` sau `'already_in_progress'` dacă account e în proces de conectare

```javascript
// IDEMPOTENCY: Return 202 if already regenerating or connecting
if (isRegenerating || isConnecting) {
  return res.status(202).json({ 
    success: true, 
    message: 'QR regeneration already in progress',
    status: isConnecting ? 'connecting' : 'already_in_progress',
    // ...
  });
}
```

#### B3. Per-Account Throttle (10s)
**File**: `whatsapp-backend/server.js` (lines 3845-3861)

**Change**: Adăugat throttle per-account (10s) pentru regenerateQr requests

```javascript
const REGENERATE_THROTTLE_MS = 10 * 1000; // 10 seconds
const lastRegenerate = global[lastRegenerateKey][accountId];
if (lastRegenerate && (Date.now() - lastRegenerate < REGENERATE_THROTTLE_MS)) {
  return res.status(429).json({
    success: false,
    error: 'rate_limited',
    message: `Please wait ${secondsRemaining}s before regenerating QR again`,
    retryAfterSeconds: secondsRemaining,
  });
}
```

### C) Backend: Handle 401/logged_out Correctly ✅

#### C1. Set status='logged_out' (not 'needs_qr')
**File**: `whatsapp-backend/server.js` - 401 handler (lines 1770, 1796)

**Change**: Schimbat status din 'needs_qr' la 'logged_out' pentru 401/logged_out disconnect

```javascript
// BEFORE: account.status = 'needs_qr';
// AFTER: account.status = 'logged_out';

await saveAccountToFirestore(accountId, {
  status: 'logged_out', // Changed from 'needs_qr'
  lastError: `logged_out (${reason}) - requires re-link`,
  requiresQR: true,
  // ...
});
```

#### C2. createConnection Blocks 'logged_out' Status
**File**: `whatsapp-backend/server.js` - `createConnection` (lines 1030, 1047)

**Status**: ✅ **DEJA FIXAT** - `createConnection` verifică `terminalStatuses` care include 'logged_out':

```javascript
const terminalStatuses = ['needs_qr', 'logged_out'];
if (terminalStatuses.includes(account.status) || account.requiresQR === true) {
  console.log(`⏸️  [${accountId}] Account status is ${account.status}, skipping auto-connect`);
  return;
}
```

### D) Flutter: Fix Emulator Functions URL ✅

#### D1. Use 10.0.2.2 when USE_ADB_REVERSE=false
**File**: `superparty_flutter/lib/services/whatsapp_api_service.dart` - `_getFunctionsUrl()` (lines 36-40)

**Change**: Folosește `10.0.2.2:5002` pentru Android emulator când `USE_ADB_REVERSE=false`

```dart
if (useEmulators && kDebugMode) {
  const useAdbReverse = bool.fromEnvironment('USE_ADB_REVERSE', defaultValue: true);
  if (Platform.isAndroid && !useAdbReverse) {
    // Android emulator: use 10.0.2.2 (maps to host's 127.0.0.1)
    return 'http://10.0.2.2:5002';
  } else {
    return 'http://127.0.0.1:5002';
  }
}
```

**Added**: `import 'dart:io';` pentru `Platform.isAndroid`

### E) Flutter: Stop UI Loops ✅

#### E1. Handle 202 (Already In Progress) as Non-Fatal
**File**: `superparty_flutter/lib/services/whatsapp_api_service.dart` - `regenerateQr()` (lines 376-395)

**Change**: Returnează success când primește 202, nu aruncă eroare

```dart
// CRITICAL FIX: Handle 202 (already in progress) as non-fatal
if (response.statusCode == 202) {
  return {
    'success': true,
    'message': errorBody?['message'] ?? 'QR regeneration already in progress',
    'status': errorBody?['status'] ?? 'already_in_progress',
  };
}
```

#### E2. Handle 429 (Rate Limited) Gracefully
**File**: `superparty_flutter/lib/services/whatsapp_api_service.dart` - `regenerateQr()` (lines 398-410)

**Change**: Returnează `ServiceUnavailableException` cu `retryAfterSeconds` pentru 429, nu cooldown

```dart
// Handle 429 (rate_limited) gracefully - show message but don't set cooldown
if (response.statusCode == 429 || errorCode == 'rate_limited') {
  final retryAfterSeconds = errorBody?['retryAfterSeconds'] as int? ?? 10;
  throw ServiceUnavailableException(
    errorBody?['message'] ?? 'Please wait before regenerating QR again',
    retryAfterSeconds: retryAfterSeconds,
  );
}
```

#### E3. UI Shows Friendly Message for 429
**File**: `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart` - `_regenerateQr()` (lines 427-438)

**Change**: UI afișează mesaj prietenos pentru 429 (nu eroare fatală)

```dart
if (e is ServiceUnavailableException) {
  if (e.retryAfterSeconds != null) {
    // 429 rate limited - show friendly message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.message ?? 'Please wait ${e.retryAfterSeconds}s...'),
        backgroundColor: Colors.orange,
        duration: Duration(seconds: e.retryAfterSeconds!),
      ),
    );
    return; // Don't show generic error
  }
}
```

### F) Backend: Handle 515/Disconnect Correctly ✅

#### F1. Transient Reconnect with Backoff (Already Implemented)
**File**: `whatsapp-backend/server.js` - connection.update close handler (lines 1646-1689)

**Status**: ✅ **DEJA FIXAT** - 515 (restart required) și 428 (connection closed) trigger reconnect cu exponential backoff:

```javascript
// CRITICAL FIX: Auto-reconnect in pairing phase for transient errors
// For 515/428, use shorter backoff (2s, 4s, 8s) since they're known recoverable errors
const baseBackoff = isTransientError ? 2000 : 1000;
const backoff = Math.min(baseBackoff * Math.pow(2, attempts), 30000);
```

#### F2. No Spam Reconnects (Already Implemented)
**Status**: ✅ **DEJA FIXAT** - Reconnect attempts sunt limitate la `MAX_PAIRING_RECONNECT_ATTEMPTS` (default 10)

## Files Modified

### Backend
1. `whatsapp-backend/server.js`
   - Line 3574: Eliminat duplicate PASSIVE check în `addAccount`
   - Lines 3845-3873: Adăugat throttle (10s) + idempotency (202 pentru connecting)
   - Line 4419: Adăugat `checkPassiveModeGuard` la `delete-account`
   - Lines 1770, 1796: Schimbat status 'needs_qr' -> 'logged_out' pentru 401
   - Line 4025: Mutat throttle timestamp DUPĂ succes (nu înainte)

### Flutter
2. `superparty_flutter/lib/services/whatsapp_api_service.dart`
   - Line 2: Adăugat `import 'dart:io';` pentru `Platform.isAndroid`
   - Lines 36-40: Fix emulator Functions URL (10.0.2.2 când `USE_ADB_REVERSE=false`)
   - Lines 376-395: Handle 202 ca non-fatal (return success)
   - Lines 398-410: Handle 429 ca non-fatal (throw ServiceUnavailableException cu retryAfterSeconds)

3. `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`
   - Lines 427-438: UI gestionează 429 cu mesaj prietenos (nu eroare fatală)

## Verification Checklist

### Test 1: PASSIVE Mode Guard
```bash
# 1. Start 2 backend instances (one acquires lock, other is PASSIVE)
# 2. Call addAccount/regenerateQr/deleteAccount from PASSIVE instance
# 3. Verify: Returns 503 with { error: 'instance_passive', mode: 'passive' }
# 4. Verify: No connection attempts logged from PASSIVE instance
```

### Test 2: regenerateQr Idempotency
```bash
# 1. Call regenerateQr when QR is valid (< 60s old)
# 2. Verify: Returns 200 with existing QR (idempotent: true)
# 3. Call regenerateQr when status is 'connecting'
# 4. Verify: Returns 202 with status: 'connecting' (non-fatal)
# 5. Call regenerateQr rapidly (5 times în 1s)
# 6. Verify: Only first succeeds, rest return 429 (rate_limited)
```

### Test 3: 401/logged_out Handling
```bash
# 1. Simulate 401 disconnect (delete creds manually)
# 2. Verify: Status = 'logged_out' (not 'needs_qr')
# 3. Verify: Session cleared (credentials deleted)
# 4. Verify: No auto-reconnect attempts
# 5. Verify: UI shows "Session expired - re-link required" + "Delete & Re-add" button
```

### Test 4: Flutter Emulator Connectivity
```bash
# Without adb reverse:
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false

# Verify: Functions URL = http://10.0.2.2:5002 (not 127.0.0.1:5002)
# Verify: App can reach Firebase Functions emulator

# With adb reverse:
adb reverse tcp:5002 tcp:5002  # (and 8082, 9098)
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true

# Verify: Functions URL = http://127.0.0.1:5002
```

### Test 5: Flutter UI Loops Prevention
```bash
# 1. Rapidly tap "Regenerate QR" 5 times
# 2. Verify: Only 1 request sent (others blocked by in-flight guard)
# 3. Verify: Backend returns 202/429 (not 500)
# 4. Verify: UI shows friendly message (not error)
# 5. Verify: No infinite retry loops
```

## Test Plan (End-to-End)

### Local Emulator Test (Without adb reverse)
```bash
# Terminal 1: Start Firebase emulators
cd Aplicatie-SuperpartyByAi
npm run emu:all

# Terminal 2: Start WhatsApp backend locally
cd whatsapp-backend
npm start

# Terminal 3: Run Flutter (without adb reverse)
cd superparty_flutter
flutter run -d emulator-5554 \
  --dart-define=USE_EMULATORS=true \
  --dart-define=USE_ADB_REVERSE=false

# Verify:
# - App loads without black screen
# - Functions URL = http://10.0.2.2:5002
# - WhatsApp accounts screen loads
# - Add account works → QR displays
```

### Production-Like Test (curl)
```bash
# 1. Check health
curl https://whats-app-ompro.ro/health

# 2. Get accounts
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-app-ompro.ro/api/whatsapp/accounts

# 3. Add account
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-app-ompro.ro/api/whatsapp/add-account

# 4. regenerateQr (should return existing QR if valid)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-app-ompro.ro/api/whatsapp/regenerate-qr/ACCOUNT_ID

# 5. Verify no 500 spam (check logs for repeated 500s)
```

### 401 Simulation Test
```bash
# 1. Add account and wait for connected status
# 2. Manually delete session files: rm -rf /app/sessions/account_*
# 3. Wait for 401 disconnect (or trigger reconnect)
# 4. Verify: Status = 'logged_out' (not 'needs_qr')
# 5. Verify: UI shows "Session expired - re-link required"
# 6. Verify: No auto-reconnect attempts in logs
```

## Summary

### Backend Fixes
- ✅ PASSIVE mode guard aplicat la toate mutating endpoints (inclusiv delete)
- ✅ regenerateQr idempotent (returnează QR existent dacă valid, 202 dacă connecting)
- ✅ Per-account throttle (10s) pentru regenerateQr
- ✅ 401 handler setează status='logged_out' (nu 'needs_qr')
- ✅ createConnection blochează 'logged_out' (deja fixat)

### Flutter Fixes
- ✅ Emulator Functions URL folosește 10.0.2.2 când `USE_ADB_REVERSE=false`
- ✅ Handle 202 (already in progress) ca non-fatal
- ✅ Handle 429 (rate limited) cu mesaj prietenos
- ✅ UI gestionează 'logged_out' cu "Delete & Re-add" button

### Already Fixed (Pre-existing)
- ✅ 515/transient disconnect reconnect cu backoff (deja implementat)
- ✅ createConnection blochează terminal statuses (deja implementat)
- ✅ Flutter guards (in-flight, cooldown, throttle) (deja implementat)
