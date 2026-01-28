# WhatsApp Issues Summary & Action Plan

## Current Status

✅ **Backend Health:** Healthy, Firestore connected, ACTIVE mode  
❌ **QR Regeneration:** Returns 500 errors  
❌ **Account Persistence:** Accounts disappear after creation  
❌ **Connection Stability:** Closes with "unknown" reason  

## Issues from Logs

### Issue 1: QR Regeneration 500 Errors
**Frequency:** Multiple failures after initial success  
**Pattern:** First regenerate succeeds (200), subsequent attempts fail (500)  
**Error:** `Backend service returned an error`

**Root Cause Hypothesis:**
- Account might be removed from memory after connection closes
- Regenerate QR endpoint can't find account (line 3561 in server.js)
- Exception thrown during `createConnection()` (line 3656)

### Issue 2: Account Disappears
**Pattern:** 
1. Account created → `accountsCount=1`
2. QR generated successfully
3. Connection closes with "unknown" reason
4. Account disappears → `accountsCount=0`

**Root Cause Hypothesis:**
- Connection cleanup removes account from memory
- Account marked as disconnected in Firestore
- Query filters out disconnected accounts

### Issue 3: Connection Close "Unknown" Reason
**Pattern:** Connection closes immediately after QR generation  
**Reconnect:** `true` (but account disappears before reconnect)

**Root Cause Hypothesis:**
- Baileys connection error not properly categorized
- Network timeout during pairing phase
- WhatsApp server rejecting connection

## Immediate Actions Required

### 1. Check legacy hosting Logs (CRITICAL)
In legacy hosting dashboard, check logs for:
```
❌ Regenerate QR error:
🔌 [account_xxx] connection.update: close
🗑️ [account_xxx] Marking old Firestore account as disconnected
```

**Look for:**
- Full error stack traces
- Account ID being cleaned up
- Reason for connection close
- PASSIVE mode messages

### 2. Verify Account in Firestore
```bash
# Check if account exists
firebase firestore:get accounts/account_dev_dde908a65501c63b124cb94c627e551d

# List all accounts
firebase firestore:get accounts --limit 10
```

**Check fields:**
- `status` - Should be `qr_ready` or `connecting`
- `lastDisconnectReason` - Should be null or empty
- `requiresQR` - Should be `true` during pairing
- `updatedAt` - Check if account was recently updated

### 3. Test Account Creation Flow
1. **Create fresh account** via Flutter app
2. **Monitor legacy hosting logs** in real-time
3. **Check Firestore** immediately after creation
4. **Wait for QR** - does it appear?
5. **Check account status** - does it persist?

## Code Issues to Investigate

### 1. Regenerate QR Error Handling
**File:** `whatsapp-backend/server.js:3536-3680`

**Issue:** Generic error handler returns 500 without details
```javascript
} catch (error) {
  console.error(`❌ Regenerate QR error:`, error);
  res.status(500).json({ success: false, error: error.message });
}
```

**Fix Needed:** Add detailed error logging and better error messages

### 2. Account Cleanup Logic
**File:** `whatsapp-backend/server.js:3294-3314`

**Issue:** Marks accounts with same phone as disconnected
```javascript
if (existingPhone && existingPhone === normalizedPhone && doc.id !== accountId) {
  console.log(`🗑️ [${doc.id}] Marking old Firestore account as disconnected`);
  // ... marks as disconnected
}
```

**Potential Issue:** If account ID changes or phone normalization differs, new account might be incorrectly identified as old

### 3. Connection Close Handling
**File:** `whatsapp-backend/server.js:1389-1420`

**Issue:** "Unknown" reason not properly handled
- Error details logged but not actionable
- Reconnect logic might remove account before reconnect

## Recommended Fixes

### Fix 1: Improve Regenerate QR Error Handling
```javascript
// Around line 3677
} catch (error) {
  console.error(`❌ [${accountId}/${requestId}] Regenerate QR error:`, error);
  console.error(`❌ Stack:`, error.stack);
  
  // Check if account exists
  const accountExists = connections.has(accountId) || 
    (firestoreAvailable && db && (await db.collection('accounts').doc(accountId).get()).exists);
  
  res.status(500).json({ 
    success: false, 
    error: 'backend_error',
    message: error.message,
    accountId: accountId,
    accountExists: accountExists,
    requestId: requestId,
  });
}
```

### Fix 2: Prevent Account Cleanup During Pairing
```javascript
// Around line 3303
const isPairing = ['qr_ready', 'awaiting_scan', 'pairing', 'connecting'].includes(data.status);
if (existingPhone && existingPhone === normalizedPhone && 
    doc.id !== accountId && !isPairing) {
  // Only mark as disconnected if NOT in pairing phase
  console.log(`🗑️ [${doc.id}] Marking old Firestore account as disconnected`);
  // ... mark as disconnected
}
```

### Fix 3: Better Unknown Disconnect Handling
```javascript
// Around line 1420
if (reason === 'unknown' || !reason) {
  // For unknown reasons during pairing, preserve account and retry
  if (['qr_ready', 'awaiting_scan', 'pairing'].includes(account.status)) {
    console.log(`⚠️ [${accountId}] Unknown disconnect during pairing - preserving account`);
    // Don't remove account, just retry connection
    return;
  }
}
```

## Testing Plan

### Test 1: Account Creation & Persistence
1. Create account via Flutter
2. Verify account appears in `/api/whatsapp/accounts`
3. Check Firestore - account exists
4. Wait 30 seconds
5. Verify account still exists

### Test 2: QR Regeneration
1. Create account
2. Wait for QR
3. Call regenerate QR endpoint
4. Verify 200 response
5. Call again immediately
6. Verify 202 (in progress) or 200 (idempotent)

### Test 3: Connection Stability
1. Create account
2. Monitor connection status
3. Wait for QR
4. Verify connection doesn't close unexpectedly
5. If closes, check reason in logs

## Next Steps

1. **URGENT:** Check legacy hosting logs for detailed error messages
2. **URGENT:** Verify account exists in Firestore after creation
3. **HIGH:** Test account creation flow end-to-end
4. **MEDIUM:** Apply fixes based on findings
5. **LOW:** Improve error logging for better diagnostics

## Questions to Answer

1. ✅ Is backend in PASSIVE mode? → **NO, it's ACTIVE**
2. ❓ Does account exist in Firestore after creation? → **CHECK REQUIRED**
3. ❓ What is the exact error in legacy hosting logs? → **CHECK REQUIRED**
4. ❓ Why does connection close with "unknown" reason? → **INVESTIGATE**
5. ❓ Is account being incorrectly cleaned up? → **INVESTIGATE**

## Files Created

- `WHATSAPP_ISSUES_DIAGNOSTIC.md` - Detailed diagnostic guide
- `diagnose-whatsapp-issues.sh` - Automated diagnostic script
- `WHATSAPP_ISSUES_SUMMARY.md` - This file

## Commands to Run

```bash
# Run diagnostic
bash diagnose-whatsapp-issues.sh

# Check Firestore accounts
firebase firestore:get accounts --limit 10

# Check specific account
firebase firestore:get accounts/account_dev_dde908a65501c63b124cb94c627e551d

# Check legacy hosting health
curl -sS https://whats-app-ompro.ro/health | jq
```
