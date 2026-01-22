#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend"
BRANCH="cursor/baileys-fix"
RUNTIME_FILE="/tmp/wa-qr-runtime.json"
BASE_PORT=8787
MAX_PORT=8837

echo "== QR Pairing (host) =="

if [ ! -d "$ROOT_DIR" ]; then
  echo "error=repo_not_found"
  exit 1
fi

cd "$ROOT_DIR"

if [ ! -f "scripts/qr-web.js" ]; then
  echo "step=update_missing_qr_web"
  git fetch origin "$BRANCH" >/dev/null 2>&1 || git fetch origin
  git stash push -u -m "auto-qr-update" >/dev/null 2>&1 || true
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  npm ci
fi

is_port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :$port" 2>/dev/null | grep -q "LISTEN"
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
    return $?
  fi
  return 1
}

PORT="$BASE_PORT"
while [ "$PORT" -le "$MAX_PORT" ]; do
  if ! is_port_listening "$PORT"; then
    break
  fi
  PORT=$((PORT + 1))
done

if [ "$PORT" -gt "$MAX_PORT" ]; then
  echo "error=no_free_port"
  exit 1
fi

DIAG_TOKEN="$(openssl rand -hex 24)"
TOKEN_SHA8="$(printf '%s' "$DIAG_TOKEN" | shasum -a 256 | awk '{print $1}' | cut -c1-8)"
NOW_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

umask 077
cat > "$RUNTIME_FILE" <<EOF
{"port":$PORT,"token":"$DIAG_TOKEN","tokenSha8":"$TOKEN_SHA8","ts":"$NOW_ISO"}
EOF
chmod 600 "$RUNTIME_FILE"

echo "PORT=$PORT"
echo "TOKEN_SHA8=$TOKEN_SHA8"
echo "URL_LOCAL_FORMAT=http://localhost:${PORT}/qr"
echo "INSTRUCTION=Run on Mac: ./scripts/qr-tunnel.sh root@IP"

export DIAG_TOKEN
export QR_WEB_PORT="$PORT"

while true; do
  node scripts/qr-web.js
  exit_code=$?
  echo "qr_web_exit=$exit_code"
  sleep 2
done
