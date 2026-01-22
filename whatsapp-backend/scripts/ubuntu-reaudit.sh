#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_HOST="${SSH_HOST:-root@37.27.34.179}"

run_remote() {
  local svc="whatsapp-backend"
  local app_dir="/opt/whatsapp/whatsapp-backend"
  local env_file="/etc/whatsapp-backend/env"
  local report_file="$app_dir/docs/UBUNTU_RUNTIME_AUDIT_WHATSAPP_BACKEND.md"

  redact() { sed -E 's/(Bearer )[A-Za-z0-9\._-]+/\1[REDACTED]/g'; }

  echo "== systemd status =="
  systemctl status "$svc" --no-pager -l | redact || true
  echo "NRestarts=$(systemctl show "$svc" -p NRestarts --value || true)"

  echo "== resources snapshot =="
  uptime || true
  free -h || true
  df -h / || true

  pid="$(systemctl show "$svc" -p MainPID --value || true)"
  if [ -n "${pid:-}" ] && [ "$pid" != "0" ]; then
    ps -p "$pid" -o pid,etime,pcpu,pmem,rss,vsz,cmd --no-headers || true
  fi

  svc_user="$(systemctl show "$svc" -p User --value || true)"
  [ -z "$svc_user" ] && svc_user="root"

  sessions_path="$(awk -F= '$1=="SESSIONS_PATH"{print $2}' "$env_file" 2>/dev/null || true)"
  port="$(awk -F= '$1=="PORT"{print $2}' "$env_file" 2>/dev/null || true)"
  [ -z "$port" ] && port="8080"
  [ -z "$sessions_path" ] && sessions_path="$app_dir/.baileys_auth"

  echo "== sessions path =="
  echo "sessions_path=$sessions_path"
  sudo -u "$svc_user" test -d "$sessions_path" && echo "sessions_exists=YES" || echo "sessions_exists=NO"
  sudo -u "$svc_user" test -w "$sessions_path" && echo "sessions_writable=YES" || echo "sessions_writable=NO"

  creds_count="$(find "$sessions_path" -name creds.json 2>/dev/null | wc -l | tr -d ' ')"
  app_state_keys="$(find "$sessions_path" -name "app-state-sync-key-*.json" 2>/dev/null | wc -l | tr -d ' ')"
  app_state_versions="$(find "$sessions_path" -name "app-state-sync-version-*.json" 2>/dev/null | wc -l | tr -d ' ')"
  echo "creds_json=$creds_count"
  echo "app_state_keys=$app_state_keys"
  echo "app_state_versions=$app_state_versions"

  base="http://127.0.0.1:$port"
  admin_token="$(awk -F= '$1=="ADMIN_TOKEN"{print $2}' "$env_file" 2>/dev/null || true)"
  umask 077
  curl_cfg=""
  if [ -n "$admin_token" ]; then
    curl_cfg="$(mktemp)"
    printf 'header = "Authorization: Bearer %s"\n' "$admin_token" > "$curl_cfg"
  fi

  curl_admin() {
    local url="$1"
    if [ -n "$curl_cfg" ]; then
      curl -sS -K "$curl_cfg" "$url"
    else
      curl -sS "$url"
    fi
  }

  cleanup() {
    [ -n "$curl_cfg" ] && rm -f "$curl_cfg" || true
  }
  trap cleanup EXIT

  echo "== /health metadata =="
  health_meta="$(curl -sS -o /tmp/health.json -w "health_http=%{http_code} bytes=%{size_download}" "$base/health" || true)"
  echo "$health_meta"
  node -e 'try{const j=require("/tmp/health.json");console.log(JSON.stringify({ok:j.ok,accounts_total:j.accounts_total,connected:j.connected,needs_qr:j.needs_qr,waMode:j.waMode,lockStatus:j.lockStatus,lockRemainingSec:j.lockRemainingSec,sessions_dir_writable:j.sessions_dir_writable}));}catch(e){console.log("health_parse_failed");}' || true

  echo "== /api/status/dashboard metadata =="
  dash_meta="$(curl -sS -o /tmp/dash.json -w "dash_http=%{http_code} bytes=%{size_download}" "$base/api/status/dashboard" || true)"
  echo "$dash_meta"
  node -e 'try{const j=require("/tmp/dash.json");const s=j.summary||{};console.log(JSON.stringify({service:j.service?.status,waMode:j.service?.waMode,lockStatus:j.service?.lockStatus,lockRemainingSec:j.service?.lockRemainingSec,accounts_total:s.total,connected:s.connected,needs_qr:s.needs_qr}));}catch(e){console.log("dash_parse_failed");}' || true

  echo "== endpoints metadata (accounts/threads/messages) =="
  curl_admin "$base/api/whatsapp/accounts" > /tmp/accounts.json || true
  account_id="$(node -e 'try{const j=require("/tmp/accounts.json");const acc=j.accounts||[];const first=acc[0]?.id||acc[0]?.accountId||"";process.stdout.write(first);}catch(e){process.stdout.write("");}')"
  node -e 'try{const j=require("/tmp/accounts.json");const acc=j.accounts||[];console.log(JSON.stringify({accounts_count:acc.length}));}catch(e){console.log("accounts_parse_failed");}' || true

  thread_id=""
  if [ -n "$account_id" ]; then
    curl_admin "$base/api/whatsapp/threads/$account_id?limit=5&orderBy=lastMessageAt" > /tmp/threads.json || true
    node -e 'try{const j=require("/tmp/threads.json");const t=j.threads||[];const first=t[0]?.id||t[0]?.threadId||null;console.log(JSON.stringify({threads_count:t.length}));}catch(e){console.log("threads_parse_failed");}' || true
    thread_id="$(node -e 'try{const j=require("/tmp/threads.json");const t=j.threads||[];const first=t[0]?.id||t[0]?.threadId||"";process.stdout.write(first);}catch(e){process.stdout.write("");}')"
  fi

  if [ -n "$account_id" ] && [ -n "$thread_id" ]; then
    curl_admin "$base/api/whatsapp/messages/$account_id/$thread_id?limit=5&orderBy=tsClient" > /tmp/messages.json || true
    node -e 'try{const j=require("/tmp/messages.json");const m=j.messages||[];console.log(JSON.stringify({messages_count:m.length}));}catch(e){console.log("messages_parse_failed");}' || true
  fi

  echo "== /health burst (30x) =="
  node -e 'const {execSync}=require("child_process");const base=process.env.BASE;const codes={};for(let i=0;i<30;i++){let c="ERR";try{c=execSync(`curl -s -o /dev/null -w "%{http_code}" ${base}/health`).toString().trim();}catch(e){}codes[c]=(codes[c]||0)+1;}console.log(JSON.stringify(codes));' BASE="$base" || true

  echo "== logs (last 15 min, sanitized) =="
  journalctl -u "$svc" --since "15 minutes ago" --no-pager | redact \
    | grep -Ei "PASSIVE|ACTIVE|lock|lease|sessions_dir_writable|SESSIONS_PATH|restore|history|sync|reconnect|stale|DisconnectReason|401|429" \
    | tail -n 120 || true

  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  health_http="$(echo "$health_meta" | sed -n 's/.*health_http=\\([0-9]*\\).*/\\1/p')"
  dash_http="$(echo "$dash_meta" | sed -n 's/.*dash_http=\\([0-9]*\\).*/\\1/p')"

  {
    echo
    echo "## Re-Audit ${timestamp}"
    echo "- service: $svc"
    echo "- port: $port"
    echo "- sessions_path: $sessions_path"
    echo "- sessions_writable: $(sudo -u "$svc_user" test -w "$sessions_path" && echo yes || echo no)"
    echo "- creds_json: $creds_count"
    echo "- app_state_keys: $app_state_keys"
    echo "- app_state_versions: $app_state_versions"
    echo "- health_http: ${health_http:-unknown}"
    echo "- dashboard_http: ${dash_http:-unknown}"
  } >> "$report_file"
}

if [ "${REMOTE_RUN:-}" = "1" ]; then
  run_remote
  exit 0
fi

if [ "${1:-}" = "--local" ]; then
  ssh -i "$SSH_KEY" "$SSH_HOST" 'REMOTE_RUN=1 bash -s' < "$0"
  exit 0
fi

run_remote
