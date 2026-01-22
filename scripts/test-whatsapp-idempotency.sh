#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${FUNCTIONS_URL:-}" ]]; then
  echo "Missing FUNCTIONS_URL (e.g., https://us-central1-superparty-frontend.cloudfunctions.net)"
  exit 1
fi

if [[ -z "${ID_TOKEN:-}" ]]; then
  echo "Missing ID_TOKEN (Firebase ID token for an authenticated user)"
  exit 1
fi

if [[ -z "${THREAD_ID:-}" || -z "${ACCOUNT_ID:-}" || -z "${TO_JID:-}" || -z "${TEXT:-}" ]]; then
  echo "Missing required vars: THREAD_ID, ACCOUNT_ID, TO_JID, TEXT"
  exit 1
fi

CLIENT_MESSAGE_ID="${CLIENT_MESSAGE_ID:-client_test_$(date +%s)}"

payload=$(cat <<EOF
{
  "threadId": "${THREAD_ID}",
  "accountId": "${ACCOUNT_ID}",
  "toJid": "${TO_JID}",
  "text": "${TEXT}",
  "clientMessageId": "${CLIENT_MESSAGE_ID}"
}
EOF
)

echo "Sending twice with clientMessageId=${CLIENT_MESSAGE_ID}"
echo "Request 1:"
curl -s -X POST "${FUNCTIONS_URL}/whatsappProxySend" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${payload}" | jq .

echo "Request 2 (duplicate):"
curl -s -X POST "${FUNCTIONS_URL}/whatsappProxySend" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${payload}" | jq .

echo "Expected: second response has duplicate=true and no extra outbox doc."
