#!/bin/bash
set -e

echo "🚀 v7.0 - Deploy Voice AI complet automat"
echo ""

cd /workspaces/superparty-ai-backend

# Install Railway CLI if needed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Set token (do NOT hardcode; use env)
export RAILWAY_TOKEN="${RAILWAY_TOKEN:-<RAILWAY_TOKEN>}"

# Initialize new project
echo "🆕 Creating new Railway project..."
railway init --name "SuperParty Voice AI" || true

# Add variables
echo "🔐 Adding variables..."
railway variables set OPENAI_API_KEY="<OPENAI_API_KEY>"
railway variables set TWILIO_ACCOUNT_SID="AC17c88873d670aab4aa4a50fae230d2df"
railway variables set TWILIO_AUTH_TOKEN="<TWILIO_AUTH_TOKEN>"
railway variables set TWILIO_PHONE_NUMBER="+12182204425"
railway variables set COQUI_API_URL="https://web-production-00dca9.up.railway.app"
railway variables set NODE_ENV="production"
railway variables set PORT="5001"

# Deploy
echo "🚀 Deploying..."
railway up --detach

# Get URL
echo "🌐 Getting service URL..."
sleep 10
SERVICE_URL=$(railway domain 2>&1 | grep -o 'https://[^[:space:]]*' | head -1)

if [ -z "$SERVICE_URL" ]; then
    echo "⚠️  Generating domain..."
    railway domain
    sleep 5
    SERVICE_URL=$(railway domain 2>&1 | grep -o 'https://[^[:space:]]*' | head -1)
fi

echo "✅ Service URL: $SERVICE_URL"

# Update BACKEND_URL
echo "🔄 Updating BACKEND_URL..."
railway variables set BACKEND_URL="$SERVICE_URL"

# Configure Twilio
echo "📞 Configuring Twilio..."
node /workspaces/Aplicatie-SuperpartyByAi/railway-monitor/update-twilio-webhook.js "$SERVICE_URL"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLET!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🎤 Voice AI URL: $SERVICE_URL"
echo "📞 Twilio: Configurat"
echo "🎯 Sună la: +1 (218) 220-4425"
echo ""
echo "Voce: Kasya (Coqui XTTS)"
echo ""
