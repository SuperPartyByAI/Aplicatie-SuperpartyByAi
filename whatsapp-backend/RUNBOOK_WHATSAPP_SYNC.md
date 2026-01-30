# WhatsApp History Sync & Conversation Persistence - Operator Runbook

**Version:** 2.0.0+  
**Feature:** Best-effort full conversation sync  
**Last Updated:** 2026-01-17

---

## Overview

This runbook documents the **best-effort full conversation sync** feature that ensures WhatsApp message history is persisted in Firestore:

1. **On pairing/re-pair:** Ingest WhatsApp history sync (chats + messages) into Firestore
2. **During runtime:** Persist inbound + outbound messages, and update delivery/read receipts
3. **After reconnect:** Backfill recent messages to fill gaps (best-effort), without duplicating
4. **Firestore schema:** Consistent and queryable (`threads/messages` structure)

**See also:** `docs/INGESTION_PIPELINE_INBOX.md` (from project root) — pipeline ingestie, de ce „0 conversații” (backfill, Railway vs Hetzner, backend alive), loguri, health/dashboard.

---

## Environment Variables

### Required

None (feature enabled by default)

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_SYNC_FULL_HISTORY` | `true` | Enable/disable full history sync on connect (`true` = enabled) |
| `WHATSAPP_BACKFILL_COUNT` | `100` | Maximum messages to backfill per thread |
| `WHATSAPP_BACKFILL_THREADS` | `50` | Maximum threads to process during backfill |
| `WHATSAPP_HISTORY_SYNC_DRY_RUN` | `false` | If `true`, logs sync counts but doesn't write to Firestore |
| `WHATSAPP_AUTO_BACKFILL_ENABLED` | `true` | Enable server-side auto backfill (on connect + periodic). Set `false` to disable. |
| `WHATSAPP_BACKFILL_INTERVAL_SECONDS` | (or `AUTO_BACKFILL_INTERVAL_MS`) | Periodic tick interval (seconds preferred; fallback 12 min in ms). |
| `WHATSAPP_BACKFILL_CONCURRENCY` | `2` | Max concurrent backfills globally. |
| `WHATSAPP_BACKFILL_COOLDOWN_MINUTES` | (or `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS`) | Cooldown after success (minutes preferred; fallback 1h in ms). |
| `WHATSAPP_BACKFILL_THREADS` | `50` | Max threads to process per backfill run. |
| `WHATSAPP_BACKFILL_COUNT` | `100` | Max messages to backfill per thread (cap). |
| `WHATSAPP_BACKFILL_MAX_DAYS` | (optional) | Max age in days for thread activity (informational / future use). |
| `AUTO_BACKFILL_ENABLED` | `true` | Legacy: enable auto backfill (both WHATSAPP_* and this must not be `false`). |
| `AUTO_BACKFILL_INTERVAL_MS` | `720000` (12 min) | Legacy: periodic tick interval. |
| `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS` | `3600000` (1 h) | Legacy: skip if last **success** within this window. |
| `AUTO_BACKFILL_ATTEMPT_BACKOFF_MS` | `600000` (10 min) | Min time between **attempts** (retry after failure). |
| `AUTO_BACKFILL_LEASE_MS` | `900000` (15 min) | Lock duration per account (whatsapp_backfill_locks). |
| `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK` | `4` | Max accounts to consider per periodic tick. |
| `AUTO_BACKFILL_MAX_CONCURRENCY` | `2` | Legacy: max concurrent backfills (overridden by WHATSAPP_BACKFILL_CONCURRENCY). |
| `INSTANCE_ID` | `hostname-pid` | Instance identifier for lock holder and logs. |
| `WHATSAPP_BACKFILL_MESSAGES_PER_THREAD` | `20` | Max messages to fetch per thread during backfill. |
| `RECENT_SYNC_ENABLED` | `true` | Enable gap-filler (lightweight recent sync) |
| `RECENT_SYNC_INTERVAL_MS` | `120000` (2 min) | Gap-filler tick interval |
| `RECENT_SYNC_LOOKBACK_MS` | `21600000` (6 h) | Lookback window (informational) |
| `RECENT_SYNC_MAX_THREADS` | `30` | Max threads per recent-sync tick |
| `RECENT_SYNC_MAX_MESSAGES_PER_THREAD` | `20` | Max messages per thread |
| `RECENT_SYNC_MAX_CONCURRENCY` | `1` | Max concurrent recent-sync runs |
| `RECENT_SYNC_LEASE_MS` | `300000` (5 min) | Lease duration per account for recent-sync |
| `AUTO_REPAIR_THREADS_ENABLED` | `true` | Run thread last-activity repair after each backfill (sets lastMessageAt/lastMessageAtMs from latest message). |
| `AUTO_REPAIR_THREADS_LIMIT_PER_RUN` | `200` | Max threads to repair per run (incremental). |
| `AUTO_REPAIR_COOLDOWN_MINUTES` | `60` | Min minutes between repair runs per account (stored in accounts/{id}.lastAutoRepairAt). |

### Setting (Hetzner / env)

Add to backend env (e.g. Hetzner):

```
WHATSAPP_SYNC_FULL_HISTORY=true
WHATSAPP_BACKFILL_COUNT=100
WHATSAPP_BACKFILL_THREADS=50
WHATSAPP_HISTORY_SYNC_DRY_RUN=false
AUTO_BACKFILL_ENABLED=true
AUTO_BACKFILL_INTERVAL_MS=720000
AUTO_BACKFILL_COOLDOWN_SUCCESS_MS=21600000
AUTO_BACKFILL_ATTEMPT_BACKOFF_MS=600000
AUTO_BACKFILL_LEASE_MS=900000
AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK=3
AUTO_BACKFILL_MAX_CONCURRENCY=1
INSTANCE_ID=hetzner-1
```

Example file: `whatsapp-backend/env.auto-backfill.example`.

### Deploy on Hetzner (systemd / pm2 / Docker)

- **systemd:** Install app, `npm ci`, configure env via `Environment=` in unit or `/etc/default/whatsapp-backend`. Use distinct `INSTANCE_ID` per machine. `systemctl start whatsapp-backend`.
- **pm2:** `pm2 start server.js --name wa-backend`; set env via `--env-file` or `ecosystem.config.js`. `INSTANCE_ID` per process.
- **Docker:** Build, run with `-e AUTO_BACKFILL_ENABLED=1` etc. One `INSTANCE_ID` per container.

---

## What "Best-Effort Full Sync" Means

- **History Sync (`syncFullHistory: true`):** On initial pairing or re-pairing, Baileys provides a history sync event (`messaging-history.set`) containing all chats and messages. These are ingested into Firestore automatically.

- **Real-time Messages (`messages.upsert`):** All new messages (inbound and outbound) are persisted to `threads/{threadId}/messages/{messageId}` in real-time.

- **Backfill After Reconnect:** After a reconnect, the system attempts to fill gaps by processing recent active threads. This is "best-effort" because:
  - WhatsApp doesn't expose a direct "fetch history" API
  - Gaps may occur during disconnection periods
  - Backfill relies on pending notifications and sync events

- **Idempotency:** All operations use message ID as document ID, ensuring no duplicates even if sync/backfill runs multiple times.

- **Realtime (primary):** `messages.upsert` → `saveMessageToFirestore` → Firestore `threads/{id}`, `threads/{id}/messages/{id}`. Logs: `[realtime] accountId=... remoteJid=... msg=... ts=... type=... writeOK=true|false`. Diagnostics: `accounts/{id}.lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRealtimeError`.

- **Gap-filler (recent-sync):** Periodic job (default 2 min) fetches last N messages from recent threads via `fetchMessagesFromWA`, writes via `saveMessagesBatch`. Lease per account (`recentSyncLeaseUntil` etc.). Log tag: `[recent-sync]`.

---

## Firestore Collections

### Enhanced Collections

#### `threads/{threadId}/messages/{messageId}`
**Enhanced fields:**
- `messageType`: `'text' | 'image' | 'video' | 'audio' | 'document'`
- `mediaType`, `mediaUrl`, `mediaMimetype`, `mediaFilename` (if media)
- `status`: `'queued' | 'sent' | 'delivered' | 'read'` (for outbound)
- `deliveredAt`, `readAt` (timestamps)
- `syncedAt` (when synced from history)
- `syncSource`: `'history_sync' | 'history_sync_immediate' | 'realtime' | 'backfill'` (source of message ingestion)

#### `threads/{threadId}`
**Enhanced fields:**
- `displayName` (extracted from `pushName`)
- `lastMessagePreview` (first 100 chars of last message)
- `lastBackfillAt` (timestamp of last backfill attempt)

#### `accounts/{accountId}`
**New fields:**
- `lastHistorySyncAt` (timestamp)
- `historySyncCount` (number of messages synced)
- `lastHistorySyncResult`: `{ saved, skipped, errors, total, dryRun }`
- `lastBackfillAt` (timestamp)
- `lastBackfillResult`: `{ threads, messages, errors, threadResults }`
- **Auto backfill:** `lastAutoBackfillAt`, `lastAutoBackfillSuccessAt`, `lastAutoBackfillAttemptAt`, `lastAutoBackfillStatus`, `lastBackfillAt`, `lastBackfillStatus` (running/success/error), `lastBackfillError`, `lastBackfillStats` (threads, messages, errors, durationMs)
- **Lease (distributed lock):** `autoBackfillLeaseUntil`, `autoBackfillLeaseHolder`, `autoBackfillLeaseAcquiredAt`
- **Realtime diagnostics:** `lastRealtimeIngestAt` (serverTimestamp, updated on each messages.upsert), `lastRealtimeMessageAt` (timestamp from message), `lastRealtimeError` (optional, when Firestore write fails).
- **Recent-sync (gap-filler):** `lastRecentSyncAt`, `lastRecentSyncResult`; lease `recentSyncLeaseUntil`, `recentSyncLeaseHolder`, `recentSyncLeaseAcquiredAt`.

**`lastAutoBackfillStatus`** – one of:
- **Running:** `{ running: true, startedAt, trigger: 'connect'|'periodic', holder }`
- **Success:** `{ ok: true, running: false, threads, messages, errors?, durationMs }`
- **Error:** `{ ok: false, running: false, errorCode, errorMessage, durationMs }`

---

## API Endpoints

### GET /api/whatsapp/threads/:accountId

**Purpose:** List threads for an account

**Request:**
```
GET /api/whatsapp/threads/account_prod_...
Query params:
  - limit (default: 50)
  - orderBy (default: 'lastMessageAt')
```

**Response:**
```json
{
  "success": true,
  "threads": [
    {
      "id": "account_prod_...__40712345678@s.whatsapp.net",
      "accountId": "account_prod_...",
      "clientJid": "40712345678@s.whatsapp.net",
      "lastMessageAt": "FirestoreTimestamp",
      "lastMessagePreview": "Hello...",
      "displayName": "John Doe",
      "lastBackfillAt": "FirestoreTimestamp"
    }
  ],
  "count": 10
}
```

### GET /api/whatsapp/messages/:accountId/:threadId

**Purpose:** List messages for a specific thread

**Request:**
```
GET /api/whatsapp/messages/account_prod_.../account_prod_...__40712345678@s.whatsapp.net
Query params:
  - limit (default: 50)
  - orderBy (default: 'createdAt')
```

**Response:**
```json
{
  "success": true,
  "thread": {
    "id": "account_prod_...__40712345678@s.whatsapp.net",
    "accountId": "account_prod_...",
    "clientJid": "40712345678@s.whatsapp.net",
    "lastMessageAt": "FirestoreTimestamp"
  },
  "messages": [
    {
      "id": "3EB0...",
      "accountId": "account_prod_...",
      "clientJid": "40712345678@s.whatsapp.net",
      "direction": "inbound",
      "body": "message text",
      "waMessageId": "3EB0...",
      "status": "delivered",
      "messageType": "text",
      "tsClient": "ISO8601",
      "tsServer": "FirestoreTimestamp",
      "createdAt": "FirestoreTimestamp",
      "syncedAt": "FirestoreTimestamp",
      "syncSource": "history_sync"
    }
  ],
  "count": 50
}
```

### POST /api/whatsapp/backfill/:accountId

**Purpose:** Trigger manual backfill for an account (admin endpoint)

**Request:**
```
POST /api/whatsapp/backfill/account_prod_...
```

**Response:**
```json
{
  "success": true,
  "message": "Backfill started (runs asynchronously)",
  "accountId": "account_prod_..."
}
```

**Note:** Backfill runs asynchronously. Check `accounts/{accountId}.lastBackfillResult` in Firestore for results.

### POST /api/admin/backfill/:accountId (admin-only)

**Purpose:** Enqueue backfill for an account (same as auto-backfill run; requires admin token).

**Request:** `POST /api/admin/backfill/account_prod_...` with admin auth.

**Response:** `{ "success": true, "message": "Backfill enqueued", "accountId": "..." }`.

### GET /api/admin/backfill/:accountId/status (admin-only)

**Purpose:** Get last backfill status for an account.

**Response:** `lastBackfillAt`, `lastBackfillStatus` (running/success/error), `lastBackfillError`, `lastBackfillStats` (threads, messages, errors, durationMs).

---

## Server-side auto backfill

History sync and backfill run **automatically** on the backend (no Flutter/user action). Production-safe: distributed lock, throttling, PASSIVE-aware.

### Behaviour

1. **On connect:** When an account becomes `connected`, an **initial** backfill is scheduled (10–40s jitter).
2. **Periodic:** Every `AUTO_BACKFILL_INTERVAL_MS`, the server runs a tick. **PASSIVE mode:** tick is skipped when lock not held.
3. **Distributed lock:** Per-account Firestore collection `whatsapp_backfill_locks/{accountId}` with fields `ownerId`, `expiresAtMs`, `startedAt`. Only one instance runs backfill per account; others skip. Lock is released on completion or expiry.
4. **Eligibility:** Connected accounts sorted by `lastAutoBackfillAt` asc (oldest first). At most `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK` per tick; at most `AUTO_BACKFILL_MAX_CONCURRENCY` running at once.
5. **Cooldown:** Skip if last **success** &lt; `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS` (6 h). Skip if last **attempt** &lt; `AUTO_BACKFILL_ATTEMPT_BACKOFF_MS` (10 min) for retry-after-failure.
6. **Status:** Before run → `lastAutoBackfillStatus: { running: true, ... }`; on success → `lastAutoBackfillSuccessAt`, `lastAutoBackfillAt`, `{ ok: true, running: false, ... }`; on error → `{ ok: false, running: false, errorCode, errorMessage, ... }` (no success timestamp).

### Control

| Action | How |
|--------|-----|
| **Change interval** | `AUTO_BACKFILL_INTERVAL_MS` (ms). Default 12 min. |
| **Success cooldown** | `AUTO_BACKFILL_COOLDOWN_SUCCESS_MS` (ms). Default 6 h. |
| **Attempt backoff** | `AUTO_BACKFILL_ATTEMPT_BACKOFF_MS` (ms). Default 10 min. |
| **Lease duration** | `AUTO_BACKFILL_LEASE_MS` (ms). Default 15 min. |
| **Max per tick / concurrency** | `AUTO_BACKFILL_MAX_ACCOUNTS_PER_TICK`, `AUTO_BACKFILL_MAX_CONCURRENCY`. |
| **Disable** | `AUTO_BACKFILL_ENABLED=false`. Manual `POST /api/whatsapp/backfill/:accountId` still works. |
| **PASSIVE** | Scheduler does not run when backend is in PASSIVE mode (lock not held). |

### Where to see status

- **Firestore:** `accounts/{accountId}` → `lastAutoBackfillAt`, `lastAutoBackfillSuccessAt`, `lastAutoBackfillAttemptAt`, `lastAutoBackfillStatus`, lease fields; **realtime:** `lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRealtimeError`; **recent-sync:** `lastRecentSyncAt`, `lastRecentSyncResult`, `recentSyncLeaseUntil`, `recentSyncLeaseHolder`.
- **Logs:** `📚 [auto-backfill] AutoBackfill tick: eligibleAccounts=N`; `Backfill start accountId=…` / `Backfill end accountId=… threads=… messages=… durationMs=…`; `[backfill-lock]` acquired/busy/released; `[schema-guard]` missing lastMessageAt/lastMessageAtMs after backfill update; `[realtime]` and `[recent-sync]` as before.
- **Endpoints:** `GET /ready` (mode, instanceId); `GET /diag` (instanceId, mode, `latestRealtime` for up to 3 connected accounts).

### Flutter

- **Flutter never auto-calls backfill.** No automatic Flutter calls for history sync. Sync is 100% server-side.
- The **Sync / Backfill** button in Inbox is **debug-only** (⋯ menu). Normal users never need it.

---

## How to Verify (copy-paste)

### Mac (local backend)

Run from **repo root** (e.g. `.../Aplicatie-SuperpartyByAi`). If you're in `~`, use the full path below.

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend && npm ci && node server.js &
sleep 5
curl -s http://127.0.0.1:8080/ready | jq
curl -s http://127.0.0.1:8080/diag | jq
# Send a WhatsApp message → check logs for [realtime] ... writeOK=true
# Firestore: accounts/{accountId} → lastRealtimeIngestAt, lastRealtimeMessageAt
```

*(Adjust the `cd` path if your repo lives elsewhere.)*

#### Troubleshooting: EADDRINUSE on port 8080 (local)

If `node server.js` fails with **`EADDRINUSE: address already in use 0.0.0.0:8080`**:

1. **Find process on 8080:**
   ```bash
   lsof -iTCP:8080 -sTCP:LISTEN
   ```
2. **Kill it** (use the PID from `lsof`):
   ```bash
   kill <PID>
   ```
   Or **run on another port**:
   ```bash
   PORT=8081 node server.js
   ```
   Then `curl -s http://127.0.0.1:8081/ready | jq` and `curl -s http://127.0.0.1:8081/diag | jq`.

3. **Note:** If the new process didn’t start (e.g. still EADDRINUSE), `curl …/diag` may hit the **old** process. Ensure the new server is listening before trusting curl output.

### Hetzner

**Replace `37.27.34.179`** with your Hetzner backend IP if different.

```bash
# Ready + diag
curl -s http://37.27.34.179:8080/ready | jq
curl -s http://37.27.34.179:8080/diag | jq

# Logs: realtime ingest, recent-sync, auto-backfill
ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f --no-pager" | grep -E 'realtime|recent-sync|auto-backfill'
```

**Firestore (Console):** `accounts/{accountId}` → `lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRecentSyncAt`, `lastAutoBackfillStatus`.

**Acceptance:** Send a new WhatsApp message → within ~10–30 s it appears in `threads/{threadId}/messages` and `lastMessageAt` updates. If backend was down 2 min, restart it → recent-sync fills the gap within 1–2 ticks. No two instances process the same account simultaneously (lease ok).

---

### Validate live ingest + gap recovery (after deploy)

Once `/diag` returns **200**, `mode` is **active**, and `firestoreConnected` is **true**, the next step is **not** deploy but **validating** that live ingest and gap-filler/backfill actually bring missing messages (yesterday/today).

#### 1. Confirm live ingest (new message → Firestore)

1. **Send a new WhatsApp message** to an existing chat (or have someone message you).
2. **On Hetzner**, check `/diag`:
   ```bash
   curl -s http://37.27.34.179:8080/diag | jq
   ```
   Verify that `timestamp` updates and, in `latestRealtime`, fields like `lastRealtimeIngestAt` / `lastRealtimeMessageAt` progress.
3. **In Firestore**, confirm:
   - New documents in `threads/{threadId}/messages/{messageId}`.
   - `lastMessageAt` on the thread document updates.

**If new messages appear:** Live ingest is OK; “yesterday/today” missing is just a **gap** (see step 2).

#### 2. Recover “yesterday” (gap) — backfill + recent-sync

1. **From the app (debug):** Use **Sync / Backfill history** (⋯ menu in Inbox).
2. **On the server**, watch logs:
   ```bash
   ssh root@37.27.34.179 "journalctl -u whatsapp-backend -n 300 --no-pager | grep -E 'realtime|recent-sync|auto-backfill|backfill|error'"
   ```
3. **In Firestore**, open `accounts/{accountId}` and check whether:
   - `lastAutoBackfillAttemptAt` / `lastAutoBackfillSuccessAt` change.
   - `lastAutoBackfillStatus` moves from `running` → `ok` or `error`.
   - `lastRecentSyncAt` / `lastRecentSyncResult` (or `lastRecentSyncStatus`) update, if present in your build.

If WhatsApp still provides yesterday’s messages via web sync, they are usually recovered (they were not “deleted”, just not ingested while the backend was on the old version).

#### 3. “Does it sync all history from my phone?”

We **cannot** guarantee “all phone history”. WhatsApp Web/Baileys does not always expose full unlimited history (depends on chat, age, type, server-side cache, etc.). What you can realistically validate:

- **New messages** arrive **live** (required).
- **Recent gaps** (yesterday/today) are **recovered** via backfill/recent-sync (usually yes).
- **Very old history** may remain **partial**.

#### 4. To confirm whether “yesterday” recovers

Share the values from **Firestore** `accounts/{accountId}` for:

- `lastAutoBackfillStatus`
- `lastAutoBackfillAttemptAt` / `lastAutoBackfillSuccessAt`
- `lastRealtimeMessageAt`
- `lastRecentSyncAt` (and `lastRecentSyncResult` if present)

Those indicate whether backfill and recent-sync have run and whether live ingest is active.

---

### Deploy on Hetzner (whatsapp-backend, path-agnostic)

**If `git pull` fails with `Permission denied (publickey)`:** → See **[Fix Hetzner deployment (git pull fails: deploy key)](#fix-hetzner-deployment-git-pull-fails-deploy-key)** below.

The repo path can vary (e.g. `/opt/superparty/whatsapp-backend` or `/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`). Use the systemd unit to find `WorkingDirectory` and `ExecStart`, then deploy there.

**1. Find backend dir on server:**

```bash
ssh root@37.27.34.179 "systemctl cat whatsapp-backend"
```

Look for `WorkingDirectory=` (and `ExecStart=` if needed). Use that directory for `git pull` and `npm ci`.

**2. Deploy (SSH one-liners).** Replace `HETZNER_IP` with your backend IP (e.g. `37.27.34.179`). Replace `BACKEND_DIR` with the dir from step 1 (e.g. `/opt/superparty/whatsapp-backend` or whatever `WorkingDirectory` shows).

```bash
# One-liner: pull, install, restart
ssh root@HETZNER_IP "cd BACKEND_DIR && git pull && npm ci --omit=dev && systemctl restart whatsapp-backend"
```

Example (replace path with `WorkingDirectory` from step 1):

```bash
ssh root@37.27.34.179 "cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend && git pull && npm ci --omit=dev && systemctl restart whatsapp-backend"
```

**3. Verify /diag (on server):**

```bash
ssh root@HETZNER_IP "curl -i http://127.0.0.1:8080/diag"
```

Example:

```bash
ssh root@37.27.34.179 "curl -i http://127.0.0.1:8080/diag"
```

**Expected:** `HTTP/1.1 200 OK` and JSON with `ready`, `mode`, `instanceId`, `firestoreConnected`, `latestRealtime`, `timestamp`. No HTML, no 404.

**If `curl …/diag` returns 404:** The server is still running an **old** version. Likely causes: wrong deploy path (`WorkingDirectory` differs from where you ran `git pull`), or `systemctl restart` didn’t load new code. Fix: confirm `WorkingDirectory` with `systemctl cat whatsapp-backend`, redeploy there, restart, then `curl` again.

**If `git pull` fails with `Permission denied (publickey)`:** The server has no SSH access to the GitHub repo. See **Fix Hetzner deployment (git pull fails: deploy key)** below.

#### /diag still 404 after deploy

If `curl …/diag` still returns **404** after deploy, use this checklist:

1. **`git pull` didn’t run** — permission / key / remote URL (deploy key missing or wrong; SSH remote blocked; HTTPS remote without token).
2. **Commands ran in the wrong directory** — you must `cd "$WD"` with `WD="$(systemctl show whatsapp-backend -p WorkingDirectory --value)"` before `git pull`.
3. **Service didn’t restart** or is running a different path — verify `systemctl status whatsapp-backend` and `systemctl cat whatsapp-backend` (`WorkingDirectory`, `ExecStart`).

The **Step 3 (Deploy)** commands (**WD**, `git rev-parse --short HEAD`, `grep … app.get('/diag'`) are the quickest way to confirm which case applies (wrong dir, old commit, or no `/diag` in `server.js`).

---

### Fix Hetzner deployment (git pull fails: deploy key)

**Context:** Hetzner runs `whatsapp-backend` from `WorkingDirectory` (e.g. `/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`). `curl http://IP:8080/diag` returns **404** when the deployed `server.js` has no `/diag` route. `git pull` fails with **`Permission denied (publickey)`** — the server has no SSH access to the repo.

**Goal:** Fix SSH access, pull latest code, restart, and verify `/diag` returns **200 JSON**. Do not change any `whatsappProxy*` Firebase functions.

**Replace `HETZNER_IP`** with your Hetzner backend IP (e.g. `37.27.34.179`) in all commands below.

---

#### 0. Check remote (optional)

**Purpose:** Confirm origin URL and repo.

```bash
ssh root@HETZNER_IP "cd \$(systemctl show whatsapp-backend -p WorkingDirectory --value) && git remote -v"
```

---

#### 1. Variant A — Existing key `deploy_aplicatie_superparty`

If the server has `/root/.ssh/deploy_aplicatie_superparty` and `deploy_aplicatie_superparty.pub`, that key may already be a GitHub deploy key. **Test:**

```bash
ssh root@HETZNER_IP "ssh -i /root/.ssh/deploy_aplicatie_superparty -o IdentitiesOnly=yes -T git@github.com || true"
```

If you see `Hi …! You've successfully authenticated` (no `Permission denied`), add `/root/.ssh/config` for `github.com`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/deploy_aplicatie_superparty
  IdentitiesOnly yes
```

```bash
ssh root@HETZNER_IP <<'SSH'
set -e
cat >/root/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/deploy_aplicatie_superparty
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
SSH
```

Then proceed to **Step 3 (Deploy)**.

---

#### 2. Variant B — New key `id_ed25519` + GitHub Deploy key

**2a. Create key + print public key**

```bash
ssh root@HETZNER_IP <<'SSH'
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f /root/.ssh/id_ed25519 ]; then
  ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" -C "hetzner-whatsapp-backend"
fi
cat /root/.ssh/id_ed25519.pub
SSH
```

Copy the `ssh-ed25519 AAAAC3...` line.

**2b. GitHub:** Repo → **Settings** → **Deploy keys** → **Add deploy key** → paste pubkey → **Read access**. Authorize for **SSO** if the org requires it.

**2c. `/root/.ssh/config`** snippet for `github.com` (`IdentityFile` = `id_ed25519`, `IdentitiesOnly yes`):

```bash
ssh root@HETZNER_IP <<'SSH'
set -e
cat >/root/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/id_ed25519
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
SSH
```

**2d. Test**

```bash
ssh root@HETZNER_IP "ssh -T git@github.com || true"
```

Expect `Hi …! You've successfully authenticated`. Then proceed to **Step 3 (Deploy)**.

---

#### 3. Deploy (path-agnostic, copy-paste)

Run from your Mac. Commands **in this exact order** (path-agnostic via `WD`):

```bash
ssh root@HETZNER_IP <<'SSH'
set -e
WD="$(systemctl show whatsapp-backend -p WorkingDirectory --value)"
echo "WD=$WD"
cd "$WD"

git pull
npm ci --omit=dev
systemctl restart whatsapp-backend
sleep 2

curl -i http://127.0.0.1:8080/ready || true
curl -i http://127.0.0.1:8080/diag || true

git rev-parse --short HEAD || true
grep -n "app.get('/diag'" server.js || true
SSH
```

**Expected:** `git pull` succeeds (no `Permission denied`); `curl …/diag` → **200 OK** and JSON; `grep` shows the `/diag` route. Then from your Mac:

```bash
curl -i http://HETZNER_IP:8080/diag
```

**Success:** `200 OK` and same JSON. `/diag` exists; backend matches repo.

**NOTE (npm ci --omit=dev):** Any runtime dependency must be in `dependencies` (not `devDependencies`), because `--omit=dev` excludes `devDependencies`. Example: `groq-sdk` must be in `dependencies`. Do not change `package.json`; only ensure runtime deps are listed there.

---

#### 4. If `ssh -T git@github.com` still fails

The server **offers** a key, but GitHub **rejects** it (`Permission denied (publickey)`). That usually means: the key is **not registered** for this repo, you’re using the **wrong repo**, or **SSO** is required and the key is **not authorized**.

**Debug command:**

```bash
ssh root@HETZNER_IP 'ls -la /root/.ssh && ssh -vT git@github.com'
```

Use the output to check key path, permissions, and that GitHub sees the deploy key. Ensure the key is added as a **Deploy key** for `SuperPartyByAI/Aplicatie-SuperpartyByAi`; if the org uses SSO, authorize the key.

---

#### 5. Fallback: HTTPS remote + PAT (if deploy key not possible)

If you can’t use a deploy key, switch the remote to HTTPS and use a **Personal Access Token (PAT)**. Use **`npm ci --omit=dev`** in the install step.

- **PAT:** Use a token with `repo` scope as the **“password”** when `git pull` prompts for credentials.
- **Non-interactive:** For unattended use, configure a **credential helper** or **`GIT_ASKPASS`** on the server (no code changes here).

```bash
ssh root@HETZNER_IP <<'SSH'
set -e
WD="$(systemctl show whatsapp-backend -p WorkingDirectory --value)"
echo "WD=$WD"
cd "$WD"

git remote -v
# If origin is git@github.com:... use:
git remote set-url origin https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git

git pull
npm ci --omit=dev
systemctl restart whatsapp-backend
sleep 2
curl -i http://127.0.0.1:8080/diag || true
SSH
```

---

#### 6. Fallback: SCP single file (quick, no Git)

Only if you have the correct `server.js` locally and prefer not to use Git. **Warn:** SCP can miss other changed files (new modules, config, etc.); **prefer git-based deploy** (Steps 1–3 or 5).

From your Mac (replace `HETZNER_IP` and `BACKEND_DIR`):

```bash
BACKEND_DIR="/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend"

scp /Users/universparty/Aplicatie-SuperpartyByAi/whatsapp-backend/server.js \
  root@HETZNER_IP:"${BACKEND_DIR}/server.js"

ssh root@HETZNER_IP "cd ${BACKEND_DIR} && npm ci --omit=dev && systemctl restart whatsapp-backend"
```

Then verify: `curl -i http://HETZNER_IP:8080/diag` → **200 OK** and JSON.

---

#### 7. Deploy from git only (production, no rsync)

When you no longer want to depend on rsync, use **git-only** deploy:

1. **Commit + push** to a production branch (e.g. `main` or `prod`) that includes:
   - The `/diag` route in `server.js`
   - `lib/wa-auto-backfill`, `lib/wa-recent-sync`, etc.
   - `groq-sdk` in `dependencies` (see `package.json`).

2. **On Hetzner**, deploy strictly from git (no stash, no rsync). Replace `<BRANCH>` with your prod branch (e.g. `main`):

```bash
ssh root@37.27.34.179 "
set -e
WD=\"\$(systemctl show whatsapp-backend -p WorkingDirectory --value)\"
cd \"\$WD\"
git fetch --all
git checkout <BRANCH>
git reset --hard origin/<BRANCH>
git clean -fd
npm ci --omit=dev
systemctl restart whatsapp-backend
sleep 2
curl -i http://127.0.0.1:8080/diag || true
"
```

Example with `main`:

```bash
ssh root@37.27.34.179 "
set -e
cd \$(systemctl show whatsapp-backend -p WorkingDirectory --value)
git fetch --all
git checkout main
git reset --hard origin/main
git clean -fd
npm ci --omit=dev
systemctl restart whatsapp-backend
sleep 2
curl -i http://127.0.0.1:8080/diag || true
"
```

Then from your Mac: `curl -i http://37.27.34.179:8080/diag` → **200** + JSON.

---

**Success conditions (Fix Hetzner deployment):**

- [ ] `ssh -T git@github.com` from Hetzner succeeds (after deploy key added).
- [ ] `git pull` in `WorkingDirectory` completes without `Permission denied`.
- [ ] `systemctl restart whatsapp-backend` runs; service is active.
- [ ] `curl -i http://127.0.0.1:8080/diag` on server → **HTTP/1.1 200 OK** and JSON (`ready`, `mode`, `instanceId`, `firestoreConnected`, `latestRealtime`, `timestamp`).
- [ ] `curl -i http://37.27.34.179:8080/diag` from Mac → same 200 JSON.

---

### How to verify (checklist)

- [ ] **Local:** `cd whatsapp-backend && npm ci && node server.js` → server starts (no "Route.get() requires a callback" crash).
- [ ] **Local:** `curl -s http://127.0.0.1:8080/diag` → 200 JSON with `ready`, `mode`, `instanceId`, `firestoreConnected`, `latestRealtime`. (If EADDRINUSE, see "Troubleshooting: EADDRINUSE" above.)
- [ ] **Hetzner:** `systemctl cat whatsapp-backend` → get `WorkingDirectory`; then `git pull` + `npm ci --omit=dev` + `systemctl restart` in that dir; `curl -i http://127.0.0.1:8080/diag` on server → 200 JSON.
- [ ] **/diag exists after deploy:** If `curl …/diag` returns **404**, server is old (wrong path or restart didn’t load new code). Verify deploy dir = `WorkingDirectory`, redeploy, restart.
- [ ] **/diag** never throws when Firestore is down; returns `firestoreConnected: false` and `latestRealtime: []`.

---

## Verification in Firestore Console

### Step 1: Verify History Sync

1. Firebase Console → Firestore → Data
2. Collection: `accounts` → Select account document
3. Check fields:
   - `lastHistorySyncAt` (should have timestamp after pairing)
   - `historySyncCount` (number of messages synced)
   - `lastHistorySyncResult` (object with `saved`, `skipped`, `errors`)

### Step 2: Verify Threads & Messages

1. Collection: `threads`
2. Verify:
   - Thread documents have `accountId`, `clientJid`, `lastMessageAt`, `lastMessagePreview`
   - Subcollection `messages` contains message documents
   - Messages have `direction`, `body`, `status`, `waMessageId`, `messageType`

### Step 3: Verify Backfill

1. Collection: `accounts` → Select account document
2. Check fields:
   - `lastBackfillAt` (timestamp of last backfill)
   - `lastBackfillResult` (object with `threads`, `messages`, `errors`)
   - `lastAutoBackfillAt`, `lastAutoBackfillSuccessAt`, `lastAutoBackfillAttemptAt`, `lastAutoBackfillStatus` (server-side auto backfill)
   - Lease: `autoBackfillLeaseUntil`, `autoBackfillLeaseHolder`, `autoBackfillLeaseAcquiredAt` (when running, holder is instance id)

Use **Firebase Console** → Firestore → `accounts` → `{accountId}` and inspect the fields above. Logs: `📚 [auto-backfill]` for tick summary and per-account start/end.

### Step 3b: Verify Realtime Ingest & Recent-Sync

1. **Realtime:** `accounts/{accountId}` → `lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRealtimeError`. Logs: `[realtime] … writeOK=true|false`.
2. **Recent-sync:** `accounts/{accountId}` → `lastRecentSyncAt`, `lastRecentSyncResult` (ok, threads, messages, errors, durationMs). Logs: `[recent-sync] … end threads=… messages=…`.
3. **Diag:** `curl -s http://BACKEND_URL/diag | jq` → `instanceId`, `mode`, `latestRealtime` (lastRealtimeIngestAt, lastRealtimeMessageAt, lastRealtimeError per account).

### Step 4: Verify Receipt Status

1. Collection: `threads/{threadId}/messages`
2. For outbound messages, check:
   - `status: 'sent' | 'delivered' | 'read'`
   - `deliveredAt` timestamp (if delivered)
   - `readAt` timestamp (if read)

---

## How to tell if sync is running or blocked

### 1) Auto-backfill status (Firestore)

In **`accounts/{accountId}`** check:

| Field | Meaning |
|-------|---------|
| `lastAutoBackfillStatus.running` | `true` → backfill in progress; `false` → idle or finished |
| `lastAutoBackfillStatus.ok` | `true` → last run succeeded; `false` → last run failed |
| `lastAutoBackfillStatus.errorCode` / `errorMessage` | Present when `ok === false` → backfill stopped with error |
| `lastAutoBackfillAttemptAt` | Last attempt (any outcome) |
| `lastAutoBackfillSuccessAt` | Last **success**; used for cooldown (e.g. 6 h) |
| `lastAutoBackfillAt` | Last run timestamp |

- **Running:** `running === true` and `startedAt` updates → backfill is active.
- **Cooldown:** `lastAutoBackfillSuccessAt` recent (within cooldown) → next tick skips; normal.
- **Blocked:** `ok === false` and `errorCode` / `errorMessage` set → fix cause (logs, Firestore, backend) then retry.

### 2) Live ingestion (not backfill)

**Test:** Send a **new** WhatsApp message in an existing chat. Check if it appears in Firestore **`threads/{threadId}/messages`** and in **Inbox** within ~10–30 s.

- **Appears:** Live ingestion works. If “yesterday/today” still missing → gap; use **manual backfill** or check **recent-sync** / cooldown.
- **Does not appear:** Problem on backend (WhatsApp connection, sessions, Firestore writes, **PASSIVE** instance, etc.). Fix that first; backfill alone will not fix live.

### 3) `/ready` and mode

```bash
curl -s http://HETZNER_IP:8080/ready | jq
```

- `mode: "active"` → instance can process; auto-backfill ticks run.
- `mode: "passive"` → instance does **not** run backfill ticks (lock not held). Live ingestion may also be disabled depending on setup.

### 4) Manual backfill (recovery test)

From **debug menu** or `whatsappProxyBackfillAccount`: trigger **Backfill started (runs asynchronously)**.

Then in Firestore:

- **`threads/{threadId}/messages`** → new docs / count increases.
- **`threads/{threadId}.lastBackfillAt`** → updated.
- **`accounts/{accountId}.lastBackfillResult`** → `threads`, `messages`, `errors`.

### 5) Why “today/yesterday” might be missing

- **Live ingestion broken:** Connected but no `messages.upsert` / Firestore writes (sessions, errors, PASSIVE). Fix backend first.
- **Backfill throttled:** Success cooldown (e.g. 6 h) → backfill seldom reruns; **live** should cover new messages. Adjust cooldown only if intentional.
- **Backend was down:** Gap while offline. Use **manual backfill** or **recent-sync** catch-up after restart.

### 6) Minimal diagnostic steps (in order)

1. **Live test:** Send a WhatsApp message → does it show up in Inbox / Firestore quickly?
2. **Firestore:** Open `accounts/{accountId}` → note `lastAutoBackfillStatus`, `lastAutoBackfillSuccessAt`, `lastAutoBackfillAttemptAt`, `lastRealtimeIngestAt`, `lastRealtimeMessageAt`.
3. **If live test fails:** Check Hetzner logs  
   `journalctl -u whatsapp-backend -n 200 --no-pager` for errors or missing “incoming message” / `[realtime]` / `messages.upsert`.
4. **If live works but gaps remain:** Run **manual backfill** again → check `lastBackfillAt` and `threads/…/messages` growth.

With `accounts/{accountId}` (or a screenshot/JSON of those fields), you can tell whether sync is **running**, **in cooldown**, or **blocked on error**.

---

## Troubleshooting

### Problem: No history sync on pairing

**Check:**
```bash
# In backend (Hetzner) logs, look for:
📚 [accountId] messaging-history.set event received
📚 [accountId] History sync: X messages found
✅ [accountId] History sync complete: X saved
```

**If missing:**
- Verify `WHATSAPP_SYNC_FULL_HISTORY=true` (or not set, defaults to true)
- Check Firestore connection: `curl .../health | jq .firestore.status`
- History sync may not trigger if account was already paired before

### Problem: Messages not persisting

**Check:**
```bash
# In backend (Hetzner) logs, look for:
[realtime] accountId=... remoteJid=... msg=... writeOK=true
💾 [accountId] Message saved: ... thread=...
```
Firestore `accounts/{accountId}` → `lastRealtimeIngestAt`, `lastRealtimeMessageAt`, `lastRealtimeError`. If `lastRealtimeError` is set, inspect Firestore write failures (permissions, schema). `GET /diag` shows `latestRealtime` for connected accounts.

**Legacy log pattern (still valid):**
```bash
💾 [accountId] Message saved to Firestore: {messageId}
```

**If missing:**
- Verify Firestore is connected
- Check for errors in logs: `❌ [accountId] Message save failed`
- Verify `FIREBASE_SERVICE_ACCOUNT_JSON` is set correctly

### Problem: Backfill not running

**Manual trigger:**
```bash
curl -X POST "http://37.27.34.179:8080/api/whatsapp/backfill/{accountId}"
# Or use your Hetzner backend URL (env BAILEYS_BASE_URL).
```

**From the app:** In **Inbox Angajați**, use „Sync / Backfill history”. Backfill-ul e permis pentru **angajați** (nu doar admin). Vezi `docs/INGESTION_PIPELINE_INBOX.md`.

**Check results:**
- Firestore: `accounts/{accountId}.lastBackfillResult`
- Logs: `📚 [accountId] Starting backfill...`

### Problem: Duplicate messages

**Should not happen** (idempotent by message ID), but if it does:
- Check dedupe collection: `inboundDedupe/{accountId}__{messageId}`
- Messages use `waMessageId` as document ID (upsert with merge)

### Problem: Inbox shows 0 threads but accounts connected

**Cause:** Inbox reads from Firestore; if backend hasn’t ingested (history sync, backfill, realtime), there are no threads for those `accountId`s.

**See:** `docs/INGESTION_PIPELINE_INBOX.md` (from project root): pipeline, three main causes (no backfill, Railway vs Hetzner split, backend not alive), log patterns, health/dashboard checks, alignment checklist.

---

## Monitoring

### Dashboard Fields

The `/api/status/dashboard` endpoint now includes:

```json
{
  "accounts": [
    {
      "accountId": "...",
      "lastBackfillAt": "ISO8601",
      "lastHistorySyncAt": "ISO8601"
    }
  ]
}
```

### Log Indicators

**History Sync:**
- `📚 [accountId] messaging-history.set event received`
- `✅ [accountId] History sync complete: X saved`

**Backfill:**
- `📚 [accountId] Starting backfill for recent threads...`
- `✅ [accountId] Backfill complete: X threads`

**Receipt Updates:**
- `✅ [accountId] Updated message {messageId} status to delivered`
- `✅ [accountId] Updated message {messageId} status to read`

---

## Code Changes Summary

### Files Modified
- `whatsapp-backend/server.js`

### Key Additions

1. **Helper Functions** (lines ~509-759):
   - `saveMessageToFirestore()` - Idempotent message save
   - `saveMessagesBatch()` - Batch writes for history sync (max 500 ops/batch)

2. **History Sync Handler** (lines ~850-925):
   - `sock.ev.on('messaging-history.set', ...)` - Ingests full history on pairing

3. **Enhanced Receipt Handlers** (lines ~1410-1480):
   - `messages.update` - Persists delivery/read status
   - `message-receipt.update` - Persists read receipts

4. **Enhanced Send Message** (lines ~2760-3040):
   - Persists outbound messages to threads before/after send

5. **Backfill Function** (lines ~760-850):
   - `backfillAccountMessages()` - Best-effort gap filling after reconnect

6. **New Endpoints**:
   - `POST /api/whatsapp/backfill/:accountId` (line ~2743)
   - `GET /api/whatsapp/threads/:accountId` (line ~3043)
   - `GET /api/whatsapp/messages/:accountId/:threadId` (line ~3073)

7. **Enhanced Dashboard** (lines ~4892-4970):
   - Includes `lastBackfillAt` and `lastHistorySyncAt` per account

---

## Safety & Idempotency

- **Message ID as Document ID:** Prevents duplicates (Firestore `set` with merge)
- **Dedupe Collection:** `inboundDedupe/{accountId}__{messageId}` for inbound messages
- **Batch Writes:** Limited to 500 ops per batch (Firestore limit)
- **Throttling:** Jitter and delays between operations to avoid rate limits
- **Dry Run Mode:** `WHATSAPP_HISTORY_SYNC_DRY_RUN=true` for testing without writes

---

## Performance Considerations

- **History Sync:** May process thousands of messages (batched, throttled)
- **Backfill:** Processes up to 50 threads with 100 messages each (configurable)
- **Concurrency:** Backfill processes 1-2 threads at a time to avoid overwhelming Firestore
- **Graceful Shutdown:** Waits up to 30 seconds for pending Firestore batches

---

**END OF RUNBOOK**
