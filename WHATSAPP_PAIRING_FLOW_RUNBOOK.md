# WhatsApp Pairing Flow - Recovery Runbook

## How to Recover from 401/logged_out

### Symptoms
- Account status shows `needs_qr` or `logged_out`
- Repeated 401 errors in logs
- Account cannot connect despite credentials existing

### Root Cause
Account was logged out by WhatsApp (401). Invalid credentials exist on disk, causing reconnect loops.

### Recovery Steps

#### Option 1: Use Reset Endpoint (Recommended)
```bash
# Reset account session via API
curl -X POST \
  https://whats-upp-production.up.railway.app/api/whatsapp/accounts/ACCOUNT_ID/reset \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

This will:
- Delete session directory on disk (`/app/sessions/ACCOUNT_ID`)
- Clear Firestore session backup
- Set status to `needs_qr`
- Clear all timers and in-memory state

Then regenerate QR:
```bash
curl -X POST \
  https://whats-upp-production.up.railway.app/api/whatsapp/regenerate-qr/ACCOUNT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Option 2: Use Flutter App
1. Open WhatsApp Accounts screen
2. For accounts with status `needs_qr` or `logged_out`:
   - Tap "Regenerate QR" button
   - App will call reset endpoint internally (TODO: add explicit reset button)

#### Option 3: Manual Cleanup (Backend Only)
If you have shell access to Railway backend:
```bash
# Delete session directory
rm -rf /app/sessions/ACCOUNT_ID

# Update Firestore (via Firebase console or CLI)
# Set status: 'needs_qr'
# Set requiresQR: true
# Clear nextRetryAt: null
# Reset retryCount: 0
```

### Verification

After reset, verify:
1. Account status is `needs_qr` in Firestore
2. Session directory does not exist: `ls /app/sessions/ACCOUNT_ID` → should fail
3. Firestore `accounts/ACCOUNT_ID` shows `nextRetryAt: null`, `retryCount: 0`
4. No reconnect attempts in logs (no `createConnection` scheduled)

### Prevention

Backend now automatically:
- Clears `connectingTimeout` on 401 cleanup
- Sets `nextRetryAt=null`, `retryCount=0` on terminal logout
- Blocks `createConnection()` if Firestore status is `needs_qr` or `logged_out`
- Does NOT schedule reconnect for 401/logged_out (requires user action)

Flutter now:
- Blocks `regenerateQr` if status is `connecting`/`qr_ready`/`connected`
- Shows appropriate UI states for each status
