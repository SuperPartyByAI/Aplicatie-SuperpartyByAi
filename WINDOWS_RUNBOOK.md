# Windows Runbook - Exact Commands

**PR**: #34  
**Branch**: `whatsapp-production-stable`

---

## Prerequisites (One-Time Setup)

```powershell
# Install Java 17 (for Firestore emulator)
winget install EclipseAdoptium.Temurin.17.JDK

# Verify
java -version
```

---

## Run Locally (3 Terminals - Exact Commands)

### Terminal 1: Start Emulators
```powershell
npm run emu
```
**Wait for:** `✔  All emulators ready!`  
**Ports:**
- Firestore: http://127.0.0.1:8082
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098
- UI: http://127.0.0.1:4001

### Terminal 2: Seed Firestore (after emulators start)
```powershell
npm run seed:emu
```
**Wait for:** `✅ Seed completed for project: demo-test`

### Terminal 3: Run Flutter
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true
```
**Expected:** App connects to emulators, logs show:
- `[FirebaseService] ✅ Emulators configured: Firestore:8082, Auth:9098, Functions:5002`

---

## Port Configuration (Single Source of Truth)

**firebase.json:**
```json
{
  "emulators": {
    "auth": { "port": 9098 },
    "firestore": { "port": 8082 },
    "functions": { "port": 5002 },
    "ui": { "port": 4001 }
  }
}
```

**superparty_flutter/lib/services/firebase_service.dart:**
- Firestore: 8082
- Auth: 9098
- Functions: 5002

**All ports are consistent** ✅

---

## Troubleshooting

### Java not found
```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
```

### ExecutionPolicy blocks .ps1
**Solution:** Use `.cmd` variants (already in npm scripts):
- `npm.cmd` (not `npm.ps1`)
- `firebase.cmd` (not `firebase.ps1`)

### Port already in use
Check what's using the port:
```powershell
netstat -ano | findstr :8082
netstat -ano | findstr :5002
netstat -ano | findstr :9098
```

Stop the process or change port in `firebase.json` (then update `firebase_service.dart`).

---

## Verification

After running all 3 terminals:
1. Emulator UI: http://127.0.0.1:4001
2. Flutter app should connect to emulators (check logs)
3. Login with test user: `test@local.dev` / `test123456`
4. Navigate to `/staff-settings` or `/admin`
