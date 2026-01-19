# Black Screen + WhatsApp Flow Fix - Complete Plan

## Root Causes Identified

### 1. Black Screen in Android Emulator
**Problem**: Auth stream timeout emite `currentUser`/`null`, dar AuthWrapper nu afișează UI explicit când snapshot nu are data și nu are error
- `authStateChanges().timeout()` emite currentUser/null la timeout (app_router.dart:76)
- AuthWrapper StreamBuilder poate rămâne în `waiting` sau avea snapshot fără data/error → black screen
- Firebase init timeout nu afișează screen de eroare clar

**Evidence**: Logs show `[AppRouter] ⚠️ Auth stream timeout (30s)` dar UI rămâne negru

### 2. Firebase Emulator Connectivity
**Problem**: USE_EMULATORS dart-define necesar dar nu e validat la startup
- Config există (firebase_service.dart:47-48) dar nu e verificat
- Preflight check există dar e non-blocking (line 95)

### 3. WhatsApp regenerateQr Spam
**Problem**: Posibil spam de regenerateQr când backend returnează 500
- Flutter guards există (in-flight, cooldown, status blocking) ✅
- Polling automat adăugat ✅
- Railway endpoint nu aruncă excepții (createConnection e wrapped în catch) ✅

**Status**: Parțial fixat - guards există, trebuie verificat runtime

### 4. Railway regenerateQr 500
**Problem**: `createConnection` poate arunca excepții dacă e apelat când "already connecting"
- Endpoint returnează 202 dacă "already connecting" (line 3852) ✅
- createConnection e wrapped în `.catch()` (line 3947) ✅
- Dar dacă `createConnection` aruncă sincron înainte de async, catch-ul nu ajunge

**Status**: Parțial fixat - trebuie verificat dacă createConnection aruncă sincron

### 5. Events Page
**Status**: ✅ Funcționează corect
- Are error handling (lines 522-551)
- Are empty state (lines 574-603)
- Are timeout handling (lines 506-511)

## Fixes Required

### A) Fix Black Screen (HIGH PRIORITY)

#### A1. AuthWrapper - Explicit Error State
**File**: `superparty_flutter/lib/screens/auth/auth_wrapper.dart`

**Change**: Add explicit check for timeout/error state and show error screen instead of black screen

```dart
// Around line 79-86
builder: (context, snapshot) {
  // CRITICAL: Check for timeout/error BEFORE waiting
  if (snapshot.hasError) {
    debugPrint('[AuthWrapper] Auth stream error: ${snapshot.error}');
    return _buildAuthErrorScreen(context, snapshot.error.toString());
  }
  
  if (snapshot.connectionState == ConnectionState.waiting) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }

  // CRITICAL: If snapshot has no data and no error (timeout case), show error
  if (!snapshot.hasData && !snapshot.hasError) {
    debugPrint('[AuthWrapper] Auth stream timeout - no data, no error');
    return _buildAuthTimeoutScreen(context);
  }
  
  // ... rest of builder
}

Widget _buildAuthErrorScreen(BuildContext context, String error) {
  return Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Authentication Error', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(error, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pushReplacementNamed('/'),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    ),
  );
}

Widget _buildAuthTimeoutScreen(BuildContext context) {
  return Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off, size: 64, color: Colors.orange),
            const SizedBox(height: 16),
            Text('Connection Timeout', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Firebase emulator may be down or unreachable.'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => setState(() {}), // Retry
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    ),
  );
}
```

#### A2. Firebase Init - Health Check UI
**File**: `superparty_flutter/lib/main.dart`

**Change**: Add health check screen when Firebase init fails, with retry button

### B) Fix Railway regenerateQr (MEDIUM PRIORITY)

#### B1. Wrap createConnection in Try-Catch (Sync Check)
**File**: `whatsapp-backend/server.js` ~line 3947

**Change**: Ensure createConnection doesn't throw synchronously before async

```javascript
// Current: createConnection(...).catch(...)
// Issue: If createConnection throws synchronously, catch doesn't help

// Fix: Wrap in try-catch before calling
try {
  // Check if already connecting BEFORE createConnection
  if (connectionRegistry.isConnecting(accountId)) {
    console.log(`ℹ️  [${accountId}/${requestId}] Already connecting, skip createConnection`);
    // Return success - connection will emit QR when ready
    return res.json({ 
      success: true, 
      message: 'Connection already in progress, QR will be available shortly',
      status: 'in_progress',
      // ...
    });
  }
  
  createConnection(accountId, account.name, account.phone).catch(err => {
    // ... existing catch
  });
} catch (syncError) {
  // Catch synchronous errors (e.g., validation, null checks)
  console.error(`❌ [${accountId}/${requestId}] Sync error in regenerateQr:`, syncError.message);
  return res.status(500).json({
    success: false,
    error: 'sync_error',
    message: syncError.message || 'Internal server error',
    requestId: requestId,
  });
}
```

### C) Verify WhatsApp Polling (LOW PRIORITY)

**Status**: Already implemented ✅
- Polling automat adăugat (whatsapp_accounts_screen.dart)
- Guards există (in-flight, cooldown, status blocking)

**Action**: Verify runtime behavior with logs

## Implementation Order

1. **A1** - Fix AuthWrapper error/timeout screen (prevents black screen)
2. **A2** - Add Firebase init error screen (prevents black screen on init failure)
3. **B1** - Wrap createConnection in try-catch (prevents 500 on sync errors)

## Files to Modify

1. `superparty_flutter/lib/screens/auth/auth_wrapper.dart` - Add error/timeout screens
2. `whatsapp-backend/server.js` - Wrap createConnection in try-catch

## Verification Checklist

### Test 1: Black Screen Fix
1. Start Flutter without Firebase emulators
2. Verify: Shows "Connection Timeout" screen (not black)
3. Click "Retry" → should retry auth stream
4. With emulators: Should show login/home normally

### Test 2: regenerateQr Stability
1. Add account → wait for QR
2. Rapidly tap "Regenerate QR" multiple times
3. Verify: Only one request sent (others blocked by in-flight guard)
4. Verify: No 500 errors (backend returns 202 if already connecting)

### Test 3: Events Page
1. Navigate to Events page
2. Verify: Shows events or "Nu există evenimente" (not black screen)
3. Apply filters → verify events filtered correctly
