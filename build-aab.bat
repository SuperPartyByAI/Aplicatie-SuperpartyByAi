@echo off
echo ========================================
echo SuperParty AAB Build Script v1.2.0+14
echo ========================================
echo.

REM Check Flutter
where flutter >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Flutter not found in PATH
    echo Please install Flutter: https://flutter.dev/docs/get-started/install/windows
    pause
    exit /b 1
)

echo [OK] Flutter found
flutter --version
echo.

REM Navigate to Flutter project
cd superparty_flutter

REM Check version
findstr /C:"version:" pubspec.yaml
echo.

REM Check signing config
if not exist "android\key.properties" (
    echo [ERROR] android\key.properties not found
    pause
    exit /b 1
)

if not exist "..\superparty-release-key.jks" (
    echo [ERROR] superparty-release-key.jks not found
    pause
    exit /b 1
)

echo [OK] Signing configuration OK
echo.

REM Clean previous builds
echo Cleaning previous builds...
flutter clean
echo.

REM Get dependencies
echo Getting dependencies...
flutter pub get
echo.

REM Run flutter doctor
echo Running flutter doctor...
flutter doctor
echo.

REM Build AAB
echo Building release AAB...
flutter build appbundle --release
echo.

REM Check if build succeeded
if exist "build\app\outputs\bundle\release\app-release.aab" (
    echo ========================================
    echo [SUCCESS] Build successful!
    echo ========================================
    echo.
    echo AAB location: build\app\outputs\bundle\release\app-release.aab
    dir build\app\outputs\bundle\release\app-release.aab
    echo.
    echo Ready for Play Store upload!
    echo.
    echo Next steps:
    echo 1. Go to https://play.google.com/console
    echo 2. Select SuperParty app
    echo 3. Create new release in Production track
    echo 4. Upload: build\app\outputs\bundle\release\app-release.aab
    echo 5. Add release notes and submit for review
    echo.
) else (
    echo [ERROR] Build failed - AAB not found
    pause
    exit /b 1
)

pause
