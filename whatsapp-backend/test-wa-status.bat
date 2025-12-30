@echo off
REM Test WA Status from Windows
REM Usage: test-wa-status.bat [ADMIN_TOKEN]

if "%1"=="" (
    echo Usage: test-wa-status.bat YOUR_ADMIN_TOKEN
    echo.
    echo Example: test-wa-status.bat dev-token-abc123
    exit /b 1
)

set ADMIN_TOKEN=%1
set BAILEYS_BASE_URL=https://whats-upp-production.up.railway.app

echo Testing WA Status...
echo Base URL: %BAILEYS_BASE_URL%
echo Token: %ADMIN_TOKEN:~0,10%...
echo.

node scripts\test-wa-status.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Test completed successfully!
    echo Check wa-status.json for full response
    echo ========================================
) else (
    echo.
    echo ========================================
    echo Test failed! Check error messages above
    echo ========================================
)
