@echo off
echo Fetching QR code for account_1767011755513...
echo.

curl -s "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV3/api/whatsapp/accounts" > accounts.json

echo QR Code URL saved to accounts.json
echo.
echo Open accounts.json and search for "account_1767011755513"
echo Copy the "qrCode" value (starts with data:image/png;base64,...)
echo Paste in browser address bar to display QR
echo.
pause
