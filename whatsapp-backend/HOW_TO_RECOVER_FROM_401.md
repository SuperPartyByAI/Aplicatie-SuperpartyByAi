# How to Recover from 401/Logged Out

## Problem
When WhatsApp account gets 401 (logged out), backend should stop auto-reconnecting and require explicit user action to re-pair.

## Automatic Recovery (Backend)

Backend automatically handles 401:
1. Detects 401 in `connection.update: close` handler
2. Calls `clearAccountSession()` to wipe invalid auth from disk
3. Sets status to `needs_qr` in Firestore
4. Sets `nextRetryAt=null`, `retryCount=0` to prevent auto-reconnect
5. Deletes account from `connections` map
6. **Does NOT** schedule `createConnection()` - user must regenerate QR

## Manual Recovery (User Action)

### Via Flutter UI:
1. Open "Manage Accounts" screen
2. Account with 401 will show status `needs_qr` or `logged_out`
3. Tap "Regenerate QR" button
4. Scan new QR code with WhatsApp

### Via API:
```bash
# Reset session (wipes auth, sets needs_qr)
curl -X POST https://whats-app-ompro.ro/api/whatsapp/accounts/{accountId}/reset \
  -H "Authorization: Bearer {token}"

# Then regenerate QR
curl -X POST https://whats-app-ompro.ro/api/whatsapp/regenerate-qr/{accountId} \
  -H "Authorization: Bearer {token}"
```

## Verification

After 401 cleanup, verify:
- Firestore: `accounts/{accountId}.status = 'needs_qr'`
- Firestore: `accounts/{accountId}.nextRetryAt = null`
- Firestore: `accounts/{accountId}.retryCount = 0`
- Disk: `/app/sessions/{accountId}` directory deleted (or empty)
- Logs: `401 handler complete: status=needs_qr, nextRetryAt=null, retryCount=0, reconnectScheduled=false`

If `createConnection` is still called after cleanup, check logs for:
- `createConnection blocked: firestore status=needs_qr` (should appear)
- Or identify what's triggering `createConnection` and add guard
