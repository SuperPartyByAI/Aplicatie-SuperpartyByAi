# SMOKE TEST (Staff + Admin) — Flutter + Firebase Auth + Firestore + Cloud Functions

## Prerequisites

- Firebase CLI installed: `firebase --version`, `firebase login`
- Emulator optional (recommended for fast smoke)
- Required Firestore collections:
  - `users`, `staffProfiles`, `teams`, `teamCodePools`, `teamAssignments`, `teamAssignmentsHistory`, `adminActions`
- Note: client cannot write to:
  - `teamCodePools`, `teamAssignments`, `teamAssignmentsHistory`, `adminActions` (rules enforced)

## Start emulators (optional)

```powershell
firebase emulators:start --only firestore,functions
```

## Seed Firestore

Emulator:

```powershell
node tools/seed_firestore.js --emulator
```

Live project:

```powershell
node tools/seed_firestore.js --project <projectId>
```

## (Optional) Set admin

Live (Admin SDK; requires `GOOGLE_APPLICATION_CREDENTIALS`):

```powershell
node tools/set_admin_claim.js --uid <UID> --project <projectId>
```

Admin is either:
- custom claim `admin:true` (preferred), OR
- `users/{uid}.role == "admin"` (fallback if used)

## Callable examples (emulator + live)

Prefer: `firebase functions:shell` (callables are not curl-friendly).

```powershell
cd functions
firebase functions:shell
```

In shell:

```js
const staffCtx = { auth: { uid: "u_staff", token: { email: "staff@test.com" } } }
const adminCtx = { auth: { uid: "u_admin", token: { email: "admin@test.com", admin: true } } }

// allocateStaffCode(teamId, prevTeamId?, prevCodeNumber?)
allocateStaffCode({ teamId: "team_a" }, staffCtx)
allocateStaffCode({ teamId: "team_b", prevTeamId: "team_a", prevCodeNumber: 150 }, staffCtx)

// finalizeStaffSetup(phone, teamId, assignedCode)
finalizeStaffSetup({ phone: "+40722123456", teamId: "team_b", assignedCode: "B250" }, staffCtx)

// updateStaffPhone(phone)
updateStaffPhone({ phone: "+40722123457" }, staffCtx)

// changeUserTeam(uid, newTeamId, forceReallocate?)
changeUserTeam({ uid: "u_staff", newTeamId: "team_c", forceReallocate: false }, adminCtx)

// setUserStatus(uid, status)
setUserStatus({ uid: "u_staff", status: "blocked" }, adminCtx)
```

## Smoke test checklist (step-by-step) + Firestore diffs

### Staff

1) Non-KYC user → Staff Settings blocks (no form)
- Expected: UI blocks. No writes.
- Firestore checks:
  - `users/{uid}.kycDone != true` AND `users/{uid}.kycData.fullName` empty/missing
  - no new `staffProfiles/{uid}` doc created by this step
  - no new `teamAssignmentsHistory/*` or `adminActions/*`

2) KYC user → select team → code appears
- Firestore checks:
  - `teamAssignments/{teamId}_{uid}` exists with:
    - `code` (number), `prefix` (string), `teamId`, `uid`, `createdAt`, `updatedAt`
  - `teamCodePools/{teamId}.freeCodes` removed allocated number (highest)
- UI checks:
  - assignedCode appears and fills `codIdentificare/ceCodAi/cineNoteaza`

3) Change team before save → code changes without leaking/duplicating codes
- Firestore checks:
  - old code number re-added **ONCE** to old pool `teamCodePools/{oldTeamId}.freeCodes`
  - new team pool removed its highest code
  - `teamAssignmentsHistory/*` entry created with `fromTeamId/toTeamId/releasedCode/newCode`

4) Save (setupDone=false) → staffProfiles filled, users.staffSetupDone=true
- Firestore checks:
  - `staffProfiles/{uid}`:
    - `setupDone:true`, `teamId`, `assignedCode`
    - `codIdentificare/ceCodAi/cineNoteaza` == `assignedCode`
    - `phone` normalized to `+40XXXXXXXXX`
  - `users/{uid}.staffSetupDone:true`

5) Reopen (setupDone=true) → team locked, phone editable, save updates phone
- Firestore checks:
  - no new allocation/history (no changes to `teamCodePools/*`, `teamAssignmentsHistory/*`, `adminActions/*`)
  - `staffProfiles/{uid}.phone` updated

### Admin

6) /admin loads only for admin claim/role

7) Search works (client-side filter)

8) Change team → code reallocated, history + adminActions written
- Firestore checks:
  - `staffProfiles/{uid}` updated `teamId` + `assignedCode` (and mirror fields)
  - pools adjusted (return old once, remove new max)
  - new `teamAssignmentsHistory/*` + `adminActions/*` docs

9) Set status → users.status updated + adminActions written
- Firestore checks:
  - `users/{uid}.status` updated
  - new `adminActions/*` doc with `action:"setUserStatus"`

## If something fails (common causes)

- Missing `teamCodePools/{teamId}` doc or empty `freeCodes`
- Missing admin claim/role
- Rules blocking unexpected client writes (pools/assignments/history/adminActions are server-only)
- Wrong project/emulator target
- Functions not deployed / build not run (`functions/dist/index.js` missing)
