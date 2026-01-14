## WhatsApp Firestore Schema (canonical)

### Control plane

#### `whatsapp_accounts/{accountId}` (employee-readable, server-only writes)
- **Purpose**: account status/health only (safe for employees)
- **Key fields** (target):
  - `accountId` (optional duplicate of doc id)
  - `name`
  - `phoneE164` (preferred) / legacy `phone`
  - `status`: `connecting|qr_ready|connected|disconnected|reconnecting|needs_qr|error`
  - `lastSeenAt` (heartbeat, updated ~15s)
  - `lastEventAt` (last WA event timestamp)
  - `syncGapStartAt`, `syncGapEndAt`
  - `degraded`, `degradedReason`
  - `lastError`, `disconnectReason`
  - `reconnectCount`
  - `lastSyncedAt`, `lastSyncedKey`
  - `desiredState`: `connected|paused`
  - `assignedWorkerId`

#### `whatsapp_accounts/{accountId}/private/state` (super-admin only read, server-only writes)
- **Purpose**: secrets / QR data for pairing
- Fields:
  - `qrCodeDataUrl`
  - `pairingCode`
  - `qrGeneratedAt`, `qrExpiresAt`
  - `authMeta` (no secrets)

#### `whatsapp_account_leases/{accountId}` (server-only writes, super-admin read)
- Fields:
  - `ownerInstanceId`
  - `leaseUntil`
  - `updatedAt`

#### `whatsapp_alerts/{alertId}` (server-only writes, super-admin read)
- Fields:
  - `type`, `severity`
  - `accountId`, `threadId`
  - `message`, `meta`
  - `createdAt`

---

### Data plane (employee read-only)

#### `whatsapp_threads/{threadId}` (server-only writes, employee read)
`threadId = "${accountId}_${chatId}"`
- Fields (target):
  - `threadId` (duplicate convenience)
  - `accountId`
  - `chatId`
  - `clientPhoneE164`
  - `clientDisplayName`
  - `ownerUid`, `ownerEmail`
  - `coWriterUids[]`
  - `locked`, `lockedReason`
  - `lastMessageAt`
  - `lastMessagePreview`
  - `unreadCountGlobal` (server-maintained heuristic)
  - `createdAt`, `updatedAt`

#### `whatsapp_messages/{waMessageId}` (server-only writes, employee read)
`waMessageId = "${threadId}_${waMessageKey}"` (deterministic)
- Fields (target):
  - `waMessageId`
  - `threadId`, `accountId`, `chatId`
  - `direction`: `in|out`
  - `text`
  - `timestamp` (WA timestamp)
  - `senderUid`, `senderEmail` (for outbound)
  - `delivery`: `queued|sent|delivered|read|failed`
  - `error`
  - `media`: `{ type, url, mime, size, thumbnailUrl?, durationSec?, fileName?, sha256?, storagePath? }`
  - `createdAt`

---

### Pipeline (server-only)

#### `whatsapp_ingest/{eventId}` (WAL / append-only)
`eventId = "${accountId}_${chatId}_${waMessageKey}"`
- Fields:
  - `accountId`, `chatId`
  - `eventType`
  - `waMessageKey`
  - `payload` (raw WA event)
  - `receivedAt`
  - `processed`, `processedAt`
  - `processAttempts`, `lastProcessError`

#### `whatsapp_outbox/{requestId}` (idempotent command queue)
`requestId = "${threadId}_${sha256(threadId|to|text|clientMessageId)}"`
- Fields:
  - `threadId`, `accountId`, `chatId`
  - `to`, `text`, `media`
  - `createdByUid`, `createdByEmail`
  - `status`: `queued|sending|sent|failed`
  - `attempts`, `lastError`, `lastTriedAt`
  - `dedupeKey`, `waMessageKey`

---

### User-private artifacts (owner-only)

#### `users/{uid}/whatsapp_thread_prefs/{threadId}`
- Fields:
  - `lastReadAt`
  - `pinned`
  - optional: `muted`, `customLabel`

---

## Indexes
See `firestore.indexes.json`:
- `whatsapp_messages`: `threadId ASC, timestamp DESC`
- `whatsapp_threads`: `accountId ASC, lastMessageAt DESC` (connector catch-up)
- `whatsapp_outbox`: `status ASC, createdAt ASC` (+ optional `accountId ASC, status ASC, createdAt ASC`)
- `whatsapp_ingest`: `processed ASC, receivedAt ASC`

