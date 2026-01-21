# Ubuntu Runtime Audit — WhatsApp Backend

## Findings
- `SESSIONS_PATH` is now set to a persistent directory and is writable by the service user.
- Server is running the updated code; `/health` now exposes `sessions_dir_writable=true`.
- After restart, `/health` and `/api/status/dashboard` still report zero accounts; no sessions are restored because disk is empty (no `creds.json` yet).
- Health burst 30x returns HTTP 200 consistently (no 429).
- Logs show PASSIVE mode due to lock not acquired, which can block restore until lock is available.

## Evidence (sanitized)
- Service status: active/running, PID 15603, memory ~165MB.
- Runtime config:
  - `PORT=8080`
  - `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions`
- Sessions path check:
  - `sessions_writable=YES`
- Health (single):
  - HTTP 200, `{ok:true, accounts_total:0, connected:0, sessions_dir_writable:true}`
- Dashboard (single):
  - HTTP 200, `{service:"healthy", storageWritable:true, total:0, connected:0, needs_qr:0, accounts_count:0}`
- Sessions files counters:
  - `account_dirs=0`
  - `creds_json=0`
  - `app_state_keys=0`
  - `app_state_versions=0`
- Health burst 30x:
  - `{"200":30}`
- Restart test:
  - `/health` after restart: `{ok:true, accounts_total:0, connected:0, sessions_dir_writable:true}`
  - `creds_json_after_restart=0`
- Logs (sanitized):
  - PASSIVE mode / lock not acquired; restore skipped while lock is held by another instance.

## Checklist (DA/NU)
- Service running (systemd): **DA**
- Port listening on 8080: **DA**
- `SESSIONS_PATH` set (persistent): **DA**
- Sessions directory exists + writable: **DA**
- Session files present (`creds.json`, `app-state-sync-*`): **NU** (needs pairing / restore)
- `/health` returns 200: **DA**
- `/health` exposes `sessions_dir_writable`: **DA**
- `/api/status/dashboard` returns counts: **DA**
- Accounts persist after restart: **NU**
- Health burst 30x without errors: **DA**
- Flutter alignment (base URL + endpoints): **PARȚIAL** (see below)

## Flutter Alignment (deduced from code)
Component | Base URL | Paths | Auth | Protocol
---|---|---|---|---
Flutter (accounts/add/regenerate/send) | Firebase Functions | `whatsappProxyGetAccounts`, `whatsappProxyAddAccount`, `whatsappProxyRegenerateQr`, `whatsappProxySend` | Firebase ID token | https
Flutter (threads) | Backend if `WHATSAPP_BACKEND_URL` set, else Functions proxy | `/api/whatsapp/threads/:accountId` or `whatsappProxyGetThreads` | Firebase ID token (proxy) | https (proxy) / http(s) backend
Flutter (inbox) | Backend (requires `WHATSAPP_BACKEND_URL`) | `/api/whatsapp/inbox/:accountId` | Firebase ID token (direct) | http(s)
Flutter (chat messages) | Firestore realtime | `threads/{threadId}/messages` | Firebase Auth | n/a

## Verdict: PROBLEMĂ
Blocking reasons:
- No disk sessions yet (`creds.json` count = 0) → accounts do not restore after restart.
- PASSIVE mode lock not acquired → restore can be gated if another instance holds the lock.

## Fix Steps (exact)
1) Configure persistent sessions path (systemd override) with correct ownership:
```bash
sudo install -d /etc/systemd/system/whatsapp-backend.service.d
sudo tee /etc/systemd/system/whatsapp-backend.service.d/override.conf >/dev/null <<'OVR'
[Service]
Environment="SESSIONS_PATH=/var/lib/whatsapp-backend/sessions"
StateDirectory=whatsapp-backend
OVR

sudo systemctl daemon-reload

SVC_USER="$(systemctl show whatsapp-backend -p User --value || true)"
[ -z "$SVC_USER" ] && SVC_USER="root"
SVC_GRP="$(id -gn "$SVC_USER" 2>/dev/null || echo "$SVC_USER")"

sudo install -d -o "$SVC_USER" -g "$SVC_GRP" -m 750 /var/lib/whatsapp-backend/sessions
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-backend
```

2) Verify:
```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/api/status/dashboard
```
Expected: `sessions_dir_writable=true` (after deploy with updated code) and accounts restore without QR.

3) Ensure only one active instance holds the lock (or wait for lease expiry), then pair once to create `creds.json` on disk.

4) Re‑run health burst test (30x) after sessions fix to confirm no 429.

5) Deploy current branch to server so `/health` includes `sessions_dir_writable` and dashboard fields (hasDiskSession, needs_qr, isStale, leaseUntil).
