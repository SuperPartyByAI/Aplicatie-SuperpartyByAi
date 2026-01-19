#!/bin/bash
# test-whatsapp-flow.sh - Test WhatsApp Flow End-to-End

RAILWAY_URL="${RAILWAY_URL:-https://whats-upp-production.up.railway.app}"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-token-test}"

echo "=== Test WhatsApp Flow ==="
echo "Railway URL: $RAILWAY_URL"
echo "Admin Token: ${ADMIN_TOKEN:0:10}..."
echo ""

REQUEST_ID="test_$(date +%s)_$$"

# 1. Health check
echo "1️⃣  Health Check..."
HEALTH=$(curl -sS -H "X-Request-ID: $REQUEST_ID" "$RAILWAY_URL/health")
STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
WA_MODE=$(echo "$HEALTH" | jq -r '.waMode // "unknown"')
ACCOUNTS_TOTAL=$(echo "$HEALTH" | jq -r '.accounts.total // 0')

echo "   Status: $STATUS"
echo "   WA Mode: $WA_MODE"
echo "   Accounts Total: $ACCOUNTS_TOTAL"
echo "   Request ID: $REQUEST_ID"

if [ "$STATUS" != "healthy" ]; then
  echo "   ❌ Health check failed"
  exit 1
fi
echo "   ✅ Health check passed"
echo ""

# 2. Get accounts
echo "2️⃣  GET /api/whatsapp/accounts..."
ACCOUNTS_RESP=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" -H "X-Request-ID: $REQUEST_ID" "$RAILWAY_URL/api/whatsapp/accounts")
ACCOUNTS_SUCCESS=$(echo "$ACCOUNTS_RESP" | jq -r '.success // false')
ACCOUNTS_COUNT=$(echo "$ACCOUNTS_RESP" | jq -r '.accounts | length // 0')
RESP_WA_MODE=$(echo "$ACCOUNTS_RESP" | jq -r '.waMode // "unknown"')
RESP_LOCK_REASON=$(echo "$ACCOUNTS_RESP" | jq -r '.lockReason // "none"')
RESP_REQUEST_ID=$(echo "$ACCOUNTS_RESP" | jq -r '.requestId // "none"')

echo "   Success: $ACCOUNTS_SUCCESS"
echo "   Accounts Count: $ACCOUNTS_COUNT"
echo "   WA Mode: $RESP_WA_MODE"
echo "   Lock Reason: $RESP_LOCK_REASON"
echo "   Response Request ID: $RESP_REQUEST_ID"

if [ "$ACCOUNTS_SUCCESS" != "true" ]; then
  echo "   ❌ Get accounts failed"
  echo "   Response: $ACCOUNTS_RESP"
  exit 1
fi

if [ "$RESP_WA_MODE" = "passive" ]; then
  echo "   ⚠️  Backend în PASSIVE mode (lockReason: $RESP_LOCK_REASON)"
  echo "   ℹ️  Accounts pot fi 0 dacă nu există în Firestore"
fi

echo "   ✅ Get accounts passed"
echo ""

# 3. Test regenerate (dacă există account)
ACCOUNT_ID=$(echo "$ACCOUNTS_RESP" | jq -r '.accounts[0].id // empty')
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
  echo "3️⃣  Test Regenerate QR pentru account: $ACCOUNT_ID..."
  REGEN_RESP=$(curl -sS -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "X-Request-ID: $REQUEST_ID" "$RAILWAY_URL/api/whatsapp/regenerate-qr/$ACCOUNT_ID")
  REGEN_SUCCESS=$(echo "$REGEN_RESP" | jq -r '.success // false')
  REGEN_STATUS=$(echo "$REGEN_RESP" | jq -r '.status // "unknown"')
  REGEN_MESSAGE=$(echo "$REGEN_RESP" | jq -r '.message // "none"')
  REGEN_REQUEST_ID=$(echo "$REGEN_RESP" | jq -r '.requestId // "none"')
  
  echo "   Success: $REGEN_SUCCESS"
  echo "   Status: $REGEN_STATUS"
  echo "   Message: $REGEN_MESSAGE"
  echo "   Request ID: $REGEN_REQUEST_ID"
  
  if [ "$REGEN_SUCCESS" = "true" ] || [ "$REGEN_STATUS" = "already_in_progress" ]; then
    echo "   ✅ Regenerate QR passed"
  else
    echo "   ❌ Regenerate QR failed"
    echo "   Response: $REGEN_RESP"
  fi
  echo ""
else
  echo "3️⃣  Skip Regenerate QR (nu există account)"
  echo ""
fi

echo "=== Rezumat ==="
echo "✅ Health: $STATUS"
echo "✅ WA Mode: $WA_MODE"
echo "✅ Accounts: $ACCOUNTS_COUNT"
echo "✅ Request ID: $REQUEST_ID (pentru corelare în logs)"
