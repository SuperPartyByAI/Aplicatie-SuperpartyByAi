# Smoke test server (browser/Postman, NO Flutter) — PR #34

This gives you a local HTTP server that talks to **Firestore + Functions emulators** and lets you run:
- seed
- full 9-step smoke suite
- individual steps (allocate/finalize/admin ops)
- last report/logs

## Start

### Terminal 1 — emulators

From repo root:

```powershell
firebase emulators:start --only firestore,functions
```

Defaults:
- Emulator UI: `http://127.0.0.1:4000`
- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001`

### Terminal 2 — smoke server

From repo root:

```powershell
npm run smoke:server
```

Server:
- `http://127.0.0.1:5179`

## Fixed test UIDs (no input required)

- staff non-KYC: `staff_nokyc_1`
- staff KYC: `staff_kyc_1`
- admin: `admin_1`

## Endpoints

### Health

```powershell
curl.exe http://127.0.0.1:5179/health
```

### Seed (teams + teamCodePools)

```powershell
curl.exe -X POST http://127.0.0.1:5179/seed
```

### Run full smoke suite (9 checks)

```powershell
curl.exe -X POST http://127.0.0.1:5179/run
```

### Read last report + logs

```powershell
curl.exe http://127.0.0.1:5179/report
```

## Step endpoints (run one action)

### Allocate code (staff)

```powershell
curl.exe -X POST http://127.0.0.1:5179/step/allocate ^
  -H "Content-Type: application/json" ^
  -d "{\"teamId\":\"team_a\",\"uid\":\"staff_kyc_1\"}"
```

Reallocate (team change before finalize):

```powershell
curl.exe -X POST http://127.0.0.1:5179/step/allocate ^
  -H "Content-Type: application/json" ^
  -d "{\"teamId\":\"team_b\",\"uid\":\"staff_kyc_1\",\"prevTeamId\":\"team_a\",\"prevCodeNumber\":150}"
```

### Finalize setup (staff)

```powershell
curl.exe -X POST http://127.0.0.1:5179/step/finalize ^
  -H "Content-Type: application/json" ^
  -d "{\"uid\":\"staff_kyc_1\",\"phone\":\"+40722123456\",\"teamId\":\"team_b\",\"assignedCode\":\"B250\"}"
```

### Admin: change team

```powershell
curl.exe -X POST http://127.0.0.1:5179/step/admin/change-team ^
  -H "Content-Type: application/json" ^
  -d "{\"uid\":\"staff_kyc_1\",\"newTeamId\":\"team_c\",\"forceReallocate\":false}"
```

### Admin: set status

```powershell
curl.exe -X POST http://127.0.0.1:5179/step/admin/status ^
  -H "Content-Type: application/json" ^
  -d "{\"uid\":\"staff_kyc_1\",\"status\":\"blocked\"}"
```

## Troubleshooting

### “Emulators not reachable”

Start them:

```powershell
firebase emulators:start --only firestore,functions
```

### “Missing functions/dist/index.js”

Build functions once:

```powershell
cd functions
npm ci
npm run build
cd ..
```

### Different emulator ports

This server reads `firebase.json` → `emulators.*.port`. If you override via env, set:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
npm run smoke:server
```

