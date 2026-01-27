#!/bin/bash

# Script simplu pentru verificare și afișare QR code
# Usage: ./scripts/check-qr-simple.sh

EMAIL="superpartybyai@gmail.com"
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"

export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"

cd "$(dirname "$0")/.." || exit 1

echo "🔍 Verificare QR code..."
echo "📧 Email: $EMAIL"
echo "🆔 Account: $ACCOUNT_ID"
echo ""

# Obține token-ul
TOKEN=$(node scripts/get-id-token-terminal.js "$EMAIL" 2>/dev/null | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)

if [ -z "$TOKEN" ]; then
  echo "❌ Nu s-a putut obține token-ul!"
  exit 1
fi

# Verifică QR-ul
QR_RESULT=$(ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/qr/$ACCOUNT_ID 2>/dev/null")

# Verifică dacă este HTML cu QR code (QR disponibil)
if echo "$QR_RESULT" | grep -q "data:image/png;base64"; then
  # Extrage QR-ul din HTML
  QR_IMAGE=$(echo "$QR_RESULT" | grep -o 'data:image/png;base64,[^"]*' | head -1)
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ QR CODE DISPONIBIL!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📱 LINK QR CODE:"
  echo "   http://37.27.34.179:8080/api/whatsapp/qr/$ACCOUNT_ID"
  echo ""
  echo "💡 Deschide link-ul de mai sus în browser pentru a vedea QR-ul"
  echo "   SAU folosește comanda:"
  echo "   ./scripts/get-and-use-token.sh superpartybyai@gmail.com qr $ACCOUNT_ID"
  echo ""
  echo "📱 INSTRUCȚIUNI:"
  echo "   1. Deschide WhatsApp pe telefon"
  echo "   2. Mergi la: Settings → Linked devices"
  echo "   3. Apasă pe 'Link a device'"
  echo "   4. Scanează QR-ul"
  echo ""
  exit 0
fi

# Verifică dacă este JSON valid (QR disponibil)
if echo "$QR_RESULT" | python3 -m json.tool >/dev/null 2>&1; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ QR CODE DISPONIBIL!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Extrage și afișează QR-ul
  QR_DATA=$(echo "$QR_RESULT" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('qrCode', data.get('qr', 'N/A')))" 2>/dev/null)
  QR_URL=$(echo "$QR_RESULT" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('qrUrl', 'N/A'))" 2>/dev/null)
  
  if [ "$QR_URL" != "N/A" ] && [ -n "$QR_URL" ]; then
    echo "📱 LINK QR CODE:"
    echo "   $QR_URL"
    echo ""
    echo "💡 Deschide link-ul în browser pentru a scana QR-ul"
    echo ""
  fi
  
  if [ "$QR_DATA" != "N/A" ] && [ -n "$QR_DATA" ]; then
    echo "📱 QR CODE DATA:"
    echo "$QR_DATA"
    echo ""
  fi
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📱 INSTRUCȚIUNI:"
  echo "   1. Deschide WhatsApp pe telefon"
  echo "   2. Mergi la: Settings → Linked devices"
  echo "   3. Apasă pe 'Link a device'"
  echo "   4. Scanează QR-ul de mai sus"
  echo ""
  
  # Afișează JSON complet pentru referință
  echo "📄 Detalii complete:"
  echo "$QR_RESULT" | python3 -m json.tool
  echo ""
else
  # Verifică statusul
  STATUS_RESULT=$(ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/accounts 2>/dev/null")
  STATUS=$(echo "$STATUS_RESULT" | python3 -c "import sys, json; data = json.load(sys.stdin); accounts = data.get('accounts', []); acc = next((a for a in accounts if a.get('id') == '$ACCOUNT_ID'), None); print(acc.get('status', 'unknown') if acc else 'not found')" 2>/dev/null)
  
  echo "⏳ QR code încă nu este disponibil"
  echo ""
  echo "📊 Status account: $STATUS"
  echo ""
  echo "💡 QR-ul se generează în timpul procesului de re-pair."
  echo "   Așteaptă câteva minute și rulează din nou:"
  echo "   ./scripts/check-qr-simple.sh"
  echo ""
  echo "   SAU folosește script-ul automat:"
  echo "   ./scripts/wait-for-qr.sh $EMAIL $ACCOUNT_ID"
  echo ""
fi
