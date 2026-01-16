# Run Flutter App on Android Emulator with Firebase Emulators

## Quick Start

### Option 1: One-Command Setup (Recommended)

**Automated setup: starts emulators + waits for ports + configures adb reverse**

```powershell
# From repo root
npm run emu:android
```

This will:
- Start Firebase emulators in a new window
- Wait for all ports (8082, 9098, 5002, 4001) to be ready
- Configure `adb reverse` for Android emulator
- Print next steps

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

**Verify setup:**
```powershell
npm run emu:check
```

### Option 2: Android Studio

1. **Start Firebase emulators** (use automated script):
   ```powershell
   npm run emu:android
   ```

2. **Configure Android Studio Run/Debug** (see section below)

3. **Run from Android Studio**: Select device → Click Run (▶)

### Option 3: Manual Command Line

```powershell
# Terminal 1: Start Firebase emulators
$root = git rev-parse --show-toplevel
cd $root
npm run emu

# Terminal 2: Setup adb reverse + run Flutter
.\tools\run_android_local.ps1
```

---

## Android Studio Configuration (CRITICAL)

**⚠️ IMPORTANT:** Android Studio may default to running plugin examples from `.plugin_symlinks` instead of your app. This causes blank screens or wrong apps.

### Fix Run/Debug Configuration

1. **Open Run Configuration:**
   - Click **Run** → **Edit Configurations...**
   - Or: Right-click `lib/main.dart` → **Run** → **Edit Configurations...**

2. **Select/Create Flutter Configuration:**
   - In left panel, find **Flutter** → **main.dart** (or create new)
   - If you see multiple "main.dart", delete the wrong ones

3. **Set Correct Dart Entrypoint:**
   - **Dart entrypoint:** Click folder icon (📁) and browse to:
     ```
     superparty_flutter/lib/main.dart
     ```
   - **⚠️ DO NOT use:** `windows/flutter/ephemeral/.plugin_symlinks/.../example/lib/main.dart`
   - **✅ MUST use:** `superparty_flutter/lib/main.dart` (from your project root)

4. **Set Additional Run Args (Optional but Recommended):**
   - **Additional run args:**
     ```
     --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
     ```

5. **Apply and Run:**
   - Click **Apply** → **OK**
   - Select device: **Medium Phone API 36.1 (mobile)** (or your emulator)
   - Click **Run** (▶)

### Verify Configuration

After running, check the **Run** tab at bottom:
- Should see: `Launching lib/main.dart on Medium Phone API 36.1...`
- Should **NOT** see: `Launching .../.plugin_symlinks/.../example/lib/main.dart`

---

## Manual Steps

### 1. Start Firebase Emulators

```powershell
$root = git rev-parse --show-toplevel
cd $root
npm run emu
```

**Wait for:** "All emulators ready!" message

**Verify:** Emulator UI opens at http://127.0.0.1:4001

---

### 2. Configure ADB Reverse (Port Forwarding)

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

# Verify emulator is connected
& $adb devices

# Setup port forwarding
& $adb reverse tcp:8082 tcp:8082  # Firestore
& $adb reverse tcp:9098 tcp:9098  # Auth
& $adb reverse tcp:5002 tcp:5002  # Functions
```

**PASS criteriu:** `adb devices` shows `emulator-XXXXX device`, port forwarding succeeds

**FAIL semnal:** "device not found", port forwarding errors

---

### 3. Run Flutter App

```powershell
$root = git rev-parse --show-toplevel
cd $root\superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**PASS criteriu:** App launches, connects to emulators, no "ECONNABORTED" errors

**FAIL semnal:** App hangs on splash, "ECONNABORTED" errors, connection timeouts

**Alternative (without adb reverse):**
```powershell
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```
This uses `10.0.2.2` instead of `127.0.0.1` (Android emulator special IP).

---

## Troubleshooting

### Problem: "ECONNABORTED connecting to 10.0.2.2:8082"

**Cause:** App is trying to connect to `10.0.2.2` instead of `127.0.0.1`

**Fix:** 
- Ensure `USE_EMULATORS=true` is set
- Verify `adb reverse` is configured (step 2)
- Check `firebase_service.dart` uses `127.0.0.1` (not `10.0.2.2`)

### Problem: App hangs on splash screen / Blank white screen with Flutter logo

**Causes:**
1. **Wrong entrypoint** (most common): Android Studio running plugin example instead of your app
2. **Firestore connection timeout**: Emulator not available or `adb reverse` not configured

**Fix:**

**Step 1: Verify Entrypoint**
- Check Run tab: Should show `Launching lib/main.dart on ...`
- If you see `.../.plugin_symlinks/.../example/lib/main.dart` → **WRONG!**
- Fix: Run → Edit Configurations → Set Dart entrypoint to `superparty_flutter/lib/main.dart`

**Step 2: Verify ADB Reverse**
```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse --list
```
Should show:
```
8082 tcp:8082 tcp:8082
9098 tcp:9098 tcp:9098
5002 tcp:5002 tcp:5002
```

If missing, run:
```powershell
& $adb reverse tcp:8082 tcp:8082
& $adb reverse tcp:9098 tcp:9098
& $adb reverse tcp:5002 tcp:5002
```

**Step 3: Hot Restart**
- In Android Studio Run tab, press **R** (Hot Restart)
- Or click **Hot Restart** button (circular arrow icon)

**Step 4: Check Logs**
- Look for: `[FirebaseService] ✅ Emulators configured`
- Look for: `[Main] ✅ Firebase initialized successfully`
- If you see `ECONNABORTED` or `UNAVAILABLE` → emulator connection issue

### Problem: "No Android emulator found"

**Fix:**
```powershell
# Start Android emulator from Android Studio
# Or use command line:
$emulator = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
& $emulator -avd <AVD_NAME>
```

---

## Verification

After setup, verify:

1. **Emulators running:** http://127.0.0.1:4001 accessible
2. **ADB reverse active:** `adb reverse --list` shows ports (8082, 9098, 5002)
3. **Correct entrypoint:** Run tab shows `Launching lib/main.dart` (not `.plugin_symlinks/.../example`)
4. **App connects:** No "ECONNABORTED" errors in logs
5. **App doesn't hang:** Shows UI within 5-10 seconds (or banner if emulators unavailable)

## Android Studio Run Tab

When running from Android Studio:
- **Run tab** (bottom panel) shows logs and Flutter output
- **Hot Reload:** Press **r** or click ⚡ (lightning) button
- **Hot Restart:** Press **R** or click 🔄 (circular arrow) button
- **Stop:** Press **q** or click ⏹ (stop) button

---

## Validation

### Test Case 1: Emulators Running → Init Succeeds

```powershell
# Step 1: Start emulators + setup
npm run emu:android

# Step 2: Verify ports
npm run emu:check
# Expected: All ports show "✓ OPEN"

# Step 3: Run Flutter
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**Expected logs:**
```
[FirebaseService] ✅ Emulators configured: host=127.0.0.1 Firestore:8082 Auth:9098 Functions:5002 UI:4001
[Main] ✅ Firebase initialized successfully
```

**PASS:** App starts normally, no timeout, connects to emulators.

---

### Test Case 2: Emulators Stopped → Error Screen + Retry

```powershell
# Step 1: Stop emulators (close emulator window)

# Step 2: Verify ports are closed
npm run emu:check
# Expected: All ports show "✗ CLOSED"

# Step 3: Run Flutter
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true
```

**Expected:**
- App shows "Firebase Initialization Failed" screen
- Error message: "Firebase initialization failed or timed out"
- Button "Retry Firebase Initialization" available
- Logs show: `[Main] ❌ Firebase initialization failed: TimeoutException`

**PASS:** App shows error screen (doesn't hang), retry button works.

---

### Test Case 3: ADB Reverse Missing → Works with USE_ADB_REVERSE=false

```powershell
# Step 1: Start emulators (without adb reverse)
npm run emu

# Step 2: Run Flutter WITHOUT adb reverse setup
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false
```

**Expected logs:**
```
[FirebaseService] ✅ Emulators configured: host=10.0.2.2 Firestore:8082 Auth:9098 Functions:5002 UI:4001
[Main] ✅ Firebase initialized successfully
```

**PASS:** App connects via `10.0.2.2` automatically, no timeout, no adb reverse needed.

---

## Notes

- **USE_ADB_REVERSE=true (default):** Uses `127.0.0.1` with `adb reverse` port forwarding (recommended, faster)
- **USE_ADB_REVERSE=false:** Uses `10.0.2.2` (Android emulator special IP, no adb reverse needed)
- **Port forwarding is required** when using `USE_ADB_REVERSE=true`
- **Timeout is 5 seconds** - app will show error screen if emulator is down
- **Physical Android device:** Requires `--dart-define=EMULATOR_HOST_IP=<your-pc-ip>` (e.g., `192.168.1.100`)

## Flags

- `USE_EMULATORS=true`: Enable Firebase emulator mode
- `USE_ADB_REVERSE=true` (default): Use `127.0.0.1` with adb reverse
- `USE_ADB_REVERSE=false`: Use `10.0.2.2` without adb reverse (Android emulator only)
- `EMULATOR_HOST_IP=<ip>`: Explicit host IP for physical Android devices (required if not emulator)
