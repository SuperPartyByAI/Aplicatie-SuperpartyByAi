# WhatsApp Pairing Flow Fix Summary

## Overview
Fixing full WhatsApp pairing flow to handle 401/logged_out correctly and prevent infinite loops.

## Backend Fixes (Completed)

### 1. 401 Handler Improvements (`server.js` ~line 1664)
- ✅ Clear `connectingTimeout` before session cleanup
- ✅ Delete reconnect timers
- ✅ Log session state before/after clear
- ✅ Set `nextRetryAt=null`, `retryCount=0` in Firestore
- ✅ Use incident type `wa_logged_out_requires_pairing`
- ✅ Added logging for debugging

### 2. Reset Endpoint (`server.js` ~line 4267)
- ✅ Added `POST /api/whatsapp/accounts/:id/reset`
- ✅ Clears disk session via `clearAccountSession()`
- ✅ Clears Firestore session backup
- ✅ Sets status to `needs_qr`
- ✅ Clears timers and in-memory state

## Backend Fixes (Remaining)

### 3. Second 401 Handler (~line 5158)
- ⏳ Apply same fixes as first handler (timeout clear, logging)

## Flutter Fixes (Completed/In Progress)

### 1. Structured Logging
- ⏳ Add NDJSON logging to `/Users/universparty/.cursor/debug.log` (TODO: can use existing debugPrint for now)
- ✅ Existing debugPrint logs already show: endpoint, statusCode, bodyLength, accountId

### 2. RegenerateQr Debounce ✅
- ✅ Already has 30s cooldown on failure
- ✅ Already has in-flight guard
- ✅ **FIXED**: Block regenerate if status is `connecting`/`qr_ready`/`connected`/`awaiting_scan`
- ✅ **FIXED**: Pass `currentStatus` parameter to `regenerateQr()` API method

### 3. UI State Handling (In Progress)
- ✅ Show QR for `needs_qr`/`qr_ready`/`awaiting_scan` (already implemented)
- ⏳ Show "Reset Session" button for `logged_out`/401 (needs UI update)
- ⏳ Stop retry loop on 500 errors (retryWithBackoff already handles this)

## Verification Steps

1. Backend: Test reset endpoint with curl
2. Backend: Verify 401 handler logs show `nextRetryAt=null`
3. Flutter: Test full flow (addAccount -> QR -> scan -> connected)
4. Flutter: Verify no infinite regenerateQr calls
