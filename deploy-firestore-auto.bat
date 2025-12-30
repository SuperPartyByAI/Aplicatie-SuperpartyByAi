@echo off
echo ========================================
echo Deploy Firestore Rules - AUTOMATIC
echo ========================================
echo.

REM Verifica daca suntem in directorul corect
if not exist firebase.json (
    echo EROARE: firebase.json nu exista in directorul curent!
    echo Ruleaza acest script din: C:\Users\ursac\Aplicatie-SuperpartyByAi\
    echo.
    pause
    exit /b 1
)

echo Directorul corect detectat!
echo.

REM Deschide Firebase Console
echo Deschid Firebase Console...
start https://console.firebase.google.com/project/superparty-frontend/firestore/rules

echo.
echo Astept 3 secunde...
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo Rulez: firebase deploy --only firestore
echo ========================================
echo.

firebase deploy --only firestore

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Regulile au fost deployate!
    echo ========================================
    echo.
    echo Verifica: https://console.firebase.google.com/project/superparty-frontend/firestore/rules
    echo Aplicatie: https://superparty-frontend.web.app/home
    echo.
) else (
    echo.
    echo ========================================
    echo EROARE la deploy!
    echo ========================================
    echo.
    echo Incearca deploy manual:
    echo 1. Deschide: https://console.firebase.google.com/project/superparty-frontend/firestore/rules
    echo 2. Copiaza continutul din firestore.rules
    echo 3. Lipeste in editor
    echo 4. Click "Publish"
    echo.
)

pause
