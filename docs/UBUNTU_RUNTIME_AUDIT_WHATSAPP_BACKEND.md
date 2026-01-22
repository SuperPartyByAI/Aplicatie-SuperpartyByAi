# Ubuntu Runtime Audit — WhatsApp Backend

## Findings
- `SESSIONS_PATH` is now set to a persistent directory and is writable by the service user.
- Server is running the updated code; `/health` now exposes `sessions_dir_writable=true`.
- After restart, `/health` and `/api/status/dashboard` still report zero accounts; no sessions are restored because disk is empty (no `creds.json` yet).
- Health burst 30x returns HTTP 200 consistently (no 429).
- Logs show PASSIVE mode due to lock not acquired, which can block restore until lock is available.
- `INSTANCE_ID` should be set via systemd (e.g. `INSTANCE_ID=%H`) to avoid random IDs and lock churn after restart.

## Evidence (sanitized)
- Service status: active/running, PID 15603, memory ~165MB.
- Runtime config:
  - `PORT=8080`
  - `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions`
- Sessions path check:
  - `sessions_writable=YES`
- Health (single):
  - HTTP 200, `{ok:true, accounts_total:0, connected:0, sessions_dir_writable:true, waMode, lockStatus}`
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
Flutter (chat messages) | Firestore realtime + proxy polling fallback | `threads/{threadId}/messages`, `whatsappProxyGetMessages` | Firebase ID token + App Check (proxy) | https

## Firestore Mode (Flutter)
- Default: prod (emulator off unless `USE_FIREBASE_EMULATOR=true`)
- Fallback: if emulator is unreachable, app logs `Firestore mode: prod` and proceeds

## Inbound Fallback (Flutter)
- Primary: Firestore stream
- Fallback: proxy polling (every ~3s) with `after` cursor and local dedupe
- Expected: `curl` without tokens to proxy returns `401`

## Audit Commands (Sanitized)
```bash
node scripts/audit-firestore-duplicates.js --windowHours=48 --limit=500 --excludeMarked
node scripts/audit-firestore-duplicates.js --windowHours=0.25 --limit=500 --excludeMarked
node scripts/audit-threads-duplicates.js --limit=2000
```
- Index requirement: collectionGroup `messages` ordered by `tsClient` (DESC)

## Index Link (Debug Mode)
```bash
node scripts/audit-firestore-duplicates.js --windowHours=0.25 --limit=50 --debug=1
```
Expected JSON includes:
- `hint: "missing_index"` and `indexLink` (open link and create index)

## Firestore Credential Check (Local)
```bash
node - <<'NODE'
const admin = require('firebase-admin');
try { admin.initializeApp(); } catch (e) {}
admin.firestore().doc('app_config/version').get()
  .then(d => { console.log("FIRESTORE_OK exists=", d.exists); process.exit(0); })
  .catch(e => { console.error("FIRESTORE_ERR", e.code || "", e.message || ""); process.exit(1); });
NODE
```

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
Environment="INSTANCE_ID=%H"
StateDirectory=whatsapp-backend
TimeoutStopSec=30
KillSignal=SIGINT
OVR

sudo systemctl daemon-reload

SVC_USER="$(systemctl show whatsapp-backend -p User --value || true)"
[ -z "$SVC_USER" ] && SVC_USER="root"
SVC_GRP="$(id -gn "$SVC_USER" 2>/dev/null || echo "$SVC_USER")"

sudo install -d -o "$SVC_USER" -g "$SVC_GRP" -m 750 /var/lib/whatsapp-backend/sessions
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-backend
```

## Restart verification without SSH (Cloud Run)
Use the gcloud control plane to trigger a new Cloud Run revision by bumping a
dummy env var (no `systemctl`, no SSH).

```bash
cd ~/Aplicatie-SuperpartyByAi/whatsapp-backend
export RESTART_CMD="./scripts/restart-backend-gcloud.sh"
RUN_RESTART=true node scripts/run-sync-verification.js
```

Environment knobs:
- `GCLOUD_PROJECT` / `GCP_PROJECT`: override project (defaults to gcloud config).
- `RUN_SERVICE_NAME`: exact Cloud Run service name (skip auto-detect).
- `RUN_REGION`: single region to search (skip auto-detect).
- `RUN_SERVICE_MATCH`: regex/substring (default `whatsapp|baileys|backend`).
- `RUN_REGIONS`: comma-separated region list for auto-detect.

The restart script prints strict JSON on stdout:
- success: `{"ok":true,"service":"...","region":"...","beforeRevision":"...","afterRevision":"..."}`
- failure: `{"ok":false,"reason":"...","lastError":"...","tried":[...]}`.

2) Verify:
```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/api/status/dashboard
```
Expected: `sessions_dir_writable=true` (after deploy with updated code) and accounts restore without QR.

3) Ensure only one active instance holds the lock (or wait for lease expiry), then pair once to create `creds.json` on disk.

4) Re‑run health burst test (30x) after sessions fix to confirm no 429.

5) Deploy current branch to server so `/health` includes `sessions_dir_writable` and dashboard fields (hasDiskSession, needs_qr, isStale, leaseUntil).

## Re-Audit 2026-01-21 (sanitized)
- `/health`: `waMode=active`, `lockStatus=held_by_this_instance`, `accounts_total=1`, `connected=1`, `needs_qr=0`, `sessions_dir_writable=true`
- Runtime path:
  - `WorkingDirectory=/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`
  - `ExecStart=/usr/bin/node /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend/server.js`
- Sessions:
  - `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions`
  - `creds.json_count=1`
- Duplicates audit (48h/500):
  - `duplicatesCount=112`
  - `uniqueFingerprints=388`
  - `totalDocs=500`

## Fast verification 2026-01-21 (sanitized)
- Restart x2, 1h audit window (limit 500):
  - before: `totalDocs=500`, `uniqueFingerprints=388`, `duplicatesCount=112`
  - after: `totalDocs=500`, `uniqueFingerprints=388`, `duplicatesCount=112`
- Dashboard metrics:
  - `dedupe.wrote=0`, `dedupe.skipped=0`, `dedupe.strongSkipped=0`
  - `history.wrote=0`, `history.skipped=0`
- Verdict: no increase in duplicates within 1h window (legacy dupes remain).

## Duplicate cleanup run 2026-01-21 (sanitized)
- `/health`: `waMode=active`, `lockStatus=held_by_this_instance`, `accounts_total=1`, `connected=1`, `needs_qr=0`, `sessions_dir_writable=true`
- Sessions:
  - `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions`
  - `creds.json_count=1`
- Thread hash: `ad7bd8a1`
- Audits BEFORE:
  - 48h/500: `totalDocs=500`, `uniqueFingerprints=385`, `duplicatesCount=115`
  - 1h/500: `totalDocs=500`, `uniqueFingerprints=385`, `duplicatesCount=115`
- Cleanup:
  - dry-run: `scannedMessages=849`, `groupsWithDuplicates=50`, `duplicatesToMark=72`
  - apply: `duplicatesToMark=72`, `threadsUpdated=1`
- Audits AFTER:
  - 48h/500: `totalDocs=500`, `uniqueFingerprints=385`, `duplicatesCount=115`
  - 1h/500: `totalDocs=500`, `uniqueFingerprints=385`, `duplicatesCount=115`
- Note: audit counts unchanged because audit script does not filter `isDuplicate=true`.

## Audit (excludeMarked default) 2026-01-21
- Thread hash: `3e8bfeaf`
- BEFORE 48h/500: `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`
- AFTER 48h/500: `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`
- BEFORE 1h/500: `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`
- AFTER 1h/500: `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`

## Quick write test 15m window (sanitized)
- Thread hash: `88e6afbd`
- Outbound send: `status_code=200`, `messageId_hash=e280ce1c`
- Audit BEFORE restart (15m/500): `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`
- Audit AFTER restart (15m/500): `totalDocs=500`, `markedDocs=82`, `activeDocs=418`, `duplicatesCountActive=28`
- Dashboard BEFORE: `dedupe.wrote=0`, `dedupe.skipped=0`, `history.wrote=0`, `history.skipped=0`
- Dashboard AFTER: `dedupe.wrote=0`, `dedupe.skipped=0`, `history.wrote=0`, `history.skipped=0`
- Note: quick write succeeded; no increase in active dupes after restart.
