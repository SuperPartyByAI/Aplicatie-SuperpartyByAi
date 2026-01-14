## WhatsApp Runbook (Railway / VM)

### Deploy target
- Deploy folder: `whatsapp-connector/`
- Long-running service (Railway/VM), not Firebase Functions.

---

## 1) Environment variables

Required:
- `PORT` (Railway sets)
- `SESSIONS_PATH=/data/.baileys_auth` (**must be on persistent volume**)
- `MAX_ACCOUNTS=30`
- Firebase Admin credentials (one option):
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended)
  - OR `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

Recommended:
- `FIREBASE_STORAGE_BUCKET=<project>.appspot.com`

Optional tuning:
- `LEASE_MS=25000`
- `LEASE_RENEW_EVERY_MS=15000`
- `SHARD_COUNT`, `SHARD_INDEX` (multi-instance sharding)
- `RATE_LIMIT_USER_PER_MIN=20`
- `RATE_LIMIT_ACCOUNT_PER_MIN=60`

---

## 2) Persistent volume check (required)

Mount a persistent volume at `/data` and set:
- `SESSIONS_PATH=/data/.baileys_auth`

Verification (after 1 pairing, restart service):
- account should reconnect without requiring QR again.

---

## 3) Configure Flutter base URL

Set Firestore doc:
- `app_config/whatsapp_connector` → `{ "baseUrl": "https://<your-railway-domain>" }`

---

## 4) Connect an account (super-admin)

### A) From Flutter
Go to **WhatsApp → Accounts → Add** and scan QR from WhatsApp “Linked devices”.

### B) From curl (super-admin ID token)

```bash
export BASE="https://<BASE>"
export ID_TOKEN="..."

curl -sS -X POST "$BASE/api/accounts" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Account 1","phone":"+40..."}'
```

Then open Flutter Accounts screen to view QR in:
- `whatsapp_accounts/{accountId}/private/state.qrCodeDataUrl`

---

## 5) Verify health + status transitions

```bash
curl -sS "$BASE/health"
```

Expected:
- `ok: true`
- list of `accounts[]` with statuses and `lastSeenAt`

Status flow (typical):
- `disconnected/connecting` → `qr_ready` → `connected`

---

## 6) Verify sending permission model

### A) Owner send (allowed)
First send sets thread owner.

```bash
export THREAD_ID="<accountId>_<chatId>"
export EMPLOYEE_ID_TOKEN="..."

curl -sS -X POST "$BASE/api/send" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"'"$THREAD_ID"'","accountId":"<accountId>","chatId":"<chatId>","to":"<chatId>","text":"ping","clientMessageId":"cli-1"}'
```

Expected:
- `{ ok: true, commandId: "..." }`
- `whatsapp_outbox/*` doc appears (server-only)
- `whatsapp_messages/*` doc appears (delivery: sent → delivered/read later)

### B) Non-owner send (denied)
Send using a different employee token to the same thread.

Expected:
- HTTP 403 `{ error: "not_thread_writer" }` (or `thread_locked` if locked)

---

## 7) Verify inbound ingestion + dedupe
Send message **from phone** to that account.

Expected:
- `whatsapp_ingest/{accountId}_{chatId}_{waMessageKey}` created once (WAL)
- projected `whatsapp_messages/{threadId}_{waMessageKey}` created once
- `whatsapp_threads/{threadId}.lastMessageAt/lastMessagePreview` updated

---

## 8) Common failures

### “Account Not Found” (historical regression)
Old legacy backend used `accounts/*` while newer clients used `whatsapp_accounts/*`.
This runbook uses the canonical `whatsapp_accounts/*` schema only.

### QR never appears
- Confirm connector has write access to Firestore.
- Confirm persistent volume is mounted and writable.
- Check connector logs for `connection_update_error`.

### Degraded heartbeat alerts
- Connector marks `whatsapp_accounts.degraded=true` if `lastSeenAt` stale > 60s.
- Alerts are written to `whatsapp_alerts/*` (super-admin only).

