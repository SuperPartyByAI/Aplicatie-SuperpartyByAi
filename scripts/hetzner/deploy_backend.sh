#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: $0 user@host [backend_dir] [ssh_key_path]}"
BACKEND_DIR="${2:-/opt/whatsapp/whatsapp-backend}"
KEY_PATH="${3:-$HOME/.ssh/hetzner_whatsapp_backend}"

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

ssh -i "$KEY_PATH" "$HOST" <<EOF
set -e
cd "$BACKEND_DIR"
git pull
npm ci
sudo systemctl restart "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE"
echo "OK restarted: $SERVICE"
curl -fsS http://127.0.0.1:8080/health || true
EOF
