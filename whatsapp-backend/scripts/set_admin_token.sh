#!/bin/bash
# Helper script to set ADMIN_TOKEN from Railway CLI
# Usage: source scripts/set_admin_token.sh

if command -v railway &> /dev/null; then
  # Try JSON format first (more reliable)
  TOKEN=$(railway variables --json 2>/dev/null | jq -r '.[] | select(.name == "ADMIN_TOKEN") | .value' 2>/dev/null)
  
  # If JSON fails, try table format with multiple methods
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    # Method 1: perl regex (most reliable for Railway CLI table format)
    if command -v perl &> /dev/null; then
      TOKEN=$(railway variables 2>&1 | grep 'ADMIN_TOKEN' | head -1 | perl -pe 's/.*\│[[:space:]]*([^[:space:]]+).*/$1/' 2>/dev/null || true)
    fi
    
    # Method 2: awk with custom field separator (fallback)
    if [ -z "$TOKEN" ]; then
      TOKEN=$(railway variables 2>&1 | grep 'ADMIN_TOKEN' | head -1 | awk -F'│' '{
        gsub(/^[ \t]+|[ \t]+$/, "", $3)
        if (length($3) > 0) print $3
      }')
    fi
    
    # Method 3: cut with xargs (fallback)
    if [ -z "$TOKEN" ]; then
      TOKEN=$(railway variables 2>&1 | grep 'ADMIN_TOKEN' | head -1 | cut -d'│' -f3 | xargs)
    fi
  fi
  
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && [ "$TOKEN" != "" ]; then
    export ADMIN_TOKEN="$TOKEN"
    echo "✅ ADMIN_TOKEN setat automat (${#TOKEN} caractere)"
    return 0
  else
    echo "⚠️  Nu s-a putut obține ADMIN_TOKEN automat"
    echo "   Setează manual: export ADMIN_TOKEN='your-token'"
    return 1
  fi
else
  echo "⚠️  Railway CLI nu este instalat"
  echo "   Setează manual: export ADMIN_TOKEN='your-token'"
  return 1
fi
