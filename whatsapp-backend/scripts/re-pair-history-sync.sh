#!/bin/bash

# Script complet pentru re-pair cu History Sync + backfill
# Usage: ./scripts/re-pair-history-sync.sh <email> <accountId>

EMAIL="$1"
ACCOUNT_ID="$2"

if [ -z "$EMAIL" ] || [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Email și Account ID necesare!"
  echo ""
  echo "Usage:"
  echo "  ./scripts/re-pair-history-sync.sh <email> <accountId>"
  echo ""
  echo "Exemplu:"
  echo "  ./scripts/re-pair-history-sync.sh superpartybyai@gmail.com account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"
  exit 1
fi

echo "🔄 Re-pair cu History Sync pentru account: $ACCOUNT_ID"
echo "📧 Email: $EMAIL"
echo ""

# Setează API key-ul
export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"

# Obține token-ul Firebase
cd "$(dirname "$0")/.." || exit 1
echo "🔑 Obținere Firebase ID Token..."
TOKEN=$(node scripts/get-id-token-terminal.js "$EMAIL" 2>/dev/null | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)

if [ -z "$TOKEN" ]; then
  echo "❌ Nu s-a putut obține token-ul!"
  exit 1
fi

echo "✅ Token obținut"
echo ""

# Pasul 1: Verifică indexul threads
echo "📊 Pasul 1: Verificare index threads..."
INDEX_ERRORS=$(ssh root@37.27.34.179 "journalctl -u whatsapp-backend --since '60 minutes ago' --no-pager | grep -E 'threads.*FAILED_PRECONDITION|create_composite=.*threads' | tail -n 20")

if [ -n "$INDEX_ERRORS" ]; then
  echo "⚠️  Atenție: Există erori de index pentru threads!"
  echo "$INDEX_ERRORS"
  echo ""
  echo "💡 Trebuie să creezi/activezi indexul în Firebase Console"
  exit 1
else
  echo "✅ Index threads OK"
fi

echo ""

# Pasul 2: Inițiază re-pair
echo "🔄 Pasul 2: Inițiere re-pair (regenerare QR)..."
REGEN_RESULT=$(ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/regenerate-qr/$ACCOUNT_ID | python3 -m json.tool")
echo "$REGEN_RESULT"
echo ""

# Pasul 3: Obține QR-ul (în buclă)
echo "📱 Pasul 3: Obținere QR code (poate dura câteva secunde)..."
QR_OBTAINED=false
for i in {1..20}; do
  echo "--- try $i"
  QR_RESULT=$(ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/qr/$ACCOUNT_ID 2>/dev/null")
  
  # Verifică dacă este JSON valid (nu HTML)
  if echo "$QR_RESULT" | python3 -m json.tool >/dev/null 2>&1; then
    echo "$QR_RESULT" | python3 -m json.tool
    QR_OBTAINED=true
    break
  else
    # Verifică dacă este HTML cu mesaj de așteptare
    if echo "$QR_RESULT" | grep -q "QR Code Not Ready"; then
      echo "⏳ QR code încă nu este gata..."
    else
      echo "$QR_RESULT" | head -5
    fi
  fi
  
  sleep 3
done

if [ "$QR_OBTAINED" = false ]; then
  echo ""
  echo "⚠️  QR code nu a apărut după 20 de încercări"
  echo "💡 Verifică logurile pentru detalii:"
  echo "   ssh root@37.27.34.179 'journalctl -u whatsapp-backend -f'"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ QR CODE OBTINUT!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 SCANEAZĂ QR-UL CU TELEFONUL:"
echo "   WhatsApp → Linked devices → Link a device"
echo ""
echo "⏳ Aștept scanarea QR-ului..."
echo "   (Monitorizez logurile pentru History Sync)"
echo ""

# Pasul 4: Monitorizează History Sync
echo "📊 Pasul 4: Monitorizare History Sync (apasă Ctrl+C când apare)..."
echo ""

ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f | egrep -i 'messaging-history.set|history sync|history.*saved|history.*complete|app state sync'"
