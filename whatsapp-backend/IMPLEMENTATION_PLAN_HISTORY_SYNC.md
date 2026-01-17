# Implementation Plan: Best-Effort Full Conversation Sync

## Current Code Paths Mapped

### Socket Initialization
- **File:** `whatsapp-backend/server.js`
- **Lines:** 565-577 (createConnection), 3216-3227 (restoreAccount)
- **Current:** `syncFullHistory: false` (lines 571, 3222)

### Message Persistence
- **File:** `whatsapp-backend/server.js`
- **Lines:** 856-991 (messages.upsert handler in createConnection)
- **Lines:** 3431-3526 (messages.upsert handler in restoreAccount)
- **Current:** Saves to `threads/{threadId}/messages/{messageId}` (lines 954-959, 3495-3499)

### Receipt Handling
- **File:** `whatsapp-backend/server.js`
- **Lines:** 994-999 (messages.update - just logging)
- **Lines:** 1002-1004 (message-receipt.update - just logging)
- **Current:** No persistence, only logging

### Send Message Flow
- **File:** `whatsapp-backend/server.js`
- **Lines:** 2476-2510 (POST /api/whatsapp/send-message)
- **Current:** Only queues to outbox if disconnected, sends directly if connected (line 2504)

### Outbox Processing
- **File:** `whatsapp-backend/server.js`
- **Lines:** 4265-4600 (outbox worker loop)
- **Current:** Processes queued messages from `outbox` collection

### Firestore Helper Functions
- **File:** `whatsapp-backend/server.js`
- **Function:** `saveAccountToFirestore()` (lines 451-472)
- **Function:** `logIncident()` (lines 475-497)

---

## Implementation Tasks

### Task 1: Enable History Sync on Socket Init ✅
- **Change:** Lines 571, 3222 - `syncFullHistory: true` (with env var guard)

### Task 2: Add History Sync Ingestion
- **New Handler:** After line 850 (before messages.upsert)
- **Event:** `sock.ev.on('messaging-history.set', ...)`

### Task 3: Enhance Receipt Handling
- **Modify:** Lines 994-999 (messages.update) - persist status updates
- **Modify:** Lines 1002-1004 (message-receipt.update) - persist receipts

### Task 4: Persist Outbound Messages
- **Modify:** Lines 2476-2510 (send-message endpoint) - write to threads before send
- **Enhance:** Outbox worker to also write to threads on send success

### Task 5: Backfill After Reconnect
- **New Logic:** After line 724 (connection.open in createConnection)
- **New Logic:** After line 3316 (connection.open in restoreAccount)

### Task 6: Add Backfill Endpoint
- **New Endpoint:** After line 2473 (after regenerate-qr endpoint)

### Task 7: Enhance Existing Endpoints
- **Enhance:** Lines 2513-2550 (GET /api/whatsapp/messages) - add pagination if needed

---

## Files to Modify
- `whatsapp-backend/server.js` (main implementation)

---

## Environment Variables to Add
- `WHATSAPP_SYNC_FULL_HISTORY` (default: true)
- `WHATSAPP_BACKFILL_COUNT` (default: 100)
- `WHATSAPP_BACKFILL_THREADS` (default: 50)
- `WHATSAPP_HISTORY_SYNC_DRY_RUN` (default: false)
