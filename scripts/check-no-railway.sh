#!/usr/bin/env bash
set -euo pipefail
git rev-parse --is-inside-work-tree >/dev/null
PATTERN='(railway|up\.railway\.app|WHATSAPP_RAILWAY_BASE_URL|railway_base_url|getRailwayBaseUrl|RAILWAY_)'
if git grep -niE "$PATTERN" -- .; then
  echo
  echo "ERROR: Railway references found."
  exit 1
fi
echo "OK: no Railway references found."
