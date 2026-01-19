# Before/After Logs - WhatsApp Stability Fixes

## Before Fixes (Unstable Behavior)

### Example 1: PASSIVE Instance Attempting Connections
```
[whatsapp-backend] ⏸️  PASSIVE mode - lock not acquired
[whatsapp-backend] 🔌 [account_xxx] Se creează conexiunea...
[whatsapp-backend] ⏰ [account_xxx] Timp de conectare expirat (60s), trecere la deconectare
[Flutter] regenerateQr: error=500, message=Backend service returned an error
[Flutter] regenerateQr: error=500, message=Backend service returned an error
[Flutter] regenerateQr: error=500, message=Backend service returned an error
```

**Problem**: PASSIVE instance încă încearcă să creeze conexiuni, cauzând timeout și 500 errors.

### Example 2: regenerateQr Spam (500 Loop)
```
[Flutter] regenerateQr: calling proxy (request 1)
[Backend] Regenerate QR request: accountId=account_xxx
[Backend] ❌ Error: Connection already in progress (throws exception)
[Flutter] regenerateQr: error=500, message=Internal server error
[Flutter] regenerateQr: calling proxy (request 2 - immediate retry)
[Backend] Regenerate QR request: accountId=account_xxx
[Backend] ❌ Error: Connection already in progress (throws exception)
[Flutter] regenerateQr: error=500, message=Internal server error
[... repeats ...]
```

**Problem**: regenerateQr aruncă 500 când account e deja "connecting", cauzând UI loop.

### Example 3: 401/logged_out Cleanup (Wrong Status)
```
[Backend] ❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
[Backend] Status set to: needs_qr
[Backend] 🔄 Auto-reconnect scheduled in 5s
[Backend] 🔌 [account_xxx] Se creează conexiunea... (reconnect attempt)
[Backend] ❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
[... loop continues ...]
```

**Problem**: 401 handler setează status='needs_qr' și pornește auto-reconnect, cauzând loop.

## After Fixes (Stable Behavior)

### Example 1: PASSIVE Instance Guarded
```
[Backend] ⏸️  [requestId] PASSIVE mode guard: lock not acquired, reason=lock_not_acquired, instanceId=xxx
[Backend] Response: 503 { success:false, error:"instance_passive", code:"passive_mode", message:"Instance is passive...", retryAfterSec:15 }
[Flutter] Backend în mod PASSIVE. Lock nu este achiziționat. Reîncearcă în câteva secunde.
```

**Fix**: PASSIVE instances returnează 503 cu `retryAfterSec`, nu încearcă conexiuni.

### Example 2: regenerateQr Idempotent (No 500 Loop)
```
[Flutter] regenerateQr: calling proxy, requestId=req_xxx, correlationId=regenerateQr_xxx
[Backend] 🔍 [account_xxx/req_xxx] Regenerate QR request
[Backend] ℹ️  [account_xxx/req_xxx] QR already exists and valid (status: qr_ready, age: 15s), returning existing QR (idempotent)
[Flutter] regenerateQr: success, qrCode=<existing>, status=qr_ready, idempotent=true

# OR if connecting:
[Backend] ℹ️  [account_xxx/req_xxx] Regenerate already in progress (connecting=true), returning 202 Accepted
[Flutter] regenerateQr: 202 already_in_progress - returning success

# OR if throttled:
[Backend] ℹ️  [account_xxx/req_xxx] Regenerate throttled (5s remaining)
[Backend] Response: 429 { error:"rate_limited", message:"Please wait 5s before regenerating QR again", retryAfterSeconds:5 }
[Flutter] Please wait 5s before regenerating QR again (orange snackbar)
```

**Fix**: regenerateQr returnează 200 (QR existent), 202 (connecting), sau 429 (throttled) - nu 500.

### Example 3: 401/logged_out Cleanup (Correct Status)
```
[Backend] 🔌 [account_xxx] connection.update: close {
  accountId: "account_xxx",
  instanceId: "uuid",
  waMode: "active",
  reasonCode: 401,
  shouldReconnect: false,
  reconnectDecision: "no_reconnect",
  statusBefore: "connected",
  statusAfter: "logged_out"
}
[Backend] ❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
[Backend] Status set to: logged_out
[Backend] 📋 [account_xxx] 401 handler complete: status=logged_out, nextRetryAt=null, retryCount=0, reconnectScheduled=false
# NO reconnect attempts logged
[Flutter] UI shows: "Session expired - re-link required" + "Delete & Re-add" button
```

**Fix**: 401 handler setează status='logged_out' și nu pornește auto-reconnect.

### Example 4: 515/Transient Disconnect (Backoff)
```
[Backend] 🔌 [account_xxx] connection.update: close {
  accountId: "account_xxx",
  instanceId: "uuid",
  waMode: "active",
  reasonCode: 515,
  shouldReconnect: true,
  reconnectDecision: "reconnect_with_backoff",
  statusBefore: "qr_ready",
  statusAfter: "connecting"
}
[Backend] 🔄 [account_xxx] Pairing phase reconnect in 2000ms (attempt 1/10, reason: 515 [515 restart required])
# ... after 2s ...
[Backend] 🔄 [account_xxx] Starting pairing phase reconnect (session will be new, QR will be regenerated)
# ... if fails again ...
[Backend] 🔄 [account_xxx] Pairing phase reconnect in 4000ms (attempt 2/10, reason: 515)
```

**Fix**: 515 disconnect trigger reconnect cu exponential backoff (2s, 4s, 8s, 16s, 30s max).

### Example 5: addAccount Idempotent (No Duplicates)
```
[Flutter] addAccount: calling proxy, requestId=req_1, correlationId=addAccount_xxx
[Backend] POST /api/whatsapp/add-account, requestId=req_1
[Backend] Account ID generated: account_dev_xxx
[Backend] Response: 200 { account: { id: "account_dev_xxx", status: "connecting" } }

# Rapid second call (within 1s):
[Flutter] addAccount: calling proxy, requestId=req_2, correlationId=addAccount_yyy
[Backend] POST /api/whatsapp/add-account, requestId=req_2
[Backend] ℹ️  [account_dev_xxx] Account already exists in pairing phase (status: qr_ready), returning existing account (idempotent)
[Backend] Response: 200 { account: { id: "account_dev_xxx", status: "qr_ready" }, idempotent: true }

# Verify: Only ONE session directory: /app/sessions/account_dev_xxx
```

**Fix**: addAccount returnează accountId existent dacă e în pairing phase, nu creează duplicate.

## Summary of Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **PASSIVE guard** | Nu aplicat la delete | Aplicat la TOATE mutating endpoints |
| **regenerateQr spam** | 500 errors (connection already in progress) | 202 (connecting) sau 429 (throttled) |
| **regenerateQr idempotent** | Trigger new connection chiar dacă QR valid | Returnează QR existent dacă valid (< 60s) |
| **401 handler** | status='needs_qr' + auto-reconnect | status='logged_out' + no reconnect |
| **515 reconnect** | Fast loop (no backoff) | Exponential backoff (2s, 4s, 8s, 16s, 30s) |
| **addAccount idempotent** | Creează duplicate pentru același phone | Returnează accountId existent dacă pairing phase |
| **Flutter emulator URL** | Hardcoded 127.0.0.1:5002 | 10.0.2.2:5002 când USE_ADB_REVERSE=false |
| **Flutter 202/429 handling** | Tratate ca eroare fatală → loop | Tratate ca non-fatal → mesaj prietenos |
| **Logging structure** | Missing instanceId/waMode | Always includes: accountId, instanceId, waMode, reasonCode, shouldReconnect, statusBefore/statusAfter |
