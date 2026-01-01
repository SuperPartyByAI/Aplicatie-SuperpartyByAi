#!/bin/bash

# Test Restart Persistence - 3x Restart Test
# Verifies that WhatsApp sessions persist across restarts

set -e

BASE_URL="https://whats-upp-production.up.railway.app"
ACCOUNT_ID="account_dev_dde908a65501c63b124cb94c627e551d"

echo "🔥 RESTART PERSISTENCE TEST - 3x Restarts"
echo "=========================================="
echo ""

# Function to check health
check_health() {
  local attempt=$1
  echo "📊 Health Check (Attempt $attempt):"
  curl -s "$BASE_URL/health" | python3 -m json.tool
  echo ""
}

# Function to wait for service to be ready
wait_for_ready() {
  echo "⏳ Waiting for service to be ready..."
  local max_attempts=30
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
      echo "✅ Service is ready!"
      return 0
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
  done
  
  echo "❌ Service did not become ready in time"
  return 1
}

# Initial state
echo "📸 INITIAL STATE (Before any restarts)"
echo "--------------------------------------"
check_health "Initial"

# Restart 1
echo "🔄 RESTART #1"
echo "-------------"
echo "Triggering restart via Railway API..."
# Note: Actual restart would be done via Railway Dashboard or API
echo "⚠️  Manual step: Restart service in Railway Dashboard"
echo "Press Enter when restart is complete..."
read

wait_for_ready
sleep 5  # Give it time to restore sessions
check_health "After Restart #1"

# Restart 2
echo ""
echo "🔄 RESTART #2"
echo "-------------"
echo "⚠️  Manual step: Restart service in Railway Dashboard again"
echo "Press Enter when restart is complete..."
read

wait_for_ready
sleep 5
check_health "After Restart #2"

# Restart 3
echo ""
echo "🔄 RESTART #3"
echo "-------------"
echo "⚠️  Manual step: Restart service in Railway Dashboard one more time"
echo "Press Enter when restart is complete..."
read

wait_for_ready
sleep 5
check_health "After Restart #3"

# Final verification
echo ""
echo "🎯 FINAL VERIFICATION"
echo "--------------------"
echo "Checking if QR is still needed..."
curl -s "$BASE_URL/api/whatsapp/qr/$ACCOUNT_ID" | grep -q "Already connected" && echo "✅ Session persisted - No QR needed!" || echo "⚠️  QR still needed - Session may not have persisted"

echo ""
echo "📊 SUMMARY"
echo "----------"
echo "If 'connected' count remained stable across all 3 restarts,"
echo "then session persistence is working correctly!"
echo ""
echo "Expected behavior:"
echo "  - Initial: connected=0, needs_qr=2"
echo "  - After scan: connected=1, needs_qr=1"
echo "  - After restart #1: connected=1, needs_qr=1 (no change)"
echo "  - After restart #2: connected=1, needs_qr=1 (no change)"
echo "  - After restart #3: connected=1, needs_qr=1 (no change)"
