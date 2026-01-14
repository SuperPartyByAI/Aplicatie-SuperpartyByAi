# Smoke test autorun (NO Flutter) — PR #34

This guide lets you validate the **Staff Settings + Admin + Callables + Rules** work end-to-end using **Node + Firebase emulators** only.

## Prerequisites

- Node.js installed (`node --version`)
- Firebase CLI installed (`firebase --version`) and logged in if needed (`firebase login`)
- Functions build exists: `functions/dist/index.js` (run build once if missing)

## Start emulators

From repo root:

```powershell
firebase emulators:start --only firestore,functions
```

### Ports / URLs (defaults)

- **Emulator UI**: `http://127.0.0.1:4000`
- **Firestore**: `127.0.0.1:8080`
- **Functions**: `127.0.0.1:5001`

## Build functions (only if needed)

If `functions/dist/index.js` is missing:

```powershell
cd functions
npm ci
npm run build
cd ..
```

## Run autorun harness (PASS/FAIL)

In a second terminal:

```powershell
node tools/smoke_run_emulator.js
```

You will get **PASS/FAIL** for:
- Staff 1–5 (KYC gating, allocation, team change release+realloc, finalize, phone update)
- Admin 6–9 (admin gating, list/search sanity, change team, set status)

## UID / actors used by the script (fixed, no input)

- staff non-KYC: `staff_nokyc_1`
- staff KYC: `staff_kyc_1`
- admin: `admin_1`
- non-admin user (for permission test): `not_admin_1`

## Troubleshooting

### “Firestore emulator not reachable”

- Ensure emulators are running:

```powershell
firebase emulators:start --only firestore,functions
```

### “Missing functions/dist/index.js”

- Build functions:

```powershell
cd functions
npm ci
npm run build
cd ..
```

### KYC / setup precondition failures

- The script writes:
  - `users/staff_nokyc_1` with `kycDone:false`
  - `users/staff_kyc_1` with `kycDone:true` and `kycData.fullName`

If you manually changed these docs, delete them in Emulator UI and rerun the script.

### Different emulator ports

Set env vars before running:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
node tools/smoke_run_emulator.js
```

