#!/bin/bash
# Login Firebase + deploy indexuri, rules, functions WhatsApp.
# Rulează: ./scripts/firebase_deploy_whatsapp.sh

set -e
cd "$(dirname "$0")/.."

echo "=== 1. Firebase login (deschide browser) ==="
firebase login

echo ""
echo "=== 2. Proiect ==="
firebase use superparty-frontend || firebase use default

echo ""
echo "=== 3. Deploy Firestore indexes ==="
firebase deploy --only firestore:indexes

echo ""
echo "=== 4. Deploy Firestore rules ==="
firebase deploy --only firestore:rules

echo ""
echo "=== 5. Deploy Functions WhatsApp ==="
(cd functions && npm install)
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr

echo ""
echo "=== 6. Verificare ==="
firebase functions:list | grep -E "whatsappProxySend|whatsappProxyGetAccounts" || true

echo ""
echo "=== Gata. Secret WHATSAPP_BACKEND_URL (dacă lipsește): ==="
echo "  firebase functions:secrets:set WHATSAPP_BACKEND_URL"
