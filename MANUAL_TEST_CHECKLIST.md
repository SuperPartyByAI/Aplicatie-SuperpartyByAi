# Manual Test Checklist - Staff Settings + Admin Features

**PR**: #34  
**Branch**: `whatsapp-production-stable`  
**HEAD**: `39e6d6839415cbb960faf6fa4614ff7c85efbf68`

---

## SETUP PRE-TEST (obligatoriu)

### 1. Pornește Firebase Emulators

```bash
# În terminal dedicat (lasă-l deschis):
cd c:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi
firebase emulators:start --only firestore,functions,auth
```

**Așteaptă** până vezi în output:
```
✔  All emulators ready! It is now safe to connect.
```

**Notează URL-urile:**
- Firestore Emulator: `http://127.0.0.1:8080`
- Functions Emulator: `http://127.0.0.1:5001`
- Auth Emulator: `http://127.0.0.1:9099`
- Emulator UI: `http://127.0.0.1:4000`

### 2. Seed Firestore (teams + code pools)

```bash
# În alt terminal:
cd c:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi
node tools/seed_firestore.js --emulator --project demo-test
```

**Verifică în Emulator UI (http://127.0.0.1:4000):**
- `teams/team_a` există cu `{label: "Echipa A", active: true}`
- `teams/team_b` există cu `{label: "Echipa B", active: true}`
- `teams/team_c` există cu `{label: "Echipa C", active: true}`
- `teamCodePools/team_a` există cu `{prefix: "A", freeCodes: [101, 102, ..., 150]}`
- `teamCodePools/team_b` există cu `{prefix: "B", freeCodes: [201, 202, ..., 250]}`
- `teamCodePools/team_c` există cu `{prefix: "C", freeCodes: [301, 302, ..., 350]}`

### 3. Configurează Flutter pentru Emulator

În Flutter app, setează:
```dart
// În main.dart sau firebase_service.dart (temporar pentru test):
FirebaseFirestore.instance.useFirestoreEmulator('127.0.0.1', 8080);
FirebaseAuth.instance.useAuthEmulator('127.0.0.1', 9099);
FirebaseFunctions.instanceFor(region: 'us-central1').useFunctionsEmulator('127.0.0.1', 5001);
```

### 4. Creează user de test (non-admin)

În Emulator UI (http://127.0.0.1:4000) → Auth:
- Adaugă user manual:
  - Email: `test@local.dev`
  - Password: `test123456`
  - UID: (generat automat)

Sau folosește Flutter app pentru sign-up.

### 5. Setează KYC pentru user de test

În Emulator UI → Firestore:
- Creează `users/{uid}` cu:
  ```json
  {
    "email": "test@local.dev",
    "displayName": "Test User",
    "kycDone": true,
    "kycData": {
      "fullName": "Test User Full Name"
    },
    "phone": "+40712345678"
  }
  ```

### 6. Creează user admin de test

În Emulator UI → Auth:
- Adaugă user:
  - Email: `admin@local.dev`
  - Password: `admin123456`
  - UID: (generat automat)

Apoi în terminal:
```bash
node tools/set_admin_claim.js --emulator --project demo-test --email admin@local.dev
```

**NOTĂ**: Pentru emulator, scriptul poate necesita modificări (Auth emulator nu suportă custom claims direct). Alternativ, setează în Firestore:
- `users/{adminUid}` cu `{role: "admin"}`

---

## TESTE FUNCȚIONALE

### TEST A: Login + Acces Staff Settings (non-admin)

**Pași:**
1. Deschide Flutter app
2. Login cu `test@local.dev` / `test123456`
3. Navighează la `/staff-settings` (sau din meniu)

**Verificări:**
- ✅ Screen se încarcă fără erori
- ✅ Vezi numele: "Test User Full Name" (din `users/{uid}.kycData.fullName`)
- ✅ Vezi email: `test@local.dev` (read-only, din `FirebaseAuth.currentUser.email`)
- ✅ Câmp telefon este editabil
- ✅ Dropdown echipe se încarcă cu: "Echipa A", "Echipa B", "Echipa C" (sortate alfabetic)
- ✅ Dropdown echipe este **activ** (nu e disabled)

**Verifică în Firestore:**
- `staffProfiles/{uid}` nu există încă (sau există cu `setupDone: false`)

---

### TEST B: KYC Blocking

**Pași:**
1. În Emulator UI → Firestore, editează `users/{uid}`:
   - Setează `kycDone: false`
   - Șterge `kycData.fullName` (sau setează la `""`)
2. Reîncarcă Flutter app sau navighează din nou la `/staff-settings`

**Verificări:**
- ✅ Vezi mesaj de eroare: "KYC nu este complet. Completează KYC și revino."
- ✅ Dropdown echipe este **disabled**
- ✅ Butonul "Alocă cod" este **disabled** sau absent
- ✅ Nu poți aloca cod până când KYC e complet

**Revertează:**
- Setează `kycDone: true` și `kycData.fullName: "Test User Full Name"`

---

### TEST C: Teams Load (sortare + active filter)

**Pași:**
1. În Emulator UI → Firestore, editează `teams/team_b`:
   - Setează `active: false`
2. Reîncarcă `/staff-settings` în Flutter

**Verificări:**
- ✅ Dropdown echipe conține DOAR: "Echipa A", "Echipa C" (team_b e ascuns)
- ✅ Echipele sunt sortate alfabetic: "Echipa A" apoi "Echipa C"

**Revertează:**
- Setează `teams/team_b.active: true`

---

### TEST D: allocateStaffCode (request token + ignore stale responses)

**Pași:**
1. În Flutter app, pe `/staff-settings`:
   - Selectează "Echipa A" din dropdown
   - Click rapid de 2 ori pe butonul "Alocă cod" (în < 1 secundă)
2. Observă UI-ul

**Verificări:**
- ✅ După primul click, UI devine "busy" (loading indicator)
- ✅ După al doilea click rapid, primul răspuns este **ignorat**
- ✅ Doar ultimul răspuns este procesat
- ✅ Vezi cod alocat: `A150` (sau alt număr din `teamCodePools/team_a.freeCodes`, cel mai mare)
- ✅ Câmpul "Cod alocat" este populat cu codul

**Verifică în Firestore:**
- `teamAssignments/team_a_{uid}` există cu:
  ```json
  {
    "teamId": "team_a",
    "uid": "{uid}",
    "code": 150,
    "prefix": "A",
    "assignedCode": "A150",
    "status": "pending",
    "createdAt": "{timestamp}"
  }
  ```
- `teamCodePools/team_a.freeCodes` NU mai conține `150` (a fost scos din array)

**Verifică în Functions logs (terminal emulator):**
- Vezi log: `allocateStaffCode called for uid={uid}, teamId=team_a`
- Vezi log: `Allocated code: A150`

---

### TEST E: finalizeStaffSetup (blochează schimbarea echipei)

**Pași:**
1. În Flutter app, pe `/staff-settings`:
   - Completează telefon: `+40712345678`
   - Click "Salvează" (sau butonul de finalizare)
2. Observă UI-ul

**Verificări:**
- ✅ Vezi mesaj de succes: "Profil salvat cu succes"
- ✅ Dropdown echipe devine **disabled** (nu mai poți schimba echipa)
- ✅ Câmpul telefon rămâne editabil

**Verifică în Firestore:**
- `staffProfiles/{uid}` există cu:
  ```json
  {
    "uid": "{uid}",
    "email": "test@local.dev",
    "nume": "Test User Full Name",
    "phone": "+40712345678",
    "teamId": "team_a",
    "assignedCode": "A150",
    "codIdentificare": "A150",
    "ceCodAi": "A150",
    "cineNoteaza": "A150",
    "setupDone": true,
    "source": "flutter",
    "updatedAt": "{timestamp}",
    "createdAt": "{timestamp}"
  }
  ```
- `users/{uid}` există cu:
  ```json
  {
    "staffSetupDone": true,
    "phone": "+40712345678",
    "updatedAt": "{timestamp}"
  }
  ```

**Încearcă să schimbi echipa:**
- ✅ Dropdown echipe este **disabled** (nu poți selecta altă echipă)
- ✅ Dacă încerci programatic, vezi eroare: "Profilul staff este deja configurat. Echipa poate fi schimbată doar din Admin."

---

### TEST F: updateStaffPhone (după setupDone)

**Pași:**
1. În Flutter app, pe `/staff-settings`:
   - Schimbă telefonul la: `+40798765432`
   - Click "Salvează telefon" (sau butonul de update telefon)

**Verificări:**
- ✅ Vezi mesaj de succes
- ✅ Telefonul este actualizat în UI

**Verifică în Firestore:**
- `staffProfiles/{uid}.phone` = `"+40798765432"`
- `users/{uid}.phone` = `"+40798765432"`
- `staffProfiles/{uid}.setupDone` rămâne `true` (nu se resetează)

**Verifică în Functions logs:**
- Vezi log: `updateStaffPhone called for uid={uid}, phone=+40798765432`

---

### TEST G: Admin Dashboard - List + Search

**Pași:**
1. Login cu `admin@local.dev` / `admin123456`
2. Navighează la `/admin`

**Verificări:**
- ✅ Screen se încarcă fără erori
- ✅ Vezi listă de `staffProfiles` (toate profilele din Firestore)
- ✅ Fiecare rând afișează: nume, email, cod, echipă, status
- ✅ Câmpul de căutare funcționează:
  - Caută "test" → găsește user-ul cu email `test@local.dev`
  - Caută "A150" → găsește user-ul cu codul `A150`
  - Caută "Test User" → găsește user-ul cu numele "Test User Full Name"

**Verifică în Firestore:**
- Query-ul citește din `staffProfiles` (toate documentele)

---

### TEST H: Admin - changeUserTeam (reallocate cod + audit)

**Pași:**
1. În Flutter app, pe `/admin`:
   - Click pe user-ul `test@local.dev`
   - Navighează la `/admin/user/{uid}`
2. Pe screen-ul de detalii:
   - Schimbă echipa din dropdown: "Echipa A" → "Echipa B"
   - Click "Schimbă echipa"

**Verificări:**
- ✅ Vezi mesaj de succes
- ✅ Echipa este actualizată în UI: "Echipa B"
- ✅ Codul este re-alocat: vezi un cod nou din `teamCodePools/team_b` (ex: `B250`)

**Verifică în Firestore:**
- `staffProfiles/{uid}.teamId` = `"team_b"`
- `staffProfiles/{uid}.assignedCode` = `"B250"` (sau alt cod nou)
- `teamAssignments/team_b_{uid}` există cu codul nou
- `teamAssignments/team_a_{uid}` NU mai există (sau e marcat ca `status: "released"`)
- `teamCodePools/team_a.freeCodes` conține din nou codul vechi (ex: `150` a fost returnat)
- `teamCodePools/team_b.freeCodes` NU mai conține codul nou (ex: `250` a fost scos)
- `teamAssignmentsHistory/{docId}` există cu:
  ```json
  {
    "uid": "{uid}",
    "oldTeamId": "team_a",
    "newTeamId": "team_b",
    "oldCode": "A150",
    "newCode": "B250",
    "changedBy": "{adminUid}",
    "changedAt": "{timestamp}",
    "reason": "admin_change"
  }
  ```
- `adminActions/{docId}` există cu:
  ```json
  {
    "action": "changeUserTeam",
    "targetUid": "{uid}",
    "actorUid": "{adminUid}",
    "details": {
      "oldTeamId": "team_a",
      "newTeamId": "team_b",
      "oldCode": "A150",
      "newCode": "B250"
    },
    "timestamp": "{timestamp}"
  }
  ```

**Verifică în Functions logs:**
- Vezi log: `changeUserTeam called by admin={adminUid}, target={uid}, newTeam=team_b`
- Vezi log: `Returned old code A150 to pool team_a`
- Vezi log: `Allocated new code B250 from pool team_b`

---

### TEST I: Admin - setUserStatus

**Pași:**
1. În Flutter app, pe `/admin/user/{uid}`:
   - Schimbă status din dropdown: "active" → "inactive"
   - Click "Setează status"

**Verificări:**
- ✅ Vezi mesaj de succes
- ✅ Status este actualizat în UI: "inactive"

**Verifică în Firestore:**
- `staffProfiles/{uid}.status` = `"inactive"` (sau `users/{uid}.status = "inactive"`)
- `adminActions/{docId}` există cu:
  ```json
  {
    "action": "setUserStatus",
    "targetUid": "{uid}",
    "actorUid": "{adminUid}",
    "details": {
      "oldStatus": "active",
      "newStatus": "inactive"
    },
    "timestamp": "{timestamp}"
  }
  ```

**Testează și "blocked":**
- Setează status la "blocked"
- Verifică că `staffProfiles/{uid}.status = "blocked"`

---

### TEST J: Rules - Client NU poate scrie direct în teamAssignments/adminActions

**Pași:**
1. În Flutter app, deschide DevTools (sau folosește browser console dacă e web)
2. Încearcă să scrii direct în Firestore (din cod sau console):

```dart
// În Flutter (sau JavaScript în browser console):
FirebaseFirestore.instance
  .collection('teamAssignments')
  .doc('test_doc')
  .set({'test': 'value'});
```

**Verificări:**
- ✅ Vezi eroare: `[firestore/permission-denied]`
- ✅ Documentul `teamAssignments/test_doc` NU este creat în Firestore

**Testează și pentru `adminActions`:**
```dart
FirebaseFirestore.instance
  .collection('adminActions')
  .doc('test_doc')
  .set({'test': 'value'});
```
- ✅ Vezi eroare: `[firestore/permission-denied]`
- ✅ Documentul NU este creat

**Verifică în Firestore (Emulator UI):**
- `teamAssignments/test_doc` nu există
- `adminActions/test_doc` nu există

---

### TEST K: WhatsApp Rules - No Open Writes

**Pași:**
1. În Flutter app (sau browser console), încearcă să scrii direct în colecții WhatsApp:

```dart
// Test 1: threads
FirebaseFirestore.instance
  .collection('threads')
  .doc('test_thread')
  .set({'test': 'value'});
// Așteaptă: permission-denied

// Test 2: whatsapp_messages
FirebaseFirestore.instance
  .collection('whatsapp_messages')
  .doc('test_msg')
  .set({'test': 'value'});
// Așteaptă: permission-denied

// Test 3: whatsapp_threads
FirebaseFirestore.instance
  .collection('whatsapp_threads')
  .doc('test_thread')
  .set({'test': 'value'});
// Așteaptă: permission-denied

// Test 4: accounts
FirebaseFirestore.instance
  .collection('accounts')
  .doc('test_account')
  .set({'test': 'value'});
// Așteaptă: permission-denied

// Test 5: accounts/{id}/chats
FirebaseFirestore.instance
  .collection('accounts')
  .doc('test_account')
  .collection('chats')
  .doc('test_chat')
  .set({'test': 'value'});
// Așteaptă: permission-denied
```

**Verificări:**
- ✅ Toate cele 5 încercări returnează eroare: `[firestore/permission-denied]`
- ✅ Niciun document nu este creat în Firestore

**Verifică în Firestore (Emulator UI):**
- `threads/test_thread` nu există
- `whatsapp_messages/test_msg` nu există
- `whatsapp_threads/test_thread` nu există
- `accounts/test_account` nu există

**Verifică în `firestore.rules`:**
- Caută `match /threads/{threadId}` → vezi `allow create, update: if false;`
- Caută `match /whatsapp_messages/{messageId}` → vezi `allow create, update: if false;`
- Caută `match /whatsapp_threads/{threadId}` → vezi `allow create, update: if false;`
- Caută `match /accounts/{accountId}` → vezi `allow create, update: if false;`

---

## VERIFICĂRI FINALE

### Firestore Rules Summary

Verifică că următoarele colecții au `allow write: if false;` (sau `allow create, update: if false;`):
- ✅ `teamCodePools/{teamId}`
- ✅ `teamAssignments/{docId}`
- ✅ `teamAssignmentsHistory/{docId}`
- ✅ `adminActions/{docId}`
- ✅ `threads/{threadId}` și `threads/{threadId}/messages/{messageId}`
- ✅ `whatsapp_messages/{messageId}`
- ✅ `whatsapp_threads/{threadId}`
- ✅ `accounts/{accountId}` și `accounts/{accountId}/chats/{chatId}` și `accounts/{accountId}/chats/{chatId}/messages/{messageId}`

### Router Guards

Verifică că:
- ✅ `/admin` redirectează la `/home` dacă user-ul nu e admin
- ✅ `/staff-settings` este accesibil pentru user autentificat (non-admin)
- ✅ `/admin/user/:uid` este accesibil doar pentru admin

### Functions Callables

Verifică în Functions logs că toate callable-urile sunt încărcate:
- ✅ `allocateStaffCode`
- ✅ `finalizeStaffSetup`
- ✅ `updateStaffPhone`
- ✅ `changeUserTeam`
- ✅ `setUserStatus`

---

## REZULTAT FINAL

După ce ai rulat toate testele:
- ✅ Toate testele A-K trec
- ✅ Nu există erori în console (Flutter sau Functions)
- ✅ Firestore rules blochează scrierile client în colecții critice
- ✅ Admin features funcționează corect
- ✅ Staff settings funcționează corect cu KYC gating

**Status**: ✅ **PASS** / ❌ **FAIL** (notează ce test a eșuat)
