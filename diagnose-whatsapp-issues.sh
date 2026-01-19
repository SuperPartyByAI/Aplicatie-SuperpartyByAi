#!/bin/bash
# WhatsApp Issues Diagnostic Script

set -e

RAILWAY_URL="https://whats-upp-production.up.railway.app"
FIREBASE_PROJECT="superparty-frontend"

echo "=== WhatsApp Issues Diagnostic ==="
echo ""

# 1. Check Railway Health
echo "1. Checking Railway Backend Health..."
HEALTH=$(curl -sS "$RAILWAY_URL/health")
echo "$HEALTH" | jq -r '.status, .firestore.status, .lock.owner, .waMode // "unknown"'
echo ""

# 2. Check if backend is in PASSIVE mode
echo "2. Checking WA Mode..."
WA_MODE=$(echo "$HEALTH" | jq -r '.waMode // "unknown"')
if [ "$WA_MODE" = "passive" ]; then
  echo "⚠️  WARNING: Backend is in PASSIVE mode!"
  echo "   This will cause QR regeneration to fail."
  echo "   Lock owner: $(echo "$HEALTH" | jq -r '.lock.owner')"
else
  echo "✅ Backend is in ACTIVE mode"
fi
echo ""

# 3. Check accounts count
echo "3. Checking Accounts..."
ACCOUNTS_COUNT=$(echo "$HEALTH" | jq -r '.accounts.total // 0')
CONNECTED_COUNT=$(echo "$HEALTH" | jq -r '.accounts.connected // 0')
echo "   Total accounts: $ACCOUNTS_COUNT"
echo "   Connected: $CONNECTED_COUNT"
echo ""

# 4. Check Firestore accounts (if Firebase CLI available)
if command -v firebase &> /dev/null; then
  echo "4. Checking Firestore Accounts..."
  echo "   (This requires Firebase CLI and authentication)"
  echo ""
  echo "   To check manually:"
  echo "   firebase firestore:get accounts --limit 10"
  echo ""
else
  echo "4. Firebase CLI not available - skipping Firestore check"
  echo ""
fi

# 5. Test regenerate QR endpoint (requires auth token)
echo "5. Testing Regenerate QR Endpoint..."
echo "   (This requires authentication token)"
echo ""
echo "   To test manually:"
echo "   curl -X POST \\"
echo "     \"https://us-central1-${FIREBASE_PROJECT}.cloudfunctions.net/whatsappProxyRegenerateQr/ACCOUNT_ID\" \\"
echo "     -H \"Authorization: Bearer YOUR_TOKEN\" \\"
echo "     -H \"Content-Type: application/json\""
echo ""

# 6. Recommendations
echo "=== Recommendations ==="
echo ""

if [ "$WA_MODE" = "passive" ]; then
  echo "🔴 CRITICAL: Backend is in PASSIVE mode"
  echo "   - QR regeneration will fail with 500 errors"
  echo "   - Check Railway logs for lock acquisition issues"
  echo "   - Verify only one Railway instance is running"
  echo ""
fi

if [ "$ACCOUNTS_COUNT" -eq 0 ]; then
  echo "⚠️  No accounts found"
  echo "   - This is normal if no accounts have been created"
  echo "   - If you just created an account, check Firestore"
  echo ""
fi

echo "Next steps:"
echo "1. Check Railway logs for detailed error messages"
echo "2. Verify account exists in Firestore"
echo "3. Check if backend is in PASSIVE mode (if yes, investigate lock)"
echo "4. Review WHATSAPP_ISSUES_DIAGNOSTIC.md for detailed analysis"
echo ""
