#!/bin/bash

# Script pentru rulare backfill după History Sync
# Usage: ./scripts/run-backfill.sh <email> <accountId>

EMAIL="$1"
ACCOUNT_ID="$2"

if [ -z "$EMAIL" ] || [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Email și Account ID necesare!"
  echo ""
  echo "Usage:"
  echo "  ./scripts/run-backfill.sh <email> <accountId>"
  exit 1
fi

export FIREBASE_API_KEY="AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0"

cd "$(dirname "$0")/.." || exit 1
echo "🔑 Obținere Firebase ID Token..."
TOKEN=$(node scripts/get-id-token-terminal.js "$EMAIL" 2>/dev/null | grep -E "^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$" | head -n 1)

if [ -z "$TOKEN" ]; then
  echo "❌ Nu s-a putut obține token-ul!"
  exit 1
fi

echo "✅ Token obținut"
echo ""
echo "🔄 Rulare backfill pentru account: $ACCOUNT_ID"
echo ""

ssh root@37.27.34.179 "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' http://127.0.0.1:8080/api/whatsapp/backfill/$ACCOUNT_ID | python3 -m json.tool"
