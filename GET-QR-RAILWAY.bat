@echo off
echo ========================================
echo   WhatsApp QR Code - Baileys 6.7.21
echo ========================================
echo.

echo Fetching latest QR code from Railway...
curl -s "https://aplicatie-superpartybyai-production-d067.up.railway.app/api/whatsapp/accounts" -H "Authorization: Bearer dev-token-local" > accounts-railway.json

echo.
echo QR Code saved to: accounts-railway.json
echo.
echo ========================================
echo   HOW TO VIEW QR CODE:
echo ========================================
echo.
echo Option 1 - Browser (EASIEST):
echo   1. Open accounts-railway.json in Notepad
echo   2. Search for "qrCode"
echo   3. Copy ENTIRE value starting with: data:image/png;base64,
echo   4. Paste in Chrome/Edge address bar
echo   5. Press Enter - QR will display!
echo.
echo Option 2 - Extract to PNG:
echo   Run: node extract-qr.js
echo.
echo ========================================
pause
