#!/bin/bash
# Script pentru testarea ingest-ului în timp real
# Usage: ./test-realtime-ingest.sh

set -e

BACKEND_URL="http://37.27.34.179:8080"
HEALTH_ENDPOINT="${BACKEND_URL}/health"

echo "=== TEST INGEST TIMP REAL ==="
echo ""
echo "1️⃣  Verificare health înainte de mesaj..."
echo ""

# Health check înainte
HEALTH_BEFORE=$(curl -s "${HEALTH_ENDPOINT}")
echo "$HEALTH_BEFORE" | python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("timestamp:", d.get("timestamp"))
print("bootTimestamp:", d.get("bootTimestamp"))
print("connected:", d.get("connected"))
print("lockStatus:", d.get("lockStatus"))
print("dedupe:", d.get("dedupe"))
print("history:", d.get("history"))
PY

echo ""
echo "2️⃣  Așteptare pentru mesaj nou..."
echo "   Trimite un mesaj nou în WhatsApp (ex. 'ping-123')"
echo "   Apoi apasă ENTER pentru a continua..."
read -r

echo ""
echo "3️⃣  Verificare health după mesaj (15 sec delay)..."
sleep 15

HEALTH_AFTER=$(curl -s "${HEALTH_ENDPOINT}")
echo "$HEALTH_AFTER" | python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("timestamp:", d.get("timestamp"))
print("bootTimestamp:", d.get("bootTimestamp"))
print("connected:", d.get("connected"))
print("lockStatus:", d.get("lockStatus"))
print("dedupe:", d.get("dedupe"))
print("history:", d.get("history"))
PY

echo ""
echo "4️⃣  Verificare log-uri backend (ultimele 2 minute)..."
echo ""
echo "Rulează manual în alt terminal:"
echo "  sudo journalctl -u whatsapp-backend --since '2 min ago' -n 200 --no-pager | egrep -i 'Processing|Attempting to save|Message saved|Dedupe|already processed|Skipping message|Firestore write FAIL|error|exception|warn|📨|📩|💾|✅|❌|⚠️'"
echo ""
echo "Sau pentru live monitoring:"
echo "  sudo journalctl -u whatsapp-backend -f --no-pager | egrep -i 'Processing|Attempting to save|Message saved|Dedupe|already processed|Skipping message|Firestore write FAIL|error|exception|warn|📨|📩|💾|✅|❌|⚠️'"
echo ""
