# WhatsApp Complete Fix Implementation Plan

## Root Causes Summary

### 1. Flutter: No Automatic Polling
- `_loadAccounts()` only called on `initState()`, button taps, and after add/regenerate
- No polling when account is in `waiting_qr` / `qr_ready` / `connecting` state
- User must manually refresh to see QR code or status updates

### 2. Flutter: No State Machine
- No lifecycle tracking for accounts
- Cannot differentiate between "waiting for QR" vs "QR ready" vs "logged out"
- Black screen when API fails silently

### 3. Flutter: No Logged Out UI
- No specific UI for `logged_out` / `401` state
- No "Reset Session" or "Delete & Re-add" button
- User confused about what to do when session expires

### 4. Functions Proxy: Masks Errors
- Returns 500 for non-2xx (partially fixed - 401/403/404/409/429 propagated)
- Other 4xx status codes may still be masked
- Backend error details not always forwarded

### 5. Backend: Timeout During Pairing
- Connecting timeout fires during pairing phase (reason 515)
- Timeout doesn't recognize 'connecting' as pairing phase

**Status**: Backend timeout fix applied ✅, needs verification

## Implementation Strategy

### Phase 1: Flutter State Machine + Polling (HIGH PRIORITY)

#### Step 1.1: Add Polling Timer
- Start polling when account is in `waiting_qr` / `qr_ready` / `connecting`
- Poll every 3 seconds
- Max polling duration: 2 minutes
- Stop polling on: `connected`, `logged_out`, `error`, or timeout

#### Step 1.2: Add State Management
- Track account states per accountId
- States: `idle`, `creating`, `waiting_qr`, `qr_ready`, `connecting`, `connected`, `logged_out`, `error`
- Update state based on API responses

#### Step 1.3: UI for Logged Out State
- Show "Session expired - re-link required" message
- Show "Delete & Re-add" button
- Disable regenerate QR button for logged_out accounts

### Phase 2: Functions Proxy (MEDIUM PRIORITY)

#### Step 2.1: Propagate All 4xx Status Codes
- Already done: 401, 403, 404, 409, 429 ✅
- Add remaining 4xx if needed (low priority)

#### Step 2.2: Include Backend Error Details
- Always include `backendError`, `backendMessage`, `backendStatus` in response body

### Phase 3: Backend Verification (LOW PRIORITY)

#### Step 3.1: Verify Timeout Fix
- Test with reason 515 during pairing phase
- Verify timeout doesn't fire incorrectly

## Implementation Details

### Flutter Polling Implementation

```dart
Timer? _pollingTimer;
DateTime? _pollingStartTime;
const _maxPollingDuration = Duration(minutes: 2);
const _pollingInterval = Duration(seconds: 3);

void _startPollingIfNeeded() {
  // Check if any account needs polling
  final needsPolling = _accounts.any((acc) {
    final status = acc['status'] as String?;
    return status == 'waiting_qr' || status == 'qr_ready' || status == 'connecting';
  });
  
  if (needsPolling && _pollingTimer == null) {
    _pollingStartTime = DateTime.now();
    _pollingTimer = Timer.periodic(_pollingInterval, (_) => _pollAccountsIfNeeded());
  }
}

void _stopPolling() {
  _pollingTimer?.cancel();
  _pollingTimer = null;
  _pollingStartTime = null;
}

void _pollAccountsIfNeeded() async {
  // Check timeout
  if (_pollingStartTime != null &&
      DateTime.now().difference(_pollingStartTime!) > _maxPollingDuration) {
    _stopPolling();
    return;
  }
  
  // Check if still needed
  final needsPolling = _accounts.any((acc) {
    final status = acc['status'] as String?;
    return status == 'waiting_qr' || status == 'qr_ready' || status == 'connecting';
  });
  
  if (!needsPolling) {
    _stopPolling();
    return;
  }
  
  // Poll
  await _loadAccounts();
}
```

### Logged Out UI

```dart
if (status == 'logged_out' || status == 'needs_qr') {
  return Column(
    children: [
      Icon(Icons.error_outline, color: Colors.red),
      Text('Session expired - re-link required'),
      ElevatedButton(
        onPressed: () => _deleteAccount(id, name),
        child: Text('Delete & Re-add'),
      ),
    ],
  );
}
```

## Testing Checklist

1. **Polling Test**
   - Add account → should start polling
   - Wait for QR → should poll until QR appears
   - Scan QR → should poll until connected
   - Connected → should stop polling

2. **Logged Out Test**
   - Simulate 401 → should show logged_out UI
   - Click "Delete & Re-add" → should delete and allow re-add

3. **Error Handling Test**
   - API fails → should show error, not black screen
   - Polling timeout → should stop polling gracefully

4. **Backend Timeout Test**
   - Reason 515 during pairing → should not timeout incorrectly
