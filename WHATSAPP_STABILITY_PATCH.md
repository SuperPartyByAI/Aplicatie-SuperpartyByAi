# WhatsApp Messaging Stability & Scalability Patch

**Date:** 2026-01-14  
**Goal:** Make WhatsApp messaging stable & scalable for 30 accounts with no cross-account collisions or duplicate sends.

---

## Summary of Changes

### 1) Fixed threadId Collision Across Accounts ✅
**Problem:** `threadId = remoteJid` caused collisions when same clientJid messages multiple accounts.

**Solution:** Changed to `threadId = ${accountId}__${clientJid}` everywhere.

**Files Changed:**
- `whatsapp-backend/server.js` (lines ~932, ~3401, ~3502): Inbound message handlers
- `whatsapp-backend/server.js` (line ~2363): Send endpoint

**Changes:**
```javascript
// BEFORE:
const threadId = from; // remoteJid only

// AFTER:
const threadId = `${accountId}__${from}`; // accountId__clientJid
```

### 2) Made Outgoing Messages First-Class in Firestore ✅
**Problem:** Outgoing messages weren't persisted until after send, causing loss on failure.

**Solution:** Create message doc + outbox entry in a batch before sending.

**Files Changed:**
- `whatsapp-backend/server.js` (line ~2363): `/api/whatsapp/send-message` endpoint

**Changes:**
- Create message doc in `threads/{threadId}/messages/{messageId}` with `status='queued'`
- Update thread with `lastMessageAt`, `lastMessageText`, `lastMessageDirection`
- Create outbox entry with `messageRef` pointing to message doc
- If account connected, send immediately and update both docs
- If not connected, outbox worker will process later

### 3) Implemented Claim/Lease in Outbox Flush ✅
**Problem:** Multiple workers could process same message, causing duplicate sends.

**Solution:** Transaction-based claim/lease mechanism.

**Files Changed:**
- `whatsapp-backend/server.js` (line ~4087): Outbox worker

**Changes:**
- Query queued messages ordered by `createdAt`
- For each doc, in a Firestore transaction:
  - Check if `status == 'queued'` and `leaseUntil < now` (or null)
  - If valid, claim: set `status='processing'`, `claimedBy=WORKER_ID`, `leaseUntil=now+60s`, `attempts++`
  - If already claimed, skip
- Only after successful claim, call `sock.sendMessage`
- On success: update outbox `status='sent'`, message `status='sent'`
- On failure: release claim, set `status='queued'` with exponential backoff

**New Fields:**
- `claimedBy`: Worker ID that claimed the message
- `leaseUntil`: Timestamp when lease expires (60s)
- `messageRef`: Path to message doc in threads collection

### 4) Implemented Status Updates ✅
**Problem:** Provider status updates (sent/delivered/read) weren't persisted.

**Solution:** Map provider events to Firestore message status updates.

**Files Changed:**
- `whatsapp-backend/server.js` (lines ~998, ~3460): `messages.update` and `message-receipt.update` handlers

**Changes:**
- `messages.update`: Map `status` field (1=sent, 2=delivered, 3=read) to message doc
- `message-receipt.update`: Map `receiptType` (1=delivered, 2=read) to message doc
- Find message by `waMessageId` using `collectionGroup('messages').where(...)`
- Update message doc `status` and `updatedAt`

### 5) Unified Accounts Collection Naming ✅
**Problem:** Mixed usage of `wa_accounts` and `accounts` collections.

**Solution:** Use `accounts` as canonical collection everywhere.

**Files Changed:**
- `whatsapp-backend/server.js` (line ~4028): Reset session endpoint

**Changes:**
- Changed `wa_accounts` → `accounts` in reset session endpoint
- Note: `restoreAccountsFromFirestore` already uses `accounts` collection

### 6) Updated Firestore Indexes ✅
**Problem:** Missing indexes for new query patterns.

**Solution:** Added indexes for outbox and messages queries.

**Files Changed:**
- `firestore.indexes.json`

**New Indexes:**
```json
{
  "collectionGroup": "outbox",
  "fields": [
    { "fieldPath": "accountId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "messages",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "threadId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

**Note:** Firestore rules already allow server-side writes (Admin SDK bypasses rules). No rule changes needed for new fields.

---

## Files Changed

1. `whatsapp-backend/server.js` - Main backend file
   - Line ~932: Inbound handler (createConnection) - threadId fix
   - Line ~998: messages.update handler - status updates
   - Line ~1006: message-receipt.update handler - status updates
   - Line ~2363: Send endpoint - first-class messages + outbox
   - Line ~3401: Inbound handler (restoreAccount) - threadId fix
   - Line ~3460: messages.update handler (restoreAccount) - status updates
   - Line ~3468: message-receipt.update handler (restoreAccount) - status updates
   - Line ~4028: Reset session - accounts collection
   - Line ~4087: Outbox worker - claim/lease mechanism

2. `firestore.indexes.json` - Firestore indexes
   - Added outbox index: accountId + status + createdAt
   - Added messages index: threadId + createdAt (collection group)

---

## Manual Verification Checklist

### A) ThreadId Collision Test
**Setup:**
1. Connect 2 accounts (account1, account2)
2. Have same clientJid (e.g., `40712345678@s.whatsapp.net`) message both accounts

**Expected:**
- Account1 messages saved to `threads/account1__40712345678@s.whatsapp.net/messages/...`
- Account2 messages saved to `threads/account2__40712345678@s.whatsapp.net/messages/...`
- No mixing of messages between accounts

**Commands:**
```bash
# Check Firestore
# threads collection should have:
# - account1__40712345678@s.whatsapp.net
# - account2__40712345678@s.whatsapp.net
# (not just 40712345678@s.whatsapp.net)
```

### B) Outgoing Message First-Class Test
**Setup:**
1. Send message from app via `/api/whatsapp/send-message`
2. Check Firestore immediately (before send completes)

**Expected:**
- Message doc exists in `threads/{threadId}/messages/{messageId}` with `status='queued'`
- Outbox doc exists with `status='queued'` and `messageRef` pointing to message doc
- After send: message `status='sent'`, outbox `status='sent'`

**Commands:**
```bash
# Send message
curl -X POST http://localhost:8080/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{"accountId": "account1", "to": "40712345678", "message": "Test"}'

# Check Firestore immediately
# threads/{accountId}__{to}/messages/{messageId} should exist with status='queued'
# outbox/{requestId} should exist with messageRef field
```

### C) Duplicate Send Prevention Test
**Setup:**
1. Run 2 backend instances (set different `WORKER_ID` env vars)
2. Send a message that will be queued (account not connected or slow network)
3. Both workers should process outbox

**Expected:**
- Only ONE worker claims the message (transaction succeeds)
- Other worker skips (transaction fails with "already claimed")
- Message sent exactly once

**Commands:**
```bash
# Instance 1
WORKER_ID=worker1 node server.js

# Instance 2
WORKER_ID=worker2 node server.js

# Send message (will be queued)
curl -X POST http://localhost:8080/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{"accountId": "account1", "to": "40712345678", "message": "Test"}'

# Check logs - only one worker should log "Sent outbox message"
# Check Firestore - outbox doc should have claimedBy=worker1 or worker2 (not both)
```

### D) Inbound Message Test
**Setup:**
1. Receive a message from a client

**Expected:**
- Message saved to `threads/{accountId}__{clientJid}/messages/{messageId}`
- Thread `lastMessageAt` updated
- Thread `lastMessageText` and `lastMessageDirection` updated

**Commands:**
```bash
# Send message TO the account from WhatsApp client
# Check Firestore:
# threads/{accountId}__{clientJid}/messages/{messageId} should exist
# threads/{accountId}__{clientJid} should have lastMessageAt updated
```

### E) Status Updates Test
**Setup:**
1. Send a message
2. Wait for delivery/read receipts from provider

**Expected:**
- Message doc `status` updates: `queued` → `sent` → `delivered` → `read`
- Each update sets `updatedAt` timestamp

**Commands:**
```bash
# Send message
curl -X POST http://localhost:8080/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{"accountId": "account1", "to": "40712345678", "message": "Test"}'

# Check Firestore - message status should update as provider sends receipts
# Monitor logs for "Updated message {id} status to {status}"
```

---

## Environment Variables

**New:**
- `WORKER_ID` (optional): Unique identifier for this worker instance. Defaults to `worker_{uuid}`.

**Existing:**
- All existing env vars remain unchanged.

---

## Migration Notes

**No data migration required:**
- ThreadId format change is backward-incompatible, but new messages will use new format
- Old threads with `threadId=remoteJid` will remain but won't receive new messages
- Consider migrating old threads if needed:
  ```javascript
  // Migration script (run once)
  const oldThreads = await db.collection('threads').where('accountId', '==', accountId).get();
  for (const doc of oldThreads.docs) {
    const data = doc.data();
    if (!data.clientJid) continue;
    const newThreadId = `${accountId}__${data.clientJid}`;
    if (doc.id !== newThreadId) {
      // Move messages and update thread
      // ... (implementation depends on data volume)
    }
  }
  ```

---

## Testing Checklist

- [ ] A) ThreadId collision test passes
- [ ] B) Outgoing message first-class test passes
- [ ] C) Duplicate send prevention test passes
- [ ] D) Inbound message test passes
- [ ] E) Status updates test passes
- [ ] Firestore indexes deployed
- [ ] No errors in logs
- [ ] Messages persist correctly
- [ ] Threads update correctly
- [ ] Outbox processes correctly

---

**Status:** ✅ All patches applied  
**Next Steps:** Deploy and run acceptance tests
