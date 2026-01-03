@echo off
echo ========================================
echo SuperParty APK Downloader
echo ========================================
echo.

REM Step 1: Trigger GitHub Actions workflow
echo [1/4] Triggering GitHub Actions build...
curl -X POST ^
  -H "Accept: application/vnd.github.v3+json" ^
  https://api.github.com/repos/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml/dispatches ^
  -d "{\"ref\":\"main\"}"

if %errorlevel% neq 0 (
    echo ERROR: Failed to trigger workflow. You need to authenticate.
    echo.
    echo MANUAL STEPS:
    echo 1. Open: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml
    echo 2. Click "Run workflow" button
    echo 3. Select branch "main"
    echo 4. Click "Run workflow" green button
    echo 5. Wait 5-7 minutes
    echo 6. Run this script again to download
    pause
    exit /b 1
)

echo Workflow triggered! Waiting for build to complete...
echo.

REM Step 2: Wait for build
echo [2/4] Waiting 7 minutes for build to complete...
echo (You can check progress at: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
timeout /t 420 /nobreak

REM Step 3: Get latest run ID
echo.
echo [3/4] Fetching latest build...
curl -s https://api.github.com/repos/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions/workflows/flutter-build.yml/runs?per_page=1 > temp_runs.json

REM Step 4: Get artifact URL
echo [4/4] Downloading APK...
echo.
echo NOTE: GitHub requires authentication to download artifacts.
echo.
echo MANUAL DOWNLOAD:
echo 1. Open: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions
echo 2. Click on the first "Build Flutter APK" workflow (green checkmark)
echo 3. Scroll down to "Artifacts" section
echo 4. Click "superparty-app" to download ZIP
echo 5. Extract app-release.apk from ZIP
echo.

start https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions

echo.
echo ========================================
echo Browser opened! Download APK manually.
echo ========================================
pause
