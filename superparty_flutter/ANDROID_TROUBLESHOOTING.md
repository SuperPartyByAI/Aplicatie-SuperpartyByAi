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
