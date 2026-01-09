# NDK Build Error Fix

## Problem
The Android NDK at `C:\Users\ursac\AppData\Local\Android\sdk\ndk\28.2.13676358` is corrupted (missing `source.properties` file).

## Solution

### Option 1: Use the Automated Script (Easiest)
1. Close Android Studio and any running emulators
2. Navigate to the Flutter project folder in File Explorer
3. Double-click `fix-ndk.bat`
4. Wait for completion
5. Run `build-app.bat` to build the app

### Option 2: Manual Command (Windows CMD or PowerShell)
1. Close Android Studio and any running emulators
2. Open Command Prompt (CMD) or PowerShell as Administrator
3. Run:
   ```cmd
   rmdir /s /q "C:\Users\ursac\AppData\Local\Android\sdk\ndk\28.2.13676358"
   ```
4. Navigate to project and build:
   ```cmd
   cd C:\Users\ursac\StudioProjects\my_app\superparty_flutter
   flutter clean
   flutter pub get
   flutter build apk
   ```

⚠️ **Note**: Git Bash uses different syntax and won't work with Windows paths. Use CMD, PowerShell, or the batch scripts instead.

### Option 2: Use Android Studio SDK Manager
1. Open Android Studio
2. Go to **Tools → SDK Manager**
3. Click on **SDK Tools** tab
4. Uncheck **NDK (Side by side)**
5. Click **Apply** to remove it
6. Check **NDK (Side by side)** again
7. Click **Apply** to reinstall it

### Option 3: Specify a Different NDK Version
If you have another NDK version installed, you can specify it in `android/app/build.gradle`:

```gradle
android {
    namespace = "com.superpartybyai.superparty_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "26.1.10909125"  // Use your installed version
    // ...
}
```

To check installed NDK versions:
```
dir "C:\Users\ursac\AppData\Local\Android\sdk\ndk"
```

## Verification
After applying the fix, run:
```
flutter clean
flutter pub get
flutter build apk
```

## Additional Notes
- The NDK is required for native code compilation
- Flutter will use the default NDK version if none is specified
- This error typically occurs after interrupted downloads or disk issues
