# Fix-uri Implementate - Rezumat Final

## ✅ Fix-uri Implementate (2026-01-18)

### Backend (whatsapp-backend/server.js)

1. **PASSIVE guard pe delete account** ✅
   - **File**: `server.js` line 4428
   - **Change**: Adăugat `checkPassiveModeGuard` la începutul handler-ului `DELETE /api/whatsapp/accounts/:id`
   - **Fix**: PASSIVE instances nu mai pot șterge accounts

```javascript
app.delete('/api/whatsapp/accounts/:id', accountLimiter, async (req, res) => {
  // HARD GATE: PASSIVE mode - do NOT delete account
  const passiveGuard = await checkPassiveModeGuard(req, res);
  if (passiveGuard) return; // Response already sent
  // ... rest of handler
});
```

2. **401 handler setează 'logged_out'** ✅
   - **File**: `server.js` line 1793-1795
   - **Change**: Schimbat `status: 'needs_qr'` la `status: 'logged_out'` în 401 handler
   - **Fix**: Semantic corect - 'needs_qr' e pentru QR expirat, 'logged_out' e pentru sesiune invalidă

```javascript
// CRITICAL: Set status to 'logged_out' (not 'needs_qr') to indicate session expired and re-link required
await saveAccountToFirestore(accountId, {
  status: 'logged_out', // Changed from 'needs_qr'
  lastError: `logged_out (${reason}) - requires re-link`,
  // ...
});
```

### Flutter (superparty_flutter/)

3. **Handle 202 (already in progress) în regenerateQr** ✅
   - **File**: `whatsapp_api_service.dart` lines 258-268
   - **Change**: Adăugat check pentru `response.statusCode == 202` înainte de error handling
   - **Fix**: Backend returnează 202 dar Flutter tratează ca success (nu eroare)

```dart
// CRITICAL FIX: Handle 202 (already in progress) as non-fatal - return success
if (response.statusCode == 202) {
  final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
  return {
    'success': true,
    'message': errorBody?['message'] ?? 'QR regeneration already in progress',
    'status': errorBody?['status'] ?? 'already_in_progress',
  };
}
```

4. **Handle 429 (rate limited) în regenerateQr + UI** ✅
   - **File**: `whatsapp_api_service.dart` lines 270-279, `whatsapp_accounts_screen.dart` lines 201-215
   - **Change**: 
     - Service: aruncă `NetworkException` cu `code: 'rate_limited'` pentru 429
     - UI: gestionează `NetworkException` cu `code == 'rate_limited'` și arată SnackBar prietenos
   - **Fix**: UI arată mesaj "Please wait X seconds" (nu eroare fatală)

```dart
// Service (whatsapp_api_service.dart)
if (response.statusCode == 429) {
  final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
  final retryAfterSeconds = errorBody?['retryAfterSeconds'] as int? ?? 10;
  throw NetworkException(
    errorBody?['message'] ?? 'Please wait ${retryAfterSeconds}s before regenerating QR again',
    code: 'rate_limited',
    originalError: {'retryAfterSeconds': retryAfterSeconds, ...?errorBody},
  );
}

// UI (whatsapp_accounts_screen.dart)
catch (e) {
  if (e is NetworkException && e.code == 'rate_limited') {
    final retryAfterSeconds = (e.originalError as Map<String, dynamic>?)?['retryAfterSeconds'] as int? ?? 10;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.message ?? 'Please wait ${retryAfterSeconds}s...'),
        backgroundColor: Colors.orange,
        duration: Duration(seconds: retryAfterSeconds),
      ),
    );
  } else {
    // ... other error handling
  }
}
```

## Status Fix-uri Existente

### ✅ Deja Implementate în Backend (din commit-uri anterioare)

1. **PASSIVE guard pe regenerateQr** (line 3793)
   - `checkPassiveModeGuard` aplicat la `POST /api/whatsapp/regenerate-qr/:accountId`
   - ✅ Funcționează corect

2. **PASSIVE guard pe addAccount** (line 3485)
   - `checkPassiveModeGuard` aplicat la `POST /api/whatsapp/add-account`
   - ✅ Funcționează corect

3. **regenerateQr Idempotency** (lines 3853-3905)
   - Returnează 202 dacă already connecting/regenerating
   - Returnează QR existent dacă valid (< 60s)
   - ✅ Funcționează corect

4. **Enhanced Logging** (lines 1477-1503)
   - Log include: accountId, instanceId, waMode, reasonCode, statusBefore/statusAfter
   - ✅ Implementat

## Files Modificate

1. `whatsapp-backend/server.js`
   - Line 4428: PASSIVE guard pe delete account
   - Lines 1793-1795: 401 handler set logged_out

2. `superparty_flutter/lib/services/whatsapp_api_service.dart`
   - Lines 258-279: Handle 202/429 în regenerateQr

3. `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`
   - Line 5: Import `app_exception.dart`
   - Lines 201-215: Handle 429 în UI (_regenerateQr catch block)

## Testare

După deploy, testează:

1. **PASSIVE guard pe delete account**:
   ```bash
   # De pe PASSIVE instance
   curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://whats-app-ompro.ro/api/whatsapp/accounts/ACCOUNT_ID
   # Expected: 503 { error: "instance_passive" }
   ```

2. **401 handler set logged_out**:
   - Trigger 401 disconnect (delete creds)
   - Check account status în Firestore: ar trebui să fie `logged_out` (nu `needs_qr`)

3. **Flutter handle 202**:
   - Call `regenerateQr` când status=connecting
   - Expected: Success (nu error), mesaj "QR regeneration already in progress"

4. **Flutter handle 429**:
   - Rapidly call `regenerateQr` 5x (spam)
   - Expected: Orange SnackBar cu mesaj "Please wait X seconds"

## Comenzi Deploy

```bash
# Backend
cd whatsapp-backend
git add server.js
git commit -m "Fix: PASSIVE guard pe delete account, 401 handler set logged_out"
git push origin main

# Flutter
cd ../superparty_flutter
git add lib/services/whatsapp_api_service.dart lib/screens/whatsapp/whatsapp_accounts_screen.dart
git commit -m "Fix: Handle 202/429 gracefully în regenerateQr"
git push origin main
```

## Note Importante

- **Commit legacy hosting**: Ensure legacy hosting deploy folosește commit corect (d4f4998a sau mai nou pentru fix-uri complete)
- **Backward Compatibility**: 401 handler change e compatibil - UI gestionează ambele `needs_qr` și `logged_out`
- **No Breaking Changes**: Fix-urile sunt defensive și nu schimbă comportamentul existent pentru cazurile corecte
