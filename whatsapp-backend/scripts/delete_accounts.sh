#!/bin/bash
# Script pentru ștergerea conturilor WhatsApp
# Usage: ./scripts/delete_accounts.sh [account_id] [account_id2] ...
# Sau pentru ștergerea tuturor conturilor cu status specificat:
#   ./scripts/delete_accounts.sh --status disconnected

set -e

BASE_URL="${WHATSAPP_BACKEND_BASE_URL:-http://37.27.34.179:8080}"

# Try to get ADMIN_TOKEN from helper script if available
if [ -z "$ADMIN_TOKEN" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/set_admin_token.sh" ]; then
    source "$SCRIPT_DIR/set_admin_token.sh" 2>/dev/null || true
  fi
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ ADMIN_TOKEN nu este setat!"
  echo ""
  echo "💡 SOLUȚIE:"
  echo "   1. Setează token-ul:"
  echo "      export ADMIN_TOKEN='your-token-here'"
  echo ""
  echo "   2. Sau rulează direct cu token:"
  echo "      ADMIN_TOKEN='your-token' ./scripts/delete_accounts.sh --list"
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
  
  # Get accounts with proper error handling
  response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/whatsapp/accounts" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -ne 200 ]; then
    echo "❌ Eroare la obținerea listei de conturi: HTTP $http_code"
    echo "$body" | jq -r '.error // .message' 2>/dev/null || echo "$body"
    exit 1
  fi
  
  # Check if response has accounts array
  if echo "$body" | jq -e '.accounts == null' >/dev/null 2>&1; then
    echo "ℹ️  Nu s-au găsit conturi (răspuns null)"
    exit 0
  fi
  
  accounts=$(echo "$body" | jq -r ".accounts[]? | select(.status == \"$status\") | .id" 2>/dev/null)
  
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
