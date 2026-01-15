# WhatsApp Multi-Account Safety Patch

## Overview
This patch ensures stable send/receive from the app, messages saved in Firestore, no duplicates, and scalability across restarts and multiple backend instances.

## Changes Made

### 1. Single Sending Mechanism
- **Status**: ✅ Enforced
- **Evidence**: `whatsapp-backend/server.js:837, 3271` - Flush outbox on connect handlers removed (commented out)
- **Result**: Only outbox worker loop handles queued messages, preventing duplicate sends on reconnect

### 2. threadId Correctness
- **Status**: ✅ Verified
- **Pattern**: `${accountId}__${clientJid}` everywhere
- **Locations**:
  - `whatsapp-backend/server.js:885` - messages.upsert handler in `createConnection`
  - `whatsapp-backend/server.js:3319` - messages.upsert handler in `restoreAccount`
  - `whatsapp-backend/server.js:2328` - `/api/whatsapp/send-message` endpoint
  - `kyc-app/kyc-app/src/components/ChatClientiRealtime.jsx:247` - Frontend send logic
- **Result**: No cross-account thread collisions

### 3. Claim/Lease in Outbox Worker
- **Status**: ✅ Implemented
- **Location**: `whatsapp-backend/server.js:3937-4045`
- **Mechanism**:
  - Query queued messages where `nextAttemptAt <= now`
  - Use Firestore transaction to atomically claim message:
    - Check `status == 'queued'` and `leaseUntil` not valid
    - Set `status='sending'`, `claimedBy=WORKER_ID`, `leaseUntil=now+60s`
  - After send: release lease (`leaseUntil=null`)
  - On failure: reset to `queued` and release lease
- **Worker ID**: Uses `RAILWAY_DEPLOYMENT_ID` or `HOSTNAME` or `local-${Date.now()}`

### 4. Outbound First-Class Messages
- **Status**: ✅ Implemented
- **Frontend**: `kyc-app/kyc-app/src/components/ChatClientiRealtime.jsx:274-286`
  - Creates message doc in `threads/{threadId}/messages/{requestId}` BEFORE writing to outbox
  - Message doc has `status='queued'` initially
- **Backend**: `whatsapp-backend/server.js:4078-4105`
  - Worker updates message doc status to `'sent'` and stores `waMessageId` after successful send
  - Worker updates message doc status to `'failed'` on max retries

### 5. Status Updates
- **Status**: ✅ Implemented
- **Location**: `whatsapp-backend/server.js:947-1020, 3379-3450`
- **Handlers**:
  - `messages.update`: Maps WhatsApp status (1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ) to our status
  - `message-receipt.update`: Maps receipt timestamps to `'delivered'` or `'read'`
- **Updates**: Both handlers update `threads/{threadId}/messages/{messageId}` with new status

### 6. Firestore Indexes
- **Status**: ✅ Verified
- **Location**: `firestore.indexes.json:49-66`
- **Index**: `outbox` collection with `accountId + status + nextAttemptAt` (ASC)
- **Deployment**: Run `firebase deploy --only firestore:indexes`

## Acceptance Tests

### A) Thread Isolation (2 accounts, same clientJid)
**Steps**:
1. Connect 2 different WhatsApp accounts
2. Send message to same `clientJid` from both accounts
3. Verify messages appear in different threads

**Expected**:
- Thread IDs: `account1__clientJid` and `account2__clientJid`
- Messages never mix between accounts

**Verify**:
```bash
# Query Firestore
firebase firestore:get threads --limit 10
# Check threadId format: should be `${accountId}__${clientJid}`
```

### B) Send from UI (First-Class Messages)
**Steps**:
1. Open chat in UI
2. Send a message
3. Immediately check Firestore

**Expected**:
- Message doc appears in `threads/{threadId}/messages/{requestId}` with `status='queued'`
- Outbox doc appears in `outbox/{requestId}` with `status='queued'`
- After worker processes: message doc `status='sent'`, `waMessageId` set
- Outbox doc `status='sent'`, `providerMessageId` set

**Verify**:
```bash
# Check message doc
firebase firestore:get "threads/{threadId}/messages/{requestId}"

# Check outbox doc
firebase firestore:get "outbox/{requestId}"
```

### C) Receive Inbound Message
**Steps**:
1. Send message from external WhatsApp to connected account
2. Check Firestore

**Expected**:
- Message doc appears in `threads/{threadId}/messages/{messageId}` with `status='delivered'`
- Thread `lastMessageAt` updated
- Thread `lastMessageText` updated

**Verify**:
```bash
# Check message doc
firebase firestore:get "threads/{threadId}/messages/{messageId}"

# Check thread
firebase firestore:get "threads/{threadId}"
```

### D) Status Updates (Delivery/Read)
**Steps**:
1. Send message from app
2. Wait for delivery receipt
3. Wait for read receipt (if recipient reads)

**Expected**:
- Message doc status transitions: `queued` → `sent` → `delivered` → `read`
- Updates happen via `messages.update` and `message-receipt.update` handlers

**Verify**:
```bash
# Monitor message doc status changes
firebase firestore:get "threads/{threadId}/messages/{requestId}" --watch
```

### E) Duplicate Prevention (Double-Click Send)
**Steps**:
1. Rapidly click send button twice (or double-click)
2. Check Firestore

**Expected**:
- Only one outbox doc created (idempotent `requestId`)
- Only one WhatsApp send occurs
- Message doc appears once

**Verify**:
```bash
# Check outbox for duplicates
firebase firestore:get outbox --where "threadId" "==" "{threadId}" --order-by "createdAt" desc --limit 5
```

### F) Restart Safety (No Duplicates on Restart)
**Steps**:
1. Queue a message (status='queued')
2. Restart backend mid-queue
3. Wait for worker to process

**Expected**:
- No duplicate sends
- Lease mechanism prevents concurrent processing
- Message eventually sent or failed after max retries

**Verify**:
```bash
# Check outbox during restart
firebase firestore:get outbox --where "status" "==" "sending" --limit 10

# Check leaseUntil timestamps
# Should see claimedBy and leaseUntil fields
```

### G) Multi-Instance Safety (Optional)
**Steps**:
1. Run 2 backend instances (different `RAILWAY_DEPLOYMENT_ID`)
2. Queue messages
3. Both instances query outbox

**Expected**:
- Only one instance claims each message (transaction)
- No duplicate sends
- Lease prevents concurrent claims

**Verify**:
```bash
# Check claimedBy field in outbox docs
firebase firestore:get outbox --where "status" "==" "sending" --limit 10
# Should see different claimedBy values for different messages
```

## Deployment

### 1. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 2. Deploy Backend
```bash
# Railway auto-deploys on push to main
# Or manually:
railway up
```

### 3. Verify Indexes
```bash
# Check index status in Firebase Console
# Or via CLI:
firebase firestore:indexes
```

## Key Files Changed

1. `whatsapp-backend/server.js`
   - Outbox worker: Added claim/lease transaction logic (lines 3937-4045)
   - Status handlers: Implemented Firestore updates in `messages.update` and `message-receipt.update` (lines 947-1020, 3379-3450)
   - Flush handlers: Already removed (lines 837, 3271)

2. `firestore.indexes.json`
   - Already has required composite index (lines 49-66)

3. `kyc-app/kyc-app/src/components/ChatClientiRealtime.jsx`
   - Already creates message doc before outbox (lines 274-286)

## Notes

- **Lease Duration**: 60 seconds (configurable via `LEASE_DURATION_MS`)
- **Worker Interval**: 500ms (configurable via `OUTBOX_WORKER_INTERVAL`)
- **Max Retries**: 5 attempts (configurable via `MAX_RETRY_ATTEMPTS`)
- **Backoff**: Exponential (1s, 2s, 4s, 8s, 16s, max 60s)

## Troubleshooting

### Messages stuck in 'queued'
- Check `nextAttemptAt` timestamp (should be <= now)
- Check account connection status
- Check worker logs for errors

### Duplicate sends
- Verify flush handlers are removed (grep for "REMOVED: Flush outbox")
- Check lease mechanism (should see `claimedBy` and `leaseUntil` fields)
- Verify transaction logic in worker

### Status not updating
- Check `messages.update` and `message-receipt.update` handlers are async
- Verify Firestore writes in handler logs
- Check `waMessageId` matches between WhatsApp and Firestore
