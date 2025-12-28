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

# Set token
export RAILWAY_TOKEN=998d4e46-c67c-47e2-9eaa-ae4cc806aab1

# Initialize new project
echo "🆕 Creating new Railway project..."
railway init --name "SuperParty Voice AI" || true

# Add variables
echo "🔐 Adding variables..."
railway variables set OPENAI_API_KEY="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"
railway variables set TWILIO_ACCOUNT_SID="AC17c88873d670aab4aa4a50fae230d2df"
railway variables set TWILIO_AUTH_TOKEN="5c6670d39a1dbf46d47ecdaa244b91d9"
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
