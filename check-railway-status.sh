#!/bin/bash
# Check Railway Service Status and Configuration
# Usage: ./check-railway-status.sh [RAILWAY_TOKEN]

set -e

RAILWAY_TOKEN="${1:-$RAILWAY_TOKEN}"
SERVICE_URL="whats-upp-production.up.railway.app"
PROJECT_ID="be379927-9034-4a4d-8e35-4fbdfe258fc0"
SERVICE_ID="bac72d7a-eeca-4dda-acd9-6b0496a2184f"

echo "🔍 Railway Service Status Check"
echo "================================="
echo ""
echo "🌐 Service URL: https://$SERVICE_URL"
echo ""

# Check if service is responding
echo "1️⃣ Checking service health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "https://$SERVICE_URL/health" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Service is responding (HTTP $HTTP_CODE)"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
    echo "❌ Service is not responding (HTTP $HTTP_CODE)"
    echo "   This usually means:"
    echo "   - Application crashed on startup"
    echo "   - Missing persistent volume (cannot write sessions)"
    echo "   - Missing SESSIONS_PATH environment variable"
    echo "   - Application failed health check"
elif [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Cannot reach service (connection failed)"
else
    echo "⚠️  Unexpected HTTP code: $HTTP_CODE"
    echo "$BODY"
fi
echo ""

# If we have Railway token, check configuration
if [ -n "$RAILWAY_TOKEN" ]; then
    echo "2️⃣ Checking Railway configuration (requires token)..."
    
    # Login
    railway login --browserless --token "$RAILWAY_TOKEN" >/dev/null 2>&1 || {
        echo "❌ Failed to authenticate with Railway token"
        exit 1
    }
    
    # Link to project
    railway link --project "$PROJECT_ID" >/dev/null 2>&1 || true
    
    echo ""
    echo "📦 Volumes:"
    railway volume list 2>/dev/null | grep -E "(whatsapp-sessions|/data/sessions)" || echo "   ⚠️  No volumes found (CRITICAL - sessions will be lost on restart!)"
    
    echo ""
    echo "🔧 Environment Variables:"
    railway variables 2>/dev/null | grep -E "(SESSIONS_PATH|RAILWAY_VOLUME)" || echo "   ⚠️  SESSIONS_PATH not found (CRITICAL - app cannot find session directory!)"
    
    echo ""
    echo "📋 Recent Deployments:"
    railway logs --tail 50 2>/dev/null | grep -E "(SESSIONS_PATH|writable|CRITICAL|Error|error)" | tail -10 || echo "   (No relevant logs found)"
    
else
    echo "2️⃣ Skipping Railway config check (no token provided)"
    echo "   To check configuration, run:"
    echo "   ./check-railway-status.sh YOUR_RAILWAY_TOKEN"
fi

echo ""
echo "================================="
echo "📝 Recommendations:"
echo ""
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Service is DOWN - Fix required:"
    echo "   1. Create persistent volume at /data/sessions"
    echo "   2. Set SESSIONS_PATH=/data/sessions environment variable"
    echo "   3. Redeploy service"
    echo ""
    echo "   Run setup script: ./setup-railway-with-token.sh YOUR_TOKEN"
else
    HEALTH_DATA=$(echo "$BODY" | jq -r '.sessions_dir_writable // "unknown"' 2>/dev/null)
    if [ "$HEALTH_DATA" != "true" ]; then
        echo "⚠️  Service is UP but sessions directory is NOT writable"
        echo "   - Check volume mount path"
        echo "   - Verify SESSIONS_PATH matches volume mount path"
    else
        echo "✅ Service appears healthy!"
    fi
fi
