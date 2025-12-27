#!/bin/bash

# Script pentru deploy Firebase cu token

echo "🔥 Firebase Deploy Script"
echo "========================="
echo ""

# Check if token is provided
if [ -z "$1" ]; then
    echo "❌ Eroare: Token-ul Firebase lipsește!"
    echo ""
    echo "Cum obții token-ul:"
    echo "1. Rulează în Git Bash LOCAL (pe Windows):"
    echo "   firebase login:ci"
    echo ""
    echo "2. Copiază token-ul generat"
    echo ""
    echo "3. Rulează acest script cu token-ul:"
    echo "   ./firebase-deploy.sh YOUR_TOKEN_HERE"
    echo ""
    exit 1
fi

FIREBASE_TOKEN=$1

echo "✅ Token primit"
echo ""

# Navigate to kyc-app
cd kyc-app/kyc-app || exit 1

echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""

echo "🚀 Deploying to Firebase..."
firebase deploy --only hosting --token "$FIREBASE_TOKEN"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deploy successful!"
    echo ""
    echo "🌐 Aplicația ta este live pe Firebase!"
else
    echo ""
    echo "❌ Deploy failed!"
    exit 1
fi
