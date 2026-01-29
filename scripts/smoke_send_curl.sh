#!/bin/bash
# Smoke test: POST whatsappProxySend cu token + thread/account/jid reale.
# 1. Ia Firebase ID token: din app după login, sau „Get ID Token” în Firebase Console.
# 2. threadId: ID-ul doc din Firestore collection „threads” (ex. accountId__40712345678@s.whatsapp.net).
# 3. accountId: ID-ul contului WhatsApp din Accounts / Firestore „accounts”.
# 4. toJid: clientJid al thread-ului (ex. 40712345678@s.whatsapp.net).

TOKEN="<PASTE_FIREBASE_ID_TOKEN_HERE>"
THREAD_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443__40787772446@s.whatsapp.net"
ACCOUNT_ID="account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443"
TO_JID="40787772446@s.whatsapp.net"

curl -i \
  "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxySend" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"threadId\": \"$THREAD_ID\",
    \"accountId\": \"$ACCOUNT_ID\",
    \"toJid\": \"$TO_JID\",
    \"text\": \"test din curl\",
    \"clientMessageId\": \"curl_$(date +%s)\"
  }"
