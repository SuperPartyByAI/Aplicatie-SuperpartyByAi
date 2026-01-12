@echo off
echo ========================================
echo Test WhatsApp Integration
echo ========================================
echo.

echo Checking Flutter installation...
flutter --version
if %errorlevel% neq 0 (
    echo ERROR: Flutter not found. Install Flutter first.
    pause
    exit /b 1
)

echo.
echo Checking project structure...
if not exist "pubspec.yaml" (
    echo ERROR: pubspec.yaml not found. Run this from superparty_flutter directory.
    pause
    exit /b 1
)

echo.
echo Getting dependencies...
flutter pub get

echo.
echo Running Flutter app...
echo Press Ctrl+C to stop
flutter run

pause
