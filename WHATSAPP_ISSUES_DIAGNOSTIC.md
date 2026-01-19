# WhatsApp Issues Diagnostic - QR Regeneration & Account Disappearing

## Issues Identified from Logs

### 1. QR Regeneration Returns 500 Errors
**Symptom:**
```
[WhatsAppApiService] regenerateQr: status=500, bodyLength=87
[WhatsAppApiService] regenerateQr: error=backend_error, message=Backend service returned an error
```

**Possible Causes:**
- Backend in PASSIVE mode (lock not acquired)
- Account not found in memory or Firestore
- Error in `createConnection()` during QR regeneration
- Exception thrown in regenerate QR endpoint

### 2. Account Disappears After Creation
**Symptom:**
```
[WhatsAppApiService] getAccounts: success, accountsCount=1
... (later) ...
[WhatsAppApiService] getAccounts: success, accountsCount=0
```

**Possible Causes:**
- Backend cleanup marking account as disconnected
- Connection closes with "unknown" reason and account is removed
- Firestore query filtering out disconnected accounts

### 3. Connection Closes with "Unknown" Reason
**Symptom:**
```
🔔 [account_dev_...] Connection update: close
🔌 [account_dev_...] Reason code: unknown, Reconnect: true
```

**Possible Causes:**
- Baileys connection error not properly categorized
- Network timeout or transient error
- WhatsApp server closing connection unexpectedly

## Diagnostic Steps

### Step 1: Check Backend Status
```bash
curl -sS https://whats-upp-production.up.railway.app/health | jq '.lock, .waMode'
```

**Expected:**
- `lock.owner` should match current deployment
- `waMode` should be "active" (not "passive")

### Step 2: Check Account in Firestore
```bash
# List all accounts
firebase firestore:get accounts --limit 10

# Check specific account
firebase firestore:get accounts/account_dev_dde908a65501c63b124cb94c627e551d
```

**Check for:**
- Account exists in Firestore
- Status field value
- `lastDisconnectReason` field
- `requiresQR` field

### Step 3: Check Railway Logs
In Railway dashboard, check logs for:
- `PASSIVE mode` messages
- `Regenerate QR error` messages
- `Connection update: close` with reason details
- `Marking old Firestore account as disconnected`

### Step 4: Test Regenerate QR Endpoint Directly
```bash
# Get auth token first (from Flutter app logs or Firebase)
TOKEN="your-firebase-id-token"
ACCOUNT_ID="account_dev_dde908a65501c63b124cb94c627e551d"

curl -X POST \
  "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyRegenerateQr/${ACCOUNT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

## Root Cause Analysis

### Issue 1: QR Regeneration 500 Error

**Location:** `whatsapp-backend/server.js:3536-3680`

**Possible causes:**
1. **PASSIVE mode guard** (line 3543) - If backend is in passive mode, it should return 503, not 500
2. **Account not found** (line 3561) - Should return 404, not 500
3. **Exception in try block** (line 3677) - Generic error handler returns 500

**Fix needed:**
- Check if `checkPassiveModeGuard` is properly implemented
- Verify error handling in regenerate QR endpoint
- Add better error messages

### Issue 2: Account Disappearing

**Location:** `whatsapp-backend/server.js:3294-3314`

**Possible cause:**
- Code at line 3303 marks accounts with same phone as "disconnected"
- If account ID changes or phone normalization differs, new account might be marked as old

**Fix needed:**
- Verify phone normalization logic
- Check if account ID matching is correct
- Ensure new accounts aren't incorrectly marked as old

### Issue 3: Connection Close "Unknown" Reason

**Location:** `whatsapp-backend/server.js:1389-1420`

**Possible cause:**
- Baileys disconnect reason not properly mapped
- Error object doesn't contain expected fields
- Network timeout or transient error

**Fix needed:**
- Improve error logging to capture full error details
- Add retry logic for transient errors
- Better handling of "unknown" disconnect reasons

## Immediate Actions

### 1. Check Backend Logs in Railway
Look for:
- `PASSIVE mode` messages
- `Regenerate QR error` with stack traces
- `Connection update: close` with full error details

### 2. Verify Account in Firestore
```bash
firebase firestore:get accounts/account_dev_dde908a65501c63b124cb94c627e551d
```

Check:
- Does account exist?
- What is the `status` field?
- What is `lastDisconnectReason`?
- Is `requiresQR` set to true?

### 3. Test with Fresh Account
1. Delete old account via Flutter app
2. Create new account
3. Monitor logs in real-time
4. Check if QR appears
5. Verify account persists

## Recommended Fixes

### Fix 1: Improve Error Handling in Regenerate QR
```javascript
// In server.js around line 3677
} catch (error) {
  console.error(`❌ Regenerate QR error:`, error);
  console.error(`❌ Stack trace:`, error.stack);
  
  // Return more detailed error
  res.status(500).json({ 
    success: false, 
    error: 'backend_error',
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    accountId: accountId,
    requestId: requestId,
  });
}
```

### Fix 2: Prevent Account Cleanup During Pairing
```javascript
// In server.js around line 3303
// Only mark as disconnected if account is NOT in pairing phase
const isPairing = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(data.status);
if (existingPhone && existingPhone === normalizedPhone && doc.id !== accountId && !isPairing) {
  console.log(`🗑️ [${doc.id}] Marking old Firestore account as disconnected`);
  // ... mark as disconnected
}
```

### Fix 3: Better Logging for Unknown Disconnect Reasons
```javascript
// In server.js around line 1389
console.error(`🔌 [${accountId}] connection.update: close`, {
  // ... existing fields
  fullError: error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : undefined,
  rawError: error,
});
```

## Next Steps

1. **Run diagnostic commands** above to gather more information
2. **Check Railway logs** for detailed error messages
3. **Verify Firestore** account state
4. **Test with fresh account** to isolate the issue
5. **Apply fixes** based on findings

## Questions to Answer

1. Is backend in PASSIVE mode? (Check health endpoint)
2. Does account exist in Firestore after creation?
3. What is the exact error in Railway logs when regenerate QR fails?
4. Why does connection close with "unknown" reason?
5. Is account being incorrectly marked as "old" and disconnected?
