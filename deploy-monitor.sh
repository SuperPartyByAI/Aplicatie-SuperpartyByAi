#!/bin/bash

echo "🚀 Deploying Ultra-Fast Monitor to Railway"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
echo "🔐 Checking Railway authentication..."
railway whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to Railway. Please run:"
    echo "   railway login"
    exit 1
fi

echo "✅ Authenticated"
echo ""

# Create monitoring service directory
echo "📁 Creating monitoring service directory..."
mkdir -p /tmp/railway-monitor
cp ultra-fast-monitor.js /tmp/railway-monitor/
cp railway-api.js /tmp/railway-monitor/
cp monitor-package.json /tmp/railway-monitor/package.json

# Create railway.json for monitor
cat > /tmp/railway-monitor/railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node ultra-fast-monitor.js",
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ALWAYS",
    "restartPolicyMaxRetries": 999,
    "healthcheckPath": "/",
    "healthcheckTimeout": 10,
    "healthcheckInterval": 10
  }
}
EOF

echo "✅ Files prepared"
echo ""

# Instructions
echo "📋 Next steps:"
echo ""
echo "1. Create new Railway service:"
echo "   - Go to Railway dashboard"
echo "   - Click 'New Service'"
echo "   - Select 'GitHub Repo'"
echo "   - Choose this repository"
echo "   - Set Root Directory: /tmp/railway-monitor"
echo ""
echo "2. Add environment variables:"
echo "   RAILWAY_TOKEN=<your_token>"
echo "   BACKEND_URL=https://web-production-00dca9.up.railway.app"
echo "   BACKEND_SERVICE_ID=<backend_service_id>"
echo "   COQUI_API_URL=<coqui_url>"
echo "   COQUI_SERVICE_ID=<coqui_service_id>"
echo ""
echo "3. Get Railway token:"
echo "   - Dashboard → Settings → Tokens"
echo "   - Create new token"
echo "   - Copy and add to env vars"
echo ""
echo "4. Get service IDs:"
echo "   railway service list"
echo ""
echo "5. Deploy!"
echo ""
echo "✅ Monitoring service ready to deploy!"
