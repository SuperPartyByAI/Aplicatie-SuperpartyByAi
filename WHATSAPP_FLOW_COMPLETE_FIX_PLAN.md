# WhatsApp Flow Complete Fix Plan

## Root Causes Identified

### 1. Flutter: No State Machine + No Polling Control
**Problem**: 
- `_loadAccounts()` is called manually, no automatic refresh
- No state machine to track account lifecycle
- No polling mechanism for QR-ready state
- Black screen when API fails silently

**Evidence**: Code review shows `_loadAccounts()` only called on `initState`, button taps, and after add/regenerate

### 2. Flutter: Error Handling Masks Real Status
**Problem**: 
- 500 errors show generic "backend_error" message
- No clear UI for logged_out/401 state
- No "Reset Session" button
- User doesn't know if QR expired or session invalid

### 3. Functions Proxy: Masks Real Status Codes
**Problem**: 
- Returns 500 for all non-2xx (except 503/404/409/429/401 we added)
- Backend error details not forwarded to Flutter
- User sees generic "backend_error" instead of "unauthorized" or "logged_out"

**Status**: Partially fixed - 401 propagation added, but other 4xx may still be masked

### 4. Backend: 401 Loop + Timeout During Pairing
**Problem**: 
- 401 handler clears session but reconnect might be triggered
- Connecting timeout fires during pairing phase (reason 515)
- Timeout doesn't recognize 'connecting' as pairing phase

**Status**: Partially fixed - timeout fix applied, needs verification

## Fixes Required

### A) Flutter: State Machine + Polling

#### A1. Add Account State Enum
```dart
enum AccountState {
  idle,           // Initial state
  creating,       // addAccount in progress
  waitingQr,      // Waiting for QR (getAccounts polling)
  qrReady,        // QR code available, waiting for scan
  connecting,     // QR scanned, connecting
  connected,      // Connected and ready
  loggedOut,      // 401/logged_out - needs re-link
  error,          // Error state with message
}
```

#### A2. Add Polling Logic
- Poll `getAccounts` every 3s ONLY when state is `waitingQr` / `qrReady` / `connecting`
- Max polling duration: 2 minutes
- Stop polling on: `connected`, `loggedOut`, `error`, or timeout
- Exponential backoff on errors (1s, 2s, 4s, 8s... max 30s)

#### A3. UI State Handling
- Show loading spinner for `creating`, `waitingQr`, `connecting`
- Show QR image for `qrReady`
- Show "Session expired - re-link required" + "Delete & Re-add" button for `loggedOut`
- Show error message for `error` state
- Never show black screen - always show a widget

### B) Functions Proxy: Full Status Code Propagation

#### B1. Propagate All 4xx Status Codes
- Already done: 401, 403, 404, 409, 429
- Add: 400, 402, 405, 406, 408, 410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 431, 451
- For 5xx: Return 500 but include `upstreamStatusCode` and `backendError` in body

#### B2. Include Backend Error Details
- Always include `backendError`, `backendMessage`, `backendStatus` in response body
- Sanitize secrets (tokens, passwords, API keys)

### C) Backend: Stabilize 401 Handling

#### C1. Prevent Reconnect Loop
- Already fixed: Firestore check in `createConnection`
- Already fixed: Timeout cleared on 401
- Verify: No reconnect scheduled after 401

#### C2. Fix Pairing Phase Timeout
- Already fixed: Added 'connecting' to pairing phase list in timeout handler
- Already fixed: Clear timeout before status change for 515
- Needs verification: Test with reason 515 during pairing

### D) Events Page + AI Rating

#### D1. Events Page
- Already handles empty/error states ✅
- Verify: Firestore query doesn't require missing indexes
- Verify: Filters work correctly

#### D2. AI Rating
- Need to locate: Where is AI rating computed/stored
- Verify: Write permissions, schema, UI display

## Implementation Priority

1. **HIGH**: Flutter state machine + polling (fixes black screen + loop)
2. **HIGH**: UI for logged_out state (user clarity)
3. **MEDIUM**: Full status code propagation (better error messages)
4. **LOW**: Backend timeout fix verification (already applied)

## Files to Modify

### Flutter
- `superparty_flutter/lib/services/whatsapp_api_service.dart`: Already has guards ✅
- `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`: Add state machine + polling

### Functions
- `functions/whatsappProxy.js`: Already has 401/403 ✅, add remaining 4xx if needed

### Backend
- `whatsapp-backend/server.js`: Timeout fix applied ✅, needs verification
