#!/bin/bash

# Script pentru a obține Firebase ID token și a-l folosi pentru request-uri API
# Usage: ./scripts/get-and-use-token.sh <email> [command] [args...]

EMAIL="$1"
COMMAND="${2:-show}"  # Default: doar afișează token-ul

if [ -z "$EMAIL" ]; then
  echo "❌ Email necesar!"
  echo ""
  echo "Usage:"
  echo "  ./scripts/get-and-use-token.sh <email>                    # Doar obține token-ul"
  echo "  ./scripts/get-and-use-token.sh <email> qr <accountId>      # Obține QR code"
  echo "  ./scripts/get-and-use-token.sh <email> accounts            # Listează conturile"
  echo "  ./scripts/get-and-use-token.sh <email> regenerate <accountId>  # Regenerare QR"
  echo ""
  exit 1
fi

# Setează API key-ul
export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"

echo "🔑 Obținere Firebase ID Token pentru: $EMAIL"
echo ""

# Obține token-ul
cd "$(dirname "$0")/.." || exit 1
OUTPUT=$(node scripts/get-id-token-terminal.js "$EMAIL" 2>&1)

# Extrage token-ul din output (linia care nu este separator și nu este "ID TOKEN:")
TOKEN=$(echo "$OUTPUT" | awk '/ID TOKEN:/{flag=1; next} flag && !/^━━/ && !/^$/ && length($0) > 100 {print; exit}')

if [ -z "$TOKEN" ] || [ "${#TOKEN}" -lt 100 ]; then
  # Încearcă o metodă alternativă - caută linia cu token-ul (JWT format)
  TOKEN=$(echo "$OUTPUT" | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)
  
  if [ -z "$TOKEN" ] || [ "${#TOKEN}" -lt 100 ]; then
    echo "❌ Nu s-a putut obține token-ul!"
    echo ""
    echo "Output complet:"
    echo "$OUTPUT"
    exit 1
  fi
fi

echo ""
echo "✅ Token obținut cu succes!"
echo ""

# Execută comanda dorită
case "$COMMAND" in
  "show")
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "ID TOKEN:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$TOKEN"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Folosește token-ul în request-uri:"
    echo "   curl -H \"Authorization: Bearer $TOKEN\" http://127.0.0.1:8080/api/whatsapp/accounts"
    ;;
  
  "qr")
    ACCOUNT_ID="$3"
    if [ -z "$ACCOUNT_ID" ]; then
      echo "❌ Account ID necesar pentru comanda 'qr'"
      echo "Usage: ./scripts/get-and-use-token.sh <email> qr <accountId>"
      exit 1
    fi
    echo "📱 Obținere QR code pentru account: $ACCOUNT_ID"
    echo ""
    ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/qr/$ACCOUNT_ID'" | jq '.' 2>/dev/null || \
      ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/qr/$ACCOUNT_ID'"
    ;;
  
  "accounts")
    echo "📋 Listează conturile WhatsApp:"
    echo ""
    ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/accounts'" | jq '.' 2>/dev/null || \
      ssh root@37.27.34.179 "curl -sS -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/accounts'"
    ;;
  
  "regenerate")
    ACCOUNT_ID="$3"
    if [ -z "$ACCOUNT_ID" ]; then
      echo "❌ Account ID necesar pentru comanda 'regenerate'"
      echo "Usage: ./scripts/get-and-use-token.sh <email> regenerate <accountId>"
      exit 1
    fi
    echo "🔄 Regenerare QR code pentru account: $ACCOUNT_ID"
    echo ""
    ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/regenerate-qr/$ACCOUNT_ID'" | jq '.' 2>/dev/null || \
      ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8080/api/whatsapp/regenerate-qr/$ACCOUNT_ID'"
    ;;
  
  *)
    echo "❌ Comandă necunoscută: $COMMAND"
    echo ""
    echo "Comenzi disponibile:"
    echo "  show        - Doar afișează token-ul (implicit)"
    echo "  qr          - Obține QR code pentru un account"
    echo "  accounts    - Listează toate conturile"
    echo "  regenerate  - Regenerare QR code pentru un account"
    exit 1
    ;;
esac

echo ""
