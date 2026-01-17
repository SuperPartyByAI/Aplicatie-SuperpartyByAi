#!/bin/bash
# Rollout Commands - Copy-Paste Ready (Values Filled In)
# Project: superparty-frontend
# Railway: https://whats-upp-production.up.railway.app

set -e  # Exit on error

echo "=== ROLLOUT COMMANDS - READY TO RUN ==="
echo ""

# 1. Git verification
echo "1. Git status:"
git fetch origin --prune
git status --short
git log -5 --oneline --decorate
echo ""

# 2. Firebase project (already set)
echo "2. Firebase project:"
firebase projects:list
firebase use superparty-frontend
echo ""

# 3. Railway health check
echo "3. Railway health:"
curl -sS https://whats-upp-production.up.railway.app/health | jq -r '.status' || curl -sS https://whats-upp-production.up.railway.app/health
echo ""

# 4. Firebase secrets (interactive - will prompt for values)
echo "4. Set Firebase secrets:"
echo "   Run manually:"
echo "   firebase functions:secrets:set RAILWAY_WHATSAPP_URL"
echo "   Value: https://whats-upp-production.up.railway.app"
echo ""
echo "   firebase functions:secrets:set GROQ_API_KEY"
echo "   Value: <your-groq-api-key>"
echo ""

# 5. Deploy
echo "5. Deploy Firebase:"
echo "   firebase deploy --only firestore:rules,firestore:indexes,functions"
echo ""

# 6. Railway smoke tests
echo "6. Railway smoke tests:"
BASE="https://whats-upp-production.up.railway.app"
echo "   Health: curl -sS $BASE/health"
echo "   Accounts: curl -sS $BASE/api/whatsapp/accounts"
echo ""

echo "=== End of commands ==="
echo ""
echo "Next: Follow ROLLOUT_FINAL_STEPS.md for detailed acceptance tests"
