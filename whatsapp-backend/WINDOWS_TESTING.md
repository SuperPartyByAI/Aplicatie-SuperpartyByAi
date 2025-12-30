# Testing WA Stability from Windows

## Prerequisites

1. **Node.js installed** (you have v24.11.1 ✅)
2. **Git repository cloned** to your Windows machine
3. **ADMIN_TOKEN** from Railway environment variables

## Get Your Admin Token

### Option 1: From Railway Dashboard
1. Go to https://railway.app
2. Open your project
3. Click "Variables" tab
4. Find `ADMIN_TOKEN` value
5. Copy it

### Option 2: From Railway CLI
```bash
railway variables get ADMIN_TOKEN
```

## Run the Test

### Method 1: Using Batch File (Easiest)

1. Open Command Prompt
2. Navigate to the repository:
   ```cmd
   cd path\to\Aplicatie-SuperpartyByAi\whatsapp-backend
   ```

3. Run the test with your token:
   ```cmd
   test-wa-status.bat YOUR_ADMIN_TOKEN_HERE
   ```

   Example:
   ```cmd
   test-wa-status.bat dev-token-abc123
   ```

### Method 2: Using Node Directly

1. Set environment variable:
   ```cmd
   set ADMIN_TOKEN=YOUR_ADMIN_TOKEN_HERE
   ```

2. Run the script:
   ```cmd
   node scripts\test-wa-status.js
   ```

## Expected Output

### Successful Test
```
========================================
WA STATUS TEST
========================================
Base URL: https://whats-upp-production.up.railway.app
Token: dev-token-...

Fetching status-now...
✅ Request successful

=== WA Connection Status (DoD-WA-1) ===
waMode: active
waStatus: CONNECTED
lastDisconnectReason: null
retryCount: 0
nextRetryAt: null
authStore: firestore
authStateExists: true
authKeyCount: 15
lockHolder: railway-prod-abc123

=== Field Verification ===
✅ waMode
✅ waStatus
✅ retryCount
✅ authStore

✅ DoD-WA-1: All required fields present

=== Status Interpretation ===
✅ WhatsApp CONNECTED

========================================
Full response saved to wa-status.json
========================================
```

### If Disconnected
```
=== Status Interpretation ===
⚠️ WhatsApp DISCONNECTED (retry #3)
   Next retry: 2025-12-30T01:00:08Z
```

### If Needs Pairing
```
=== Status Interpretation ===
❌ WhatsApp NEEDS_PAIRING (logged out)
   QR code scan required
```

### If Passive Mode
```
=== Status Interpretation ===
⚠️ Instance in PASSIVE mode (lock not acquired)
   Another instance is handling WA connection
```

## Troubleshooting

### Error: "Authentication failed"
```
❌ Error: HTTP 401: Unauthorized
⚠️ Authentication failed. Check ADMIN_TOKEN environment variable.
```

**Solution**: Check your ADMIN_TOKEN is correct

### Error: "Cannot reach server"
```
❌ Error: getaddrinfo ENOTFOUND whats-upp-production.up.railway.app
⚠️ Cannot reach server. Check BASE_URL.
```

**Solution**: 
- Check your internet connection
- Verify Railway app is running: https://whats-upp-production.up.railway.app/health

### Error: "Cannot find module"
```
Error: Cannot find module 'C:\Users\ursac\scripts\test-wa-status.js'
```

**Solution**: Make sure you're in the `whatsapp-backend` directory:
```cmd
cd Aplicatie-SuperpartyByAi\whatsapp-backend
```

## View Full Response

After running the test, check `wa-status.json` for the complete response:

```cmd
type wa-status.json
```

Or open it in a text editor.

## Alternative: Use PowerShell

If you prefer PowerShell:

```powershell
$env:ADMIN_TOKEN = "YOUR_ADMIN_TOKEN_HERE"
node scripts\test-wa-status.js
```

## Alternative: Use curl (if installed)

If you have curl installed on Windows:

```cmd
curl -H "X-Admin-Token: YOUR_ADMIN_TOKEN_HERE" https://whats-upp-production.up.railway.app/api/longrun/status-now
```

## What to Look For

### DoD-WA-1 Verification ✅
The test verifies all required fields are present:
- `waMode` - active or passive
- `waStatus` - CONNECTED, DISCONNECTED, or NEEDS_PAIRING
- `lastDisconnectReason` - reason for last disconnect
- `retryCount` - number of reconnect attempts
- `nextRetryAt` - when next reconnect will happen
- `authStore` - should be "firestore"

### Connection Health
- **CONNECTED** = Everything working ✅
- **DISCONNECTED** = Temporary issue, auto-reconnecting ⚠️
- **NEEDS_PAIRING** = Logged out, QR scan needed ❌
- **Passive mode** = Another instance is active ℹ️

## Next Steps

After verifying the status:

1. **If CONNECTED**: Everything is working! ✅

2. **If DISCONNECTED**: 
   - Check `retryCount` and `nextRetryAt`
   - Wait for auto-reconnect
   - Check Railway logs if retryCount > 5

3. **If NEEDS_PAIRING**:
   - Go to: https://whats-upp-production.up.railway.app/api/whatsapp/qr
   - Scan QR code with WhatsApp mobile app

4. **If Passive Mode**:
   - This is normal if you have multiple instances
   - Only one instance runs WA connection at a time

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify app is running: https://whats-upp-production.up.railway.app/health
3. Check Firestore for incidents: `wa_metrics/longrun/incidents`
