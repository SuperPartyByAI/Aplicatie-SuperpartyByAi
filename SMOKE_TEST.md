# SMOKE TEST (Staff + Admin) — Flutter + Firebase Auth + Firestore + Cloud Functions

Acest document îți dă un **checklist executabil** (pas-cu-pas) pentru a valida rapid flow-ul **Staff self-setup** și **Admin management**, inclusiv **verificări clare în Firestore** după fiecare pas.

## Prerequisites

- **Firebase CLI**: `firebase --version` + `firebase login`
- **Node.js**: recomandat **v20** (Functions runtime este nodejs20)
- **Flutter SDK**: `flutter --version`
- Proiecte:
  - Flutter: `superparty_flutter/`
  - Functions: `functions/` (TypeScript build → `functions/dist/`)

## Colecții Firestore (schema)

- `users/{uid}`
- `staffProfiles/{uid}`
- `teams/{teamId}`
- `teamCodePools/{teamId}`
- `teamAssignments/{teamId}_{uid}`
- `teamAssignmentsHistory/{autoId}`
- `adminActions/{autoId}`

## Security (important)

- Client NU poate scrie în: `teamCodePools`, `teamAssignments`, `teamAssignmentsHistory`, `adminActions`.
- Admin = **custom claim** `admin:true` SAU `users/{uid}.role == "admin"`.

---

## 1) Build / analyze / tests

### Functions

```powershell
cd functions
npm i
npm run build
cd ..
```

Expected:
- `functions/dist/index.js` există

### Flutter

```powershell
cd superparty_flutter
flutter pub get
flutter analyze
flutter test
cd ..
```

---

## 2) Emulator (recomandat pentru smoke rapid)

```powershell
firebase emulators:start --only firestore,functions
```

---

## 3) Seed Firestore (teams + teamCodePools)

### Emulator

```powershell
node tools/seed_firestore.js --emulator
```

### Production
Necesită `GOOGLE_APPLICATION_CREDENTIALS` (service account json).

```powershell
node tools/seed_firestore.js --project <projectId>
```

### Verify seed (Firestore)

Verifică:
- `teams/team_a`, `teams/team_b`, `teams/team_c` (cu `label`, `active:true`)
- `teamCodePools/team_a` cu `prefix:"A"` și `freeCodes:[101..150]`
- `teamCodePools/team_b` cu `prefix:"B"` și `freeCodes:[201..250]`
- `teamCodePools/team_c` cu `prefix:"C"` și `freeCodes:[301..350]`

---

## 4) Callable functions — quick checks (emulator)

### 4.1 Deschide Functions shell

```powershell
cd functions
firebase functions:shell
```

### 4.2 Context (auth) pentru callables

În shell, folosește al doilea argument ca “context” (auth):

```js
const staffCtx = { auth: { uid: "u_staff", token: { email: "staff@test.com" } } }
const adminCtx = { auth: { uid: "u_admin", token: { email: "admin@test.com", admin: true } } }
```

> Alternativ (fallback admin): setează `users/u_admin.role="admin"` în Firestore (emulator UI e OK).

### 4.3 Exemple apeluri (toate)

```js
// Staff allocation
allocateStaffCode({ teamId: "team_a" }, staffCtx)
allocateStaffCode({ teamId: "team_b", prevTeamId: "team_a", prevCodeNumber: 150 }, staffCtx)

// Staff finalize + phone update
finalizeStaffSetup({ phone: "+40722123456", teamId: "team_b", assignedCode: "B250" }, staffCtx)
updateStaffPhone({ phone: "+40722123457" }, staffCtx)

// Admin
changeUserTeam({ uid: "u_staff", newTeamId: "team_c", forceReallocate: false }, adminCtx)
changeUserTeam({ uid: "u_staff", newTeamId: "team_c", forceReallocate: true }, adminCtx) // same team, force
setUserStatus({ uid: "u_staff", status: "blocked" }, adminCtx)
```

Expected (shape stabil pentru allocate/change team):
- `allocateStaffCode` returnează:
  - `{ assignedCode: string, prefix: string, number: number, teamId: string }`
- `changeUserTeam` returnează:
  - `{ teamId: string, prefix: string, number: number, assignedCode: string }`

---

## 5) STAFF — checklist + Firestore diffs

### STAFF-1: Non-KYC user → Staff Settings blocks (no form)

**Setup (Firestore):**
- `users/u_staff_nokyc`:
  - `kycDone: false` (sau absent)
  - `kycData.fullName`: absent / empty

**Expected (UI):**
- blocant: **“KYC nu este complet. Completează KYC și revino.”**
- form NU se afișează

**Expected (Firestore):**
- NU se modifică:
  - `teamCodePools/*`
  - `teamAssignments/*`
  - `teamAssignmentsHistory/*`
  - `adminActions/*`

---

### STAFF-2: KYC user → select team → code appears

**Setup (Firestore):**
- `users/u_staff`:
  - `kycDone:true` OR `kycData.fullName:"Nume Test"`
- `staffProfiles/u_staff` absent sau `{ setupDone:false }`

**Action (callable):**
```js
allocateStaffCode({ teamId: "team_a" }, staffCtx)
```

**Expected (Firestore diffs):**
1) `teamCodePools/team_a.freeCodes`
- se scoate **cel mai mare număr** (max)
2) `teamAssignments/team_a_u_staff`
- creat/actualizat cu `teamId, uid, code=max, prefix="A", createdAt/updatedAt`

---

### STAFF-3: Change team before save → code changes without leaking/duplicating codes

**Action (callable):**
```js
// exemplu: dacă ai primit number=150 la team_a:
allocateStaffCode({ teamId: "team_b", prevTeamId: "team_a", prevCodeNumber: 150 }, staffCtx)
```

**Expected (Firestore diffs):**
1) `teamCodePools/team_a.freeCodes`
- conține din nou `150` **o singură dată**
2) `teamAssignments/team_a_u_staff`
- șters
3) `teamCodePools/team_b.freeCodes`
- maxB scos
4) `teamAssignments/team_b_u_staff`
- creat cu `prefix:"B", code=maxB`
5) `teamAssignmentsHistory/{autoId}`
- creat cu `fromTeamId:"team_a"`, `toTeamId:"team_b"`, `releasedCode:150`, `newCode:maxB`, `actorRole:"staff"`

---

### STAFF-4: Save (setupDone=false) → staffProfiles filled, users.staffSetupDone=true

**Action (callable):**
```js
finalizeStaffSetup({ phone: "+40722123456", teamId: "team_b", assignedCode: "B250" }, staffCtx)
```

**Expected (Firestore diffs):**
1) `staffProfiles/u_staff`:
- `setupDone:true`
- `teamId:"team_b"`
- `assignedCode:"B250"`
- `codIdentificare/ceCodAi/cineNoteaza:"B250"`
- `phone:"+40722123456"`
- `email:"staff@test.com"` (din token)
- `nume` din KYC
2) `users/u_staff`:
- `staffSetupDone:true`
- `phone:"+40722123456"`

**Server-side check (must):**
- dacă `teamAssignments/team_b_u_staff` nu există sau `code/prefix` nu corespund → `failed-precondition`

---

### STAFF-5: Reopen (setupDone=true) → team locked, phone editable, save updates phone (no allocations)

**Expected (UI):**
- team dropdown disabled
- phone editable
- save nu face alocări

**Action (callable):**
```js
updateStaffPhone({ phone: "+40722123457" }, staffCtx)
```

**Expected (Firestore diffs):**
1) `staffProfiles/u_staff.phone="+40722123457"`
2) `users/u_staff.phone="+40722123457"`
3) NU se modifică:
- `teamCodePools/*`, `teamAssignments/*`, `teamAssignmentsHistory/*`, `adminActions/*`

---

## 6) ADMIN — checklist + Firestore diffs

### ADMIN-0: Set admin claim (preferred)

```powershell
node tools/set_admin_claim.js --project <projectId> --uid <uid>
```

Important:
- user trebuie să facă relogin / refresh token ca să primească claims

---

### ADMIN-1: /admin loads only for admin claim/role

**Expected:**
- admin vede dashboard
- non-admin este redirectat la `/home`

---

### ADMIN-2: Search works (client-side filter)

**Expected:**
- search filtrează local în listă (nume/email/cod)
- nu cere indexuri noi

---

### ADMIN-3: Change team → code reallocated, history + adminActions written

**Action (callable):**
```js
changeUserTeam({ uid: "u_staff", newTeamId: "team_c", forceReallocate: false }, adminCtx)
```

**Expected (Firestore diffs):**
1) `teamCodePools/<oldTeam>.freeCodes`:
- include vechiul code number (o singură dată)
2) `teamCodePools/team_c.freeCodes`:
- maxC scos
3) `teamAssignments/<oldTeam>_u_staff`: șters
4) `teamAssignments/team_c_u_staff`: creat/actualizat
5) `staffProfiles/u_staff`:
- `teamId:"team_c"`, `assignedCode:"C<maxC>"`, și cele 3 câmpuri identice
6) `teamAssignmentsHistory/{autoId}`:
- `actorUid:"u_admin"`, `actorRole:"admin"`
7) `adminActions/{autoId}`:
- `action:"changeUserTeam"` + actor + target + from/to + codes

---

### ADMIN-4: Set status → users.status updated + adminActions written

**Action (callable):**
```js
setUserStatus({ uid: "u_staff", status: "blocked" }, adminCtx)
```

**Expected (Firestore diffs):**
1) `users/u_staff.status="blocked"`
2) `adminActions/{autoId}`:
- `action:"setUserStatus"`, `targetUid`, `status`, `actorUid`

---

## 7) Deploy (production)

```powershell
cd functions
npm i
npm run build
cd ..

firebase deploy --only firestore:rules,functions

cd superparty_flutter
flutter pub get
flutter run
```

---

## If something fails (common causes)

- **Missing pool doc / empty freeCodes**
  - Eroare: “Nu există pool…” / “Nu mai există coduri…”
  - Fix: rulează seed (`node tools/seed_firestore.js --emulator`) și verifică `teamCodePools/{teamId}`

- **Missing auth context**
  - Eroare: `unauthenticated`
  - Fix: în shell, pasează `staffCtx/adminCtx` cu `auth.uid`

- **Missing admin claim/role**
  - Eroare: `permission-denied`
  - Fix: claim `admin:true` sau `users/{uid}.role="admin"` + relogin/refresh token

- **Rules “block writes”**
  - Este corect: client nu scrie în pools/assignments/history/adminActions
  - Folosește Cloud Functions / Admin SDK
