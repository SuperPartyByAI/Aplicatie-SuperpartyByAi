@echo off
REM Quick test without token - just checks if server is up
echo ========================================
echo Quick WA Status Test
echo ========================================
echo.
echo Testing server health...
curl -s https://whats-upp-production.up.railway.app/health
echo.
echo.
echo ========================================
echo.
echo To test WA status, you need the ADMIN_TOKEN.
echo.
echo Get it from Railway:
echo 1. Go to https://railway.app
echo 2. Open your project
echo 3. Click "Variables" tab
echo 4. Copy ADMIN_TOKEN value
echo.
echo Then run:
echo   test-wa-status.bat YOUR_TOKEN_HERE
echo.
echo ========================================
