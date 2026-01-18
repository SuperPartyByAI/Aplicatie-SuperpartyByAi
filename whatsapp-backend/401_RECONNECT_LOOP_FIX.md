# Fix: 401 Reconnect Loop - Terminal Logout Handling

## Root Cause

The WhatsApp backend was entering an **infinite reconnect loop** when accounts received a 401 (Unauthorized) logout:

1. WhatsApp invalidates session (401/logged_out)
2. Backend's `connection.update: close` handler receives 401
3. Backend enters "Explicit cleanup" path and sets status to `needs_qr`
4. **BUG**: Backend schedules `createConnection()` after 5 seconds
5. New connection attempts with **invalid credentials** → 401 again
6. Loop repeats indefinitely

**Consequence**: Accounts with invalidated sessions (logout, revoked linked devices, expired credentials) could never recover without manual intervention. The backend would continuously retry with corrupted credentials, flooding logs and consuming resources.

---

## Solution

### 1. **Created `clearAccountSession()` Function** (lines 886-909)
- **Purpose**: Clear both disk session and Firestore backup before re-pairing
- **Implementation**:
  - Deletes session directory: `/app/sessions/{accountId}` (using `fs.rmSync`)
  - Deletes Firestore backup: `wa_sessions/{accountId}` collection doc
- **Result**: Next pairing starts with clean slate (no stale credentials)

### 2. **Created `isTerminalLogout()` Helper** (lines 911-923)
- **Purpose**: Identify terminal disconnect reasons (require re-pairing, not auto-reconnect)
- **Terminal reasons**: `401 (loggedOut)`, `badSession`, `unauthorized`
- **Result**: Centralized logic for terminal logout detection

### 3. **Fixed Terminal Logout Cleanup** (lines 1275-1310, 4211-4243)
- **Before**: Scheduled `createConnection()` after 5 seconds
- **After**: 
  - Calls `clearAccountSession()` to remove corrupted credentials
  - Sets account status to `needs_qr`
  - Sets `requiresQR: true` flag
  - **DOES NOT** schedule `createConnection()` (requires explicit user action)
- **Result**: Loop stops, account waits for "Regenerate QR" user action

### 4. **Updated Regenerate QR Endpoint** (lines 3016-3074)
- **Before**: Only cleaned in-memory state, didn't clear session
- **After**:
  - Calls `clearAccountSession()` deterministically
  - Sets status to `connecting` (will transition to `qr_ready`)
  - Then calls `createConnection()` (generates fresh QR)
- **Result**: QR regeneration always starts with clean session

### 5. **Added Guard in `createConnection()`** (lines 927-937)
- **Purpose**: Prevent auto-connect attempts for accounts with terminal logout status
- **Logic**: Skips auto-connect if status is `needs_qr` or `logged_out`, or if `requiresQR === true`
- **Result**: Background reconnect loops won't restart terminal logout accounts

---

## Files Changed

1. **`whatsapp-backend/server.js`**:
   - Added `clearAccountSession()` function (lines 886-909)
   - Added `isTerminalLogout()` helper (lines 911-923)
   - Fixed terminal logout cleanup (lines 1275-1310, 4211-4243)
   - Updated regenerate-qr endpoint (lines 3016-3074)
   - Added guard in `createConnection()` (lines 927-937)

2. **`whatsapp-backend/scripts/verify_terminal_logout.js`** (new):
   - Verification script to ensure fix is properly implemented
   - Runs checks for all fix components
   - Usage: `node scripts/verify_terminal_logout.js`

---

## Verification

Run the verification script:
```bash
cd whatsapp-backend
node scripts/verify_terminal_logout.js
```

**Expected output**: All checks pass ✅

---

## How to Verify Manually

### 1. **Create Account**
- Add WhatsApp account via Flutter app
- Account should connect and become `connected`

### 2. **Force 401 (Terminal Logout)**
- Option A: Unlink device from WhatsApp app (Settings → Linked Devices → [Your Device] → Unlink)
- Option B: Revoke all linked devices
- Option C: Wait for credentials to expire (rare, usually weeks)

### 3. **Verify Backend Behavior**
- Backend should receive 401 in logs:
  ```
  ❌ [account_xxx] Explicit cleanup (401), terminal logout - clearing session
  🗑️  [account_xxx] Session directory deleted: /app/sessions/account_xxx
  🗑️  [account_xxx] Firestore session backup deleted
  ```
- Account status should become `needs_qr` in Firestore
- **No reconnect attempts** should appear in logs (loop stopped)

### 4. **Regenerate QR**
- Use Flutter app: Tap "Regenerate QR" button
- Backend should:
  - Clear session again (deterministic)
  - Generate fresh QR code
  - Status transitions: `needs_qr` → `connecting` → `qr_ready`

### 5. **Reconnect**
- Scan QR code with phone
- Account should reconnect: `qr_ready` → `connected`

---

## What is Preserved

✅ **Conversations (threads/messages)**: NEVER deleted - only session is cleared
✅ **Account document**: Preserved in Firestore (status updated, not deleted)
✅ **Client data**: All `clients/` and `threads/` collections untouched
✅ **CRM data**: Events (`evenimente/`), extractions, stats preserved

---

## What is Cleared (On Terminal Logout)

🗑️ **Session directory**: `/app/sessions/{accountId}` (disk)
🗑️ **Firestore session backup**: `wa_sessions/{accountId}` (collection doc)

**Why**: Corrupted/invalid credentials must be removed for fresh pairing.

---

## Migration Notes

- **No migration required**: Existing accounts continue to work
- **Terminal logout accounts**: Will stop reconnecting automatically (expected)
- **Action required**: Users with `needs_qr` status must click "Regenerate QR" to re-pair

---

## Commands Run

```bash
# Verification
cd whatsapp-backend
node scripts/verify_terminal_logout.js

# Expected: All checks pass ✅
```

---

## Related Issues

- **Issue**: Infinite reconnect loop on 401/logged_out
- **Symptom**: Backend logs flooded with 401 errors, accounts never recover
- **Fix**: Stop auto-reconnect on terminal logout, clear session, require explicit QR regeneration

---

**Status**: ✅ **FIXED** - Verified by automated script

**Date**: 2026-01-18

**Commit**: `fix(wa): stop 401 reconnect loop; clear session on logged_out; deterministic regenerate-qr`
