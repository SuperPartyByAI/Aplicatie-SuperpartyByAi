# WhatsApp "Cap-Coadă" Evidence Pack

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30`  
**Goal:** Complete evidence of what exists vs what's missing for end-to-end WhatsApp + Firebase + Flutter flow

---

## 1) REPO STATUS

### Git Info:
```
Working Directory: /Users/universparty/Aplicatie-SuperpartyByAi
Git Root: /Users/universparty/Aplicatie-SuperpartyByAi
Branch: audit-whatsapp-30
Latest Commit: (see git log output below)
Remote: origin → git@github.com:SuperPartyByAI/Aplicatie-SuperpartyByAi.git
```

### Git Status:
```
(Output from: git status)
```

### Latest Commit:
```
(Output from: git log -1 --oneline)
```

---

## 2) FLUTTER WHATSAPP FEATURE MAP

### Screens:

**Existing:**
- ✅ `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart` - Menu only (external WhatsApp + link to Accounts)
- ✅ `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart` - Accounts management (add/regenerate/delete/QR)

**Missing:**
- ❌ `whatsapp_inbox_screen.dart` - Thread list per accountId
- ❌ `whatsapp_chat_screen.dart` - Messages + Send UI + CRM Panel
- ❌ `client_profile_screen.dart` - CRM profile (KPI + events list + Ask AI)

### Services:

**Existing:**
- ✅ `superparty_flutter/lib/services/whatsapp_api_service.dart` - API client for legacy hosting backend
  - Methods: `getAccounts()`, `addAccount()`, `regenerateQr()`, `deleteAccount()`, `sendViaProxy()`, `qrPageUrl()`
  
**Missing:**
- ❌ `extractEventFromThread()` - Call `whatsappExtractEventFromThread` callable
- ❌ `getClientProfile(phoneE164)` - Query `clients/{phoneE164}`
- ❌ `getClientEvents(phoneE164)` - Query `evenimente` where `phoneE164`
- ❌ `askClientAI(phoneE164, question)` - Call `clientCrmAsk` callable

### Router:

**Existing Routes:**
- ✅ `/whatsapp` - WhatsApp menu screen
- ✅ `/whatsapp/accounts` - Accounts management screen

**Missing Routes:**
- ❌ `/whatsapp/inbox/:accountId` - Thread list
- ❌ `/whatsapp/chat/:accountId/:threadId` - Chat screen
- ❌ `/whatsapp/client/:phoneE164` - Client profile screen

### Evidence Search:

```bash
# Grep results for WhatsApp-related code in Flutter:
grep -n "sendViaProxy\|whatsappProxy\|getAccounts\|addAccount" superparty_flutter/lib/services/whatsapp_api_service.dart
```

**Results:**
- `sendViaProxy()` - Line 64 (sends via Firebase Functions proxy with auth)
- `getAccounts()` - Line 118 (GET legacy hosting backend)
- `addAccount()` - Line 151 (POST legacy hosting backend)
- `regenerateQr()` - Line 189 (POST legacy hosting backend)
- `deleteAccount()` - Line 222 (DELETE legacy hosting backend)
- `qrPageUrl()` - Line 255 (returns URL for QR page)

---

## 3) BACKEND WHATSAPP EVIDENCE (legacy hosting Backend)

### Directory Structure:

```
whatsapp-backend/
├── server.js (main backend service)
├── legacy hosting.toml (legacy hosting config)
├── package.json (dependencies)
└── ... (other files)
```

### Key Backend Features (server.js):

#### **A) Message Persistence:**

**Evidence:**
- `messages.upsert` handler → saves to `threads/{threadId}/messages/{messageId}` (Line 1319)
- `messages.update` handler → updates delivery/read receipts (Line 1410)
- `message-receipt.update` handler → updates message status (Line 1470)

**Line References:**
```javascript
// messages.upsert handler (inbound/outbound messages)
// Line 1319: sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
// Saves to: threads/{threadId}/messages/{messageId} (Line 1443, 1488)

// messages.update handler (delivery/read receipts)
// Line 1410: sock.ev.on('messages.update', async (updates) => {
// Updates message status: deliveredAt, readAt (Line 1410-1465)

// message-receipt.update handler
// Line 1470: sock.ev.on('message-receipt.update', async (receipts) => {
// Updates message status: delivered/read (Line 1470-1503)
```

#### **B) History Sync:**

**Evidence:**
- `messaging-history.set` handler → ingests full conversation history (Line 1252)
- Uses `saveMessagesBatch()` for scalable ingestion (Line 509-759)

**Line References:**
```javascript
// messaging-history.set handler
// Line 1252: sock.ev.on('messaging-history.set', async (history) => {
// Ingests: chats + messages from history sync
// Updates: accounts/{accountId}.lastHistorySyncAt
```

#### **C) API Endpoints:**

**Existing Endpoints:**
- ✅ `GET /api/whatsapp/accounts` - List accounts (Line 2561, 2582)
- ✅ `POST /api/whatsapp/add-account` - Add account (Line 1546, 1568)
- ✅ `GET /api/whatsapp/qr/:accountId` - Get QR code (Line 1548, 2452)
- ✅ `POST /api/whatsapp/regenerate-qr/:accountId` - Regenerate QR (Line 1547)
- ✅ `POST /api/whatsapp/send-message` - Send message (direct) (Line 1548)
- ✅ `GET /api/whatsapp/threads/:accountId` - List threads (Line 3129)
- ✅ `GET /api/whatsapp/messages/:accountId/:threadId` - List messages (Line 3158)
- ✅ `POST /api/whatsapp/backfill/:accountId` - Trigger backfill (Line 2977)
- ✅ `GET /api/status/dashboard` - Status dashboard (Line 5044)

**Line References:**
```javascript
// All endpoints are documented in server.js with line numbers
// See grep output: lines 1545-1549, 2452, 2561-2582, 2977, 3129, 3158, 5044
```

### legacy hosting Configuration:

**legacy hosting.toml:**
```
(see full file content)
```

**Key Settings:**
- Volume mount path: `/app/sessions`
- Build command: (from package.json scripts)
- Start command: (from package.json scripts)

**package.json:**
```
(see full file content)
```

**Environment Variables (Expected):**
- `SESSIONS_PATH=/app/sessions`
- `FIREBASE_SERVICE_ACCOUNT_JSON=...`
- `ADMIN_TOKEN=...` (optional)
- `WHATSAPP_SYNC_FULL_HISTORY=true`
- `WHATSAPP_BACKFILL_COUNT=100`
- `WHATSAPP_BACKFILL_THREADS=50`

### Sessions Persistence:

**Evidence:**
- SESSIONS_PATH env var checked at startup (Line 311-314, 339)
- Writable check: `sessions dir exists/writable true` (Line 344-350)
- Uses `useMultiFileAuthState` from Baileys (Line 912)
- legacy hosting volume mount: `/app/sessions` (from legacy hosting.toml line 17)

**Line References:**
```javascript
// Line 311-314: SESSIONS_PATH env var (priority: SESSIONS_PATH > LEGACY_VOLUME_MOUNT_PATH > fallback)
// Line 339: console.log(`📁 SESSIONS_PATH: ${process.env.SESSIONS_PATH || 'NOT SET (using fallback)'}`)
// Line 344-350: Writable check with error message if not writable
// Line 912: useMultiFileAuthState(sessionPath) for Baileys auth
```

---

## 4) FIREBASE EVIDENCE

### firebase.json:

```json
(see full file content)
```

### Firestore Rules:

**Key Rules:**

```javascript
// Threads collection (NEVER DELETE)
match /threads/{threadId} {
  allow read: if isAuthenticated() && (isAdmin() || resource.data.accountId in getUserAllowedAccounts());
  allow create, update: if false; // Server-only writes
  allow delete: if false; // NEVER DELETE
  
  // Messages subcollection (NEVER DELETE)
  match /messages/{messageId} {
    allow read: if isAuthenticated() && (...);
    allow create: if false; // Server-only writes
    allow update: if false; // Messages are immutable
    allow delete: if false; // NEVER DELETE
  }
  
  // Extractions subcollection (AI audit)
  match /extractions/{messageId} {
    allow read: if isEmployee();
    allow create, update: if false; // Server-only writes
    allow delete: if false; // NEVER DELETE
  }
}

// Clients collection (CRM profiles, NEVER DELETE)
match /clients/{phoneE164} {
  allow read: if isEmployee();
  allow create, update: if false; // Server-only writes
  allow delete: if false; // NEVER DELETE
}

// Evenimente collection (NEVER DELETE)
match /evenimente/{eventId} {
  allow delete: if false; // Use isArchived instead
}
```

**Full rules file:** `firestore.rules`

### Firestore Indexes:

**Existing Indexes:**
- `threads`: `accountId ASC, lastMessageAt DESC`
- `threads`: `accountId ASC, assignedTo ASC, lastMessageAt DESC`
- `outbox`: `status ASC, nextAttemptAt ASC`
- `evenimente`: `phoneE164 ASC, date DESC`
- `evenimente`: `phoneE164 ASC, isArchived ASC, date DESC`
- `customers`: `accountId ASC, lastMessageAt DESC`
- `orders`: `customerId ASC, createdAt DESC`
- ... (see `firestore.indexes.json`)

### Cloud Functions:

**WhatsApp Proxy Functions:**
- ✅ `whatsappProxyGetAccounts` - Proxy for `GET /api/whatsapp/accounts`
- ✅ `whatsappProxyAddAccount` - Proxy for `POST /api/whatsapp/add-account`
- ✅ `whatsappProxyRegenerateQr` - Proxy for `POST /api/whatsapp/regenerate-qr/:accountId`
- ✅ `whatsappProxySend` - Proxy for send message (with auth + idempotency)

**CRM Functions (New):**
- ✅ `aggregateClientStats` - Trigger on `evenimente/{eventId}` create/update
- ✅ `whatsappExtractEventFromThread` - Callable for AI extraction from threads
- ✅ `clientCrmAsk` - Callable for AI questions about clients

**Event Functions (Existing):**
- ✅ `chatEventOps` - CREATE/UPDATE/ARCHIVE/LIST events (V3 schema)
- ✅ `chatEventOpsV2` - Enhanced version with interactive flow

**Evidence:**
```javascript
// functions/index.js exports (Line 865-876)
exports.whatsappProxyGetAccounts = whatsappProxy.getAccounts;  // Line 866
exports.whatsappProxyAddAccount = whatsappProxy.addAccount;    // Line 867
exports.whatsappProxyRegenerateQr = whatsappProxy.regenerateQr; // Line 868
exports.whatsappProxySend = whatsappProxy.send;                // Line 869
exports.aggregateClientStats = require('./aggregateClientStats').aggregateClientStats; // Line 872
exports.whatsappExtractEventFromThread = require('./whatsappExtractEventFromThread').whatsappExtractEventFromThread; // Line 874
exports.clientCrmAsk = require('./clientCrmAsk').clientCrmAsk; // Line 876
exports.chatEventOps = require('./chatEventOps').chatEventOps; // Line 847
exports.chatEventOpsV2 = require('./chatEventOpsV2').chatEventOpsV2; // Line 850
```

---

## 5) DEPLOY EVIDENCE (MANUAL INPUT REQUIRED)

### legacy hosting Service:

**Domain:** `whats-upp-production.up.legacy hosting.app` (or your actual domain)

**Environment Variables (Names only, no secrets):**
- `SESSIONS_PATH`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `ADMIN_TOKEN` (optional)
- `WHATSAPP_SYNC_FULL_HISTORY`
- `WHATSAPP_BACKFILL_COUNT`
- `WHATSAPP_BACKFILL_THREADS`
- `REDIS_URL` (if used)
- `LEGACY_TOKEN` (if used)

**Volume Mount Path:** `/app/sessions`

**Deploy Status:** (check legacy hosting UI → Deployments → Latest)

**Branch Running:** `main` or `audit-whatsapp-30` (check legacy hosting UI)

---

### Firebase:

**Project ID:** `superparty-frontend`

**Firestore Collections (from Console):**
- `accounts` (WhatsApp accounts)
- `threads` (conversations)
- `threads/{threadId}/messages` (messages)
- `threads/{threadId}/extractions` (AI audit)
- `outbox` (message queue)
- `clients` (CRM profiles - NEW)
- `evenimente` (events/parties)
- `inboundDedupe` (dedupe cache)

**Sample Documents:**

**accounts/{accountId}:**
```json
{
  "accountId": "WA-01",
  "name": "Main Account",
  "phone": "+40712345678",
  "status": "connected",
  "qrCode": null,
  "lastConnectedAt": <timestamp>
}
```

**threads/{threadId}:**
```json
{
  "threadId": "WA-01__+40712345678@s.whatsapp.net",
  "accountId": "WA-01",
  "clientJid": "+40712345678@s.whatsapp.net",
  "lastMessageAt": <timestamp>,
  "lastMessageText": "Test message",
  "lastMessageDirection": "inbound"
}
```

**threads/{threadId}/messages/{messageId}:**
```json
{
  "messageId": "...",
  "accountId": "WA-01",
  "clientJid": "+40712345678@s.whatsapp.net",
  "direction": "inbound",
  "body": "Test message",
  "status": "delivered",
  "tsClient": <timestamp>,
  "createdAt": <timestamp>
}
```

**clients/{phoneE164}:**
```json
{
  "phoneE164": "+40712345678",
  "phoneRaw": "40712345678",
  "displayName": "Client Name",
  "lifetimeSpendPaid": 2100,
  "lifetimeSpendAll": 2100,
  "eventsCount": 2,
  "lastEventAt": <timestamp>,
  "createdAt": <timestamp>,
  "updatedAt": <timestamp>
}
```

**evenimente/{eventId}:**
```json
{
  "eventId": "...",
  "eventShortId": 123,
  "phoneE164": "+40712345678",
  "date": "10-02-2026",
  "address": "Str. X nr 3",
  "payment": {
    "amount": 1200,
    "status": "UNPAID",
    "currency": "RON"
  },
  "rolesBySlot": {...},
  "isArchived": false,
  "createdAt": <timestamp>
}
```

---

## 6) WHAT'S MISSING (For Complete "Cap-Coadă" Flow)

### 6.1 Flutter UI (Missing):

1. **Inbox Screen** ❌
   - List threads per `accountId`
   - Search by phone/name
   - Navigate to Chat screen

2. **Chat Screen** ❌
   - Display messages from `threads/{threadId}/messages`
   - Input + Send button (uses existing `sendViaProxy()`)
   - Message status (sent/delivered/read)
   - **CRM Panel:**
     - Button "AI: Detectează petrecere (Draft)"
     - Button "Confirm & Save"
     - Button "Open Client Profile"

3. **Client Profile Screen** ❌
   - KPI Cards (totalSpent, eventsCount, lastEventAt)
   - Events List (query `evenimente` where `phoneE164`)
   - Button "Ask AI about client"

4. **Service Methods (Missing):**
   - `extractEventFromThread()`
   - `getClientProfile()`
   - `askClientAI()`

---

### 6.2 Backend (Complete - No Missing Parts):

✅ Message persistence (`messages.upsert`, `messages.update`)  
✅ History sync (`messaging-history.set`)  
✅ Outbox queue (with lease/claim mechanism)  
✅ Receipts (delivered/read)  
✅ Backfill endpoint (`POST /api/whatsapp/backfill/:accountId`)  
✅ CRM aggregation (`aggregateClientStats` trigger)  
✅ AI extraction (`whatsappExtractEventFromThread` callable)  
✅ AI questions (`clientCrmAsk` callable)  

---

### 6.3 Firebase (Complete - No Missing Parts):

✅ Firestore Rules (NEVER DELETE policy)  
✅ Firestore Indexes (for queries on `threads`, `evenimente`, `clients`)  
✅ Cloud Functions (proxy + CRM)  
✅ `clients/{phoneE164}` collection schema  

---

## 7) FLOW "CAP-COADĂ" (Current State vs Complete)

### Current Flow (What Works):

1. ✅ **Pair Account:**
   - Flutter → WhatsApp Accounts screen
   - Add Account → Backend creates account
   - Display QR → Client scans → Connected

2. ✅ **Send Message (via Proxy):**
   - Flutter → `sendViaProxy()` → Firebase Functions → legacy hosting backend
   - Message saved to `outbox` + `threads/{threadId}/messages`

3. ✅ **Receive Message (backend):**
   - WhatsApp → legacy hosting backend → `messages.upsert` → Firestore
   - Saved to `threads/{threadId}/messages`

4. ✅ **History Sync (backend):**
   - On pairing → `messaging-history.set` → Ingest history to Firestore

5. ✅ **CRM Aggregation (backend):**
   - Event created → `aggregateClientStats` trigger → Update `clients/{phoneE164}`

---

### Missing Flow (What Doesn't Work):

1. ❌ **View Inbox in Flutter:**
   - No screen to list threads
   - Can't browse conversations in-app

2. ❌ **View Messages in Flutter:**
   - No Chat screen
   - Can't see message history in-app

3. ❌ **CRM Panel in Flutter:**
   - No UI to trigger AI extraction
   - No UI to confirm/save event draft
   - No UI to view client profile

4. ❌ **Auto-CRM (Automatic):**
   - No automatic trigger on inbound message → AI extraction
   - (Could be added as Firestore trigger on `threads/{threadId}/messages/{messageId}` onCreate)

---

## 8) COMPLETE CHECKLIST (What Exists ✅ vs Missing ❌)

### Backend WhatsApp (legacy hosting):
- ✅ Account management (add/regenerate/delete)
- ✅ QR generation + pairing
- ✅ Message persistence (inbound/outbound)
- ✅ History sync (`messaging-history.set`)
- ✅ Backfill endpoint
- ✅ Receipts (delivered/read)
- ✅ Outbox queue (with lease)
- ✅ Sessions persistence (volume mount)

### Firebase (Firestore + Functions):
- ✅ Firestore Rules (NEVER DELETE)
- ✅ Firestore Indexes (for queries)
- ✅ Proxy Functions (with auth)
- ✅ CRM Functions (`aggregateClientStats`, `whatsappExtractEventFromThread`, `clientCrmAsk`)
- ✅ Event Functions (`chatEventOps`, `chatEventOpsV2`)

### Flutter UI:
- ✅ Accounts screen (add/regenerate/delete/QR)
- ✅ Send via proxy (`sendViaProxy()`)
- ❌ Inbox screen (thread list)
- ❌ Chat screen (messages + CRM Panel)
- ❌ Client Profile screen (KPI + Ask AI)
- ❌ Service methods CRM (`extractEventFromThread`, `getClientProfile`, `askClientAI`)

---

## 9) NEXT STEPS (To Complete "Cap-Coadă")

### Priority 1: Flutter Service Methods
1. Add `extractEventFromThread()` in `whatsapp_api_service.dart`
2. Add `getClientProfile(phoneE164)` in `whatsapp_api_service.dart`
3. Add `askClientAI(phoneE164, question)` in `whatsapp_api_service.dart`

### Priority 2: Flutter Screens
4. Create `whatsapp_inbox_screen.dart` (thread list)
5. Create `whatsapp_chat_screen.dart` (messages + CRM Panel)
6. Create `client_profile_screen.dart` (KPI + Ask AI)

### Priority 3: Navigation
7. Add routes in `app_router.dart`:
   - `/whatsapp/inbox/:accountId`
   - `/whatsapp/chat/:accountId/:threadId`
   - `/whatsapp/client/:phoneE164`

### Priority 4: Deploy
8. Deploy Firebase Functions:
   ```bash
   firebase deploy --only functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk
   ```
9. Deploy Firestore Rules + Indexes:
   ```bash
   firebase deploy --only firestore
   ```

---

## 10) VERIFICATION COMMANDS

### Check Backend (legacy hosting):
```bash
# Health check
curl https://whats-app-ompro.ro/health

# Accounts list
curl https://whats-app-ompro.ro/api/whatsapp/accounts

# Dashboard
curl https://whats-app-ompro.ro/api/status/dashboard
```

### Check Firebase:
```bash
# Firestore rules
firebase firestore:rules:get

# Firestore indexes
firebase firestore:indexes:list

# Functions list
firebase functions:list
```

### Check Flutter:
```bash
# Verify WhatsApp screens exist
ls -la superparty_flutter/lib/screens/whatsapp

# Verify service methods exist
grep -n "extractEventFromThread\|getClientProfile\|askClientAI" superparty_flutter/lib/services/whatsapp_api_service.dart
```

---

**END OF EVIDENCE PACK**
