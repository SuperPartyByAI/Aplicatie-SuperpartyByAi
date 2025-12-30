#!/bin/bash
# WA STABILITY EVIDENCE RUNNER
# Produces evidence for all DoD-WA requirements

set -euo pipefail

BASE="${BAILEYS_BASE_URL:-https://whats-upp-production.up.railway.app}"
TOKEN="${LONGRUN_ADMIN_TOKEN:-}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "$TOKEN" ]; then
  echo "ERROR: LONGRUN_ADMIN_TOKEN not set"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer [REDACTED]"
HDR=(-H "Authorization: Bearer $TOKEN")

echo "========================================"
echo "WA STABILITY EVIDENCE"
echo "========================================"
echo "Timestamp: $TS"
echo "Base URL: $BASE"
echo ""

echo "=== 1. HEALTH (commitHash + uptime) ==="
curl -sS -i "$BASE/health" | head -20
echo ""

echo "=== 2. STATUS-NOW (DoD-WA-1 fields) ==="
curl -sS "${HDR[@]}" "$BASE/api/longrun/status-now" | python3 -m json.tool | head -150
echo ""

echo "=== 3. FIRESTORE-WRITE-TEST ==="
curl -sS "${HDR[@]}" "$BASE/api/longrun/firestore-write-test" | python3 -m json.tool
echo ""

echo "=== 4. BOOTSTRAP (idempotent) ==="
curl -sS -X POST "${HDR[@]}" "$BASE/api/longrun/bootstrap" | python3 -m json.tool | head -50
echo ""

echo "=== 5. VERIFY DATA QUALITY ==="
curl -sS "${HDR[@]}" "$BASE/api/longrun/verify/dataquality" | python3 -m json.tool
echo ""

echo "=== 6. VERIFY READINESS ==="
curl -sS "${HDR[@]}" "$BASE/api/longrun/verify/readiness" | python3 -m json.tool
echo ""

echo "=== 7. OUTBOX STATS ==="
curl -sS "${HDR[@]}" "$BASE/api/longrun/outbox/stats" | python3 -m json.tool
echo ""

echo "========================================"
echo "EVIDENCE COMPLETE"
echo "========================================"
