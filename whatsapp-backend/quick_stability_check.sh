#!/bin/bash
# Quick Stability Check Script

echo "🔍 Quick Baileys Session Stability Check"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get backend URL (default to Railway production)
BACKEND_URL="${WHATSAPP_BACKEND_URL:-https://whats-upp-production.up.railway.app}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

# 1. Check backend mode
echo "1️⃣  Backend Mode:"
READY_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/ready" 2>/dev/null)
READY_RESPONSE=$(curl -s "${BACKEND_URL}/ready" 2>/dev/null)

if [ "$READY_HTTP_CODE" = "200" ] && [ -n "$READY_RESPONSE" ]; then
  # Extract JSON (remove HTML/headers if present)
  JSON_BODY=$(echo "$READY_RESPONSE" | grep -o '{.*}' | head -1 || echo "$READY_RESPONSE")
  
  # Check if it's valid JSON
  if echo "$JSON_BODY" | jq empty 2>/dev/null; then
    MODE=$(echo "$JSON_BODY" | jq -r '.mode // "unknown"')
    READY=$(echo "$JSON_BODY" | jq -r '.ready // false')
    INSTANCE_ID=$(echo "$JSON_BODY" | jq -r '.instanceId // "unknown"')
    
    if [ "$MODE" = "active" ] && [ "$READY" = "true" ]; then
      echo -e "   ${GREEN}✅ Mode: $MODE, Ready: $READY${NC}"
      echo "   Instance: $INSTANCE_ID"
    elif [ "$MODE" = "passive" ]; then
      echo -e "   ${YELLOW}⚠️  Mode: $MODE (lock held by another instance)${NC}"
      echo "   Instance: $INSTANCE_ID"
    else
      echo -e "   ${YELLOW}⚠️  Mode: $MODE, Ready: $READY${NC}"
      echo "   Instance: $INSTANCE_ID"
    fi
  else
    echo -e "   ${YELLOW}⚠️  /ready endpoint returned non-JSON (HTTP $READY_HTTP_CODE)${NC}"
    echo "   Response: $(echo "$READY_RESPONSE" | head -c 100)"
    echo "   (Backend might be old version or endpoint not available)"
  fi
elif [ "$READY_HTTP_CODE" = "404" ]; then
  echo -e "   ${YELLOW}⚠️  /ready endpoint not found (404)${NC}"
  echo "   Backend might be old version - check /health instead"
elif [ "$READY_HTTP_CODE" = "502" ] || [ "$READY_HTTP_CODE" = "503" ]; then
  echo -e "   ${RED}❌ Backend unhealthy (HTTP $READY_HTTP_CODE)${NC}"
  echo "   Check Railway service status"
else
  echo -e "   ${RED}❌ Cannot reach backend (HTTP $READY_HTTP_CODE)${NC}"
fi
echo ""

# 2. Check accounts status (if token provided)
if [ -n "$ADMIN_TOKEN" ]; then
  echo "2️⃣  Accounts Status:"
  ACCOUNTS_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${BACKEND_URL}/api/whatsapp/accounts" 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    ACCOUNT_COUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.accounts | length // 0')
    CONNECTED_COUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.accounts[] | select(.status == "connected") | .id' | wc -l | tr -d ' ')
    QR_READY_COUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.accounts[] | select(.status == "qr_ready") | .id' | wc -l | tr -d ' ')
    NEEDS_QR_COUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.accounts[] | select(.status == "needs_qr") | .id' | wc -l | tr -d ' ')
    
    echo "   Total accounts: $ACCOUNT_COUNT"
    echo -e "   ${GREEN}✅ Connected: $CONNECTED_COUNT${NC}"
    
    if [ "$QR_READY_COUNT" -gt 0 ]; then
      echo -e "   ${YELLOW}⏳ QR Ready: $QR_READY_COUNT${NC}"
    fi
    
    if [ "$NEEDS_QR_COUNT" -gt 0 ]; then
      echo -e "   ${RED}❌ Needs QR: $NEEDS_QR_COUNT${NC}"
      echo "   (This indicates session loss - investigate if frequent)"
    fi
    
    echo ""
    echo "   Accounts details:"
    echo "$ACCOUNTS_RESPONSE" | jq -r '.accounts[] | "     - \(.name // .id): \(.status) (QR: \(if .qrCode then "yes" else "no" end))"'
  else
    echo -e "   ${RED}❌ Cannot fetch accounts (check ADMIN_TOKEN)${NC}"
  fi
else
  echo "2️⃣  Accounts Status:"
  echo "   ⚠️  ADMIN_TOKEN not set - skipping accounts check"
  echo "   Set ADMIN_TOKEN env var to check accounts"
fi
echo ""

# 3. Check health endpoint
echo "3️⃣  Health Check:"
HEALTH_RESPONSE=$(curl -s "${BACKEND_URL}/health" 2>/dev/null)
if [ $? -eq 0 ]; then
  HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status // "unknown"')
  UPTIME=$(echo "$HEALTH_RESPONSE" | jq -r '.uptime // 0')
  
  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "   ${GREEN}✅ Status: $HEALTH_STATUS${NC}"
    echo "   Uptime: $(($UPTIME / 3600))h $(($UPTIME % 3600 / 60))m"
  else
    echo -e "   ${RED}❌ Status: $HEALTH_STATUS${NC}"
  fi
else
  echo -e "   ${RED}❌ Cannot reach /health endpoint${NC}"
fi
echo ""

# 4. Instructions
echo "📋 Next Steps:"
echo "   - Monitor logs: railway logs --service whatsapp-backend | grep -E 'restore|health|stale|connected'"
echo "   - Check for restores: railway logs --service whatsapp-backend | grep 'restore.*Firestore'"
echo "   - Verify Railway Volume: SESSIONS_PATH=/data/sessions"
echo "   - Test message: curl -X POST .../api/whatsapp/send-message"
echo ""
echo "💡 Session Stability Checks:"
echo "   1. Status should be 'connected' (not 'qr_ready' frequent)"
echo "   2. Health should be 'healthy' (not 'unhealthy')"
echo "   3. Restore count should be low (< 5/day = normal)"
echo ""
echo "📖 Full test guide: whatsapp-backend/TEST_SESSION_STABILITY.md"
echo ""
