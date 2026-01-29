# Black Screen + WhatsApp Flow - Verification Checklist

## Root Causes Fixed

### 1. Black Screen ✅
**Problem**: Auth stream timeout emite currentUser/null, dar AuthWrapper nu afișează UI explicit când snapshot e empty/timeout
**Fix**: Adăugat `_buildAuthErrorScreen()` și `_buildAuthTimeoutScreen()` în AuthWrapper

### 2. legacy hosting regenerateQr 500 ✅
**Problem**: `createConnection` poate arunca excepții sincrone când "already connecting"
**Fix**: Adăugat check cu `connectionRegistry.tryAcquire()` și try-catch pentru sync errors

### 3. WhatsApp Polling ✅
**Status**: Deja implementat - polling automat la 3s când account e în pairing states

### 4. Events Page ✅
**Status**: Deja funcționează - are error/empty state handling

## Files Modified

### Flutter
1. `superparty_flutter/lib/screens/auth/auth_wrapper.dart`
   - Adăugat `_buildAuthErrorScreen()` pentru auth stream errors
   - Adăugat `_buildAuthTimeoutScreen()` pentru auth stream timeouts
   - Adăugat check `ConnectionState.done && !snapshot.hasData` pentru timeout case

### Backend
2. `whatsapp-backend/server.js` ~line 3922
   - Adăugat check `connectionRegistry.tryAcquire()` înainte de `createConnection`
   - Adăugat try-catch pentru sync errors în `createConnection`
   - Returnează 200 cu `status: 'already_connecting'` dacă deja se conectează

## Verification Steps

### Test 1: Black Screen Fix (Auth Timeout)
```bash
# 1. Start Flutter WITHOUT Firebase emulators
flutter run -d emulator-5554

# 2. Verify: Should show "Connection Timeout" screen (NOT black)
# - Orange icon (wifi_off)
# - Message: "Firebase emulator may be down or unreachable"
# - "Retry" button

# 3. With emulators running:
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true
# Should show login/home normally (NOT black screen)
```

### Test 2: Black Screen Fix (Auth Error)
```bash
# 1. Simulate auth error (e.g., invalid Firebase config)
# 2. Verify: Should show "Authentication Error" screen (NOT black)
# - Red icon (error_outline)
# - Error message displayed
# - "Retry" button
```

### Test 3: regenerateQr Stability
```bash
# 1. Add WhatsApp account
# 2. Rapidly tap "Regenerate QR" 5 times
# 3. Verify:
#   - Only ONE request sent (others blocked by in-flight guard)
#   - Backend returns 202 or 200 (NOT 500)
#   - No "sync_error" or "internal_error" in logs
```

### Test 4: Events Page
```bash
# 1. Navigate to Events page
# 2. Verify: Shows events OR "Nu există evenimente" (NOT black screen)
# 3. Apply filters → verify events filtered correctly
```

## Commands for Testing

### Flutter Run with Emulators
```bash
cd superparty_flutter
flutter run -d emulator-5554 --dart-define=USE_EMULATORS=true
```

### Flutter Run WITHOUT Emulators (Test Timeout Screen)
```bash
cd superparty_flutter
flutter run -d emulator-5554  # Without --dart-define=USE_EMULATORS
```

### Check Flutter Logs
```bash
adb -s emulator-5554 logcat -d | grep -E "flutter.*Auth|flutter.*error|flutter.*timeout" -i | tail -50
```

### Test regenerateQr Endpoint (curl)
```bash
# Test rapid regenerate (should return 202 if already connecting)
curl -X POST \
  https://whats-app-ompro.ro/api/whatsapp/regenerate-qr/ACCOUNT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Request-ID: test_$(date +%s)"
```

### Check Backend Logs (legacy hosting)
- Verify: `Already connecting (connectionRegistry check), skip createConnection`
- Verify: No `Sync error in regenerateQr` messages
- Verify: No unhandled exceptions

## Expected Behavior

### Auth Timeout
- ✅ Shows "Connection Timeout" screen (orange icon, retry button)
- ✅ NOT black screen
- ✅ Retry button works (rebuilds widget)

### regenerateQr
- ✅ First request: 200 (success) or 202 (already in progress)
- ✅ Subsequent rapid requests: 202 (already in progress) or blocked by Flutter guard
- ✅ No 500 errors
- ✅ No "sync_error" messages

### Events Page
- ✅ Shows events or "Nu există evenimente"
- ✅ NOT black screen
- ✅ Filters work correctly
