#!/bin/bash
set -e

echo "🚀 AUTO-DEPLOY Voice AI Backend"
echo ""

# Check if railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

cd /workspaces/Aplicatie-SuperpartyByAi/voice-backend

echo "📦 Initializing Railway project..."
railway init --name "SuperParty Voice AI"

echo "🔐 Adding environment variables..."
railway variables set OPENAI_API_KEY="<OPENAI_API_KEY>"
railway variables set TWILIO_ACCOUNT_SID="AC17c88873d670aab4aa4a50fae230d2df"
railway variables set TWILIO_AUTH_TOKEN="<TWILIO_AUTH_TOKEN>"
railway variables set TWILIO_PHONE_NUMBER="+12182204425"
railway variables set COQUI_API_URL="https://web-production-00dca9.up.railway.app"
railway variables set NODE_ENV="production"
railway variables set PORT="5001"

echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployed!"
echo ""
echo "Getting service URL..."
RAILWAY_URL=$(railway domain)

echo ""
echo "Updating BACKEND_URL..."
railway variables set BACKEND_URL="https://$RAILWAY_URL"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ VOICE AI DEPLOYED!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Service URL: https://$RAILWAY_URL"
echo ""
echo "NEXT: Configure Twilio webhook:"
echo "https://console.twilio.com/"
echo "Phone Numbers → +1 (218) 220-4425"
echo "A call comes in: https://$RAILWAY_URL/api/voice/incoming"
echo ""
echo "Then call: +1 (218) 220-4425"
echo ""
