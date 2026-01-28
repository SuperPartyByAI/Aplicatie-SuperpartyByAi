#!/bin/bash
# Helper script to set ADMIN_TOKEN from environment or manual input
# Usage: source scripts/set_admin_token.sh

# Check if ADMIN_TOKEN is already set
if [ -n "$ADMIN_TOKEN" ]; then
  echo "✅ ADMIN_TOKEN deja setat (${#ADMIN_TOKEN} caractere)"
  return 0
fi

# Try to get from Hetzner server (if accessible)
if command -v ssh &> /dev/null; then
  # Try to get from Hetzner server environment
  TOKEN=$(ssh root@37.27.34.179 "systemctl show whatsapp-backend -p Environment | grep -oP 'ADMIN_TOKEN=\K[^ ]+' | head -1" 2>/dev/null || true)
  
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
    export ADMIN_TOKEN="$TOKEN"
    echo "✅ ADMIN_TOKEN setat automat din Hetzner server (${#TOKEN} caractere)"
    return 0
  fi
fi

# Fallback: manual input
echo "⚠️  ADMIN_TOKEN nu este setat automat"
echo "   Setează manual: export ADMIN_TOKEN='your-token'"
echo "   Sau obține din Hetzner: ssh root@37.27.34.179 'systemctl show whatsapp-backend -p Environment'"
return 1
