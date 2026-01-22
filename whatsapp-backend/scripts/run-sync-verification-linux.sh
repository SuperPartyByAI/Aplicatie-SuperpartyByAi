#!/usr/bin/env bash
set -euo pipefail

if [ -z "${RESTART_SSH:-}" ]; then
  echo "RESTART_SSH missing"
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_ART_DIR="$ROOT_DIR/_artifacts"
REMOTE_ROOT="${REMOTE_ROOT:-~/Aplicatie-SuperpartyByAi}"
REMOTE_BACKEND_DIR="$REMOTE_ROOT/whatsapp-backend"
REMOTE_ART_DIR="$REMOTE_ROOT/_artifacts"
REMOTE_JSON="$REMOTE_ART_DIR/run_sync_verification_restart.json"

mkdir -p "$LOCAL_ART_DIR"

ssh -o StrictHostKeyChecking=no "$RESTART_SSH" "bash -lc 'set -euo pipefail; mkdir -p \"$REMOTE_ART_DIR\"; cd \"$REMOTE_BACKEND_DIR\"; export FIRESTORE_PREFER_REST=true; RUN_RESTART=true node scripts/run-sync-verification.js > \"$REMOTE_JSON\"'"

ssh -o StrictHostKeyChecking=no "$RESTART_SSH" "cat \"$REMOTE_JSON\"" > "$LOCAL_ART_DIR/run_sync_verification_restart.json"

echo "exit=0"
