## WhatsApp Connector (Railway/VM) — RUNBOOK

This service is the **production WhatsApp connector**:
- **Long-running** (Railway/VM) Baileys sockets for up to **30 accounts**
- **Firestore is source of truth** for `whatsapp_accounts`, `whatsapp_account_leases`, `whatsapp_ingest`, `whatsapp_threads`, `whatsapp_messages`, `whatsapp_outbox`
- **Realtime UI** in Flutter comes from **Firestore streams** (no Socket.IO)
- **Sending** is **server-controlled**: Flutter calls HTTP API → server writes `whatsapp_outbox` → worker sends via Baileys → writes `whatsapp_messages`

---

## 1) Deploy to Railway

### Service root
Deploy the folder: `whatsapp-connector/`

### Required env vars
- **PORT**: `8080` (Railway provides it automatically; this is a safe default)
- **INSTANCE_ID**: optional; if unset, generated on boot
- **MAX_ACCOUNTS**: `30`
- **SESSIONS_PATH**: `/data/.baileys_auth` (must be a mounted persistent volume)
- **FIREBASE_SERVICE_ACCOUNT_JSON**: JSON service account (recommended)
  - Or use:
    - **FIREBASE_PROJECT_ID**
    - **FIREBASE_CLIENT_EMAIL**
    - **FIREBASE_PRIVATE_KEY** (with `\n` escaped newlines supported)
- Optional:
  - **SHARD_COUNT**, **SHARD_INDEX** (multi-instance sharding)
  - **LEASE_MS** (default 25000)
  - **LEASE_RENEW_EVERY_MS** (default 15000)

### Persistent volume
Create & mount a persistent volume at `/data` and set:
- `SESSIONS_PATH=/data/.baileys_auth`

This is mandatory for:
- fast reconnect
- not losing linked-device auth across redeploys

---

## 2) Configure Flutter to point to the connector

Set Firestore doc:
- `app_config/whatsapp_connector`:
  - `baseUrl`: `"https://<your-railway-domain>"`

Example:

```json
{ "baseUrl": "https://your-whatsapp-connector.up.railway.app" }
```

---

## 3) Connect a new WhatsApp account (QR)

1) Login in Flutter with super-admin:
   - `ursache.andrei1995@gmail.com`
2) Go to **WhatsApp → Accounts**
3) Tap **Add** (name + optional phone)
4) Wait for status `qr_ready` and the QR image to appear
5) On the phone:
   - WhatsApp → **Linked devices** → **Link a device** → scan QR
6) After pairing, status should switch to `connected` and QR disappears.

If stuck:
- Tap **Regenerate** (forces session reset for that account on the current connector instance).

---

## 4) Verify end-to-end

### A) Health

```bash
curl -sS https://<BASE>/health
```

### B) Create account (admin only)

```bash
export BASE="https://<BASE>"
export ID_TOKEN="...firebase id token for super-admin..."

curl -sS -X POST "$BASE/api/accounts" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Account","phone":"+40..."}'
```

### C) Send message (employee or admin)

```bash
export THREAD_ID="wa_<accountId>_<chatId>"
export ID_TOKEN="...firebase id token..."

curl -sS -X POST "$BASE/api/send" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"'"$THREAD_ID"'","to":"<chatId>","text":"ping","clientMessageId":"cli-1"}'
```

Expected:
- A doc appears in `whatsapp_outbox/*`
- Worker marks it `sent`
- A doc appears in `whatsapp_messages/*`
- `whatsapp_threads/<threadId>` updates `lastMessageAt/lastMessageText`

### D) Inbound message
Send a message **from the phone** to that account.

Expected:
- A doc appears in `whatsapp_ingest/*` (WAL)
- It becomes `processed=true`
- A doc appears in `whatsapp_messages/*`
- Thread updates in `whatsapp_threads/*`

---

## 5) Common failures / fixes

### No QR appears
- Check logs: look for `connection_update_error` / `messages_upsert_error`
- Ensure the service can write to Firestore (service account correct)
- Ensure `SESSIONS_PATH` is writable

### Reconnect loops / frequent disconnects
- Verify persistent volume is mounted (auth state must persist)
- Confirm the account is not in `desiredState="paused"`
- Ensure only one instance holds the lease for that account:
  - `whatsapp_account_leases/<accountId>.ownerInstanceId`

### Lease conflicts (multi-instance)
- Either run **one instance**, or configure sharding:
  - `SHARD_COUNT=2`, `SHARD_INDEX=0` and another with `SHARD_INDEX=1`

---

## 6) Local dev (optional)

From repo root:

```bash
cd whatsapp-connector
npm install
set PORT=8080
set SESSIONS_PATH=%CD%\\.sessions
set FIREBASE_SERVICE_ACCOUNT_JSON=...
npm start
```

