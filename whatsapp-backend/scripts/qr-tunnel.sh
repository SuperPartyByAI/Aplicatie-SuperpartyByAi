#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 user@host"
  exit 1
fi

TARGET="$1"

RUNTIME_JSON="$(ssh "$TARGET" 'cat /tmp/wa-qr-runtime.json')"

read_json() {
  local key="$1"
  node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(0,"utf8"));const key=process.argv[1];if(!(key in data)){process.exit(2);}process.stdout.write(String(data[key]));' "$key" <<<"$RUNTIME_JSON"
}

PORT="$(read_json port)"
TOKEN="$(read_json token)"
TOKEN_SHA8="$(read_json tokenSha8)"

if [ -z "$PORT" ] || [ -z "$TOKEN" ]; then
  echo "error=runtime_invalid"
  exit 1
fi

echo "PORT=$PORT"
echo "TOKEN_SHA8=$TOKEN_SHA8"

ssh -N -L "${PORT}:127.0.0.1:${PORT}" "$TARGET" >/dev/null 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" >/dev/null 2>&1 || true' EXIT

sleep 1

if command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}/qr?token=${TOKEN}"
else
  echo "OPEN_URL=http://localhost:${PORT}/qr"
fi

echo "status=waiting_for_connected"

connected=false
for _ in {1..90}; do
  response="$(curl -sS "http://localhost:${PORT}/qr?token=${TOKEN}" || true)"
  if echo "$response" | grep -q '"error":"unauthorized"'; then
    reason="$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(`unauthorized expectedSha8=${d.expectedSha8||"null"} gotSha8=${d.gotSha8||"null"} expectedLen=${d.expectedLen||0} gotLen=${d.gotLen||0}`);' <<<"$response")"
    echo "PAIRING_FAIL reason=$reason"
    exit 1
  fi
  if echo "$response" | grep -q "Status: CONNECTED"; then
    connected=true
    break
  fi
  sleep 2
done

if [ "$connected" != "true" ]; then
  echo "PAIRING_FAIL reason=connected_timeout"
  exit 1
fi

STATUS_JSON="$(ssh "$TARGET" 'cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend && node scripts/wa-status-json.js')"

node -e '
const fs=require("fs");
const data=JSON.parse(fs.readFileSync(0,"utf8"));
const connectedOk=data.connected===1;
const sessionOk=data.session_present===true;
const accountsOk=Number(data.accounts_total||0)>=1;
if (connectedOk && sessionOk && accountsOk) {
  console.log("PAIRING_OK");
  process.exit(0);
}
const reasons=[];
if (!connectedOk) reasons.push("connected_not_1");
if (!sessionOk) reasons.push("session_missing");
if (!accountsOk) reasons.push("accounts_total_lt1");
console.log(`PAIRING_FAIL reason=${reasons.join(",") || "unknown"}`);
process.exit(1);
' <<<"$STATUS_JSON"
