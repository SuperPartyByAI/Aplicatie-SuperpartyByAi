#!/usr/bin/env bash
set -euo pipefail
git rev-parse --is-inside-work-tree >/dev/null
PATTERN='(railway|up\.railway\.app|WHATSAPP_RAILWAY_BASE_URL|railway_base_url|getRailwayBaseUrl|RAILWAY_)'
if git grep -niE "$PATTERN" -- functions/ whatsapp-backend/scripts/ superparty_flutter/lib/ superparty_flutter/README.md 2>/dev/null | grep -v "Binary" | grep -v "node_modules" | grep -q .; then
  echo
  echo "ERROR: Legacy hosting references found in active code."
  git grep -niE "$PATTERN" -- functions/ whatsapp-backend/scripts/ superparty_flutter/lib/ superparty_flutter/README.md 2>/dev/null | grep -v "Binary" | grep -v "node_modules"
  exit 1
fi
echo "OK: no legacy hosting references found in active code."
