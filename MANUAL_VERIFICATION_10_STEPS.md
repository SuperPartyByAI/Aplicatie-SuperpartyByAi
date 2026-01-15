# Manual Verification Checklist - 10 Steps

**PR**: #34  
**Branch**: `whatsapp-production-stable`

---

## Setup (One-Time)

1. **Install Java 17**
   ```powershell
   winget install EclipseAdoptium.Temurin.17.JDK
   java -version
   ```

---

## Verification Steps

### Step 1: Start Emulators
**Terminal 1:**
```powershell
npm run emu
```
**Verify in logs:**
- `✔  All emulators ready!`
- Firestore: http://127.0.0.1:8082
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098

**Emulator UI:** http://127.0.0.1:4001

---

### Step 2: Seed Firestore
**Terminal 2 (after emulators start):**
```powershell
npm run seed:emu
```
**Verify in logs:**
- `✅ Seed completed for project: demo-test`

**Verify in Emulator UI:**
- Collections exist: `teams`, `teamCodePools`
- `teams/team_a`, `team_b`, `team_c` exist
- `teamCodePools/team_a` has `freeCodes` array

---

### Step 3: Run Flutter
**Terminal 3:**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true
```
**Verify in Flutter logs:**
- `[FirebaseService] ✅ Emulators configured: Firestore:8082, Auth:9098, Functions:5002`

---

### Step 4: Login & Navigate to Staff Settings
**In Flutter app:**
1. Login: `test@local.dev` / `test123456`
2. Navigate to `/staff-settings` (or use menu)

**Verify:**
- Screen loads without errors
- Name displayed at top (from `users/{uid}.kycData.fullName` or fallback)
- Email displayed (read-only, from FirebaseAuth)
- Phone field editable
- Teams dropdown shows teams (only `active != false`, sorted)

---

### Step 5: Test Idempotency - allocateStaffCode
**In Staff Settings:**
1. Select a team (e.g., "Echipa A")
2. **Click "Alocă cod" rapidly 2 times** (< 1 second between clicks)

**Verify in Emulator UI:**
- `teamAssignments/team_a_{uid}` exists **only once** (not duplicate)
- `staffRequestTokens/{uid}_{tokenHash}` exists with `result` cached
- UI shows assigned code (not error about duplicate)

---

### Step 6: Test Idempotency - finalizeStaffSetup
**In Staff Settings:**
1. Enter phone: `+40722123456`
2. **Click "Salvează" rapidly 2 times** (< 1 second)

**Verify in Emulator UI:**
- `staffProfiles/{uid}` has `setupDone: true` **only once**
- `users/{uid}` has `staffSetupDone: true` **only once**
- `staffRequestTokens/{uid}_{tokenHash}` for finalizeStaffSetup exists with cached result

---

### Step 7: Test Admin Gating
**In Flutter app:**
1. Logout
2. Login with non-admin user (or create new user)
3. Try to navigate to `/admin` (type in URL or use menu)

**Verify:**
- Redirects to `/home` (not `/admin`)
- No error message
- No crash

**Setup Admin (if needed):**
- In Emulator UI: `users/{uid}` → Set `role: "admin"`
- Or run: `node tools/set_admin_claim.js --email admin@local.dev --project demo-test`

---

### Step 8: Test WhatsApp UI Guards
**In Flutter app (as admin):**
1. Navigate to `/whatsapp/accounts`
2. **Click "Add Account" rapidly 2 times**

**Verify:**
- Only one account added (not duplicate)
- Button "Add Account" is disabled while `_isAddingAccount == true`
- Loading indicator shows

**Test Regenerate QR:**
3. Find account with QR
4. **Click "Regenerate QR" rapidly 2 times**

**Verify:**
- Only one request sent
- Button disabled while `_regeneratingQr.contains(accountId)`

---

### Step 9: Test Firestore Rules - Client Write Denied
**In Flutter app (DevTools console or manually):**
Try to write directly to Firestore:
```dart
// This should fail with permission-denied
FirebaseFirestore.instance.collection('teamAssignments').doc('test').set({'test': true});
FirebaseFirestore.instance.collection('adminActions').doc('test').set({'test': true});
FirebaseFirestore.instance.collection('threads').doc('test').set({'test': true});
```

**Verify:**
- All requests return `permission-denied` error
- Documents do NOT appear in Emulator UI

---

### Step 10: Test Router Redirects
**In Flutter app:**
1. Logout
2. Try to access `/staff-settings` or `/admin`

**Verify:**
- Redirects to `/` (login screen)
- No error, no crash

**After login (non-admin):**
3. Try to access `/admin`

**Verify:**
- Redirects to `/home`
- No error, no crash

---

## Expected Results Summary

| Test | Expected Result |
|------|----------------|
| Idempotency allocateStaffCode | Single allocation, cached token result |
| Idempotency finalizeStaffSetup | Single setup, cached token result |
| Admin gating | Non-admin → redirect `/home` |
| WhatsApp UI guards | Buttons disabled, no duplicate actions |
| Firestore rules | Client writes denied to server-only collections |
| Router redirects | Auth required → `/`, Admin required → `/home` |

---

## If Tests Fail

1. **Check Emulator UI** - Verify collections exist, documents created correctly
2. **Check Flutter logs** - Look for errors, connection issues
3. **Check Functions logs** - In Terminal 1, look for callable execution logs
4. **Verify ports** - Ensure Firestore:8082, Auth:9098, Functions:5002 match in logs

**All tests passing = PR ready for merge** ✅
