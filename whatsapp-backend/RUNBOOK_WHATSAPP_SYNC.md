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

### Setting in Railway

Railway Dashboard → Service → Variables → Add:

```
WHATSAPP_SYNC_FULL_HISTORY=true
WHATSAPP_BACKFILL_COUNT=100
WHATSAPP_BACKFILL_THREADS=50
WHATSAPP_HISTORY_SYNC_DRY_RUN=false
```

---

## What "Best-Effort Full Sync" Means

- **History Sync (`syncFullHistory: true`):** On initial pairing or re-pairing, Baileys provides a history sync event (`messaging-history.set`) containing all chats and messages. These are ingested into Firestore automatically.

- **Real-time Messages (`messages.upsert`):** All new messages (inbound and outbound) are persisted to `threads/{threadId}/messages/{messageId}` in real-time.

- **Backfill After Reconnect:** After a reconnect, the system attempts to fill gaps by processing recent active threads. This is "best-effort" because:
  - WhatsApp doesn't expose a direct "fetch history" API
  - Gaps may occur during disconnection periods
  - Backfill relies on pending notifications and sync events

- **Idempotency:** All operations use message ID as document ID, ensuring no duplicates even if sync/backfill runs multiple times.

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
- `syncSource`: `'history_sync' | 'realtime'`

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

### Step 4: Verify Receipt Status

1. Collection: `threads/{threadId}/messages`
2. For outbound messages, check:
   - `status: 'sent' | 'delivered' | 'read'`
   - `deliveredAt` timestamp (if delivered)
   - `readAt` timestamp (if read)

---

## Troubleshooting

### Problem: No history sync on pairing

**Check:**
```bash
# In Railway logs, look for:
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
# In Railway logs, look for:
💾 [accountId] Message saved to Firestore: {messageId}
```

**If missing:**
- Verify Firestore is connected
- Check for errors in logs: `❌ [accountId] Message save failed`
- Verify `FIREBASE_SERVICE_ACCOUNT_JSON` is set correctly

### Problem: Backfill not running

**Manual trigger:**
```bash
curl -X POST "https://your-service.railway.app/api/whatsapp/backfill/{accountId}"
```

**Check results:**
- Firestore: `accounts/{accountId}.lastBackfillResult`
- Logs: `📚 [accountId] Starting backfill...`

### Problem: Duplicate messages

**Should not happen** (idempotent by message ID), but if it does:
- Check dedupe collection: `inboundDedupe/{accountId}__{messageId}`
- Messages use `waMessageId` as document ID (upsert with merge)

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
