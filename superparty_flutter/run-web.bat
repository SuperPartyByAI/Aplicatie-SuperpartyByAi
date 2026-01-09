@echo off
echo ========================================
echo SuperParty Flutter Web Runner
echo ========================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

echo Current directory: %CD%
echo.

echo Step 1: Cleaning previous build...
call flutter clean
if errorlevel 1 (
    echo ERROR: Flutter clean failed
    pause
    exit /b 1
)

echo.
echo Step 2: Getting dependencies...
call flutter pub get
if errorlevel 1 (
    echo ERROR: Flutter pub get failed
    pause
    exit /b 1
)

echo.
echo Step 3: Starting web server...
echo.
echo ========================================
echo Web app will be available at:
echo http://127.0.0.1:5051
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo Press 'r' for hot reload
echo Press 'R' for hot restart
echo.

call flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051

pause
