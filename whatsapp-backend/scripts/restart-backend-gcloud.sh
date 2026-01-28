#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCLOUD_PROJECT:-${GCP_PROJECT:-}}"
if [ -z "$PROJECT" ]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi
PROJECT="${PROJECT:-superparty-frontend}"

RUN_SERVICE_NAME="${RUN_SERVICE_NAME:-}"
RUN_REGION="${RUN_REGION:-}"
RUN_SERVICE_MATCH="${RUN_SERVICE_MATCH:-whatsapp|baileys|backend}"
RUN_REGIONS="${RUN_REGIONS:-}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TRIED_FILE="$(mktemp)"
SUCCESS_JSON=""

gcloud config set project "$PROJECT" >/dev/null 2>&1

emit_json() {
  python3 - "$TRIED_FILE" "$PROJECT" "$1" "$2" "$3" "$4" "$5" "$6" "$7" <<'PY'
import json, sys, pathlib
tried_path = pathlib.Path(sys.argv[1])
project = sys.argv[2]
ok = sys.argv[3] == "true"
reason = sys.argv[4] if sys.argv[4] != "null" else None
last_error = sys.argv[5] if sys.argv[5] != "null" else None
service = sys.argv[6] if sys.argv[6] != "null" else None
region = sys.argv[7] if sys.argv[7] != "null" else None
before_rev = sys.argv[8] if sys.argv[8] != "null" else None
after_rev = sys.argv[9] if sys.argv[9] != "null" else None

tried = []
if tried_path.exists():
    for line in tried_path.read_text().splitlines():
        parts = line.split("\t", 2)
        if len(parts) < 3:
            continue
        tried.append({
            "service": parts[0],
            "region": parts[1],
            "error": parts[2],
        })

payload = {
    "ok": ok,
    "project": project,
    "restartPerformed": ok,
    "restartVerified": ok,
}
if service:
    payload["service"] = service
if region:
    payload["region"] = region
if before_rev:
    payload["beforeRevision"] = before_rev
if after_rev:
    payload["afterRevision"] = after_rev
if not ok:
    payload["reason"] = reason or "unknown"
    if last_error:
        payload["lastError"] = last_error
    payload["tried"] = tried

print(json.dumps(payload))
PY
}

record_tried() {
  local err
  err="$(echo "$3" | tr '\n' ' ' | tr '\t' ' ')"
  printf "%s\t%s\t%s\n" "$1" "$2" "$err" >> "$TRIED_FILE"
}

get_regions() {
  if [ -n "$RUN_REGION" ]; then
    echo "$RUN_REGION"
    return
  fi
  if [ -n "$RUN_REGIONS" ]; then
    echo "$RUN_REGIONS" | tr ',' '\n' | sed '/^$/d'
    return
  fi
  gcloud run regions list --platform managed --format="value(locationId)" 2>/dev/null || true
}

pick_services() {
  local region="$1"
  local services_json
  services_json="$(gcloud run services list --platform managed --region "$region" --format=json 2>/dev/null || echo '[]')"
  python3 - "$services_json" "$RUN_SERVICE_MATCH" "$region" <<'PY'
import json, re, sys
services = json.loads(sys.argv[1])
pattern = re.compile(sys.argv[2], re.IGNORECASE)
region = sys.argv[3]

def score(name):
    n = name.lower()
    s = 0
    if "whatsapp" in n:
        s += 3
    if "baileys" in n:
        s += 2
    if "backend" in n:
        s += 1
    return s

for svc in services:
    name = svc.get("metadata", {}).get("name", "")
    if not name:
        continue
    if re.search(r'(proxy|function|gcf)', name, re.IGNORECASE):
        continue
    if pattern.search(name):
        print(f"{name}\t{region}\t{score(name)}\tcloudrun")
PY
}

pick_functions() {
  local funcs_json
  funcs_json="$(gcloud functions list --gen2 --format=json 2>/dev/null || echo '[]')"
  python3 - "$funcs_json" "$RUN_SERVICE_MATCH" <<'PY'
import json, re, sys
funcs = json.loads(sys.argv[1])
pattern = re.compile(sys.argv[2], re.IGNORECASE)

def score(name):
    n = name.lower()
    s = 0
    if "whatsapp" in n:
        s += 3
    if "baileys" in n:
        s += 2
    if "backend" in n:
        s += 1
    return s

for fn in funcs:
    name = fn.get("name", "")
    region = fn.get("location", "")
    region = region.split("/")[-1] if region else ""
    svc = fn.get("serviceConfig", {}).get("service", "")
    if not svc or not region:
        continue
    if pattern.search(name) or pattern.search(svc):
        print(f"{svc}\t{region}\t{score(svc)}\tfunction")
PY
}

build_candidates() {
  local tmp
  tmp="$(mktemp)"
  if [ -n "$RUN_SERVICE_NAME" ]; then
    echo -e "${RUN_SERVICE_NAME}\t${RUN_REGION:-us-central1}\t999\tmanual" > "$tmp"
  else
    pick_functions >> "$tmp" || true
    for region in $regions; do
      pick_services "$region" >> "$tmp" || true
    done
  fi

  python3 - "$tmp" <<'PY'
import sys
from collections import defaultdict

rows = []
for line in open(sys.argv[1], 'r'):
    parts = line.strip().split("\t")
    if len(parts) < 4:
        continue
    service, region, score, source = parts[0], parts[1], int(parts[2]), parts[3]
    rows.append((service, region, score, source))

best = {}
for service, region, score, source in rows:
    key = (service, region)
    if key not in best or score > best[key][2]:
        best[key] = (service, region, score, source)

sorted_rows = sorted(best.values(), key=lambda r: (-r[2], r[0], r[1]))
for service, region, score, source in sorted_rows:
    print(f"{service}\t{region}\t{score}\t{source}")
PY
}

attempt_restart() {
  local service="$1"
  local region="$2"
  local image
  local before_rev
  local after_rev
  local ready_status

  image="$(gcloud run services describe "$service" --region "$region" --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || true)"
  if [ -z "$image" ]; then
    record_tried "$service" "$region" "missing_image"
    return 1
  fi

  before_rev="$(gcloud run services describe "$service" --region "$region" --format="value(status.latestReadyRevisionName)" 2>/dev/null || true)"
  if [ -z "$before_rev" ]; then
    record_tried "$service" "$region" "describe_failed"
    return 1
  fi

  local update_out
  set +e
  update_out="$(gcloud run services update "$service" --region "$region" --update-env-vars "RESTART_NONCE=$(date +%s)" --quiet 2>&1)"
  local update_status=$?
  set -e
  if [ $update_status -ne 0 ]; then
    record_tried "$service" "$region" "$update_out"
    return 1
  fi

  for _ in {1..60}; do
    ready_status="$(gcloud run services describe "$service" --region "$region" --format="value(status.conditions[?(@.type==\"Ready\")].status)" 2>/dev/null || true)"
    after_rev="$(gcloud run services describe "$service" --region "$region" --format="value(status.latestReadyRevisionName)" 2>/dev/null || true)"
    if [ "$ready_status" = "True" ] && [ -n "$after_rev" ] && [ "$after_rev" != "$before_rev" ]; then
      set +e
      node "$ROOT_DIR/scripts/test-health.js" >/dev/null 2>&1
      local health_status=$?
      set -e
      if [ $health_status -ne 0 ]; then
        record_tried "$service" "$region" "health_check_failed"
        return 1
      fi
      SUCCESS_JSON="$(emit_json true null null "$service" "$region" "$before_rev" "$after_rev")"
      return 0
    fi
    sleep 5
  done

  record_tried "$service" "$region" "timeout_waiting_ready"
  return 1
}

if [ -n "$RUN_SERVICE_NAME" ]; then
  if attempt_restart "$RUN_SERVICE_NAME" "${RUN_REGION:-us-central1}"; then
    echo "$SUCCESS_JSON"
    exit 0
  fi
  echo "$(emit_json false update_failed null null null null null)"
  exit 2
fi

regions="$(get_regions)"
if [ -z "$regions" ]; then
  echo "$(emit_json false no_regions null null null null null)"
  exit 2
fi

services="$(build_candidates)"
if [ -z "$services" ]; then
  echo "$(emit_json false no_candidate null null null null null)"
  exit 2
fi
while IFS=$'\t' read -r service region score source; do
  [ -z "$service" ] && continue
  if attempt_restart "$service" "$region"; then
    echo "$SUCCESS_JSON"
    exit 0
  fi
done <<< "$services"

echo "$(emit_json false no_candidate null null null null null)"
exit 2
