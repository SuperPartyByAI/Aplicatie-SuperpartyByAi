#!/bin/bash

# 🚀 Deploy Script - Automated Firebase Hosting Deploy
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🔨 Building application..."
npm run build

echo ""
echo "📦 Deploying to Firebase Hosting..."

# Try to get token from Firebase Secret Manager
echo "🔐 Retrieving deploy token from Firebase Secret Manager..."
DEPLOY_TOKEN=$(firebase functions:secrets:access DEPLOY_TOKEN 2>/dev/null || echo "")

if [ -n "$DEPLOY_TOKEN" ]; then
  echo "✅ Token retrieved from Firebase Secret Manager"
  firebase deploy --only hosting --token "$DEPLOY_TOKEN"
elif [ -f .env.local ]; then
  # Fallback to .env.local
  echo "⚠️  Using token from .env.local (fallback)"
  source .env.local
  
  if [ -z "$FIREBASE_TOKEN" ]; then
    echo "❌ FIREBASE_TOKEN not found in .env.local"
    exit 1
  fi
  
  firebase deploy --only hosting --token "$FIREBASE_TOKEN"
else
  echo "❌ No deploy token found!"
  echo "Please run: firebase functions:secrets:set DEPLOY_TOKEN"
  exit 1
fi

echo ""
echo "✅ Deploy complete!"
echo "🌐 Live URL: https://superparty-frontend.web.app"
