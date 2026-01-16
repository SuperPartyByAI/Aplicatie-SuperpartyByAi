# Android Build Troubleshooting

## NDK Error: CXX1101 - Missing source.properties

### Symptom
```
[CXX1101] NDK at C:\Users\<user>\AppData\Local\Android\sdk\ndk\<version> did not have a source.properties file
BUILD FAILED
```

### Root Cause
The Android NDK (Native Development Kit) installation is corrupted or incomplete. This typically happens due to:
- Interrupted download
- Disk space issues during installation
- Antivirus interference
- Network issues

### Solution

#### Option 1: Automated Fix (Recommended)
1. Close Android Studio and any running emulators
2. Navigate to the Flutter project folder: `superparty_flutter`
3. Double-click `fix-ndk.bat` (Windows) or run it from Command Prompt
4. After completion, run `build-app.bat` to rebuild

#### Option 2: Manual Fix via Command Prompt
1. Close Android Studio and any running emulators
2. Open Command Prompt (CMD) as Administrator
3. Delete the corrupted NDK folder:
   ```cmd
   rmdir /s /q "C:\Users\<your-username>\AppData\Local\Android\sdk\ndk\<version>"
   ```
   Replace `<your-username>` and `<version>` with actual values from the error message

4. Navigate to your Flutter project:
   ```cmd
   cd C:\path\to\superparty_flutter
   ```

5. Clean and rebuild:
   ```cmd
   flutter clean
   flutter pub get
   flutter build apk
   ```

The Android Gradle Plugin will automatically download a fresh NDK during the build.

#### Option 3: Reinstall via Android Studio
1. Open Android Studio
2. Go to **Tools → SDK Manager**
3. Click on **SDK Tools** tab
4. Uncheck **NDK (Side by side)**
5. Click **Apply** to remove it
6. Check **NDK (Side by side)** again
7. Click **Apply** to reinstall
8. Restart Android Studio
9. Run `flutter clean && flutter pub get` in your project

#### Option 4: Manual NDK Installation via sdkmanager
```cmd
cd C:\Users\<your-username>\AppData\Local\Android\sdk\cmdline-tools\latest\bin
sdkmanager --install "ndk;26.1.10909125"
```

### Verification
After applying any fix, verify the installation:

```cmd
flutter doctor -v
```

Look for:
```
[✓] Android toolchain - develop for Android devices
    • Android SDK at C:\Users\<user>\AppData\Local\Android\sdk
    • Platform android-34, build-tools 34.0.0
    • Java binary at: ...
    • Java version ...
    • All Android licenses accepted.
```

### Prevention
- Ensure stable internet connection during SDK installations
- Disable antivirus temporarily during Android SDK updates
- Keep at least 10GB free disk space on system drive
- Use Android Studio's SDK Manager for all SDK component installations

### Additional Notes
- **Git Bash users**: Use Windows Command Prompt (CMD) or PowerShell instead. Git Bash has issues with Windows paths.
- **NDK version**: Flutter automatically selects the appropriate NDK version. Don't manually pin `ndkVersion` in `build.gradle` unless required.
- **Build cache**: If issues persist after NDK fix, run `flutter clean` and delete `android/.gradle` folder.

### Related Issues
- If you see "Execution failed for task ':app:mergeDebugNativeLibs'", this is also NDK-related
- If you see "No toolchains found in the NDK toolchains folder", follow the same fix steps

### Support
If the issue persists after trying all solutions:
1. Check Flutter version: `flutter --version`
2. Check Android SDK path: `flutter doctor -v`
3. Verify Java installation: `java -version`
4. Check available disk space
5. Review full build logs for additional errors

---

## File Lock Error: kernel_blob.bin / mergeDebugAssets

### Symptom
```
Execution failed for task ':app:mergeDebugAssets'.
java.nio.file.FileSystemException: ...\build\app\intermediates\assets\debug\mergeDebugAssets\flutter_assets\kernel_blob.bin: The process cannot access the file because it is being used by another process
```

### Root Cause
File locks occur when:
1. **Processes still running**: `dart.exe`, `java.exe`, `gradle.exe`, or `flutter.exe` are holding file handles
2. **Gradle daemon active**: Background Gradle daemon is locking build files
3. **OneDrive sync**: OneDrive is syncing files during build, causing locks
4. **Antivirus scanning**: Real-time antivirus scanning is locking files
5. **Previous build not cleaned**: Old build artifacts are locked by previous processes

### Solution

#### Option 1: Automated Fix (Recommended)
Use the automated reset script:

**PowerShell:**
```powershell
cd superparty_flutter
.\scripts\flutter_reset_windows.ps1
```

**Or with BAT wrapper:**
```cmd
cd superparty_flutter
scripts\flutter_reset_windows.bat
```

**To run Flutter after reset:**
```powershell
.\scripts\flutter_reset_windows.ps1 -RunAfterClean
```

**To run on specific device:**
```powershell
.\scripts\flutter_reset_windows.ps1 -RunAfterClean -Device "emulator-5554"
```

The script will:
- Stop Gradle daemon
- Kill blocking processes (dart.exe, java.exe, gradle.exe, flutter.exe)
- Delete build folders (`build`, `.dart_tool`, `android/app/build`, `android/.gradle`)
- Run `flutter clean` and `flutter pub get`
- Optionally run `flutter run` after cleanup

#### Option 2: Manual Fix

**Step 1: Stop Gradle Daemon**
```powershell
cd superparty_flutter\android
.\gradlew --stop
```

**Step 2: Kill Blocking Processes**
```powershell
taskkill /F /IM dart.exe /T
taskkill /F /IM java.exe /T
taskkill /F /IM gradle.exe /T
taskkill /F /IM flutter.exe /T
```

**Step 3: Delete Build Folders**
```powershell
cd superparty_flutter
rmdir /s /q build
rmdir /s /q .dart_tool
rmdir /s /q android\app\build
rmdir /s /q android\.gradle
```

**Step 4: Clean and Rebuild**
```powershell
flutter clean
flutter pub get
flutter run
```

#### Option 3: OneDrive-Specific Fix

If your project is in OneDrive (e.g., `C:\Users\<user>\OneDrive\...`):

1. **Pause OneDrive sync** during build:
   - Right-click OneDrive icon in system tray
   - Select "Pause syncing" → "2 hours"
   - Run build
   - Resume syncing after build completes

2. **Exclude build folders from OneDrive sync**:
   - Right-click `superparty_flutter\build` → OneDrive → "Always keep on this device"
   - Repeat for `.dart_tool` and `android\.gradle`

3. **Move project out of OneDrive** (best long-term solution):
   ```powershell
   # Move to C:\dev\ (recommended)
   Move-Item "C:\Users\<user>\OneDrive\Desktop\Aplicatie-SuperpartyByAi" "C:\dev\Aplicatie-SuperpartyByAi"
   ```

### Verification

After applying the fix, verify:

1. **No processes running:**
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like "*dart*" -or $_.ProcessName -like "*gradle*" -or $_.ProcessName -like "*java*"}
   ```
   Should return nothing (or only system processes)

2. **Build folders deleted:**
   ```powershell
   Test-Path superparty_flutter\build
   ```
   Should return `False`

3. **Build succeeds:**
   ```powershell
   flutter build apk --debug
   ```
   Should complete without file lock errors

### Prevention

- **Close Android Studio** before running builds from command line
- **Stop emulators** if not needed during build
- **Avoid OneDrive paths** for development projects (use `C:\dev\` or `C:\Projects\`)
- **Pause antivirus** during builds (if it causes issues)
- **Use the reset script** before major builds if you've had lock issues before

### Related Issues

- If you see "The process cannot access the file because it is being used by another process" for other files (e.g., `.dart_tool/package_config.json`), use the same fix
- If build fails with "Unable to delete directory", this is also a file lock issue
- If `flutter clean` fails, kill processes first, then delete folders manually

### Support

If the issue persists:
1. Check if any IDE (Android Studio, VS Code) has the project open
2. Verify no other terminal windows are running Flutter/Gradle commands
3. Restart computer if locks persist (nuclear option)
4. Check Windows Event Viewer for file system errors
5. Consider moving project out of OneDrive permanently