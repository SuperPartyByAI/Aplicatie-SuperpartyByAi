#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend"
BRANCH="cursor/baileys-fix"
SERVICE_NAME="whatsapp-backend"

echo "== Server update (safe) =="
echo "cwd=${ROOT_DIR}"

if [ ! -d "$ROOT_DIR" ]; then
  echo "error: repo_not_found"
  exit 1
fi

cd "$ROOT_DIR"

echo "step=stash"
git stash -u >/dev/null 2>&1 || true

echo "step=fetch"
git fetch origin "$BRANCH" >/dev/null 2>&1

echo "step=checkout"
git checkout "$BRANCH" >/dev/null 2>&1

echo "step=reset"
git reset --hard "origin/$BRANCH" >/dev/null 2>&1

echo "step=npm_ci"
npm ci >/dev/null 2>&1

if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-units --type=service --all | grep -q "$SERVICE_NAME"; then
    if [ "${RESTART_AFTER_UPDATE:-false}" = "true" ]; then
      echo "step=restart"
      systemctl restart "$SERVICE_NAME"
    else
      echo "restart_hint=systemctl restart $SERVICE_NAME"
    fi
  else
    echo "restart_hint=systemctl restart $SERVICE_NAME"
  fi
else
  echo "restart_hint=systemctl restart $SERVICE_NAME"
fi

echo "status=ok"
