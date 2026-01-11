#!/bin/bash

# Check Firebase Project and Firestore via CLI
# Requires: firebase-tools installed and logged in

echo "🔍 FIREBASE PROJECT VERIFICATION"
echo "═══════════════════════════════════════════════════════════"

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not installed"
    echo ""
    echo "Install with:"
    echo "  npm install -g firebase-tools"
    echo ""
    exit 1
fi

echo "✅ Firebase CLI installed"
echo ""

# Check current project
echo "📋 Current Project:"
firebase use

echo ""
echo "─────────────────────────────────────────────────────────────"

# List projects
echo "📁 Available Projects:"
firebase projects:list

echo ""
echo "─────────────────────────────────────────────────────────────"

# Check Firestore collections (requires authentication)
echo "🔥 Firestore Collections:"
echo ""
echo "To list collections, run:"
echo "  firebase firestore:indexes"
echo ""
echo "To check counter:"
echo "  firebase firestore:get counters/eventShortCode"
echo ""

# Check functions
echo "─────────────────────────────────────────────────────────────"
echo "⚙️  Cloud Functions:"
firebase functions:list 2>&1 | head -20

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "✅ Verification complete"
echo ""
echo "To deploy:"
echo "  firebase deploy --only functions"
echo "  firebase deploy --only firestore:rules"
echo ""
