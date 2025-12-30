@echo off
echo ========================================
echo Deploy Aplicatie pe Firebase Hosting
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

echo [1/3] Build aplicatie React...
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
echo [2/3] Build reusit!
echo ========================================
echo.

cd ..\..

echo [3/3] Deploy pe Firebase Hosting...
echo.
firebase deploy --only hosting

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Aplicatia a fost deployata!
    echo ========================================
    echo.
    echo Aplicatie LIVE: https://superparty-frontend.web.app/home
    echo.
    echo Deschid aplicatia in browser...
    start https://superparty-frontend.web.app/home
    echo.
) else (
    echo.
    echo EROARE la deploy!
    echo.
)

pause
