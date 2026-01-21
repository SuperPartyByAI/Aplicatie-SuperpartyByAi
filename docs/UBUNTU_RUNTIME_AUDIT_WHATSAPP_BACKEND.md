# Ubuntu Runtime Audit — WhatsApp Backend

## Findings
- `SESSIONS_PATH` is unset; effective path falls back to `/opt/whatsapp/whatsapp-backend/.baileys_auth`, but the directory is missing and not writable.
- After service restart, `/health` and `/api/status/dashboard` report zero accounts; restore does not occur (consistent with missing disk session path).
- `/health` response does not include `sessions_dir_writable` in current deployment (likely not updated to latest code yet).
- API read endpoints respond and return metadata counts; inbox/messages counts are non‑zero.
- Log history (24h) contains repeated Firestore serialization errors (`Message`/`WebMessageInfo` objects) from previous runs.
- Health burst histogram test was inconclusive (script returned ERR) and should be re‑run after fixing sessions path.

## Evidence (sanitized)
- Service status: active/running, PID 1513, memory ~165MB.
- Runtime config:
  - `PORT=8080`
  - `SESSIONS_PATH=<unset>`
  - `SESSIONS_PATH_EFFECTIVE=/opt/whatsapp/whatsapp-backend/.baileys_auth`
- Sessions path check:
  - `sessions_exists=NO`
  - `sessions_writable=NO`
- Health (single):
  - HTTP 200, `{ok:true, connected:1, accounts_total:1, status:"healthy"}`
- Dashboard (single):
  - HTTP 200, `{service:"healthy", storageWritable:true, total:1, connected:1, needs_qr:0, accounts_count:1}`
- Accounts:
  - `accounts_count=2`
- Threads (account sample):
  - `threads_count=5`
- Inbox (account sample):
  - `messages_count=5`, `total=1609`
- Messages (thread sample):
  - `messages_count=5`
- Restart test:
  - `/health` after restart: `{ok:true, connected:0, accounts_total:0}`
  - `/api/status/dashboard` after restart: `{total:0, connected:0, needs_qr:0, accounts_count:0}`

## Checklist (DA/NU)
- Service running (systemd): **DA**
- Port listening on 8080: **DA**
- `SESSIONS_PATH` set (persistent): **NU**
- Sessions directory exists + writable: **NU**
- Session files present (`creds.json`, `app-state-sync-*`): **NU** (dir missing)
- `/health` returns 200: **DA**
- `/health` exposes `sessions_dir_writable`: **NU** (not in response)
- `/api/status/dashboard` returns counts: **DA**
- Accounts persist after restart: **NU**
- Read endpoints (threads/inbox/messages) return metadata: **DA**
- Health burst 30x without errors: **NU** (inconclusive / ERR)
- Flutter alignment (base URL + endpoints): **PARȚIAL** (see below)

## Flutter Alignment (deduced from code)
Component | Base URL | Paths | Auth | Protocol
---|---|---|---|---
Flutter (accounts/add/regenerate/send) | Firebase Functions | `whatsappProxyGetAccounts`, `whatsappProxyAddAccount`, `whatsappProxyRegenerateQr`, `whatsappProxySend` | Firebase ID token | https
Flutter (threads) | Backend if `WHATSAPP_BACKEND_URL` set, else Functions proxy | `/api/whatsapp/threads/:accountId` or `whatsappProxyGetThreads` | Firebase ID token (proxy) | https (proxy) / http(s) backend
Flutter (inbox) | Backend (requires `WHATSAPP_BACKEND_URL`) | `/api/whatsapp/inbox/:accountId` | Firebase ID token (direct) | http(s)
Flutter (chat messages) | Firestore realtime | `threads/{threadId}/messages` | Firebase Auth | n/a

## Verdict: PROBLEMĂ
Primary blocker: missing persistent/writable sessions path. This breaks “WhatsApp Web‑like” stability after restart.

## Fix Steps (exact)
1) Configure persistent sessions path (systemd override):
```bash
sudo mkdir -p /etc/systemd/system/whatsapp-backend.service.d
sudo tee /etc/systemd/system/whatsapp-backend.service.d/override.conf >/dev/null <<'OVR'
[Service]
Environment="SESSIONS_PATH=/var/lib/whatsapp-backend/sessions"
StateDirectory=whatsapp-backend
OVR

sudo mkdir -p /var/lib/whatsapp-backend/sessions
sudo chown -R root:root /var/lib/whatsapp-backend/sessions
sudo chmod 750 /var/lib/whatsapp-backend/sessions
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-backend
```

2) Verify:
```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/api/status/dashboard
```
Expected: `sessions_dir_writable=true` (after deploy with updated code) and accounts restore without QR.

3) Re‑run health burst test (30x) after sessions fix to confirm no 429.

4) Deploy current branch to server so `/health` includes `sessions_dir_writable` and dashboard fields (hasDiskSession, needs_qr, isStale, leaseUntil).
