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
READY_RESPONSE=$(curl -s "${BACKEND_URL}/ready" 2>/dev/null)
if [ $? -eq 0 ]; then
  MODE=$(echo "$READY_RESPONSE" | jq -r '.mode // "unknown"')
  READY=$(echo "$READY_RESPONSE" | jq -r '.ready // false')
  INSTANCE_ID=$(echo "$READY_RESPONSE" | jq -r '.instanceId // "unknown"')
  
  if [ "$MODE" = "active" ] && [ "$READY" = "true" ]; then
    echo -e "   ${GREEN}✅ Mode: $MODE, Ready: $READY${NC}"
    echo "   Instance: $INSTANCE_ID"
  elif [ "$MODE" = "passive" ]; then
    echo -e "   ${YELLOW}⚠️  Mode: $MODE (lock held by another instance)${NC}"
    echo "   Instance: $INSTANCE_ID"
  else
    echo -e "   ${RED}❌ Mode: $MODE, Ready: $READY${NC}"
  fi
else
  echo -e "   ${RED}❌ Cannot reach backend${NC}"
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
echo "   - Monitor logs: railway logs --service whatsapp-backend --follow"
echo "   - Check for restores: grep 'restore.*Firestore' in logs"
echo "   - Verify Railway Volume: SESSIONS_PATH=/data/sessions"
echo "   - Test message: curl -X POST .../api/whatsapp/send-message"
echo ""
echo "📖 Full test guide: whatsapp-backend/TEST_SESSION_STABILITY.md"
echo ""
