@echo off
echo ========================================
echo   Deploy Firebase Functions - SuperParty
echo ========================================
echo.
echo Deploying Cloud Functions...
echo.

cd /d "%~dp0"

firebase deploy --only functions

echo.
echo ========================================
echo   Deploy Complete!
echo ========================================
echo.
echo Check Firebase Console to verify:
echo https://console.firebase.google.com/project/superparty-frontend/functions
echo.
pause
