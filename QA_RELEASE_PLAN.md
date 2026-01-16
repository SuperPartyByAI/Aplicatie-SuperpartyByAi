# QA/Release Engineering - Plan Executabil Stabilitate

## Setup Repository în Cursor (OBLIGATORIU)

**Dacă vezi eroarea:** "fatal: not a git repository" sau "npm caută package.json în System32"

**⚠️ RECOMANDARE:** Mută repo-ul din OneDrive pentru a evita file locks și probleme cu symlinks.

**Mutare repo (opțional, dar recomandat):**

```powershell
# Mută repo-ul din OneDrive în C:\dev
New-Item -ItemType Directory -Path "C:\dev" -Force | Out-Null
Move-Item -Path "C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -Destination "C:\dev\Aplicatie-SuperpartyByAi"
```

Apoi deschide în Cursor: `C:\dev\Aplicatie-SuperpartyByAi`

**Fix (dacă rămâi în OneDrive):**

1. **File → Open Folder** în Cursor
2. Selectează: `C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi` (sau `C:\dev\Aplicatie-SuperpartyByAi` dacă l-ai mutat)
3. Verifică în terminal:
```powershell
Get-Location
git status
Test-Path "package.json"
```

**PASS criteriu:** `Get-Location` arată path-ul repo-ului, `git status` funcționează, `package.json` există

**Dacă terminalul pornește greșit:**
```powershell
.\tools\recover_repo.ps1
```

Vezi `SETUP_CURSOR_REPO.md` pentru detalii complete.

---

## ⚠️ IMPORTANT (Windows) - OneDrive File Locks

**Problema:** Build failures pe Windows din cauza file locks când repo-ul e pe OneDrive.

**Eroare tipică:**
```
Execution failed for task ':cloud_firestore:compileDebugJavaWithJavac'.
> java.io.IOException: Unable to delete directory '...\build\cloud_firestore\...'
```

### Soluția Recomandată: Mută Repo-ul din OneDrive

```powershell
# Mută repo-ul în C:\dev (elimină complet problemele de file locking)
New-Item -ItemType Directory -Path "C:\dev" -Force | Out-Null
Move-Item -Path "C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -Destination "C:\dev\Aplicatie-SuperpartyByAi"
```

Apoi deschide în Cursor: `C:\dev\Aplicatie-SuperpartyByAi`

### Dacă Rămâi în OneDrive

**Opțiunea 1: Pauzează OneDrive Sync**
1. Click pe iconița OneDrive în system tray
2. Settings → Sync and backup → Advanced settings
3. Pause syncing → Pause for 2 hours
4. Rulează build-ul
5. Reactivează sync după build

**Opțiunea 2: Exclude Foldere din Sync**
1. Settings → Account → Choose folders
2. Exclude sau "Free up space" pentru:
   - `superparty_flutter\build`
   - `superparty_flutter\.dart_tool`
   - `superparty_flutter\android\.gradle`
   - `superparty_flutter\windows\flutter\ephemeral\.plugin_symlinks`

**Opțiunea 3: Folosește Script de Cleanup**
```powershell
.\tools\run_android_local.ps1
```

Scriptul face automat cleanup agresiv și rulează build-ul.

**Vezi `WINDOWS_ONE_DRIVE_LOCKS.md` pentru detalii complete și troubleshooting.**

---

## Prerequisites (Windows)

### Fix Symlink Support (Flutter)

Dacă vezi eroarea: "Building with plugins requires symlink support. Please enable Developer Mode..."

**Pași:**

1. Deschide Settings:
```powershell
start ms-settings:developers
```

2. Activează toggle-ul "Developer Mode" ON

3. Restart Cursor complet (toate ferestrele închise)

4. Verifică symlink support:
```powershell
$testDir = "$env:TEMP\symlink_test_$(Get-Random)"
$testLink = "$env:TEMP\symlink_link_$(Get-Random)"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null
New-Item -ItemType SymbolicLink -Path $testLink -Target $testDir -Force
if (Test-Path $testLink) {
    Write-Host "✓ Symlink support works" -ForegroundColor Green
    Remove-Item $testLink, $testDir -Force
} else {
    Write-Host "✗ Symlink support failed - restart Cursor after enabling Developer Mode" -ForegroundColor Red
}
```

**PASS criteriu:** Symlink test reușește, mesaj verde "✓ Symlink support works"

**FAIL semnal:** Eroare la crearea symlink, mesaj roșu - restart Cursor după Developer Mode

---

## Terminal 1 (T1) - Emulators

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    Write-Host "  Sau rulează: .\tools\recover_repo.ps1" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Start emulators
npm run emu
```

**NOTĂ:** Terminalul T1 trebuie să rămână deschis - emulators trebuie să ruleze continuu.

**PASS criteriu:** Emulators UI opens at http://127.0.0.1:4001, Firestore on 8082, Auth on 9098, Functions on 5002, mesaj "All emulators ready!" apare

**FAIL semnal:** Port already in use, emulator crash, "ECONNREFUSED" errors, "All emulators ready!" never appears

**Logs to collect:** Terminal output (T1) - full output, `firebase-debug.log` in root directory

**Files to verify:** `firebase.json`, `package.json` (emulators script)

---

## Terminal 2 (T2) - Seed + Functions

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    Write-Host "  Sau rulează: .\tools\recover_repo.ps1" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Seed
npm run seed:emu

# Așteaptă 3 secunde
Start-Sleep -Seconds 3

# Functions
cd functions
npm ci
npm test
npm run build
node test-event-creation.js
```

**PASS criteriu:** 
- Seed: "Seed completed" or "X documents created" in output
- npm ci: No errors, dependencies installed
- npm test: All tests pass, exit code 0
- npm run build: No TypeScript errors, dist/ folder created
- test-event-creation.js: "Success" or event ID returned, no exceptions

**FAIL semnal:** 
- Seed: "Error", "Failed to seed", no documents visible in Firestore emulator UI
- npm ci: Dependency conflicts, network errors, missing packages
- npm test: Test failures, exceptions, timeouts, exit code non-zero
- npm run build: TypeScript compilation errors, missing types
- test-event-creation.js: "Error", "Failed", exceptions, no event created

**Logs to collect:** Terminal output (T2), `functions/npm-debug.log`, Jest test output

**Files to verify:** `functions/package.json`, `functions/tsconfig.json`, `functions/test-event-creation.js`

---

## Terminal 3 (T3) - Flutter

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    Write-Host "  Sau rulează: .\tools\recover_repo.ps1" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Flutter
cd superparty_flutter
flutter clean
flutter pub get
flutter analyze --fatal-infos --fatal-warnings
flutter test
flutter build apk --debug
flutter run --dart-define=USE_EMULATORS=true
```

**NOTĂ:** Asigură-te că T1 (emulators) rulează înainte de `flutter run`.

**PASS criteriu:**
- flutter clean: "Deleting build..." completed, no errors
- flutter pub get: "Got dependencies", no errors, exit code 0
- flutter analyze: "No issues found", exit code 0, no warnings/infos
- flutter test: All tests pass, "All tests passed", exit code 0
- flutter build apk: "Built build\app\outputs\flutter-apk\app-debug.apk", no errors
- flutter run: App launches on emulator, no crash on startup, "Flutter run key commands" message appears

**FAIL semnal:**
- flutter clean: File lock errors, permission denied, build folder not deleted
- flutter pub get: Dependency conflicts, network errors, "pub get failed", symlink errors
- flutter analyze: Warnings/infos found (fatal), syntax errors, exit code non-zero
- flutter test: Test failures, exceptions, timeouts, "Some tests failed"
- flutter build apk: Compilation errors, missing dependencies, "Build failed"
- flutter run: App crash on startup, "Lost connection to device", build errors, "No devices found"

**Logs to collect:** Full Flutter run output (T3), `superparty_flutter/flutter_run.log` (if exists), Android logs via `adb logcat` (if using Android emulator)

**Files to verify:** `superparty_flutter/pubspec.yaml`, `superparty_flutter/analysis_options.yaml`, `superparty_flutter/android/app/build.gradle`

---

## Terminal 3 (T3) - Optional Web Test

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    Write-Host "  Sau rulează: .\tools\recover_repo.ps1" -ForegroundColor Yellow
    exit 1
}
cd $root\superparty_flutter
flutter run -d chrome
```

Testează manual în browser: deep links, refresh (F5), navigation.

**PASS criteriu:** Web app loads in Chrome, no console errors, navigation works, refresh (F5) doesn't crash

**FAIL semnal:** Blank screen, console errors (red), refresh causes crash, navigation breaks

**Logs to collect:** Browser console (F12), Flutter run output

---

## Android Emulator (adb reverse)

Dacă folosești Android emulator și ai probleme cu conexiunea la Firebase emulators, configurează port forwarding:

```powershell
# Găsește adb.exe
$adbPath = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    Write-Host "✗ adb.exe not found at: $adbPath" -ForegroundColor Red
    Write-Host "  Install Android SDK Platform Tools or update path" -ForegroundColor Yellow
    exit 1
}

# Verifică device-uri conectate
& $adbPath devices

# Configurează port forwarding pentru Firebase emulators
& $adbPath reverse tcp:8082 tcp:8082  # Firestore
& $adbPath reverse tcp:9098 tcp:9098  # Auth
& $adbPath reverse tcp:5002 tcp:5002  # Functions
& $adbPath reverse tcp:4001 tcp:4001  # Emulator UI

Write-Host "✓ Port forwarding configured" -ForegroundColor Green
```

**PASS criteriu:** `adb devices` arată device-ul, port forwarding reușește fără erori

**FAIL semnal:** "device not found", "cannot connect", port forwarding errors

**Logs to collect:** Output de la `adb devices` și `adb reverse`

**Alternativă - Script rapid:**
```powershell
.\tools\flutter_run_android.ps1
```
(scriptul include cleanup symlinks și rulează Flutter automat)

---

## Manual Checks (10 Pași)

### 1. Login Flow + Load Data

**Action:** Login with valid credentials (use emulator auth or test account)

**PASS criteriu:** 
- Login succeeds, redirects to home screen
- User data loaded correctly (name, role visible)
- No "permission-denied" errors in console
- Firestore queries succeed

**FAIL semnal:** 
- Login fails with wrong error message
- Infinite loading spinner
- Redirects to wrong screen
- Firestore permission-denied errors in console
- User data not displayed

**Logs to check:** Flutter run output (T3), browser console (web), Firebase Auth logs in emulator UI (T1), Firestore emulator UI

**Files to verify:** `superparty_flutter/lib/screens/auth/*.dart`, `superparty_flutter/lib/core/routing/*.dart`

---

### 2. Staff Settings Access

**Action:** Navigate to Staff Settings screen (from drawer or menu)

**PASS criteriu:** 
- Screen loads without crash
- Staff data displays correctly (code, name, role)
- Can edit settings (if applicable)
- No permission errors

**FAIL semnal:** 
- Screen crashes on load
- "Permission denied" errors
- Blank screen
- Navigation error
- Data not loading

**Logs to check:** Flutter run output (T3), Firestore rules violations in emulator UI (T1)

**Files to verify:** `superparty_flutter/lib/screens/staff_settings_screen.dart`, `firestore.rules`

---

### 3. Idempotency - Double Click Prevention

**Action:** Rapidly double-click any "Create Event" or "Save" button (test on event creation or edit)

**PASS criteriu:** 
- Only one action executes
- No duplicate documents in Firestore
- UI shows single loading state
- Success message appears once
- Button disabled during processing

**FAIL semnal:** 
- Multiple documents created (check Firestore emulator UI)
- Duplicate entries in UI list
- Multiple loading spinners
- "Duplicate key" or "already exists" errors in logs
- Button remains enabled during processing

**Logs to check:** Firestore emulator UI (check document count), Flutter run output for duplicate function calls

**Files to verify:** `superparty_flutter/lib/screens/evenimente/*.dart` (check for debouncing/loading guards), `superparty_flutter/lib/services/*.dart`

---

### 4. Admin Gating

**Action:** 
- Login as non-admin user (regular staff)
- Try to access admin screens (Admin Dashboard, KYC Approvals, AI Conversations)

**PASS criteriu:** 
- Redirected away from admin screens
- "Access denied" or "Unauthorized" message shown
- No crash
- Navigation works correctly

**FAIL semnal:** 
- Non-admin can access admin screens
- App crashes on access attempt
- No redirect happens
- Blank screen

**Logs to check:** Router logs in Flutter run output (T3), Firestore permission checks

**Files to verify:** `superparty_flutter/lib/core/routing/*.dart`, `superparty_flutter/lib/screens/admin/*.dart`, `firestore.rules`

---

### 5. WhatsApp UI Guards

**Action:** 
- Navigate to WhatsApp screens
- Check if UI shows proper loading/error states
- Test with emulator (no real WhatsApp connection expected)

**PASS criteriu:** 
- UI shows "Not connected" or "Connecting" state
- No crash when WhatsApp not available
- Error messages are user-friendly
- Loading states work correctly

**FAIL semnal:** 
- App crashes when WhatsApp unavailable
- Blank screen
- Infinite loading spinner
- Unhandled exceptions in logs
- No error message shown

**Logs to check:** Flutter run output (T3) for WhatsApp connection errors

**Files to verify:** `superparty_flutter/lib/screens/whatsapp/*.dart`, `superparty_flutter/lib/services/whatsapp_api_service.dart`

---

### 6. Firestore Rules - Permission Denied Handling

**Action:** 
- Try to read/write data that should be denied by rules (e.g., non-admin accessing admin collection)
- Check client-side error handling

**PASS criteriu:** 
- Client catches permission-denied gracefully
- Shows user-friendly error message
- No crash, app continues working
- Error logged but doesn't break UI

**FAIL semnal:** 
- App crashes on permission-denied
- Unhandled exception in logs
- Blank screen
- No error message shown
- App becomes unresponsive

**Logs to check:** Flutter run output (T3) for "permission-denied" errors, Firestore emulator UI (T1) for rule violations

**Files to verify:** `firestore.rules`, error handling in `superparty_flutter/lib/services/*.dart`

---

### 7. Router Redirects / Logout

**Action:** 
- Logout from app (click logout button)
- Check redirect behavior
- Try to access protected routes after logout (e.g., events list)

**PASS criteriu:** 
- Logout redirects to login screen
- Protected routes redirect to login when accessed after logout
- No navigation errors
- State cleared properly (no user data visible)
- Can login again successfully

**FAIL semnal:** 
- Stuck on same screen after logout
- Can still access protected routes without login
- Navigation errors in logs
- State not cleared (user data still visible)
- Cannot login again

**Logs to check:** Flutter run output (T3) for navigation errors, router logs

**Files to verify:** `superparty_flutter/lib/core/routing/*.dart`, logout handlers in auth service

---

### 8. Event Creation Flow

**Action:** 
- Create a new event through UI (use event creation screen)
- Fill all required fields (date, address, child name, etc.)
- Submit form

**PASS criteriu:** 
- Event created successfully
- Appears in events list immediately
- No duplicate events
- Success message shown
- Form resets after creation

**FAIL semnal:** 
- Event not created (check Firestore emulator UI)
- Duplicate events created
- Validation errors not shown
- Crash on submit
- Event doesn't appear in list

**Logs to check:** Firestore emulator UI (T1) - new document created, Functions logs (T2) if using callable, Flutter run output (T3)

**Files to verify:** `superparty_flutter/lib/screens/evenimente/*.dart`, `functions/test-event-creation.js`

---

### 9. Deep Links / URL Navigation (Web)

**Action:** 
- Test deep links (if implemented) - navigate to specific route via URL
- Test direct URL navigation in web browser
- Test browser back/forward buttons
- Test refresh (F5) on different routes

**PASS criteriu:** 
- Deep links navigate correctly to intended screen
- URL changes reflect in app state
- Browser navigation (back/forward) works
- No crashes on back/forward
- Refresh (F5) works without crash
- State preserved where expected

**FAIL semnal:** 
- Deep links don't work (404 or wrong screen)
- URL doesn't update when navigating
- Browser navigation breaks app
- State lost on navigation
- Refresh causes crash or blank screen

**Logs to check:** Router logs, browser console (F12), Flutter run output (T3)

**Files to verify:** `superparty_flutter/lib/core/routing/*.dart`, deep link handlers

---

### 10. Error Recovery / Resilience

**Action:** 
- Simulate network error (stop emulators in T1, or disable network)
- Try to perform actions (create event, load data)
- Re-enable emulators/network
- Check if app recovers

**PASS criteriu:** 
- App shows network error message (user-friendly)
- No crash
- Retry works after reconnection
- State preserved (form data not lost)
- Can continue working after recovery

**FAIL semnal:** 
- App crashes on network error
- Infinite loading spinner
- No error message shown
- Can't recover after reconnection
- State lost (form data cleared)

**Logs to check:** Network error handling in Flutter run output (T3), retry logic

**Files to verify:** Error handling in services, network retry logic

---

## Troubleshooting

### Emulator Issues (T1)

**Problem:** Port already in use

```powershell
netstat -ano | findstr :8082
taskkill /PID <PID> /F
```

Repetă pentru 9098, 5002, 4001.

**Problem:** Emulator won't start
- Check Firebase CLI: `firebase --version`
- Check Java installed: `java --version`
- Verify `firebase.json` exists and is valid
- Restart terminal, try again

**Logs to collect:** 
- Emulator terminal output (T1) - full output
- `firebase-debug.log` in root directory

**Files to verify:** `firebase.json`, `package.json` (emulators script)

---

### Functions Issues (T2)

**Problem:** Seed fails
- Verify emulators are running (T1) - check http://127.0.0.1:4001
- Check Firestore emulator is accessible on port 8082
- Verify seed script exists: `tools/seed_firestore.js`
- Check project ID matches: `demo-test`

**Problem:** Tests fail
- Check if emulators are running (T1)
- Verify Firestore connection in test files
- Check for hardcoded project IDs in tests
- Run single test: `npm test -- test-name.test.js`

**Problem:** Build fails
- Check TypeScript version: `npm list typescript`
- Verify `tsconfig.json` is valid
- Clear and reinstall: `Remove-Item -Recurse -Force node_modules; npm ci`

**Logs to collect:**
- Functions terminal output (T2) - full output
- `functions/npm-debug.log` (if exists)
- Jest test output (verbose: `npm test -- --verbose`)

**Files to verify:**
- `functions/tsconfig.json`
- `functions/package.json`
- Test files in `functions/` (check for `*.test.js`)

---

### Flutter Issues (T3)

**Problem:** Analyze fails
- Check specific errors: `flutter analyze --no-fatal-infos --no-fatal-warnings`
- Fix warnings first, then re-run with fatal flags
- Check `analysis_options.yaml` for rule configuration

**Problem:** Tests fail
- Run single test file: `flutter test test/specific_test.dart`
- Run with verbose: `flutter test --verbose`
- Check test files in `superparty_flutter/test/`

**Problem:** Build fails with "Unable to delete directory" (file locking)

**Eroare tipică:**
```
Execution failed for task ':cloud_firestore:compileDebugJavaWithJavac'.
> java.io.IOException: Unable to delete directory '...\build\cloud_firestore\...'
  Failed to delete some children. This might happen because a process has files open.
```

**Fix rapid:**
```powershell
.\tools\fix_build_locks.ps1
```

**Fix manual:**
```powershell
# 1. Oprește procese Java/Gradle
Get-Process -Name "java" | Stop-Process -Force

# 2. Șterge folderul problematic
$root = git rev-parse --show-toplevel
$buildPath = "$root\superparty_flutter\build\cloud_firestore"
Remove-Item -Path $buildPath -Recurse -Force

# 3. Flutter clean
cd $root\superparty_flutter
flutter clean
```

**Prevenție:** Mută repo-ul din OneDrive în `C:\dev\Aplicatie-SuperpartyByAi` (vezi secțiunea Setup)

**Problem:** Build fails (alte cauze)
- Check Android setup: `cd android; .\gradlew clean; cd ..`
- Clean and rebuild: `flutter clean; flutter pub get; flutter build apk --debug`
- Check `android/app/build.gradle` for configuration

**Problem:** App crashes on run
- Check emulator connection: `flutter devices`
- Verify emulators are running (T1)
- Run with verbose: `flutter run --dart-define=USE_EMULATORS=true --verbose`
- Check for missing environment variables

**Logs to collect:**
- Flutter run output (T3) - full terminal output, especially crash stack trace
- `superparty_flutter/flutter_run.log` (if exists)
- Android logs: `adb logcat` (if using Android emulator)
- `superparty_flutter/build/` folder contents (check for error files)

**Files to verify:**
- `superparty_flutter/pubspec.yaml` (dependencies, version)
- `superparty_flutter/analysis_options.yaml`
- `superparty_flutter/android/app/build.gradle`
- `superparty_flutter/lib/main.dart` (entry point)

---

### General Issues

**Problem:** Seed doesn't create documents
- Verify emulators are running (T1)
- Check Firestore emulator UI: http://127.0.0.1:4001
- Verify seed script: `tools/seed_firestore.js`
- Check project ID: `demo-test` (should match emulator project)

**Logs to collect:**
- Seed output from T2 terminal
- Firestore emulator UI (check if documents appear)

**Files to verify:**
- `tools/seed_firestore.js`
- `package.json` (seed:emu script)
- `firebase.json` (emulator configuration)

---

## Quick Verification Checklist

After all steps complete, verify:

- [ ] All 3 terminals running without errors
- [ ] Emulator UI accessible (http://127.0.0.1:4001)
- [ ] Flutter app running on emulator
- [ ] No crashes in first 30 seconds after launch
- [ ] Login works
- [ ] Can navigate between screens without crashes
- [ ] No permission-denied errors in console
- [ ] Double-click doesn't create duplicates
- [ ] Admin gating works (non-admin redirected)
- [ ] Logout works and redirects correctly

---

## Log Collection for Failed Steps

If any step fails, collect:

1. **Terminal outputs:**
   - Full output from failed terminal (T1/T2/T3)
   - Copy last 50-100 lines minimum
   - Include error stack traces

2. **Flutter logs:**
   - `flutter run --verbose` output (full)
   - `flutter analyze` output (full)
   - `flutter test --verbose` output (full)

3. **Firebase logs:**
   - Emulator UI screenshots (Firestore, Auth tabs)
   - Firestore data snapshot (export from emulator UI)
   - Functions logs from emulator UI

4. **System info:**
   - Node version: `node --version`
   - Flutter version: `flutter --version`
   - Firebase CLI version: `firebase --version`
   - PowerShell version: `$PSVersionTable.PSVersion`

5. **Error files:**
   - `firebase-debug.log` (root directory)
   - `functions/npm-debug.log` (if exists)
   - `superparty_flutter/flutter_run.log` (if exists)
   - `superparty_flutter/build/` error files

---

## Success Criteria

**Full PASS:** All automated steps pass (T1, T2, T3) + all 10 manual checks pass

**Partial PASS:** Automated steps pass, 1-2 manual checks have minor issues (document for fix, can proceed with caution)

**FAIL:** Any automated step fails OR 3+ manual checks fail → DO NOT RELEASE, fix issues first
