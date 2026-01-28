# WhatsApp Stability Fixes - PR Summary

## Root Cause

**PASSIVE mode instances were still attempting connections** because:
1. `checkPassiveModeGuard()` există dar nu era aplicat la toate mutating endpoints (delete account lipsea)
2. `addAccount` avea duplicate check (guard + manual check), cauzând confuzie
3. Request-urile puteau bypassa guard-ul dacă erau trimise rapid după start-up

**Solution**: Aplicat `checkPassiveModeGuard` la TOATE mutating endpoints și eliminat duplicate checks.

## Fixes Summary

### Backend (whatsapp-backend/server.js)

1. **PASSIVE Mode Guard** - Aplicat la delete account (line 4419)
2. **Remove Duplicate** - Eliminat duplicate PASSIVE check în addAccount (line 3574)
3. **regenerateQr Idempotency** - Returnează QR existent dacă valid (200), 202 dacă connecting (lines 3879-3905)
4. **regenerateQr Throttle** - Per-account throttle 10s pentru prevent UI loops (lines 3845-3861)
5. **401 Handler** - Setează status='logged_out' (nu 'needs_qr') pentru session expired (lines 1770, 1796)

### Flutter (superparty_flutter/)

1. **Emulator Functions URL** - Folosește `10.0.2.2:5002` când `USE_ADB_REVERSE=false` (whatsapp_api_service.dart:36-40)
2. **Handle 202 Gracefully** - Returnează success pentru 202 (already in progress) (whatsapp_api_service.dart:376-395)
3. **Handle 429 Gracefully** - Mesaj prietenos pentru 429 (rate limited) (whatsapp_accounts_screen.dart:427-438)

## How to Verify

### Local Emulator (Without adb reverse)
```bash
# Terminal 1: Emulators
npm run emu:all

# Terminal 2: Backend (local)
cd whatsapp-backend && npm start

# Terminal 3: Flutter
cd superparty_flutter
flutter run -d emulator-5554 \
  --dart-define=USE_EMULATORS=true \
  --dart-define=USE_ADB_REVERSE=false

# Verify:
# - Functions URL = http://10.0.2.2:5002 (check logs)
# - WhatsApp accounts screen loads
# - Add account → QR displays
```

### Production (curl)
```bash
# Health check
curl https://whats-app-ompro.ro/health

# Add account (should return 503 if PASSIVE)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-app-ompro.ro/api/whatsapp/add-account

# regenerateQr (should return existing QR if valid, 202 if connecting, 429 if throttled)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-app-ompro.ro/api/whatsapp/regenerate-qr/ACCOUNT_ID
```

### Expected Behavior

**PASSIVE Mode**:
- ✅ Mutating endpoints return 503 `{ error: 'instance_passive', mode: 'passive' }`
- ✅ No connection attempts logged from PASSIVE instance

**regenerateQr**:
- ✅ Returns 200 with existing QR if valid (< 60s old)
- ✅ Returns 202 with `status: 'connecting'` if already connecting
- ✅ Returns 429 with `retryAfterSeconds` if throttled (within 10s)

**401/logged_out**:
- ✅ Status = 'logged_out' (not 'needs_qr')
- ✅ Session cleared (credentials deleted)
- ✅ No auto-reconnect attempts
- ✅ UI shows "Session expired - re-link required" + "Delete & Re-add" button

**Flutter Emulator**:
- ✅ Functions URL = `http://10.0.2.2:5002` when `USE_ADB_REVERSE=false`
- ✅ App can reach Firebase Functions emulator

## Files Changed

1. `whatsapp-backend/server.js` - PASSIVE guard, idempotency, throttle, 401 handler
2. `superparty_flutter/lib/services/whatsapp_api_service.dart` - Emulator URL, 202/429 handling
3. `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart` - 429 UI handling

## Risks / Rollback

**Low Risk**: 
- Fix-urile sunt defensive (guards, throttles) și nu schimbă comportamentul corect
- 401 handler schimbă status din 'needs_qr' la 'logged_out' (compatibil - UI gestionează ambele)

**Rollback**:
```bash
# Revert backend
cd whatsapp-backend
git revert HEAD

# Revert Flutter
cd superparty_flutter
git revert HEAD
```
