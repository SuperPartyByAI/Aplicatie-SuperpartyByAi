# WhatsApp Stability Fix - Commands to Run

## Quick Deploy Commands

### Option 1: Deploy Backend Only

```bash
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git add server.js
git commit -m "Fix: WhatsApp stability - PASSIVE guard on delete, regenerateQr idempotent+throttle, 401 sets logged_out, remove duplicate checks"
git push origin main
```

### Option 2: Deploy Functions Only

```bash
cd Aplicatie-SuperpartyByAi/functions
git add whatsappProxy.js
git commit -m "Fix: debug mode for super-admin - include backendStatusCode and backendErrorSafe"
git push origin main
```

### Option 3: Deploy Flutter Only

```bash
cd Aplicatie-SuperpartyByAi/superparty_flutter
git add lib/services/whatsapp_api_service.dart lib/screens/whatsapp/whatsapp_accounts_screen.dart
git commit -m "Fix: WhatsApp emulator Functions URL (10.0.2.2), handle 202/429 gracefully, stop UI loops"
git push origin main
```

### Option 4: Deploy All Fixes (Backend + Flutter)

```bash
# Backend
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git add server.js
git commit -m "Fix: WhatsApp stability - PASSIVE guard, idempotent regenerateQr, 401 sets logged_out"
cd ..

# Flutter
cd superparty_flutter
git add lib/services/whatsapp_api_service.dart lib/screens/whatsapp/whatsapp_accounts_screen.dart
git commit -m "Fix: WhatsApp emulator URL, handle 202/429, stop UI loops"
cd ..

# Push all
git push origin main
```

## Verification Commands

### Check Status Before Deploy
```bash
# Backend changes
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git diff server.js | grep -A 5 -B 5 "logged_out\|checkPassiveModeGuard\|REGENERATE_THROTTLE"

# Flutter changes
cd ../superparty_flutter
git diff lib/services/whatsapp_api_service.dart | grep -A 5 -B 5 "10.0.2.2\|429\|202"
git diff lib/screens/whatsapp/whatsapp_accounts_screen.dart | grep -A 5 -B 5 "retryAfterSeconds\|rate_limited"
```

### Test Locally (Emulator Without adb reverse)
```bash
# Terminal 1: Start emulators
cd Aplicatie-SuperpartyByAi
npm run emu:all

# Terminal 2: Start backend (local)
cd whatsapp-backend
npm start

# Terminal 3: Run Flutter (without adb reverse)
cd ../superparty_flutter
flutter run -d emulator-5554 \
  --dart-define=USE_EMULATORS=true \
  --dart-define=USE_ADB_REVERSE=false

# Verify Functions URL in logs:
# Should see: [WhatsAppApiService] Using Android emulator Functions URL: http://10.0.2.2:5002
```

### Test Production (curl)
```bash
# Set admin token
export ADMIN_TOKEN="dev-token-..."

# 1. Health check
curl https://whats-upp-production.up.railway.app/health

# 2. Get accounts
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts

# 3. Add account (should return 503 if PASSIVE)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+40712345678"}' \
  https://whats-upp-production.up.railway.app/api/whatsapp/add-account

# 4. regenerateQr (should return existing QR if valid, 202 if connecting, 429 if throttled)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID
```

### Verify After Deploy

**Railway logs should show:**
- ✅ Commit hash is NEW (not `892419e6`)
- ✅ PASSIVE mode guard logs: `⏸️  [requestId] PASSIVE mode guard`
- ✅ Throttle logs: `ℹ️  [accountId] Regenerate throttled (Xs remaining)`
- ✅ 401 handler logs: `status=logged_out` (not `needs_qr`)
- ✅ Idempotent QR logs: `QR already exists and valid, returning existing QR`

**Flutter logs should show:**
- ✅ `[WhatsAppApiService] Using Android emulator Functions URL: http://10.0.2.2:5002` (when `USE_ADB_REVERSE=false`)
- ✅ `202 already_in_progress - returning success` (când backend returnează 202)
- ✅ `429 rate_limited - throttle applied` (când backend returnează 429)
