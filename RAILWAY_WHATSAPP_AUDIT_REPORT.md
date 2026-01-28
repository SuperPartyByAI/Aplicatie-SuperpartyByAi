# legacy hosting WhatsApp Backend - Complete Audit Report

**Mode:** READ-ONLY AUDIT  
**Date:** 2026-01-17  
**Purpose:** Extract legacy hosting deployment steps, API onboarding flow, and Firestore schema for 30 WhatsApp accounts

---

## 0. Repository Map

### Top-Level Structure
```
Aplicatie-SuperpartyByAi/
├── whatsapp-backend/          # WhatsApp backend service (main focus)
│   ├── server.js              # Main entrypoint (4728 lines)
│   ├── package.json           # Dependencies & scripts
│   ├── Dockerfile             # Container image
│   ├── legacy hosting.toml           # legacy hosting deployment config
│   └── lib/                   # Support modules
├── superparty_flutter/        # Flutter mobile app (out of scope)
├── functions/                 # Firebase Cloud Functions
├── voice-backend/             # Voice AI backend
├── twilio-backend/            # Twilio integration
└── legacy hosting.json               # Root legacy hosting config
```

### WhatsApp Backend Location
- **Path:** `whatsapp-backend/`
- **Entrypoint:** `whatsapp-backend/server.js` (line 1)
- **Package:** `whatsapp-backend/package.json`

---

## 1. Entrypoints & Server Startup

### Main Entry File
- **File:** `whatsapp-backend/server.js` (line 1-4728)
- **Express App Creation:** Line 137: `const app = express();`
- **Server Listen:** Line 4221: `app.listen(PORT, '0.0.0.0', async () => { ... })`
- **Port:** Line 138: `const PORT = process.env.PORT || 8080;`

### Package.json Scripts
- **File:** `whatsapp-backend/package.json` (lines 6-16)
- **Start Command:** `"start": "node server.js"` (line 7)
- **Dev Command:** `"dev": "nodemon server.js"` (line 8)
- **Pre-start Guard:** `"prestart": "node build-guard.js"` (line 9)

### legacy hosting Configuration
- **File:** `legacy hosting.json` (root)
  - **Builder:** `NIXPACKS` (line 4)
  - **Build Command:** `cd whatsapp-backend && npm install` (line 5)
  - **Start Command:** `cd whatsapp-backend && node server.js` (line 8)
  - **Healthcheck Path:** `/health` (line 13)
  - **Healthcheck Timeout:** 30s (line 14)
  - **Healthcheck Interval:** 20s (line 15)

- **File:** `whatsapp-backend/legacy hosting.toml`
  - **Builder:** `NIXPACKS` (line 2)
  - **Start Command:** `node server.js` (line 5)
  - **Restart Policy:** `ON_FAILURE` with max 10 retries (lines 6-7)
  - **Volume Mount:** `/app/sessions` (lines 16-17)

### Dockerfile
- **File:** `whatsapp-backend/Dockerfile`
- **Base Image:** `node:20-slim` (line 1)
- **Workdir:** `/app` (line 3)
- **Install:** `npm ci --only=production` (line 7)
- **Expose:** Port 8080 (line 11)
- **CMD:** `node server.js` (line 13)

---

## 2. Baileys Confirmation

### Baileys Import
- **File:** `whatsapp-backend/server.js` (lines 5-10)
```javascript
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
```

### Package Dependency
- **File:** `whatsapp-backend/package.json` (line 26)
- **Version:** `"@whiskeysockets/baileys": "^7.0.0-rc.9"`

### makeWASocket Initialization
- **Primary:** Line 565 in `createConnection()` function
- **Restore:** Line 3216 in `restoreAccount()` function
- **Browser Metadata:** Lines 569, 3220: `browser: ['SuperParty', 'Chrome', '2.0.0']`
- **Version Fetch:** Lines 526, 3214: `const { version } = await fetchLatestBaileysVersion();`
- **Auth State:** Line 530, 3184: `let { state, saveCreds } = await useMultiFileAuthState(sessionPath);`

### Session Path Construction
- **File:** `whatsapp-backend/server.js` (lines 311-317)
```javascript
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.LEGACY_VOLUME_MOUNT_PATH
    ? path.join(process.env.LEGACY_VOLUME_MOUNT_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));
```
- **Per-Account Path:** Line 513, 3140: `const sessionPath = path.join(authDir, accountId);`

### Session Files Created
- **File:** `whatsapp-backend/server.js` (lines 520-523, 3673)
- **Credentials:** `creds.json` (line 520, 3673)
- **Session Files:** Created by `useMultiFileAuthState()` (Baileys library)
- **Files Structure:** `{authDir}/{accountId}/creds.json`, `pre-key-*.json`, `session-*.json`

---

## 3. Multi-Account Design

### Maximum Accounts
- **File:** `whatsapp-backend/server.js` (line 139)
- **Constant:** `const MAX_ACCOUNTS = 30;`
- **Validation:** Line 2194: `if (connections.size >= MAX_ACCOUNTS) { ... }`

### AccountId Format
- **File:** `whatsapp-backend/server.js` (lines 68-73)
- **Function:** `generateAccountId(phone)`
- **Format:** `account_{env}_{hash}` where hash is SHA256(phone) first 32 chars
- **Example:** `account_prod_abc123def456...`
- **Deterministic:** Same phone → same accountId (line 2202-2203)

### Account Registry
- **File:** `whatsapp-backend/server.js` (lines 249-251)
- **Map:** `const connections = new Map(); // accountId -> { sock, status, phone, name, ... }`
- **Storage:** In-memory Map storing per-account socket, status, metadata

### Account Connection Registry (Lock System)
- **File:** `whatsapp-backend/server.js` (lines 89-133)
- **Class:** `AccountConnectionRegistry`
- **Purpose:** Prevents duplicate socket creation (lines 502-505)
- **Methods:**
  - `tryAcquire(accountId)` - Line 98
  - `markConnected(accountId)` - Line 121
  - `release(accountId)` - Line 129

---

## 4. Session Persistence (legacy hosting-Critical)

### SESSIONS_PATH Configuration
- **File:** `whatsapp-backend/server.js` (lines 311-317)
- **Priority:**
  1. `process.env.SESSIONS_PATH`
  2. `process.env.LEGACY_VOLUME_MOUNT_PATH + '/baileys_auth'`
  3. Fallback: `{__dirname}/.baileys_auth`

### Runtime Directory When Env Missing
- **Fallback Path:** Line 317: `path.join(__dirname, '.baileys_auth')`
- **Note:** Ephemeral on legacy hosting unless volume mounted

### Folder Structure Per Account
- **Base Path:** `{authDir}/{accountId}/` (lines 513, 3140)
- **Files:**
  - `creds.json` (lines 520, 3673)
  - `pre-key-*.json` (created by Baileys)
  - `session-*.json` (created by Baileys)

### Writable Check (Fail-Fast)
- **File:** `whatsapp-backend/server.js` (lines 327-352)
- **Test Write:** Lines 330-333 (write/delete test file)
- **Fail-Fast:** Lines 346-352: `process.exit(1)` if not writable
- **Runtime Check:** Lines 1392-1403 (in `/health` endpoint)

### Logging
- **Lines 339-342:** Logs SESSIONS_PATH, authDir, exists, writable status
- **Lines 324, 516:** Logs directory creation

---

## 5. Boot Restore Sequence

### Boot Flow (Exact Order)
- **File:** `whatsapp-backend/server.js` (lines 4228-4231)

**Step 1: Server Starts**
- Line 4221: `app.listen()` callback executes

**Step 2: Firestore Restore**
- Line 4230: `await restoreAccountsFromFirestore();`
- Function: `restoreAccountsFromFirestore()` (lines 3551-3645)
- Collection: `accounts` (line 3561)
- Filter: `where('status', '==', 'connected')` (line 3561)
- Order: Sorted by `accountId` alphabetically (line 3583)
- Jitter: 2-5 seconds between accounts (lines 3590-3595)
- Action: Calls `restoreAccount()` for each (line 3598)

**Step 3: Disk Scan Restore**
- Line 4231: `await restoreAccountsFromDisk();`
- Function: `restoreAccountsFromDisk()` (lines 3649-3713)
- Scan: Reads `authDir` directories (lines 3658-3660)
- Filter: Directories with `creds.json` (lines 3675-3676)
- Order: Sorted alphabetically (line 3668)
- Jitter: 2-5 seconds between accounts (lines 3678-3683)
- Action: Calls `restoreAccount()` if not already in connections (lines 3687-3691)

**Step 4: Start Connections (Staggered)**
- Lines 3603-3627: For each restored account, calls `createConnection()` with 2-5s jitter

### restoreAccount() Function
- **File:** `whatsapp-backend/server.js` (lines 3132-3547)
- **Input:** `accountId`, `data` (from Firestore)
- **Firestore Restore:** Lines 3143-3169 (if disk missing, restore from `wa_sessions` collection)
- **Disk Load:** Line 3184: `useMultiFileAuthState(sessionPath)`
- **Socket Creation:** Line 3216: `makeWASocket()`
- **Event Handlers:** Lines 3260-3525 (connection.update, messages.upsert, etc.)

### Staggered Boot Ordering
- **Firestore Restore:** Lines 3582-3583, 3590-3595 (sorted by accountId, 2-5s jitter)
- **Disk Restore:** Lines 3667-3668, 3678-3683 (sorted alphabetically, 2-5s jitter)
- **Connection Start:** Lines 3607-3609, 3614-3619 (sorted by accountId, 2-5s jitter)
- **Rationale:** Prevent WhatsApp rate limiting during boot

---

## 6. API Onboarding Flow (Exact Endpoints)

### Endpoint: Add Account
- **Route:** `POST /api/whatsapp/add-account`
- **File:** `whatsapp-backend/server.js` (lines 2190-2303)
- **Rate Limit:** `accountLimiter` (line 2190)
- **Request Schema:**
  ```json
  {
    "name": "string (optional)",
    "phone": "string (E.164 or local format)"
  }
  ```
- **Response Schema:**
  ```json
  {
    "success": true,
    "account": {
      "id": "account_prod_abc123...",
      "name": "string",
      "phone": "string",
      "status": "connecting",
      "qrCode": null,
      "pairingCode": null,
      "createdAt": "ISO8601"
    }
  }
  ```
- **Actions:**
  - Generates deterministic accountId (lines 2202-2203)
  - Checks for duplicates (lines 2206-2265)
  - Calls `createConnection()` async (line 2275)
  - Returns immediately with "connecting" status (lines 2284-2295)

### Endpoint: Get QR Code
- **Route:** `GET /api/whatsapp/qr/:accountId`
- **File:** `whatsapp-backend/server.js` (lines 1951-2055)
- **Response:** HTML page with QR image (data URL) or 404
- **QR Format:** Base64 data URL (`data:image/png;base64,...`)
- **Storage:** In-memory `account.qrCode` (line 652) + Firestore `accounts/{accountId}.qrCode` (line 658)
- **Alternative:** `GET /api/whatsapp/qr-visual` (lines 2120-2187) - Shows all QR codes in HTML

### Endpoint: Get Accounts List
- **Route:** `GET /api/whatsapp/accounts`
- **File:** `whatsapp-backend/server.js` (lines 2081-2117)
- **Response Schema:**
  ```json
  {
    "success": true,
    "accounts": [
      {
        "id": "account_prod_...",
        "name": "string",
        "phone": "string",
        "status": "connected|connecting|qr_ready|disconnected|logged_out",
        "qrCode": "data:image/png;base64,..." (if available),
        "pairingCode": "string|null",
        "createdAt": "ISO8601",
        "lastUpdate": "ISO8601"
      }
    ],
    "cached": false
  }
  ```

### Endpoint: Status Dashboard
- **Route:** `GET /api/status/dashboard`
- **File:** `whatsapp-backend/server.js` (lines 4148-4218)
- **Response Schema:**
  ```json
  {
    "timestamp": "ISO8601",
    "service": {
      "status": "healthy",
      "uptime": 12345,
      "version": "2.0.0"
    },
    "storage": {
      "path": "/app/sessions",
      "writable": true,
      "totalAccounts": 5
    },
    "accounts": [
      {
        "accountId": "account_prod_...",
        "phone": "+407****97",
        "status": "connected",
        "lastEventAt": "ISO8601",
        "lastMessageAt": "ISO8601",
        "lastSeen": "ISO8601",
        "reconnectCount": 0,
        "reconnectAttempts": 0,
        "needsQR": false,
        "qrCode": "data:image/png;base64,..." (if needsQR=true)
      }
    ],
    "summary": {
      "connected": 5,
      "connecting": 0,
      "disconnected": 0,
      "needs_qr": 0,
      "total": 5
    }
  }
  ```

### Endpoint: Regenerate QR
- **Route:** `POST /api/whatsapp/regenerate-qr/:accountId`
- **File:** `whatsapp-backend/server.js` (lines 2445-2473)
- **Actions:**
  - Disconnects old socket (lines 2455-2461)
  - Deletes from connections (line 2463)
  - Calls `createConnection()` again (line 2467)

### Endpoint: Disconnect Account
- **Route:** `POST /api/whatsapp/disconnect/:id`
- **File:** `whatsapp-backend/server.js` (lines 2592-2637)
- **Actions:**
  - Closes socket (line 2605)
  - Sets status to 'disconnected' (line 2610)
  - Updates Firestore (lines 2614-2619)
  - Removes from connections Map (line 2623)
- **Response:**
  ```json
  {
    "success": true,
    "accountId": "account_prod_...",
    "tsDisconnect": 1234567890,
    "reason": "user_disconnect"
  }
  ```

### Endpoint: Delete Account
- **Route:** `DELETE /api/whatsapp/accounts/:id`
- **File:** `whatsapp-backend/server.js` (lines 2553-2584)
- **Actions:**
  - Closes socket (lines 2563-2569)
  - Deletes from connections (line 2571)
  - Updates Firestore status to 'deleted' (lines 2575-2578)

### Endpoint: Send Message
- **Route:** `POST /api/whatsapp/send-message`
- **File:** `whatsapp-backend/server.js` (lines 2476-2510)
- **Request Schema:**
  ```json
  {
    "accountId": "account_prod_...",
    "to": "+40712345678" or "40712345678@s.whatsapp.net",
    "message": "text message"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "messageId": "3EB0...",
    "queued": false  // true if account not connected
  }
  ```

### Endpoint: Get Messages
- **Route:** `GET /api/whatsapp/messages`
- **File:** `whatsapp-backend/server.js` (lines 2513-2550)
- **Query Params:**
  - `accountId` (optional)
  - `threadId` (optional)
  - `limit` (default: 50)
- **Response:**
  ```json
  {
    "success": true,
    "threads": [
      {
        "id": "account_prod_...__40712345678@s.whatsapp.net",
        "accountId": "account_prod_...",
        "clientJid": "40712345678@s.whatsapp.net",
        "lastMessageAt": "FirestoreTimestamp",
        "messages": [...]
      }
    ]
  }
  ```

---

## 7. QR Lifecycle

### QR Generation
- **Trigger:** Baileys `connection.update` event with `qr` field (lines 644, 3267)
- **Handler:** Lines 647-686, 3270-3295
- **Process:**
  1. QR string received from Baileys (line 644: `const { qr } = update`)
  2. Convert to base64 data URL (line 650: `QRCode.toDataURL(qr)`)
  3. Store in memory: `account.qrCode = qrDataURL` (line 652)
  4. Update status: `account.status = 'qr_ready'` (line 653)
  5. Save to Firestore: `accounts/{accountId}.qrCode` (lines 657-661)

### QR Storage
- **In-Memory:** `account.qrCode` (line 652) - Base64 data URL
- **Firestore:** `accounts/{accountId}` document, field `qrCode` (line 658)
- **Format:** Base64 data URL (`data:image/png;base64,...`)

### QR Exposure via API
- **HTML Endpoint:** `GET /api/whatsapp/qr/:accountId` (lines 1951-2055)
  - Returns HTML page with `<img src="${qrCode}">`
- **JSON Endpoint:** `GET /api/whatsapp/accounts` (line 2100) - Includes `qrCode` in account object
- **Dashboard:** `GET /api/status/dashboard` (lines 4183-4189) - Includes QR if `needsQR=true`

### QR Cleanup
- **On Connection:** Line 702: `account.qrCode = null` when `connection === 'open'`
- **Firestore:** Line 718: Removes `qrCode` field when saving connected status

---

## 8. Health Monitor & Auto-Reconnect

### Exponential Backoff Logic
- **File:** `whatsapp-backend/server.js` (lines 783-801, 3376-3391)
- **Constants:**
  - `MAX_RECONNECT_ATTEMPTS = 5` (line 308)
  - `RECONNECT_TIMEOUT_MS = 60000` (line 309)
- **Backoff Formula:** Line 787, 3380
  ```javascript
  const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
  // Attempt 1: 1000ms (1s)
  // Attempt 2: 2000ms (2s)
  // Attempt 3: 4000ms (4s)
  // Attempt 4: 8000ms (8s)
  // Attempt 5: 16000ms (16s)
  // Max: 30000ms (30s)
  ```
- **Tracking:** `reconnectAttempts` Map (line 285): `accountId -> number`

### LoggedOut → needs_qr → Cleanup → Recreate
- **File:** `whatsapp-backend/server.js` (lines 724-844, 3318-3414)
- **State Transitions:**

**Step 1: Disconnect Detection**
- Handler: `connection.update` with `lastDisconnect` (lines 727, 3326)
- Check: `DisconnectReason.loggedOut` (lines 738, 3339)

**Step 2: Should Reconnect Decision**
- Line 727-728, 3326-3327:
  ```javascript
  const shouldReconnect =
    lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
  ```

**Step 3: If LoggedOut (no reconnect)**
- Lines 824-844, 3395-3414:
  1. Set status to `needs_qr` (lines 826, 3395)
  2. Save to Firestore (lines 828-830)
  3. Log incident (lines 832-835)
  4. Delete from connections Map (line 838)
  5. Release lock (line 839)
  6. Schedule reconnect after 5s (lines 841-843)

**Step 4: If Other Disconnect (reconnect)**
- Lines 783-823, 3376-3394:
  1. Check attempts < MAX_RECONNECT_ATTEMPTS (line 786, 3379)
  2. Calculate backoff (line 787, 3380)
  3. Increment attempts (line 792, 3385)
  4. Schedule reconnect with backoff (lines 797-801, 3387-3391)
  5. If max attempts: Set `needs_qr`, cleanup, regenerate (lines 803-823)

### State Transitions Summary
- **connected** → (disconnect) → **reconnecting** (if auto-reconnect) OR **logged_out** (if loggedOut)
- **reconnecting** → (max attempts) → **needs_qr**
- **logged_out** → (cleanup) → **needs_qr**
- **needs_qr** → (QR scan) → **qr_ready** → (connection.open) → **connected**
- **connecting** → (timeout 60s) → **disconnected** (line 600-606)

---

## 9. Graceful Shutdown

### Signal Handlers
- **File:** `whatsapp-backend/server.js` (lines 4721-4727)
- **SIGTERM Handler:** Line 4721: `process.on('SIGTERM', async () => { ... })`
- **SIGINT Handler:** Line 4725: `process.on('SIGINT', async () => { ... })`
- **Unified Function:** `gracefulShutdown(signal)` (lines 4665-4719)

### Graceful Shutdown Sequence
- **Function:** `gracefulShutdown()` (lines 4665-4719)
- **Steps:**
  1. Stop lease refresh timer (lines 4669-4671)
  2. Stop long-run jobs (lines 4674-4676)
  3. **Flush all sessions to disk** (lines 4678-4691):
     - Iterates over `connections` Map
     - Calls `account.saveCreds()` for each account
     - Waits for all promises with `Promise.allSettled()`
  4. Release Firestore leases (line 4694)
  5. Close all sockets (lines 4696-4714):
     - Calls `account.sock.end()` for each
     - Waits for all with `Promise.allSettled()`
  6. Exit: `process.exit(0)` (line 4718)

### Session Flush Details
- **Line 4681:** Iterates over `connections.entries()`
- **Line 4682:** Checks if `account.saveCreds` exists
- **Line 4683-4687:** Calls `saveCreds()` wrapped in error handling
- **Line 4690:** `await Promise.allSettled(flushPromises)`
- **Note:** `saveCreds()` triggers Firestore backup (lines 535-562, 3189-3211)

---

## 10. Message/Conversation Persistence (Firestore)

### Firestore Collections Used

#### 1. `accounts`
- **Purpose:** Account metadata and status
- **References:**
  - Line 459: `db.collection('accounts').doc(accountId)`
  - Line 3561: `db.collection('accounts').where('status', '==', 'connected')`
  - Line 1960: `db.collection('accounts').doc(accountId).get()`
  - Line 2247: `db.collection('accounts').get()`
- **Fields (from code evidence):**
  - `accountId`, `name`, `phone`, `phoneE164`
  - `status` (connected, connecting, qr_ready, disconnected, logged_out, needs_qr)
  - `qrCode`, `pairingCode`
  - `waJid`, `lastEventAt`, `lastMessageAt`
  - `createdAt`, `updatedAt`, `lastDisconnectedAt`
  - `lastDisconnectReason`, `lastDisconnectCode`, `lastError`
  - `claimedBy`, `claimedAt`, `leaseUntil` (lease data)
  - `worker` object (service, instanceId, version, commit, uptime, bootTs)

#### 2. `wa_sessions`
- **Purpose:** Backup encrypted session files
- **References:**
  - Line 550: `db.collection('wa_sessions').doc(accountId).set(...)`
  - Line 3146: `db.collection('wa_sessions').doc(accountId).get()`
  - Line 3203: `db.collection('wa_sessions').doc(accountId).set(...)`
  - Line 3964: `db.collection('wa_sessions').get()`
  - Line 4118: `db.collection('wa_sessions').doc(id).delete()`
- **Document Structure:**
  ```javascript
  {
    files: {
      "creds.json": "...",
      "pre-key-1.json": "...",
      "session-1.json": "..."
    },
    updatedAt: FirestoreTimestamp,
    schemaVersion: 2
  }
  ```
- **Backup Trigger:** Every `saveCreds()` call (lines 535-562, 3189-3211)

#### 3. `threads`
- **Purpose:** Conversation threads
- **References:**
  - Line 955: `db.collection('threads').doc(threadId)`
  - Line 964: `db.collection('threads').doc(threadId).set(...)`
  - Line 2517: `db.collection('threads')`
- **Document ID Format:** `{accountId}__{clientJid}` (line 933)
- **Fields:**
  - `accountId`, `clientJid`
  - `lastMessageAt` (FirestoreTimestamp)

#### 4. `threads/{threadId}/messages`
- **Purpose:** Messages per thread (subcollection)
- **References:**
  - Line 957-959: `db.collection('threads').doc(threadId).collection('messages').doc(messageId)`
  - Line 2528-2531: Query messages subcollection
- **Document Structure:**
  ```javascript
  {
    accountId: "account_prod_...",
    clientJid: "40712345678@s.whatsapp.net",
    direction: "inbound" | "outbound",
    body: "message text",
    waMessageId: "3EB0...",
    status: "delivered",
    tsClient: "ISO8601",
    tsServer: FirestoreTimestamp,
    createdAt: FirestoreTimestamp
  }
  ```

#### 5. `outbox`
- **Purpose:** Queued outbound messages
- **References:**
  - Line 2488: `db.collection('outbox').doc(messageId).set(...)`
  - Line 4272: `db.collection('outbox').where('status', '==', 'queued')`
  - Line 4292: `db.collection('outbox').doc(requestId)`
  - Line 4350, 4370, 4431, 4455: Update outbox documents
- **Document Structure:**
  ```javascript
  {
    accountId: "account_prod_...",
    toJid: "40712345678@s.whatsapp.net",
    threadId: "account_prod_...__407...",
    payload: { message: "..." },
    body: "message text",
    status: "queued" | "processing" | "sent" | "failed",
    attemptCount: 0,
    nextAttemptAt: FirestoreTimestamp,
    claimedBy: "worker_id",
    leaseUntil: FirestoreTimestamp,
    providerMessageId: "3EB0...",
    createdAt: FirestoreTimestamp,
    updatedAt: FirestoreTimestamp
  }
  ```

#### 6. `inboundDedupe`
- **Purpose:** Deduplicate inbound messages
- **References:**
  - Line 899: `db.collection('inboundDedupe').doc(dedupeKey)`
- **Document ID Format:** `{accountId}__{messageId}` (line 898)
- **Document Structure:**
  ```javascript
  {
    accountId: "account_prod_...",
    providerMessageId: "3EB0...",
    processedAt: FirestoreTimestamp,
    expiresAt: FirestoreTimestamp  // TTL: 7 days
  }
  ```

#### 7. `incidents`
- **Purpose:** Log incident events
- **References:**
  - Line 484: `db.collection('incidents').doc(incidentId).set(...)`
- **Function:** `logIncident()` (lines 475-497)
- **Document Structure:**
  ```javascript
  {
    accountId: "account_prod_...",
    type: "qr_generation_failed" | "max_reconnect_attempts" | "logged_out",
    severity: "high" | "medium",
    details: {},
    ts: FirestoreTimestamp
  }
  ```

### Message Persistence Flow
- **Inbound Messages:**
  - Handler: `messages.upsert` event (lines 856, 3431)
  - Dedupe Check: Lines 897-928 (Firestore transaction)
  - Save to Firestore: Lines 930-978
    - Path: `threads/{threadId}/messages/{messageId}`
    - Update thread: Line 964
  - **Evidence:** Messages ARE persisted to Firestore

- **Outbound Messages:**
  - Direct Send: Line 2504 (if account connected)
  - Queue if Disconnected: Lines 2486-2500 (saves to `outbox`)
  - Worker Processing: Lines 4265-4600 (outbox worker loop)
  - Status Updates: Lines 4350, 4370 (update status in Firestore)

---

## 11. legacy hosting Deployment Guidance

### legacy hosting.toml
- **File:** `whatsapp-backend/legacy hosting.toml`
- **Volume Mount:** Line 17: `mountPath = "/app/sessions"` (NOTE: Current config uses `/app/sessions`, but code expects `/data/sessions` or `SESSIONS_PATH` env var)

### legacy hosting.json (Root)
- **File:** `legacy hosting.json` (root directory)
- **Start Command:** Line 8: `cd whatsapp-backend && node server.js`

### Required Environment Variables
Based on code evidence:

#### Critical (Must Have)
1. **SESSIONS_PATH** (or LEGACY_VOLUME_MOUNT_PATH)
   - **Usage:** Lines 311-317
   - **Expected:** `/app/sessions` or `/data/sessions`
   - **Note:** Must match volume mount path

2. **FIREBASE_SERVICE_ACCOUNT_JSON**
   - **Usage:** Lines 164-198 (Firebase initialization)
   - **Required:** For Firestore access
   - **Format:** JSON string of Firebase service account key

3. **PORT**
   - **Usage:** Line 138: `process.env.PORT || 8080`
   - **legacy hosting:** Auto-injected, defaults to 8080

#### Optional (Nice to Have)
4. **ADMIN_TOKEN**
   - **Usage:** Line 147-149
   - **Default:** Random generated if not set
   - **Purpose:** Admin endpoint protection

5. **REDIS_URL**
   - **Usage:** `redis-cache.js` module
   - **Purpose:** Cache (optional, has memory fallback)

6. **LONGRUN_ADMIN_TOKEN**
   - **Usage:** Line 367
   - **Default:** Falls back to ADMIN_TOKEN
   - **Purpose:** Long-run job endpoints

7. **WHATSAPP_CONNECT_TIMEOUT_MS**
   - **Usage:** Lines 373, 508, 594, 3133, 3243
   - **Default:** 60000 (60 seconds)

8. **LEGACY_DEPLOYMENT_ID**
   - **Usage:** Lines 385, 630, 4262
   - **legacy hosting:** Auto-injected
   - **Purpose:** Worker identification

9. **LEGACY_GIT_COMMIT_SHA**
   - **Usage:** Line 355
   - **legacy hosting:** Auto-injected
   - **Purpose:** Version tracking

### Volume Configuration
- **Expected Mount Path:** Based on `legacy hosting.toml` line 17: `/app/sessions`
- **Code Preference:** `SESSIONS_PATH` env var (line 313) - should match volume mount
- **Current Issue:** Code checks for writability at startup (lines 346-352) and exits if not writable

### Build Configuration
- **Builder:** NIXPACKS (no Dockerfile needed unless custom build required)
- **Build Command:** `cd whatsapp-backend && npm install`
- **Node Version:** 20.x (from `package.json` engines line 19)

---

## 12. Project Knowledge

### High-Level Architecture
- **Backend Services:**
  - `whatsapp-backend/` - WhatsApp multi-account service (Node.js + Baileys)
  - `voice-backend/` - Voice AI integration
  - `twilio-backend/` - Twilio SMS/call integration
  - `functions/` - Firebase Cloud Functions

- **Frontend:**
  - `superparty_flutter/` - Flutter mobile app (Dart)

- **Integration:**
  - WhatsApp backend communicates with Flutter app via REST API
  - Uses Firestore for shared data (messages, accounts)
  - Redis for caching (optional)

### Important Modules/Folders
- **whatsapp-backend/lib/**
  - `wa-bootstrap.js` - Bootstrap utilities
  - `wa-reconnect-manager.js` - Reconnection logic
  - `wa-stability-manager.js` - Stability monitoring
  - `wa-keepalive-monitor.js` - Keepalive detection
  - `wa-auto-heal.js` - Auto-recovery
  - `persistence/firestore-auth.js` - Firestore auth state (alternative to disk)
  - `longrun-jobs-v2.js` - Long-running job management

### WhatsApp Backend Integration
- **REST API:** Express.js server (line 137)
- **WebSocket:** Baileys library (no browser automation)
- **Storage:** Hybrid (disk + Firestore backup)
- **Caching:** Redis (with memory fallback)
- **Monitoring:** Health endpoints, Sentry, Logtail

---

## Final Checklists

### legacy hosting UI Deployment Steps

1. **Create Volume**
   - legacy hosting Dashboard → Service → Volumes
   - Click "New Volume"
   - Name: `whatsapp-sessions-volume`
   - Mount Path: `/app/sessions` (or set `SESSIONS_PATH` env var to match)
   - Size: `1GB` (minimum, recommend 10GB for 30 accounts)
   - Region: Same as service
   - Click "Create"

2. **Set Environment Variables**
   - legacy hosting Dashboard → Service → Variables
   - Add variables:
     - `SESSIONS_PATH` = `/app/sessions` (MUST match volume mount path)
     - `FIREBASE_SERVICE_ACCOUNT_JSON` = `{...}` (Firebase service account JSON as string)
     - `ADMIN_TOKEN` = `your-secret-token` (optional, for admin endpoints)
     - `REDIS_URL` = `redis://...` (optional, for caching)
     - `WHATSAPP_CONNECT_TIMEOUT_MS` = `60000` (optional, default 60s)

3. **Deploy**
   - legacy hosting auto-deploys on git push (if connected)
   - Or: legacy hosting Dashboard → Deployments → Redeploy

4. **Verify Health**
   - Check logs for: `Sessions dir writable: true` (line 342)
   - Test endpoint: `GET https://your-service.legacy hosting.app/health`
   - Expected: `"status": "healthy"` and `"sessions_dir_writable": true`

5. **Log Checks**
   - legacy hosting Dashboard → Service → Logs
   - Look for:
     - `✅ Server running on port 8080`
     - `📁 Auth directory: /app/sessions`
     - `📁 Sessions dir writable: true`
     - `✅ Account restore complete: X accounts loaded`

---

### Onboarding 30 Accounts Checklist (Using Actual Endpoints)

**Prerequisites:**
- Service deployed and healthy
- Volume mounted correctly
- Firestore configured

**Steps for Each Account (1-30):**

1. **Add Account**
   ```bash
   POST https://your-service.legacy hosting.app/api/whatsapp/add-account
   Content-Type: application/json
   
   {
     "name": "Account 1",
     "phone": "+40712345678"
   }
   ```
   - **Response:** `{ "success": true, "account": { "id": "account_prod_...", "status": "connecting" } }`
   - **Evidence:** Lines 2190-2303

2. **Wait for QR (5-10 seconds)**
   ```bash
   GET https://your-service.legacy hosting.app/api/whatsapp/qr/{accountId}
   ```
   - **Response:** HTML page with QR code image
   - **Alternative:** `GET /api/whatsapp/accounts` to get `qrCode` field in JSON
   - **Evidence:** Lines 1951-2055, 644-686

3. **Scan QR with WhatsApp Mobile**
   - Open WhatsApp → Settings → Linked Devices → Link a Device
   - Scan QR code from step 2

4. **Verify Connection**
   ```bash
   GET https://your-service.legacy hosting.app/api/status/dashboard
   ```
   - **Check:** Account status = `"connected"`
   - **Evidence:** Lines 4148-4218

5. **Monitor Status**
   ```bash
   GET https://your-service.legacy hosting.app/api/whatsapp/accounts
   ```
   - **Check:** `status: "connected"`, `qrCode: null`

**Repeat steps 1-5 for accounts 2-30**

**Notes:**
- Accounts boot with 2-5s jitter between them (lines 3590-3595, 3614-3619)
- Duplicate phone numbers automatically disconnect old session (lines 2206-2265)
- QR codes expire after ~40 seconds, regenerate if needed via `POST /api/whatsapp/regenerate-qr/:accountId`
- If account logs out, status changes to `needs_qr` and you must regenerate QR (lines 824-844)

**Batch Onboarding Script Example:**
```bash
#!/bin/bash
BASE_URL="https://your-service.legacy hosting.app"
PHONES=("+40711111111" "+40722222222" ... "+40730303030")

for i in {1..30}; do
  phone="${PHONES[$i-1]}"
  echo "Adding account $i: $phone"
  
  response=$(curl -s -X POST "$BASE_URL/api/whatsapp/add-account" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"Account $i\", \"phone\": \"$phone\"}")
  
  accountId=$(echo $response | jq -r '.account.id')
  echo "Account ID: $accountId"
  echo "QR URL: $BASE_URL/api/whatsapp/qr/$accountId"
  
  sleep 3  # Wait between requests to avoid rate limiting
done
```

---

**END OF AUDIT REPORT**
