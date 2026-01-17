#!/bin/bash
# Railway Setup Script - Foloseste Railway GraphQL API direct
# Railway CLI nu accepta token prin environment pentru toate comenzile
# Deci folosim API direct

set -e

TOKEN_VALUE="${1:-$RAILWAY_TOKEN}"
PROJECT_ID="be379927-9034-4a4d-8e35-4fbdfe258fc0"
SERVICE_ID="bac72d7a-eeca-4dda-acd9-6b0496a2184f"
RAILWAY_API="https://backboard.railway.com/graphql/v2"
MOUNT_PATH="/data/sessions"
VOLUME_SIZE_GB=1

if [ -z "$TOKEN_VALUE" ]; then
    echo "❌ EROARE: Token lipsa!"
    echo ""
    echo "Usage:"
    echo "  ./setup-railway-api-direct.sh YOUR_TOKEN"
    echo ""
    exit 1
fi

echo "🚂 Railway Setup pentru WhatsApp 30 Accounts (via API)"
echo "========================================================"
echo ""
echo "📋 Proiect: $PROJECT_ID"
echo "📋 Service: $SERVICE_ID"
echo ""

# Verificare autentificare si tip token
echo "🔐 Verificare autentificare..."

# Incercare Personal/Team Token
AUTH_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $TOKEN_VALUE" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email } }"}')

USE_PERSONAL_TOKEN=false
if echo "$AUTH_RESPONSE" | grep -q '"data".*"me"'; then
    USE_PERSONAL_TOKEN=true
    AUTH_HEADER="Authorization: Bearer $TOKEN_VALUE"
    USER_EMAIL=$(echo "$AUTH_RESPONSE" | jq -r '.data.me.email // "unknown"' 2>/dev/null)
    echo "✅ Token Personal/Team detectat - Permisiuni complete"
    echo "   Email: $USER_EMAIL"
else
    # Incercare Project Token
    PROJECT_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
      -H "Project-Access-Token: $TOKEN_VALUE" \
      -H "Content-Type: application/json" \
      -d "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { id name } }\"}")
    
    if echo "$PROJECT_RESPONSE" | grep -q '"data".*"project"'; then
        AUTH_HEADER="Project-Access-Token: $TOKEN_VALUE"
        PROJECT_NAME=$(echo "$PROJECT_RESPONSE" | jq -r '.data.project.name // "unknown"' 2>/dev/null)
        echo "⚠️  Project Token detectat - Permisiuni LIMITATE"
        echo "   Proiect: $PROJECT_NAME"
        echo ""
        echo "❌ EROARE: Project tokens NU pot crea volume sau seta variabile!"
        echo ""
        echo "📝 Solutii:"
        echo "   1. Creeaza Personal/Team Token: https://railway.app/account/tokens"
        echo "   2. Configureaza manual in Railway Web UI (recomandat)"
        echo ""
        echo "   Vezi: RAILWAY_SETUP_MANUAL_STEPS.md pentru ghid complet"
        exit 1
    else
        echo "❌ EROARE: Autentificare esuata. Verifica token-ul."
        echo "$AUTH_RESPONSE" | jq . 2>/dev/null || echo "$AUTH_RESPONSE"
        exit 1
    fi
fi
echo ""

# Verificare daca volume exista deja
echo "📦 Verificare volume existente..."
VOLUMES_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $TOKEN_VALUE" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { volumes { edges { node { id name mountPath serviceId } } } } }\"}")

EXISTING_VOLUME=$(echo "$VOLUMES_RESPONSE" | jq -r ".data.project.volumes.edges[] | select(.node.mountPath == \"$MOUNT_PATH\" and .node.serviceId == \"$SERVICE_ID\") | .node.id" 2>/dev/null)

if [ -n "$EXISTING_VOLUME" ] && [ "$EXISTING_VOLUME" != "null" ]; then
    echo "⚠️  Volume la '$MOUNT_PATH' exista deja (ID: $EXISTING_VOLUME). Skip creare."
else
    echo "📦 Creare volume: whatsapp-sessions-volume la $MOUNT_PATH..."
    
    CREATE_VOLUME_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
      -H "Authorization: Bearer $TOKEN_VALUE" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": \"mutation(\$input: VolumeCreateInput!) { volumeCreate(input: \$input) { id name mountPath } }\",
        \"variables\": {
          \"input\": {
            \"projectId\": \"$PROJECT_ID\",
            \"serviceId\": \"$SERVICE_ID\",
            \"name\": \"whatsapp-sessions-volume\",
            \"mountPath\": \"$MOUNT_PATH\",
            \"sizeGb\": $VOLUME_SIZE_GB
          }
        }
      }")
    
    VOLUME_ID=$(echo "$CREATE_VOLUME_RESPONSE" | jq -r '.data.volumeCreate.id // empty' 2>/dev/null)
    
    if [ -n "$VOLUME_ID" ] && [ "$VOLUME_ID" != "null" ]; then
        echo "✅ Volume creat! ID: $VOLUME_ID"
    else
        echo "❌ EROARE: Creare volume esuata."
        echo "$CREATE_VOLUME_RESPONSE" | jq . 2>/dev/null || echo "$CREATE_VOLUME_RESPONSE"
        exit 1
    fi
fi
echo ""

# Verificare daca variabila exista deja
echo "🔧 Verificare variabile de mediu..."
VARIABLES_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $TOKEN_VALUE" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { environments { edges { node { id service(id: \\\"$SERVICE_ID\\\") { id variables { edges { node { name value } } } } } } } } }\"}")

ENV_ID=$(echo "$VARIABLES_RESPONSE" | jq -r '.data.project.environments.edges[0].node.id // empty' 2>/dev/null)
EXISTING_SESSIONS_PATH=$(echo "$VARIABLES_RESPONSE" | jq -r ".data.project.environments.edges[0].node.service.variables.edges[] | select(.node.name == \"SESSIONS_PATH\") | .node.value" 2>/dev/null)

if [ -n "$EXISTING_SESSIONS_PATH" ] && [ "$EXISTING_SESSIONS_PATH" != "null" ]; then
    echo "⚠️  Variabila SESSIONS_PATH exista cu valoarea: $EXISTING_SESSIONS_PATH"
    if [ "$EXISTING_SESSIONS_PATH" != "$MOUNT_PATH" ]; then
        echo "   Actualizare la: $MOUNT_PATH..."
        UPDATE_VAR_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
          -H "Authorization: Bearer $TOKEN_VALUE" \
          -H "Content-Type: application/json" \
          -d "{
            \"query\": \"mutation(\$input: VariableUpsertInput!) { variableUpsert(input: \$input) { name value } }\",
            \"variables\": {
              \"input\": {
                \"projectId\": \"$PROJECT_ID\",
                \"environmentId\": \"$ENV_ID\",
                \"serviceId\": \"$SERVICE_ID\",
                \"name\": \"SESSIONS_PATH\",
                \"value\": \"$MOUNT_PATH\"
              }
            }
          }")
        
        if echo "$UPDATE_VAR_RESPONSE" | grep -q "data"; then
            echo "✅ Variabila actualizata!"
        else
            echo "❌ EROARE: Actualizare variabila esuata."
            echo "$UPDATE_VAR_RESPONSE" | jq . 2>/dev/null || echo "$UPDATE_VAR_RESPONSE"
        fi
    else
        echo "✅ Variabila este deja corecta!"
    fi
else
    echo "🔧 Setare variabila: SESSIONS_PATH=$MOUNT_PATH"
    
    CREATE_VAR_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
      -H "Authorization: Bearer $TOKEN_VALUE" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": \"mutation(\$input: VariableUpsertInput!) { variableUpsert(input: \$input) { name value } }\",
        \"variables\": {
          \"input\": {
            \"projectId\": \"$PROJECT_ID\",
            \"environmentId\": \"$ENV_ID\",
            \"serviceId\": \"$SERVICE_ID\",
            \"name\": \"SESSIONS_PATH\",
            \"value\": \"$MOUNT_PATH\"
          }
        }
      }")
    
    if echo "$CREATE_VAR_RESPONSE" | grep -q "data"; then
        echo "✅ Variabila setata!"
    else
        echo "❌ EROARE: Setare variabila esuata."
        echo "$CREATE_VAR_RESPONSE" | jq . 2>/dev/null || echo "$CREATE_VAR_RESPONSE"
        exit 1
    fi
fi
echo ""

echo "✅ ✅ ✅ SETUP COMPLET! ✅ ✅ ✅"
echo ""
echo "📝 Urmatorii pasi:"
echo "1. Railway va redeploy automat dupa ce ai setat variabila"
echo "2. Verifica logs in Railway dashboard"
echo "3. Cauta in logs: 'Sessions dir writable: true'"
echo "4. Testeaza: curl https://whats-upp-production.up.railway.app/health"
echo ""
echo "🎉 Gata pentru 30 de conturi WhatsApp!"
