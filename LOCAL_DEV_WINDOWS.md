# Local Development on Windows

Quick reference for running the app locally on Windows PowerShell.

## Prerequisites

- Node.js 20+ (or use `.nvmrc` with `nvm use`)
- Firebase CLI: `npm i -g firebase-tools`
- Java 17+ (for Firestore emulator): `winget install EclipseAdoptium.Temurin.17.JDK`
- Flutter (optional, for Flutter app): Install from [flutter.dev](https://flutter.dev)

## Quick Commands (3-5 max)

### 1. Android + Firebase Emulators: One-Command Setup (Recommended)

**For Flutter Android development with Firebase emulators:**

```powershell
# One command: Starts emulators + waits for ports + sets up adb reverse
npm run emu:android
```

This script will:
- Start Firebase emulators in a new window
- Wait for all ports to be ready (8082, 9098, 5002, 4001)
- Configure `adb reverse` for Android emulator
- Print next steps to run Flutter app

**Then run Flutter:**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**Alternative (without adb reverse):**
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```
This uses `10.0.2.2` automatically (Android emulator special IP) - works without `adb reverse`.

**⚠️ IMPORTANT:** `--dart-define` flags are compile-time only. If you change `USE_ADB_REVERSE`, you must:
1. Stop the app completely (press `q` or Stop button)
2. Run `flutter clean` (optional but recommended)
3. Run `flutter run` again with new flags

**Hot restart (R) does NOT apply new dart-define flags!**

**Verify ports are open:**
```powershell
npm run emu:check
```

### 2. Start Emulators + Seed (Manual)

```powershell
# Terminal 1: Start emulators
npm run emu

# Terminal 2: Seed Firestore (wait for emulators to start)
npm run seed:emu
```

**URL-uri (from firebase.json - single source of truth):**
- Firestore: http://127.0.0.1:8082
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098
- UI: http://127.0.0.1:4001

**Note:** All scripts read ports from `firebase.json`. To change ports, edit `firebase.json` only.

### 2. Build Functions (if changed TypeScript)

```powershell
npm run functions:build
```

### 3. Run Flutter (with emulators)

**After running `npm run emu:android`:**

```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**Or use the run script:**
```powershell
.\tools\run_android_local.ps1
```

**Seed creates:**
- `teams/team_a`, `team_b`, `team_c`
- `teamCodePools/team_a`, `team_b`, `team_c` with free codes

### Deploy Functions

```powershell
npm run functions:deploy
```

Builds and deploys to Firebase (requires `firebase login` and project access).

### Deploy Firestore Rules

```powershell
npm run rules:deploy
```

## Manual Commands (if scripts don't work)

### Emulators

```powershell
firebase.cmd emulators:start --only firestore,functions,auth --project demo-test
```

### Seed

```powershell
node tools/seed_firestore.js --emulator --project demo-test
```

### Functions Build

```powershell
cd functions
npm.cmd ci
npm.cmd run build
cd ..
```

### Set Admin Claim (for emulator)

```powershell
# After creating user in Auth emulator UI
node tools/set_admin_claim.js --project demo-test --email admin@local.dev
# OR manually in Firestore emulator UI: users/{uid} with {role: "admin"}
```

## Flutter App (with Emulators)

```powershell
cd superparty_flutter
flutter pub get
flutter run --dart-define=USE_EMULATORS=true
```

The app will automatically connect to emulators if `USE_EMULATORS=true` and `kDebugMode`.

## Troubleshooting

### Firebase Init Timeout / "No Firebase App '[DEFAULT]' has been created"

**Symptom:** App shows "Firebase Initialization Failed" screen or timeout error.

**Root Cause:** Firebase emulators are not running or ports are not accessible.

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

4. **If adb reverse is missing:**
   - Ensure Android emulator is running: `adb devices`
   - Run: `adb reverse tcp:8082 tcp:8082` (and 9098, 5002)
   - Or use: `npm run emu:android` (does this automatically)

### ExecutionPolicy blocks .ps1

**Fix:** Folosește `.cmd` sau `npm` scripts:
```powershell
npm run emu:android  # uses .cmd wrapper
npm run emu:check    # uses npm script
```

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

### Java not found (Firestore emulator)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
```

### Firebase CLI not found

```powershell
npm i -g firebase-tools
# Scripts folosesc deja firebase.cmd
```

### Port already in use

Verifică porturile în `firebase.json`:
- Firestore: 8082
- Functions: 5002
- Auth: 9098

Stop procesul care folosește portul sau schimbă portul în `firebase.json`.

**Check what's using a port:**
```powershell
netstat -ano | findstr :8082
taskkill /F /PID <PID>
```

### USE_EMULATORS not working

Verifică că rulezi cu `--dart-define`:
```powershell
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

Nu edita manual `firebase_service.dart` - este automat prin dart-define.

### Port Inconsistency / Seed fails with wrong port

**Symptom:** `npm run seed:emu` shows `[seed] Using Firestore emulator at 127.0.0.1:8080` (wrong port).

**Root Cause:** Scripts were hardcoding old ports (8080, 5001, 9099, 4000) instead of reading from `firebase.json`.

**Fix:** All scripts now read ports from `firebase.json` (single source of truth):
- `tools/seed_firestore.js` reads from `firebase.json` or `FIRESTORE_EMULATOR_HOST` env var
- `scripts/check_emu_ports.ps1` reads from `firebase.json`
- `scripts/adb_reverse_emulators.ps1` reads from `firebase.json`
- `package.json` uses `--config .\firebase.json` for emulator startup

**Validation:**
```powershell
# 1. Start emulators (uses firebase.json ports)
npm run emu

# 2. Verify seed uses correct port
npm run seed:emu
# Expected: [seed] Using Firestore emulator at 127.0.0.1:8082

# 3. Check all ports are open
npm run emu:check
# Expected: All ports show "✓ OPEN" (8082, 9098, 5002, 4001)

# 4. Run Flutter (should not timeout)
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
# Expected: [FirebaseService] ✅ Emulators configured: host=127.0.0.1 Firestore:8082 Auth:9098 Functions:5002 UI:4001
```

### ADB Reverse Not Working

**Symptom:** App connects to `10.0.2.2` instead of `127.0.0.1`, or connection fails.

**Fix:**
1. **Verify emulator is connected:**
   ```powershell
   adb devices
   ```
   Should show `emulator-XXXXX device`

2. **Setup adb reverse:**
   ```powershell
   adb reverse tcp:8082 tcp:8082
   adb reverse tcp:9098 tcp:9098
   adb reverse tcp:5002 tcp:5002
   ```

3. **Verify reversals:**
   ```powershell
   adb reverse --list
   ```

4. **Or use automated script:**
   ```powershell
   npm run emu:android
   ```

### Functions build fails

```powershell
cd functions
npm.cmd ci
npm.cmd run build
# Verifică: functions/dist/index.js există
```

## Notes

- All scripts use `.cmd` extensions for Windows compatibility
- Emulator data is stored in `.firebase/` (gitignored)
- Use `demo-test` project for local development (no real Firebase project needed)
