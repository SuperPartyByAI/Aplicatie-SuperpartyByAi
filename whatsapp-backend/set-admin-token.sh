#!/bin/bash

# Script pentru setare ADMIN_TOKEN în Railway
# Usage: ./set-admin-token.sh

set -e

TOKEN="8df59afe1ca9387674e2b72c42460e3a3d2dea96833af6d3d9b840ff48ddfea3"

echo "=== SETARE ADMIN_TOKEN ÎN RAILWAY ==="
echo ""
echo "🔑 Token generat:"
echo "$TOKEN"
echo ""

# Verifică dacă e link-at
if ! railway status >/dev/null 2>&1; then
  echo "❌ Proiectul nu e link-at în Railway CLI."
  echo ""
  echo "📝 Pași:"
  echo "1. Rulează: railway link"
  echo "2. Selectează proiectul WhatsApp backend în browser"
  echo "3. Apoi rulează din nou acest script: ./set-admin-token.sh"
  echo ""
  echo "SAU"
  echo ""
  echo "Setare manuală în Railway Dashboard:"
  echo "1. https://railway.app/dashboard"
  echo "2. Selectează proiectul WhatsApp backend"
  echo "3. Click 'Variables' tab"
  echo "4. Adaugă: ADMIN_TOKEN = $TOKEN"
  exit 1
fi

echo "✅ Proiect link-at!"
echo ""
echo "Setăm ADMIN_TOKEN..."
railway variables set ADMIN_TOKEN="$TOKEN"

echo ""
echo "✅ ADMIN_TOKEN setat!"
echo ""
echo "Verificare:"
railway variables | grep -i "ADMIN_TOKEN" || echo "⚠️  Nu apare în listă (poate fi normal)"

echo ""
echo "🚀 Backend-ul va redeploy automat (dacă auto-deploy e activat)"
echo "   SAU face restart manual din Railway Dashboard"
echo ""
echo "Verificare după deploy:"
echo "  curl -s https://whats-upp-production.up.railway.app/health | jq"
echo "  curl -s https://whats-upp-production.up.railway.app/ready | jq"
