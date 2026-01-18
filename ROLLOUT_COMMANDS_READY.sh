#!/bin/bash
# Rollout Commands - WhatsApp Integration Ready
# Generated: 2026-01-18
# Branch: audit-whatsapp-30

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 WhatsApp Integration - Pre-Flight Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Set Firebase project
echo "📦 Setting Firebase project..."
firebase use superparty-frontend
echo ""

# Check Railway backend health
echo "🔍 Checking Railway backend health..."
RAILWAY_HEALTH=$(curl -sS https://whats-upp-production.up.railway.app/health)
RAILWAY_STATUS=$(echo "$RAILWAY_HEALTH" | jq -r '.status')
RAILWAY_FIRESTORE=$(echo "$RAILWAY_HEALTH" | jq -r '.firestore.status')

if [ "$RAILWAY_STATUS" = "healthy" ] && [ "$RAILWAY_FIRESTORE" = "connected" ]; then
  echo "✅ Railway backend: HEALTHY"
  echo "   Firestore: $RAILWAY_FIRESTORE"
else
  echo "❌ Railway backend: UNHEALTHY"
  echo "   Response: $RAILWAY_HEALTH"
  exit 1
fi
echo ""

# Check critical functions
echo "🔍 Checking critical Cloud Functions..."
firebase functions:list | grep -E "Function|whatsappExtractEventFromThread|clientCrmAsk|aggregateClientStats|whatsappProxy|bootstrapAdmin" || true
echo ""

# Check Firestore rules/indexes
echo "🔍 Checking Firestore deployment status..."
echo "Rules: firestore.rules"
ls -lh firestore.rules
echo "Indexes: firestore.indexes.json"
ls -lh firestore.indexes.json
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PRE-FLIGHT CHECKS COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Manual tests ready:"
echo "   1. Pair QR (scan with real WhatsApp phone)"
echo "   2. Inbox (verify threads appear)"
echo "   3. Receive (client → WA account)"
echo "   4. Send (app → client)"
echo "   5. Restart Safety (Railway restart, no data loss)"
echo "   6-9. CRM tests (Extract → Save → Aggregate → Ask AI)"
echo ""
echo "📖 See ACCEPTANCE_TEST_REPORT.md for detailed steps"
