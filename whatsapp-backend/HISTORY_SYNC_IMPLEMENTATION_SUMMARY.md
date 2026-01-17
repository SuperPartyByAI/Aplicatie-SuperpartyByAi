# History Sync Implementation Summary

## Code Changes

### File Modified
- `whatsapp-backend/server.js`

### Lines Changed/Added

#### 1. Environment Variables & Configuration (Lines ~377-388)
- Added: `SYNC_FULL_HISTORY`, `BACKFILL_COUNT`, `BACKFILL_THREADS`, `HISTORY_SYNC_DRY_RUN`
- Defaults: History sync enabled, backfill 100 messages/50 threads

#### 2. Helper Functions (Lines ~509-759)
- **`saveMessageToFirestore(accountId, msg, isFromHistory)`** - Idempotent message save (reusable)
- **`saveMessagesBatch(accountId, messages, source)`** - Batch writes for history sync (500 ops/batch limit)

#### 3. Socket Initialization (Lines ~565-577, ~3216-3227)
- Changed: `syncFullHistory: false` → `syncFullHistory: SYNC_FULL_HISTORY`
- Enables history sync on pairing (configurable via env var)

#### 4. History Sync Handler (Lines ~850-925)
- **Event:** `sock.ev.on('messaging-history.set', ...)`
- Extracts messages from history object/array
- Uses `saveMessagesBatch()` for efficient batch writes
- Updates `accounts/{accountId}.lastHistorySyncAt` and `historySyncCount`

#### 5. Enhanced Message Persistence (Lines ~1194-1197)
- Replaced inline save logic with `saveMessageToFirestore()` helper
- Ensures consistent schema and idempotency

#### 6. Enhanced Receipt Handlers (Lines ~1410-1480, ~4075-4146)
- **`messages.update`** - Persists delivery/read status to Firestore
- **`message-receipt.update`** - Persists read receipts with timestamps

#### 7. Enhanced Send Message Endpoint (Lines ~2760-3040)
- Persists outbound messages to threads BEFORE and AFTER send
- Creates thread message doc with status='queued' if account disconnected
- Updates status to 'sent' after successful send

#### 8. Backfill Function (Lines ~760-850)
- **`backfillAccountMessages(accountId)`** - Best-effort gap filling
- Queries recent active threads (ordered by lastMessageAt desc)
- Processes with concurrency limit (1-2 threads at a time)
- Updates `accounts/{accountId}.lastBackfillAt` and `lastBackfillResult`

#### 9. Backfill Trigger After Connect (Lines ~724-739, ~3316-3331)
- Schedules backfill after `connection === 'open'` in both `createConnection` and `restoreAccount`
- Uses jitter (10-40 seconds) to avoid hitting all 30 accounts simultaneously

#### 10. New API Endpoints

**POST /api/whatsapp/backfill/:accountId** (Lines ~2743-2762)
- Triggers manual backfill for an account
- Returns immediately (runs asynchronously)

**GET /api/whatsapp/threads/:accountId** (Lines ~3043-3068)
- Lists threads for an account with pagination
- Ordered by `lastMessageAt` desc

**GET /api/whatsapp/messages/:accountId/:threadId** (Lines ~3070-3118)
- Lists messages for a specific thread
- Ordered by `tsClient` desc

**Enhanced GET /api/whatsapp/messages** (Lines ~3120-3173)
- Legacy endpoint maintained for backward compatibility
- Enhanced to support new query format

#### 11. Enhanced Dashboard (Lines ~4892-4970)
- Added `lastBackfillAt` and `lastHistorySyncAt` fields per account
- Fetches from Firestore `accounts` collection

#### 12. Enhanced Outbox Worker (Lines ~5208-5235)
- Already had thread update logic (no changes needed)
- Persists messages to threads when sent successfully

#### 13. Graceful Shutdown Enhancement (Lines ~5479-5485)
- Added timeout handling for session flush (30 seconds)
- Prevents hanging on shutdown if Firestore batches are slow

---

## Firestore Schema Changes

### New Fields in `accounts/{accountId}`
- `lastHistorySyncAt`: FirestoreTimestamp
- `historySyncCount`: number
- `lastHistorySyncResult`: object
- `lastBackfillAt`: FirestoreTimestamp
- `lastBackfillResult`: object

### New Fields in `threads/{threadId}`
- `displayName`: string (from pushName)
- `lastMessagePreview`: string (first 100 chars)
- `lastBackfillAt`: FirestoreTimestamp

### New Fields in `threads/{threadId}/messages/{messageId}`
- `messageType`: string (`'text' | 'image' | 'video' | 'audio' | 'document'`)
- `mediaType`, `mediaUrl`, `mediaMimetype`, `mediaFilename`: for media messages
- `status`: string (`'queued' | 'sent' | 'delivered' | 'read'`)
- `deliveredAt`, `readAt`: FirestoreTimestamp
- `syncedAt`: FirestoreTimestamp (when synced from history)
- `syncSource`: string (`'history_sync' | 'realtime'`)

---

## Testing Checklist

- [ ] Test history sync on new pairing (add account, scan QR)
- [ ] Test history sync on re-pairing (regenerate QR)
- [ ] Test real-time message persistence (send/receive messages)
- [ ] Test receipt updates (check `messages.update` handler)
- [ ] Test backfill after reconnect (disconnect → reconnect → verify backfill runs)
- [ ] Test manual backfill endpoint
- [ ] Test threads endpoint (GET /api/whatsapp/threads/:accountId)
- [ ] Test messages endpoint (GET /api/whatsapp/messages/:accountId/:threadId)
- [ ] Verify no duplicate messages (idempotency)
- [ ] Verify graceful shutdown completes within timeout

---

## Known Limitations

1. **History Sync:** Only triggers on pairing/re-pairing. Existing paired accounts may not have full history.

2. **Backfill:** Best-effort only. WhatsApp doesn't expose direct "fetch history" API. Gaps during disconnection may not be fully recovered.

3. **Media Files:** Only metadata is stored (URL, mimetype, filename). Actual media files are not downloaded/stored.

4. **Batch Size:** Firestore batch limit is 500 operations. Large history syncs are processed in multiple batches with throttling.

---

## Rollback Plan

If issues occur, disable via environment variable:

```bash
# In Railway Variables:
WHATSAPP_SYNC_FULL_HISTORY=false
```

This will disable history sync but keep real-time message persistence active.

---

**END OF SUMMARY**
