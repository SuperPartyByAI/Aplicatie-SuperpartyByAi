#!/bin/bash
# Commands to deploy WhatsApp flow fixes to Railway

set -e  # Exit on error

echo "🚀 Deploying WhatsApp Flow Fixes..."
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# 1. Backend fixes (whatsapp-backend/server.js)
echo "📦 Step 1: Committing backend fixes..."
cd whatsapp-backend

git add server.js
git status

echo ""
read -p "Commit backend fixes? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "Fix: connectingTimeout log - move after isPairingPhaseNow check to prevent misleading message when status is qr_ready after 515"
    echo "✅ Backend fix committed"
else
    echo "⏭️  Skipping backend commit"
fi

cd ..

# 2. Functions fixes (functions/whatsappProxy.js)
echo ""
echo "📦 Step 2: Committing Functions fixes..."
cd functions

git add whatsappProxy.js
git status

echo ""
read -p "Commit Functions fixes? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "Fix: debug mode for super-admin - include backendStatusCode and backendErrorSafe in error response"
    echo "✅ Functions fix committed"
else
    echo "⏭️  Skipping Functions commit"
fi

cd ..

# 3. Push to remote
echo ""
echo "📤 Step 3: Pushing to remote..."
read -p "Push to remote (origin main)? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main
    echo "✅ Pushed to remote"
    echo ""
    echo "🔄 Railway will auto-deploy on push"
    echo "📋 Check Railway logs after deployment to verify commit hash (should not be 892419e6)"
else
    echo "⏭️  Skipping push"
fi

echo ""
echo "✅ Done! Check Railway deployment status."
