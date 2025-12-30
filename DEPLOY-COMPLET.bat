@echo off
echo ========================================
echo Deploy COMPLET - Firestore + Hosting
echo ========================================
echo.

REM Verifica daca suntem in directorul corect
if not exist firebase.json (
    echo EROARE: firebase.json nu exista!
    echo Ruleaza din: C:\Users\ursac\Aplicatie-SuperpartyByAi\
    echo.
    pause
    exit /b 1
)

echo [1/4] Build aplicatie React...
echo.
cd kyc-app\kyc-app
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo EROARE la build!
    pause
    exit /b 1
)

echo.
echo ========================================
echo [2/4] Build reusit!
echo ========================================
echo.

cd ..\..

echo [3/4] Deploy Firestore Rules...
echo.
firebase deploy --only firestore

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo EROARE la deploy Firestore!
    pause
    exit /b 1
)

echo.
echo ========================================
echo [4/4] Deploy Hosting...
echo ========================================
echo.
firebase deploy --only hosting

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Deploy complet finalizat!
    echo ========================================
    echo.
    echo Firestore Rules: https://console.firebase.google.com/project/superparty-frontend/firestore/rules
    echo Aplicatie LIVE: https://superparty-frontend.web.app/home
    echo.
    echo Deschid aplicatia in browser...
    start https://superparty-frontend.web.app/home
    echo.
) else (
    echo.
    echo EROARE la deploy Hosting!
    echo.
)

pause
