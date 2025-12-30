@echo off
echo ================================================================
echo   DEPLOY UI FIX - Buton Disconnect WhatsApp
echo ================================================================
echo.

cd kyc-app\kyc-app

echo 1. Building UI...
call npm run build

if %errorlevel% neq 0 (
  echo.
  echo ERROR: Build failed!
  pause
  exit /b 1
)

echo.
echo 2. Deploying to Firebase...
call firebase deploy --only hosting

if %errorlevel% neq 0 (
  echo.
  echo ERROR: Deploy failed!
  echo.
  echo Posibile cauze:
  echo   - Nu esti autentificat: ruleaza 'firebase login'
  echo   - Nu ai permisiuni pe project 'superparty-frontend'
  echo.
  pause
  exit /b 1
)

echo.
echo ================================================================
echo   DEPLOYMENT COMPLETE
echo ================================================================
echo.
echo Verifica in browser (hard refresh: Ctrl+Shift+R):
echo   https://superparty-frontend.web.app/chat-clienti
echo.
echo Butonul '🔌 Deconecteaza Cont' trebuie sa fie vizibil
echo pentru fiecare cont cu status 'connected'.
echo.
pause
