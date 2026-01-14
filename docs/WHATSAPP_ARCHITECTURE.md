## WhatsApp Architecture (production)

### Production truth (what runs in production)
- **Canonical runtime**: `whatsapp-connector/` (Railway/VM long-running)
- **Source of truth**: WhatsApp phones + Baileys auth state on persistent volume
- **Operational mirror**: Firestore (`whatsapp_*` collections)
- **Realtime UI**: Flutter reads Firestore streams (no Socket.IO)

### Invariants (non-negotiable)
- **No client writes** to canonical data plane:
  - `whatsapp_threads`, `whatsapp_messages`, `whatsapp_ingest`, `whatsapp_outbox`, `whatsapp_account_leases`
- **QR/pairing secrets are super-admin only**:
  - stored only in `whatsapp_accounts/{id}/private/state`
- **Idempotency everywhere**:
  - WAL ID: `${accountId}_${chatId}_${waMessageKey}`
  - Thread ID: `${accountId}_${chatId}`
  - Message ID: `${threadId}_${waMessageKey}`
  - Outbox ID: `${threadId}_${sha256(threadId|to|text|clientMessageId)}`
- **Single connector per account**:
  - enforced by Firestore lease in `whatsapp_account_leases/{accountId}`

---

## Pipeline overview

### Inbound
1) Baileys receives `messages.upsert`
2) Connector writes WAL doc to `whatsapp_ingest/*` (create-only, deterministic id)
3) Processor projects idempotently:
   - create `whatsapp_messages/{waMessageId}` if missing
   - upsert `whatsapp_threads/{threadId}` lastMessageAt/preview

### Outbound
1) Flutter calls connector `POST /api/send` with Firebase ID token
2) Connector checks:
   - user is employee
   - thread permission (owner/co-writer/super-admin) and not locked
   - rate limits
3) Connector writes `whatsapp_outbox/{requestId}` (create-only idempotent)
4) Worker claims queued/failed commands, sends via Baileys
5) Worker writes message projection `whatsapp_messages/*` and updates thread
6) Receipts update `whatsapp_messages.delivery`

---

## Ownership model
- **Thread owner**: the employee who sends the **first outbound** message on that thread.
- **Co-writers**: explicitly granted by owner (or super-admin override).
- **Locked thread**: nobody can send unless super-admin.

Connector enforces this at `/api/send`.

---

## Known historical bug (regression to avoid)
There was an “Account Not Found” regression caused by **collection mismatch**:
- QR page queried `db.collection('accounts')` while other components were moving toward `whatsapp_accounts`.

This is visible in legacy code under `whatsapp-backend/server.js` at `/api/whatsapp/qr/:accountId`.

Migration policy:
- Keep legacy endpoints for a while, but ensure **all new code** reads/writes **only** `whatsapp_*`.

---

## Failure modes & mitigations
- **Transient disconnects**: connector reconnect policy with jittered backoff; auth state persists on volume.
- **Multi-instance double-connect**: prevented by `whatsapp_account_leases`.
- **Ingest duplication**: prevented by WAL deterministic IDs + message deterministic IDs.
- **Outbox duplication**: prevented by deterministic requestId (dedupeKey).
- **Downtime gaps**: connector best-effort backfill on reconnect using Baileys history fetch into WAL (safe re-run).

