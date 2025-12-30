@echo off
echo ========================================
echo Deploy Firestore Rules
echo ========================================
echo.

REM Deschide Firebase Console in browser
echo Deschid Firebase Console in browser...
start https://console.firebase.google.com/project/superparty-frontend/firestore/rules

echo.
echo ========================================
echo INSTRUCTIUNI:
echo ========================================
echo 1. Autentifica-te cu superpartybyai@gmail.com
echo 2. Click pe tab "Rules"
echo 3. Sterge regulile existente
echo 4. Copiaza si lipeste regulile din firestore.rules
echo 5. Click "Publish"
echo.
echo Fisierul cu reguli: firestore.rules
echo.
echo Apasa orice tasta pentru a deschide fisierul firestore.rules...
pause >nul

REM Deschide fisierul firestore.rules
notepad firestore.rules

echo.
echo ========================================
echo Deploy complet!
echo ========================================
echo.
pause
