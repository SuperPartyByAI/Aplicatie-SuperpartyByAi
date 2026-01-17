#!/bin/bash
# Railway Setup Script - Configureaza Volume si Environment Variables
# Foloseste token API pentru autentificare non-interactiv

set -e  # Exit on error

echo "🚂 Railway Setup pentru WhatsApp 30 Accounts"
echo "=============================================="
echo ""

# Verificare token
if [ -z "$RAILWAY_TOKEN" ]; then
    echo "❌ EROARE: RAILWAY_TOKEN nu este setat!"
    echo ""
    echo "Cum sa obtii token-ul:"
    echo "1. Deschide: https://railway.app/account/tokens"
    echo "2. Click 'New Token'"
    echo "3. Numeaza-l (ex: 'cursor-setup')"
    echo "4. Copiaza token-ul (apare o singura data!)"
    echo ""
    echo "Apoi ruleaza:"
    echo "  export RAILWAY_TOKEN='tokenul_tau_aici'"
    echo "  ./setup-railway.sh"
    echo ""
    exit 1
fi

# Proiect ID
PROJECT_ID="be379927-9034-4a4d-8e35-4fbdfe258fc0"
SERVICE_ID="bac72d7a-eeca-4dda-acd9-6b0496a2184f"

echo "📋 Proiect: $PROJECT_ID"
echo "📋 Service: $SERVICE_ID"
echo ""

# Setare token ca variabila de mediu (Railway CLI il foloseste automat)
export RAILWAY_TOKEN="$RAILWAY_TOKEN"

# Verificare autentificare (Railway CLI foloseste automat RAILWAY_TOKEN din env)
echo "🔐 Verificare autentificare cu token API..."
railway whoami >/dev/null 2>&1 || {
    echo "❌ EROARE: Autentificare esuata. Verifica token-ul."
    echo "   Railway CLI foloseste automat variabila RAILWAY_TOKEN din environment"
    exit 1
}

echo "✅ Autentificare reusita!"
echo ""

# Link la proiect
echo "🔗 Link la proiect..."
cd "$(dirname "$0")"
railway link --project "$PROJECT_ID" || {
    echo "⚠️  Proiectul este deja link-uit sau link-ul a esuat"
}

echo "✅ Proiect link-uit!"
echo ""

# Verificare daca volume exista deja
echo "📦 Verificare volume existente..."
EXISTING_VOLUME=$(railway volume list 2>/dev/null | grep "whatsapp-sessions-volume" || true)

if [ -n "$EXISTING_VOLUME" ]; then
    echo "⚠️  Volume 'whatsapp-sessions-volume' exista deja. Skip creare."
else
    echo "📦 Creare volume: whatsapp-sessions-volume"
    railway volume create whatsapp-sessions-volume \
        --mount /data/sessions \
        --size 1GB \
        --service "$SERVICE_ID" || {
        echo "❌ EROARE: Creare volume esuata."
        exit 1
    }
    echo "✅ Volume creat!"
fi
echo ""

# Verificare daca variabila exista deja
echo "🔧 Verificare variabile de mediu..."
EXISTING_VAR=$(railway variables 2>/dev/null | grep "SESSIONS_PATH" || true)

if [ -n "$EXISTING_VAR" ]; then
    echo "⚠️  Variabila SESSIONS_PATH exista deja. Actualizare..."
    railway variables set SESSIONS_PATH=/data/sessions || {
        echo "❌ EROARE: Actualizare variabila esuata."
        exit 1
    }
    echo "✅ Variabila actualizata!"
else
    echo "🔧 Setare variabila: SESSIONS_PATH=/data/sessions"
    railway variables set SESSIONS_PATH=/data/sessions || {
        echo "❌ EROARE: Setare variabila esuata."
        exit 1
    }
    echo "✅ Variabila setata!"
fi
echo ""

# Verificare finala
echo "🔍 Verificare configurare finala..."
echo ""
echo "Volume-uri:"
railway volume list 2>/dev/null || echo "⚠️  Nu s-au putut lista volume-urile"
echo ""
echo "Variabile de mediu:"
railway variables 2>/dev/null | grep -E "(SESSIONS_PATH|RAILWAY)" || echo "⚠️  Nu s-au putut lista variabilele"
echo ""

echo "✅ ✅ ✅ SETUP COMPLET! ✅ ✅ ✅"
echo ""
echo "📝 Urmatorii pasi:"
echo "1. Railway va redeploy automat dupa ce ai setat variabila"
echo "2. Verifica logs in Railway dashboard"
echo "3. Cauta in logs: 'Sessions dir writable: true'"
echo "4. Testeaza: curl https://your-url.railway.app/health"
echo ""
echo "🎉 Gata pentru 30 de conturi WhatsApp!"
