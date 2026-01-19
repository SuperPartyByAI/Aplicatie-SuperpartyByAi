# Deploy Commands - WhatsApp Flow Fixes

## Quick Commands (Copy & Paste)

### Option 1: Deploy Backend Fixes Only

```bash
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git add server.js
git commit -m "Fix: connectingTimeout log - move after isPairingPhaseNow check to prevent misleading message when status is qr_ready after 515"
git push origin main
```

### Option 2: Deploy Functions Fixes Only

```bash
cd Aplicatie-SuperpartyByAi/functions
git add whatsappProxy.js
git commit -m "Fix: debug mode for super-admin - include backendStatusCode and backendErrorSafe in error response"
git push origin main
```

### Option 3: Deploy All Fixes (Both Backend + Functions)

```bash
# Backend
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git add server.js
git commit -m "Fix: connectingTimeout log - move after isPairingPhaseNow check to prevent misleading message when status is qr_ready after 515"
cd ..

# Functions
cd functions
git add whatsappProxy.js
git commit -m "Fix: debug mode for super-admin - include backendStatusCode and backendErrorSafe in error response"
cd ..

# Push all
git push origin main
```

### Option 4: Check Status Before Deploy

```bash
# Check backend changes
cd Aplicatie-SuperpartyByAi/whatsapp-backend
git status
git diff server.js | head -50

# Check Functions changes
cd ../functions
git status
git diff whatsappProxy.js | head -50
```

## Verify After Deploy

### 1. Check Railway Logs for New Commit Hash

```bash
# Railway will show commit hash in logs
# Should NOT be 892419e6 (old commit)
# Should be a NEW commit hash
```

### 2. Test Connecting Timeout Fix

```
After reason 515:
✅ Should see: "Timeout fired but status is qr_ready (pairing phase), skipping timeout transition"
❌ Should NOT see: "Timp de conectare expirat (60s), trecere la deconectare"
```

### 3. Test Functions Debug Mode (Optional)

```bash
# Test with X-Debug header (only works in emulator with super-admin)
curl -X POST \
  "http://127.0.0.1:5002/whatsappProxyRegenerateQr?accountId=ACCOUNT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Debug: true"

# Response should include: backendStatusCode, backendErrorSafe (only in debug mode)
```

## Files Modified

1. `whatsapp-backend/server.js` - connectingTimeout log fix (line 1225-1226)
2. `functions/whatsappProxy.js` - debug mode fix (lines 943-1041)
