#!/bin/bash
# Script pentru ștergerea conturilor WhatsApp
# Usage: ./scripts/delete_accounts.sh [account_id] [account_id2] ...
# Sau pentru ștergerea tuturor conturilor cu status specificat:
#   ./scripts/delete_accounts.sh --status disconnected

set -e

BASE_URL="${RAILWAY_PUBLIC_DOMAIN:-https://whats-upp-production.up.railway.app}"

# Try to get ADMIN_TOKEN from Railway CLI if not set
if [ -z "$ADMIN_TOKEN" ]; then
  ADMIN_TOKEN=$(railway variables 2>&1 | grep 'ADMIN_TOKEN' | head -1 | awk -F'│' '{print $3}' | xargs)
  if [ -n "$ADMIN_TOKEN" ]; then
    export ADMIN_TOKEN
  fi
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ ADMIN_TOKEN nu este setat!"
  echo "Setare: export ADMIN_TOKEN='your-token'"
  exit 1
fi

delete_account() {
  local account_id=$1
  echo "🗑️  Șterg contul: $account_id"
  
  response=$(curl -s -w "\n%{http_code}" -X DELETE \
    "$BASE_URL/api/whatsapp/accounts/$account_id" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -eq 200 ]; then
    echo "✅ Șters: $account_id"
    return 0
  else
    echo "❌ Eroare la ștergerea $account_id: HTTP $http_code"
    echo "$body" | jq -r '.error // .message' 2>/dev/null || echo "$body"
    return 1
  fi
}

if [ "$1" == "--status" ]; then
  # Șterge toate conturile cu un status specificat
  status=$2
  echo "🔍 Caut conturi cu status: $status"
  
  accounts=$(curl -s "$BASE_URL/api/whatsapp/accounts" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | \
    jq -r ".accounts[] | select(.status == \"$status\") | .id")
  
  if [ -z "$accounts" ]; then
    echo "ℹ️  Nu s-au găsit conturi cu status: $status"
    exit 0
  fi
  
  echo "📋 Conturi găsite:"
  echo "$accounts" | nl
  
  read -p "⚠️  Ești sigur că vrei să ștergi aceste conturi? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "❌ Anulat"
    exit 0
  fi
  
  echo ""
  deleted=0
  failed=0
  while IFS= read -r account_id; do
    if [ -n "$account_id" ]; then
      if delete_account "$account_id"; then
        ((deleted++))
      else
        ((failed++))
      fi
      sleep 0.5  # Rate limiting
    fi
  done <<< "$accounts"
  
  echo ""
  echo "✅ Șterse: $deleted"
  if [ $failed -gt 0 ]; then
    echo "❌ Eșuate: $failed"
  fi

elif [ "$1" == "--list" ]; then
  # Lista toate conturile
  echo "📋 LISTA CONTURI:"
  echo ""
  curl -s "$BASE_URL/api/whatsapp/accounts" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | \
    jq -r '.accounts[] | "\(.id) | \(.name) | \(.phone) | Status: \(.status)"' | \
    column -t -s '|'
  
elif [ $# -eq 0 ]; then
  echo "📋 USAGE:"
  echo ""
  echo "1. Lista toate conturile:"
  echo "   ./scripts/delete_accounts.sh --list"
  echo ""
  echo "2. Șterge un cont specific:"
  echo "   ./scripts/delete_accounts.sh account_id"
  echo ""
  echo "3. Șterge mai multe conturi:"
  echo "   ./scripts/delete_accounts.sh account_id1 account_id2 ..."
  echo ""
  echo "4. Șterge toate conturile cu un status:"
  echo "   ./scripts/delete_accounts.sh --status disconnected"
  echo ""
  echo "📊 Status-uri posibile:"
  echo "   - disconnected (conturi vechi, deconectate)"
  echo "   - needs_qr (conturi care necesită QR)"
  echo "   - qr_ready (conturi cu QR generat)"
  echo "   - connected (conturi active - NU ȘTERGE!)"
  exit 0

else
  # Șterge conturi specificate
  echo "🗑️  Șterg conturi: $@"
  echo ""
  
  deleted=0
  failed=0
  for account_id in "$@"; do
    if delete_account "$account_id"; then
      ((deleted++))
    else
      ((failed++))
    fi
    sleep 0.5
  done
  
  echo ""
  echo "✅ Șterse: $deleted"
  if [ $failed -gt 0 ]; then
    echo "❌ Eșuate: $failed"
  fi
fi
