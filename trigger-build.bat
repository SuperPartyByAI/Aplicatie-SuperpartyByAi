@echo off
echo ========================================
echo SuperParty - Trigger Build
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Making small change to trigger build...
cd superparty_flutter
echo. >> README.md

echo [2/3] Committing and pushing...
git add README.md
git commit -m "trigger: Build APK"
git push origin main

if %errorlevel% neq 0 (
    echo ERROR: Push failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Build triggered! Opening GitHub Actions...
timeout /t 2 /nobreak > nul
start https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions

echo.
echo ========================================
echo SUCCESS! Build started.
echo ========================================
echo.
echo Wait 5-7 minutes, then:
echo 1. Refresh the GitHub Actions page
echo 2. Click on "Build Flutter APK" (green checkmark)
echo 3. Scroll down to "Artifacts"
echo 4. Click "superparty-app" to download
echo.
pause
