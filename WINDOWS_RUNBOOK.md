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

## Run Locally

### Option 1: Android + Firebase Emulators (One-Command Setup)

**For Flutter Android development, automated setup:**

```powershell
npm run emu:android
```

This will:
- Start Firebase emulators (Firestore:8082, Auth:9098, Functions:5002, UI:4001)
- Seed Firestore with teams + code pools
- Configure `adb reverse` for Android emulator
- Print next steps

**Then run Flutter:**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**⚠️ IMPORTANT:** `--dart-define` flags are compile-time only. If you change `USE_ADB_REVERSE`, you must:
1. Stop the app completely (press `q` or Stop button)
2. Run `flutter clean` (optional but recommended)
3. Run `flutter run` again with new flags

**Hot restart (R) does NOT apply new dart-define flags!**

**Verify setup:**
```powershell
npm run emu:check
```

### Option 2: 3 Terminals (Manual Workflow)

**Terminal 1: Start Emulators**
```powershell
npm run emu
```
**Wait for:** `✔  All emulators ready!`  
**Ports:**
- Firestore: http://127.0.0.1:8082
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098
- UI: http://127.0.0.1:4001

**Terminal 2: Seed Firestore (after emulators start)**
```powershell
npm run seed:emu
```
**Wait for:** `✅ Seed completed for project: demo-test`

**Terminal 3: Setup ADB Reverse + Run Flutter**
```powershell
# Setup adb reverse (if using Android emulator)
.\scripts\adb_reverse_emulators.ps1

# Run Flutter
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**Expected:** App connects to emulators, logs show:
- `[FirebaseService] ✅ Emulators configured: host=127.0.0.1, Firestore:8082, Auth:9098, Functions:5002`

**Alternative (without adb reverse):**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```
This uses `10.0.2.2` automatically (Android emulator special IP) - works without `adb reverse`.

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

### Firebase Init Timeout / "No Firebase App '[DEFAULT]' has been created"

**Symptom:** App shows "Firebase Initialization Failed" or timeout error.

**Root Cause:** Firebase emulators are not running or ports are not accessible from Android emulator.

**Fix:**

1. **Start emulators and setup adb reverse:**
   ```powershell
   npm run emu:android
   ```

2. **Verify ports are open:**
   ```powershell
   npm run emu:check
   ```
   Should show all ports as "✓ OPEN"

3. **If ports are closed:**
   - Check if emulator window is running
   - Check for port conflicts: `netstat -ano | findstr :8082`
   - Restart emulators: Close window, then `npm run emu:android` again

4. **If adb reverse is missing (Android emulator):**
   - **Option A (Recommended):** Run `.\scripts\adb_reverse_emulators.ps1` or use `npm run emu:android`
   - **Option B (Automatic):** Use `USE_ADB_REVERSE=false` - app will use `10.0.2.2` automatically:
     ```powershell
     flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
     ```

### Java not found
```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
```

### ExecutionPolicy blocks .ps1
**Solution:** Use npm scripts (already use `.cmd` variants):
- `npm run emu:android` (uses PowerShell with Bypass)
- `npm run emu:check` (uses PowerShell with Bypass)

### Port already in use
Check what's using the port:
```powershell
netstat -ano | findstr :8082
netstat -ano | findstr :5002
netstat -ano | findstr :9098
```

Stop the process or change port in `firebase.json` (then update `firebase_service.dart`).

### OneDrive Path Issues

**Symptom:** File locks, build failures, "Unable to delete directory"

**Fix:**
1. **Move project out of OneDrive:**
   ```powershell
   Move-Item "C:\Users\<user>\OneDrive\Desktop\Aplicatie-SuperpartyByAi" "C:\dev\Aplicatie-SuperpartyByAi"
   ```

2. **Or pause OneDrive sync** during development:
   - Right-click OneDrive icon → "Pause syncing" → "2 hours"

3. **Or exclude build folders:**
   - Right-click `superparty_flutter\build` → OneDrive → "Always keep on this device"

---

## Verification

After running all 3 terminals:
1. Emulator UI: http://127.0.0.1:4001
2. Flutter app should connect to emulators (check logs)
3. Login with test user: `test@local.dev` / `test123456`
4. Navigate to `/staff-settings` or `/admin`
