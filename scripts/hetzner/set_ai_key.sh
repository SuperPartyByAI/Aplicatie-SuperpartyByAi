#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: $0 user@host [ssh_key_path]}"
KEY_PATH="${2:-$HOME/.ssh/hetzner_whatsapp_backend}"
ENV_FILE="/etc/whatsapp-backend/firebase-sa.env"

read -rs -p "GROQ_API_KEY: " GROQ_API_KEY
echo

detect_service() {
  ssh -i "$KEY_PATH" "$HOST" \
    "systemctl list-units --type=service --no-legend | awk '{print \$1}' | grep -E '^(whatsapp-backend\\.service|whatsapp_backend\\.service|superparty-backend\\.service)$' | head -n 1" \
    || true
}

SERVICE="$(detect_service)"
if [[ -z "${SERVICE:-}" ]]; then
  echo "Nu am putut detecta automat service-ul."
  echo "Rulează pe server: systemctl list-units --type=service | grep -i whatsapp"
  exit 1
fi

# Ensure env file exists with safe perms
ssh -i "$KEY_PATH" "$HOST" \
  "sudo mkdir -p /etc/whatsapp-backend && sudo install -m 600 /dev/null '$ENV_FILE'"

# Write key (overwrite file)
ssh -i "$KEY_PATH" "$HOST" "sudo tee '$ENV_FILE' >/dev/null" <<EOF
GROQ_API_KEY=$GROQ_API_KEY
EOF

ssh -i "$KEY_PATH" "$HOST" \
  "sudo systemctl daemon-reload && sudo systemctl restart '$SERVICE' && sudo systemctl is-active --quiet '$SERVICE' && echo 'OK restarted: $SERVICE' && sudo journalctl -u '$SERVICE' -n 120 --no-pager"
