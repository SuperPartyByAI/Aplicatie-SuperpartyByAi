# Railway WhatsApp Backend - Operator Runbook

**Version:** 2.0.0  
**Last Updated:** 2026-01-17  
**Purpose:** Production operations guide for 30 WhatsApp accounts on Railway

---

## Table of Contents

1. [Repository Map](#0-repository-map)
2. [Entrypoints & Startup](#1-entrypoints--startup)
3. [Railway Persistence Requirements](#2-railway-persistence-requirements)
4. [Baileys Confirmation](#3-baileys-confirmation)
5. [Multi-Account Design](#4-multi-account-design)
6. [Boot Restore Sequence](#5-boot-restore-sequence)
7. [API Reference](#6-api-reference)
8. [QR Lifecycle](#7-qr-lifecycle)
9. [Health Monitor & Reconnect](#8-health-monitor--reconnect)
10. [Graceful Shutdown](#9-graceful-shutdown)
11. [Firestore Collections](#10-firestore-collections)
12. [Operator Checklists](#11-operator-checklists)

---

## 0. Repository Map

### Structure
```
Aplicatie-SuperpartyByAi/
├── whatsapp-backend/          # WhatsApp backend service
│   ├── server.js              # Main entrypoint (4728 lines)
│   ├── package.json           # Dependencies
│   ├── Dockerfile             # Container image
│   ├── railway.toml           # Railway deployment config
│   └── lib/                   # Support modules
├── railway.json               # Root Railway config
└── [other services...]
```

**Evidence:**
- Backend location: `whatsapp-backend/` (confirmed via `list_dir`)
- Entrypoint: `whatsapp-backend/server.js` (line 1)

---

## 1. Entrypoints & Startup

### Main Entry File
- **File:** `whatsapp-backend/server.js` (line 1-4728)
- **Express Init:** Line 137: `const app = express();`
- **Server Listen:** Line 4221: `app.listen(PORT, '0.0.0.0', async () => { ... })`
- **Port:** Line 138: `const PORT = process.env.PORT || 8080;`

### Package.json Scripts
- **File:** `whatsapp-backend/package.json` (lines 6-16)
- **Start Command:** `"start": "node server.js"` (line 7)
- **Dev Command:** `"dev": "nodemon server.js"` (line 8)

### Railway Configuration

**File:** `railway.json` (root, lines 1-17)
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd whatsapp-backend && npm install"
  },
  "deploy": {
    "startCommand": "cd whatsapp-backend && node server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

**File:** `whatsapp-backend/railway.toml` (lines 1-17)
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/health"
healthcheckTimeout = 30

[[volumes]]
mountPath = "/app/sessions"
```

**File:** `whatsapp-backend/Dockerfile` (lines 1-13)
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

---

## 2. Railway Persistence Requirements

### SESSIONS_PATH Logic
- **File:** `whatsapp-backend/server.js` (lines 311-317)
```javascript
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));
```

**Priority:**
1. `SESSIONS_PATH` env var (highest priority)
2. `RAILWAY_VOLUME_MOUNT_PATH + '/baileys_auth'`
3. Fallback: `{__dirname}/.baileys_auth` (ephemeral)

### Fail-Fast Writability Check
- **File:** `whatsapp-backend/server.js` (lines 327-352)

**Test Logic:**
- Lines 328-336: Writes test file `.write-test` and deletes it
- Lines 346-352: **`process.exit(1)` if not writable** (fail-fast)

**Logging:**
- Lines 339-342: Logs `SESSIONS_PATH`, `authDir`, exists, writable status
- Line 351: Error message includes fix instructions

### Expected Mount Path from Config
- **File:** `whatsapp-backend/railway.toml` (line 17)
- **Mount Path:** `/app/sessions`

### Railway UI Steps (Exact)

#### Step 1: Create Persistent Volume
1. Railway Dashboard → Project → Service (`whatsapp-backend`) → Tab **"Volumes"**
2. Click **"New Volume"**
3. Set:
   - **Name:** `whatsapp-sessions-volume`
   - **Mount Path:** `/app/sessions` ⚠️ (MUST match this exactly)
   - **Size:** `10GB` (recommended for 30 accounts)
4. Click **"Create"**
5. Wait for status **"Active"** (green)

#### Step 2: Set Environment Variables
Railway Dashboard → Service → Tab **"Variables"** → Add:

| Variable | Value | Required | Evidence |
|----------|-------|----------|----------|
| `SESSIONS_PATH` | `/app/sessions` | ✅ **CRITICAL** | Lines 311-317 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `{...}` (JSON string) | ✅ **CRITICAL** | Lines 164-198 |
| `ADMIN_TOKEN` | Random long token | ⚠️ Recommended | Lines 147-149 |
| `WHATSAPP_CONNECT_TIMEOUT_MS` | `60000` | Optional | Lines 373, 508 |

#### Step 3: Verify Deployment
**Check Logs (Railway Dashboard → Deployments → Latest → View Logs):**
```
✅ SESSIONS_PATH: /app/sessions
✅ Auth directory: /app/sessions
✅ Sessions dir exists: true
✅ Sessions dir writable: true
✅ Firebase Admin initialized
✅ Server running on port 8080
```

**Health Check:**
```bash
curl https://your-service.railway.app/health | jq '{ok, sessions_dir_writable, firestore: .firestore.status}'
```

**Expected:**
```json
{
  "ok": true,
  "sessions_dir_writable": true,
  "firestore": {
    "status": "connected"
  }
}
```

---

## 3. Baileys Confirmation (No Browser)

### Baileys Imports
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
- **Browser Metadata:** Lines 569, 3220: `browser: ['SuperParty', 'Chrome', '2.0.0']` (metadata only, not real browser)

### useMultiFileAuthState Usage
- **File:** `whatsapp-backend/server.js` (lines 530, 3184)
```javascript
let { state, saveCreds } = await useMultiFileAuthState(sessionPath);
```

### Session Folder Structure
- **Per-Account Path:** Line 513, 3140: `const sessionPath = path.join(authDir, accountId);`
- **Example:** `/app/sessions/account_prod_abc123def456.../`
- **Files Created by Baileys:**
  - `creds.json` (lines 520, 3673)
  - `pre-key-*.json` (created by Baileys)
  - `session-*.json` (created by Baileys)

---

## 4. Multi-Account Design (30 Accounts)

### Maximum Accounts
- **File:** `whatsapp-backend/server.js` (line 139)
- **Constant:** `const MAX_ACCOUNTS = 30;`
- **Validation:** Line 2194: `if (connections.size >= MAX_ACCOUNTS) { return res.status(400).json({ error: 'Maximum 30 accounts reached' }); }`

### AccountId Generation
- **File:** `whatsapp-backend/server.js` (lines 68-73)
- **Function:** `generateAccountId(phone)`
```javascript
function generateAccountId(phone) {
  const canonical = canonicalPhone(phone);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 32);
  const env = process.env.NODE_ENV || 'dev';
  return `account_${env}_${hash}`;
}
```
- **Format:** `account_{env}_{hash}` (hash is first 32 chars of SHA256)
- **Deterministic:** Same phone → same accountId (line 2202-2203)

### In-Memory Registry
- **File:** `whatsapp-backend/server.js` (lines 249-251)
- **Map:** `const connections = new Map(); // accountId -> account object`
- **Account Object Structure (from code evidence):**
  ```javascript
  {
    id: accountId,
    name: string,
    phone: string,
    phoneNumber: string,
    status: 'connecting' | 'connected' | 'qr_ready' | 'disconnected' | 'logged_out' | 'needs_qr',
    sock: BaileysSocket,
    qrCode: string | null,  // Base64 data URL
    pairingCode: string | null,
    createdAt: ISO8601 string,
    lastUpdate: ISO8601 string,
    lastEventAt: timestamp,
    lastMessageAt: timestamp,
    waJid: string | null,
    saveCreds: function,
    reconnectCount: number
  }
  ```

---

## 5. Boot Restore Sequence

### Startup Flow (Exact Order)
- **File:** `whatsapp-backend/server.js` (lines 4221-4232)

**Step 1: Server Starts**
- Line 4221: `app.listen(PORT, '0.0.0.0', async () => { ... })`

**Step 2: Firestore Restore**
- Line 4230: `await restoreAccountsFromFirestore();`
- **Function:** `restoreAccountsFromFirestore()` (lines 3551-3645)
- **Collection:** `accounts` (line 3561)
- **Query:** `db.collection('accounts').where('status', '==', 'connected')` (line 3561)
- **Ordering:** Sorted by `accountId` alphabetically (line 3583)
- **Jitter:** 2-5 seconds between accounts (lines 3590-3595)
  ```javascript
  const jitter = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
  ```
- **Action:** Calls `restoreAccount(accountId, data)` for each (line 3598)

**Step 3: Disk Scan Restore**
- Line 4231: `await restoreAccountsFromDisk();`
- **Function:** `restoreAccountsFromDisk()` (lines 3649-3713)
- **Scan:** Reads `authDir` directories (lines 3658-3660)
- **Filter:** Directories containing `creds.json` (lines 3675-3676)
- **Ordering:** Sorted alphabetically (line 3668)
- **Jitter:** 2-5 seconds between accounts (lines 3678-3683)
- **Action:** Calls `restoreAccount()` if not already in connections (lines 3687-3691)

**Step 4: Staggered Connection Start**
- Lines 3603-3627: For each restored account, calls `createConnection()` with 2-5s jitter

**Step 5: Health Monitoring Starts**
- Line 4234: `setInterval(() => { checkStaleConnections(); ... }, HEALTH_CHECK_INTERVAL)`
- **Interval:** `HEALTH_CHECK_INTERVAL = 60000` (60 seconds, line 144)

---

## 6. API Reference

### Base URL
```
https://your-service.railway.app
```

### Authentication
- Most endpoints: **No authentication required**
- Admin endpoints: `Authorization: Bearer {ADMIN_TOKEN}` header required
- **Evidence:** Lines 147-149 (ADMIN_TOKEN), `requireAdmin` middleware used for admin endpoints

---

### Endpoint: POST /api/whatsapp/add-account

**Route:** `POST /api/whatsapp/add-account`  
**File:** `whatsapp-backend/server.js` (lines 2190-2303)  
**Auth:** None (public endpoint)  
**Rate Limit:** `accountLimiter` (configured rate limiter)

**Request Schema:**
```json
{
  "name": "string (optional, label for account)",
  "phone": "string (E.164 format: +40712345678 or local format: 0712345678)"
}
```

**Response Schema:**
```json
{
  "success": true,
  "account": {
    "id": "account_prod_abc123def456...",
    "name": "WA-01",
    "phone": "+40712345678",
    "status": "connecting",
    "qrCode": null,
    "pairingCode": null,
    "createdAt": "2026-01-17T18:30:00.000Z"
  }
}
```

**Example Request:**
```bash
curl -X POST "https://your-service.railway.app/api/whatsapp/add-account" \
  -H "Content-Type: application/json" \
  -d '{"name":"WA-01","phone":"+40712345678"}'
```

**Example Response:**
```json
{
  "success": true,
  "account": {
    "id": "account_prod_7a8b9c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    "name": "WA-01",
    "phone": "+40712345678",
    "status": "connecting",
    "qrCode": null,
    "pairingCode": null,
    "createdAt": "2026-01-17T18:30:00.000Z"
  }
}
```

**Code Evidence:**
- Request body parsing: Line 2192: `const { name, phone } = req.body;`
- AccountId generation: Lines 2202-2203
- Max accounts check: Lines 2194-2199
- Duplicate detection: Lines 2206-2265
- Connection creation: Line 2275: `createConnection(accountId, name, phone)`
- Response: Lines 2284-2295

---

### Endpoint: GET /api/whatsapp/qr/:accountId

**Route:** `GET /api/whatsapp/qr/:accountId`  
**File:** `whatsapp-backend/server.js` (lines 1951-2055)  
**Auth:** None

**Request:** URL parameter `accountId`

**Response:** HTML page with QR code image (base64 data URL embedded)

**Example Request:**
```bash
curl "https://your-service.railway.app/api/whatsapp/qr/account_prod_abc123..."
```

**Example Response:** HTML page with `<img src="data:image/png;base64,...">`

**Code Evidence:**
- Parameter extraction: Line 1953: `const { accountId } = req.params;`
- Account lookup: Lines 1956-1964 (in-memory first, then Firestore)
- QR extraction: Line 1977: `account.qrCode || account.qr_code`
- HTML generation: Lines 1993-2043

---

### Endpoint: GET /api/whatsapp/accounts

**Route:** `GET /api/whatsapp/accounts`  
**File:** `whatsapp-backend/server.js` (lines 2081-2117)  
**Auth:** None

**Request:** None (GET)

**Response Schema:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "account_prod_...",
      "name": "WA-01",
      "phone": "+40712345678",
      "status": "connected|connecting|qr_ready|disconnected|logged_out|needs_qr",
      "qrCode": "data:image/png;base64,..." | null,
      "pairingCode": "string" | null,
      "createdAt": "ISO8601",
      "lastUpdate": "ISO8601"
    }
  ],
  "cached": false
}
```

**Example Request:**
```bash
curl "https://your-service.railway.app/api/whatsapp/accounts"
```

**Example Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "account_prod_7a8b9c...",
      "name": "WA-01",
      "phone": "+40712345678",
      "status": "connected",
      "qrCode": null,
      "pairingCode": null,
      "createdAt": "2026-01-17T18:30:00.000Z",
      "lastUpdate": "2026-01-17T18:35:00.000Z"
    }
  ],
  "cached": false
}
```

**Code Evidence:**
- Account iteration: Lines 2094-2105
- Response construction: Lines 2093-2113
- Cache support: Lines 2084-2111 (if feature flag enabled)

---

### Endpoint: GET /api/status/dashboard

**Route:** `GET /api/status/dashboard`  
**File:** `whatsapp-backend/server.js` (lines 4148-4218)  
**Auth:** None

**Request:** None (GET)

**Response Schema:**
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
      "phone": "+407****78",
      "status": "connected",
      "lastEventAt": "ISO8601" | null,
      "lastMessageAt": "ISO8601" | null,
      "lastSeen": "ISO8601" | null,
      "reconnectCount": 0,
      "reconnectAttempts": 0,
      "needsQR": false,
      "qrCode": "data:image/png;base64,..." | null
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

**Example Request:**
```bash
curl "https://your-service.railway.app/api/status/dashboard"
```

**Example Response:**
```json
{
  "timestamp": "2026-01-17T18:40:00.000Z",
  "service": {
    "status": "healthy",
    "uptime": 600,
    "version": "2.0.0"
  },
  "storage": {
    "path": "/app/sessions",
    "writable": true,
    "totalAccounts": 30
  },
  "accounts": [
    {
      "accountId": "account_prod_7a8b9c...",
      "phone": "+407****78",
      "status": "connected",
      "lastEventAt": "2026-01-17T18:39:30.000Z",
      "lastMessageAt": null,
      "lastSeen": "2026-01-17T18:39:30.000Z",
      "reconnectCount": 0,
      "reconnectAttempts": 0,
      "needsQR": false,
      "qrCode": null
    }
  ],
  "summary": {
    "connected": 30,
    "connecting": 0,
    "disconnected": 0,
    "needs_qr": 0,
    "total": 30
  }
}
```

**Code Evidence:**
- Account data extraction: Lines 4156-4191
- Summary calculation: Lines 4151-4154, 4207-4213
- Storage info: Lines 4201-4205

---

### Endpoint: POST /api/whatsapp/regenerate-qr/:accountId

**Route:** `POST /api/whatsapp/regenerate-qr/:accountId`  
**File:** `whatsapp-backend/server.js` (lines 2445-2473)  
**Auth:** None

**Request:** URL parameter `accountId`

**Response Schema:**
```json
{
  "success": true,
  "message": "QR regeneration started"
}
```

**Example Request:**
```bash
curl -X POST "https://your-service.railway.app/api/whatsapp/regenerate-qr/account_prod_abc123..."
```

**Code Evidence:**
- Parameter: Line 2447: `const { accountId } = req.params;`
- Socket cleanup: Lines 2455-2461
- Reconnection: Line 2467: `createConnection(accountId, account.name, account.phone)`

---

### Endpoint: POST /api/whatsapp/disconnect/:id

**Route:** `POST /api/whatsapp/disconnect/:id`  
**File:** `whatsapp-backend/server.js` (lines 2592-2637)  
**Auth:** None

**Request:** URL parameter `id` (accountId)

**Response Schema:**
```json
{
  "success": true,
  "accountId": "account_prod_...",
  "tsDisconnect": 1234567890,
  "reason": "user_disconnect"
}
```

**Example Request:**
```bash
curl -X POST "https://your-service.railway.app/api/whatsapp/disconnect/account_prod_abc123..."
```

**Code Evidence:**
- Socket close: Line 2605: `account.sock.end()`
- Status update: Line 2610, 2614-2619
- Removal: Line 2623: `connections.delete(id)`

---

### Endpoint: DELETE /api/whatsapp/accounts/:id

**Route:** `DELETE /api/whatsapp/accounts/:id`  
**File:** `whatsapp-backend/server.js` (lines 2553-2584)  
**Auth:** None

**Request:** URL parameter `id` (accountId)

**Response Schema:**
```json
{
  "success": true,
  "message": "Account deleted"
}
```

**Example Request:**
```bash
curl -X DELETE "https://your-service.railway.app/api/whatsapp/accounts/account_prod_abc123..."
```

**Code Evidence:**
- Socket close: Lines 2563-2569
- Deletion: Lines 2571-2578
- Firestore update: Lines 2575-2578 (status: 'deleted')

---

### Endpoint: POST /api/whatsapp/send-message

**Route:** `POST /api/whatsapp/send-message`  
**File:** `whatsapp-backend/server.js` (lines 2476-2510)  
**Auth:** None  
**Rate Limit:** `messageLimiter`

**Request Schema:**
```json
{
  "accountId": "account_prod_...",
  "to": "+40712345678" | "40712345678@s.whatsapp.net",
  "message": "text message"
}
```

**Response Schema:**
```json
{
  "success": true,
  "messageId": "3EB0...",
  "queued": false
}
```

**If Account Not Connected:**
```json
{
  "success": true,
  "queued": true,
  "messageId": "msg_1234567890_abc123"
}
```

**Example Request:**
```bash
curl -X POST "https://your-service.railway.app/api/whatsapp/send-message" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "account_prod_7a8b9c...",
    "to": "+40712345678",
    "message": "Hello from Railway!"
  }'
```

**Code Evidence:**
- Body parsing: Line 2478
- Queue logic: Lines 2485-2500 (if not connected, queue in `outbox`)
- Direct send: Line 2504: `account.sock.sendMessage(jid, { text: message })`

---

### Endpoint: GET /api/whatsapp/messages

**Route:** `GET /api/whatsapp/messages`  
**File:** `whatsapp-backend/server.js` (lines 2513-2550)  
**Auth:** None

**Query Parameters:**
- `accountId` (optional)
- `threadId` (optional)
- `limit` (optional, default: 50)

**Response Schema:**
```json
{
  "success": true,
  "threads": [
    {
      "id": "account_prod_...__40712345678@s.whatsapp.net",
      "accountId": "account_prod_...",
      "clientJid": "40712345678@s.whatsapp.net",
      "lastMessageAt": "FirestoreTimestamp",
      "messages": [
        {
          "id": "3EB0...",
          "accountId": "account_prod_...",
          "clientJid": "40712345678@s.whatsapp.net",
          "direction": "inbound" | "outbound",
          "body": "message text",
          "waMessageId": "3EB0...",
          "status": "delivered",
          "tsClient": "ISO8601",
          "tsServer": "FirestoreTimestamp",
          "createdAt": "FirestoreTimestamp"
        }
      ]
    }
  ]
}
```

**Example Request:**
```bash
curl "https://your-service.railway.app/api/whatsapp/messages?accountId=account_prod_...&limit=50"
```

**Code Evidence:**
- Query parsing: Line 2515
- Firestore query: Line 2517: `db.collection('threads')`
- Message subcollection: Lines 2528-2532

---

### Endpoint: GET /health

**Route:** `GET /health`  
**File:** `whatsapp-backend/server.js` (lines 1380-1503)  
**Auth:** None  
**Railway Healthcheck:** Configured in `railway.toml` line 8

**Response Schema:**
```json
{
  "ok": true | false,
  "accounts_total": 0,
  "connected": 0,
  "needs_qr": 0,
  "sessions_dir_writable": true | false,
  "status": "healthy" | "unhealthy",
  "version": "2.0.0",
  "commit": "abc12345",
  "bootTimestamp": "ISO8601",
  "deploymentId": "uuid",
  "mode": "single",
  "uptime": 12345,
  "timestamp": "ISO8601",
  "accounts": {
    "total": 0,
    "connected": 0,
    "connecting": 0,
    "disconnected": 0,
    "needs_qr": 0,
    "max": 30
  },
  "firestore": {
    "status": "connected" | "disconnected" | "error" | "not_configured"
  },
  "errorsByStatus": {}
}
```

**Example Request:**
```bash
curl "https://your-service.railway.app/health"
```

**Code Evidence:**
- Writability check: Lines 1392-1403
- Firestore check: Lines 1428-1443
- Account aggregation: Lines 1457-1458

---

## 7. QR Lifecycle

### QR Generation
- **Trigger:** Baileys `connection.update` event with `qr` field
- **File:** `whatsapp-backend/server.js` (lines 644, 3267)

**Handler Flow:**
1. QR string received from Baileys (line 644: `const { qr } = update`)
2. Convert to base64 data URL (line 650: `await QRCode.toDataURL(qr)`)
3. Store in memory: `account.qrCode = qrDataURL` (line 652)
4. Update status: `account.status = 'qr_ready'` (line 653)
5. Save to Firestore: `accounts/{accountId}.qrCode` (lines 657-661)

### QR Storage
- **In-Memory:** `account.qrCode` (line 652) - Base64 data URL
- **Firestore:** `accounts/{accountId}` document, field `qrCode` (line 658)
- **Format:** Base64 data URL (`data:image/png;base64,...`)

**Code Evidence:**
- QR generation: Lines 647-686, 3270-3295
- Firestore save: Lines 657-661, 3276-3280

### QR Exposure
- **HTML Endpoint:** `GET /api/whatsapp/qr/:accountId` (lines 1951-2055)
  - Returns HTML page with `<img src="${qrCode}">`
- **JSON Endpoint:** `GET /api/whatsapp/accounts` (line 2100) - Includes `qrCode` field
- **Dashboard:** `GET /api/status/dashboard` (lines 4183-4189) - Includes QR if `needsQR=true`

### QR Cleanup
- **On Connection:** Line 702: `account.qrCode = null` when `connection === 'open'`
- **Firestore:** Line 718: Removes `qrCode` field when saving connected status

---

## 8. Health Monitor & Reconnect

### Exponential Backoff
- **File:** `whatsapp-backend/server.js` (lines 783-801, 3376-3391)

**Constants:**
- `MAX_RECONNECT_ATTEMPTS = 5` (line 308)
- `RECONNECT_TIMEOUT_MS = 60000` (line 309)

**Formula:**
```javascript
const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
```

**Backoff Values:**
- Attempt 1: 1000ms (1s)
- Attempt 2: 2000ms (2s)
- Attempt 3: 4000ms (4s)
- Attempt 4: 8000ms (8s)
- Attempt 5: 16000ms (16s)
- Max cap: 30000ms (30s)

**Code Evidence:**
- Lines 787, 3380: Backoff calculation
- Lines 797-801, 3387-3391: Scheduled reconnect with backoff

### State Transitions

#### loggedOut / badSession / unauthorized → needs_qr

**File:** `whatsapp-backend/server.js` (lines 724-844, 3318-3414)

**Flow:**
1. **Disconnect Detection:** Handler `connection.update` with `lastDisconnect` (lines 727, 3326)
2. **Reason Check:** `DisconnectReason.loggedOut` (lines 738, 3339)
3. **Decision:** `shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut` (lines 727-728, 3326-3327)

**If LoggedOut (no reconnect):**
- Lines 824-844, 3395-3414:
  1. Set status to `needs_qr` (lines 826, 3395)
  2. Save to Firestore (lines 828-830)
  3. Log incident (lines 832-835)
  4. Delete from connections Map (line 838)
  5. Release lock (line 839)
  6. Schedule reconnect after 5s (lines 841-843)

**If Other Disconnect (reconnect):**
- Lines 783-823, 3376-3394:
  1. Check attempts < MAX_RECONNECT_ATTEMPTS (line 786, 3379)
  2. Calculate backoff (line 787, 3380)
  3. Increment attempts (line 792, 3385)
  4. Schedule reconnect with backoff (lines 797-801, 3387-3391)
  5. If max attempts reached: Set `needs_qr`, cleanup, regenerate (lines 803-823)

**State Diagram:**
```
connected → (disconnect) → reconnecting (auto-reconnect)
                ↓
         (max attempts) → needs_qr
                ↓
         (loggedOut/badSession) → needs_qr
                ↓
         (regenerate QR) → qr_ready → (scan) → connected
```

---

## 9. Graceful Shutdown

### Signal Handlers
- **File:** `whatsapp-backend/server.js` (lines 4721-4727)

**Handlers:**
- Line 4721: `process.on('SIGTERM', async () => { await gracefulShutdown('SIGTERM'); })`
- Line 4725: `process.on('SIGINT', async () => { await gracefulShutdown('SIGINT'); })`

### Graceful Shutdown Function
- **File:** `whatsapp-backend/server.js` (lines 4665-4719)

**Sequence:**
1. **Stop lease refresh timer** (lines 4669-4671)
2. **Stop long-run jobs** (lines 4674-4676)
3. **Flush all sessions to disk** (lines 4678-4691):
   ```javascript
   const flushPromises = [];
   for (const [accountId, account] of connections.entries()) {
     if (account.saveCreds) {
       flushPromises.push(account.saveCreds().catch(...));
     }
   }
   await Promise.allSettled(flushPromises);
   ```
4. **Release Firestore leases** (line 4694)
5. **Close all sockets** (lines 4696-4714):
   ```javascript
   account.sock.end();
   ```
6. **Exit:** `process.exit(0)` (line 4718)

**Code Evidence:**
- Session flush: Lines 4681-4690
- Socket close: Lines 4699-4713
- Firestore backup: `saveCreds()` triggers backup to `wa_sessions` (lines 535-562)

---

## 10. Firestore Collections (Exact Paths)

### Collection: `accounts`

**Purpose:** Account metadata and status  
**Document ID Format:** `account_prod_{hash}` (generated accountId)

**Fields Written:**
- `accountId`, `name`, `phone`, `phoneE164`
- `status` (connected, connecting, qr_ready, disconnected, logged_out, needs_qr)
- `qrCode` (base64 data URL), `pairingCode`
- `waJid`, `lastEventAt`, `lastMessageAt`
- `createdAt`, `updatedAt`, `lastDisconnectedAt`
- `lastDisconnectReason`, `lastDisconnectCode`, `lastError`
- `claimedBy`, `claimedAt`, `leaseUntil` (lease data)
- `worker` object (service, instanceId, version, commit, uptime, bootTs)

**Code References:**
- Save: Lines 459-468 (`saveAccountToFirestore()`)
- Query: Line 3561 (`db.collection('accounts').where('status', '==', 'connected')`)
- Read: Line 1960 (`db.collection('accounts').doc(accountId).get()`)
- Update: Lines 2422, 2575, 2614, etc.

### Collection: `wa_sessions`

**Purpose:** Backup encrypted session files (multi-file auth state)  
**Document ID Format:** `account_prod_{hash}` (same as accountId)

**Document Structure:**
```javascript
{
  files: {
    "creds.json": "{...}",
    "pre-key-1.json": "{...}",
    "session-1.json": "{...}"
  },
  updatedAt: FirestoreTimestamp,
  schemaVersion: 2
}
```

**Code References:**
- Write: Lines 550, 3203 (`db.collection('wa_sessions').doc(accountId).set(...)`)
- Read: Lines 3146 (`db.collection('wa_sessions').doc(accountId).get()`)
- Delete: Line 4118 (`db.collection('wa_sessions').doc(id).delete()`)
- Backup trigger: Every `saveCreds()` call (lines 535-562, 3189-3211)

### Collection: `threads`

**Purpose:** Conversation threads  
**Document ID Format:** `{accountId}__{clientJid}` (line 933)

**Fields:**
- `accountId`
- `clientJid` (e.g., "40712345678@s.whatsapp.net")
- `lastMessageAt` (FirestoreTimestamp)

**Code References:**
- Write: Line 964 (`db.collection('threads').doc(threadId).set(...)`)
- Query: Line 2517 (`db.collection('threads')`)

### Subcollection: `threads/{threadId}/messages`

**Purpose:** Messages per conversation  
**Document ID Format:** WhatsApp message ID (e.g., "3EB0...")

**Document Structure:**
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

**Code References:**
- Write: Lines 954-959 (`db.collection('threads').doc(threadId).collection('messages').doc(messageId).set(...)`)
- Handler: `messages.upsert` event (lines 856-991, 3431-3526)
- Query: Lines 2528-2532 (read messages from subcollection)

### Collection: `outbox`

**Purpose:** Queued outbound messages (when account not connected)  
**Document ID Format:** Generated message ID (e.g., `msg_1234567890_abc123`)

**Document Structure:**
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

**Code References:**
- Write: Line 2488 (`db.collection('outbox').doc(messageId).set(...)`)
- Query: Lines 4272-4275 (`db.collection('outbox').where('status', '==', 'queued')`)
- Update: Lines 4350, 4370, 4431, 4455 (status updates)
- Worker loop: Lines 4265-4600 (processes queued messages)

### Collection: `inboundDedupe`

**Purpose:** Deduplicate inbound messages (prevent duplicate processing)  
**Document ID Format:** `{accountId}__{messageId}` (line 898)

**Document Structure:**
```javascript
{
  accountId: "account_prod_...",
  providerMessageId: "3EB0...",
  processedAt: FirestoreTimestamp,
  expiresAt: FirestoreTimestamp  // TTL: 7 days (line 911)
}
```

**Code References:**
- Write: Lines 912-917 (transaction-based check-and-set)
- Read: Lines 902-908 (transaction get)
- Handler: `messages.upsert` event (lines 897-928)

### Collection: `incidents`

**Purpose:** Log incident events (errors, failures)  
**Document ID Format:** `{type}_{timestamp}_{random}` (line 482)

**Document Structure:**
```javascript
{
  accountId: "account_prod_...",
  type: "qr_generation_failed" | "max_reconnect_attempts" | "logged_out",
  severity: "high" | "medium",
  details: {},
  ts: FirestoreTimestamp
}
```

**Code References:**
- Write: Lines 484-492 (`db.collection('incidents').doc(incidentId).set(...)`)
- Function: `logIncident()` (lines 475-497)
- Usage: Lines 685, 810, 832 (various error scenarios)

---

## 11. Operator Checklists

### Checklist 1: Railway Setup (Initial Deployment)

#### A. Create Persistent Volume
- [ ] Railway Dashboard → Project → Service (`whatsapp-backend`) → Tab **"Volumes"**
- [ ] Click **"New Volume"**
- [ ] Set **Name:** `whatsapp-sessions-volume`
- [ ] Set **Mount Path:** `/app/sessions` ⚠️ (EXACT - must match)
- [ ] Set **Size:** `10GB` (recommended for 30 accounts)
- [ ] Click **"Create"**
- [ ] Wait for status **"Active"** (green)

#### B. Set Environment Variables
- [ ] Railway Dashboard → Service → Tab **"Variables"**
- [ ] Add `SESSIONS_PATH` = `/app/sessions`
- [ ] Add `FIREBASE_SERVICE_ACCOUNT_JSON` = `{...}` (Firebase service account JSON as string)
- [ ] Add `ADMIN_TOKEN` = `your-long-random-token` (recommended)
- [ ] (Optional) Add `WHATSAPP_CONNECT_TIMEOUT_MS` = `60000`

#### C. Verify Deployment
- [ ] Railway Dashboard → Deployments → Latest → View Logs
- [ ] Confirm logs show:
  ```
  ✅ SESSIONS_PATH: /app/sessions
  ✅ Sessions dir writable: true
  ✅ Firebase Admin initialized
  ✅ Server running on port 8080
  ```
- [ ] Test health endpoint:
  ```bash
  curl https://your-service.railway.app/health | jq '{ok, sessions_dir_writable, firestore: .firestore.status}'
  ```
- [ ] Expected: `{"ok": true, "sessions_dir_writable": true, "firestore": {"status": "connected"}}`

---

### Checklist 2: Onboarding 30 Accounts

#### Setup Variables
```bash
export BASE_URL="https://your-service.railway.app"
export ADMIN_TOKEN="your-admin-token"  # Optional
```

#### For Each Account (1-30):

**Step 1: Add Account**
```bash
curl -X POST "${BASE_URL}/api/whatsapp/add-account" \
  -H "Content-Type: application/json" \
  -d '{"name":"WA-01","phone":"+40712345678"}' | jq .
```
- [ ] Note `accountId` from response
- [ ] Confirm response has `"status": "connecting"`

**Step 2: Wait for QR (5-10 seconds)**
```bash
# Check status
curl "${BASE_URL}/api/whatsapp/accounts" | jq '.accounts[] | select(.id == "{accountId}") | {status, qrCode: (.qrCode != null)}'
```
- [ ] Confirm status becomes `"qr_ready"` and `qrCode` is not null

**Step 3: Get QR Code**
```bash
# Option A: HTML page (open in browser)
open "${BASE_URL}/api/whatsapp/qr/{accountId}"

# Option B: Extract from JSON
curl "${BASE_URL}/api/whatsapp/accounts" | \
  jq -r '.accounts[] | select(.id == "{accountId}") | .qrCode' | \
  sed 's/data:image\/png;base64,//' | base64 -d > qr-{accountId}.png && \
  open qr-{accountId}.png
```

**Step 4: Scan QR with WhatsApp Mobile**
- [ ] Open WhatsApp → Settings → Linked Devices → Link a Device
- [ ] Scan QR code from step 3

**Step 5: Verify Connection**
```bash
# Wait 5-10 seconds, then check
curl "${BASE_URL}/api/status/dashboard" | jq '.accounts[] | select(.accountId == "{accountId}") | {status, needsQR}'
```
- [ ] Confirm `status == "connected"` and `needsQR == false`

**Step 6: Verify Persistence (After All 30 Added)**
```bash
# Check all accounts
curl "${BASE_URL}/api/status/dashboard" | jq '.summary'
```
- [ ] Expected: `"connected": 30, "total": 30`

**Step 7: Test Redeploy (After All Connected)**
- [ ] Trigger redeploy (Railway Dashboard → Redeploy)
- [ ] Wait 1-2 minutes for boot
- [ ] Verify all accounts auto-reconnect:
  ```bash
  curl "${BASE_URL}/api/status/dashboard" | jq '.summary'
  ```
- [ ] Expected: All 30 accounts remain `connected` (no QR re-scan needed)

---

### Checklist 3: Recover Account (When loggedOut / needs_qr)

#### Option A: Regenerate QR (Recommended)
```bash
ACCOUNT_ID="account_prod_..."
curl -X POST "${BASE_URL}/api/whatsapp/regenerate-qr/${ACCOUNT_ID}" | jq .
```
- [ ] Wait 5-10 seconds
- [ ] Get new QR: `curl "${BASE_URL}/api/whatsapp/qr/${ACCOUNT_ID}"` (or use accounts list)
- [ ] Scan QR with phone
- [ ] Verify: `curl "${BASE_URL}/api/whatsapp/accounts" | jq '.accounts[] | select(.id == "'${ACCOUNT_ID}'") | .status'`

#### Option B: Hard Reset (DELETE + Re-add)
```bash
ACCOUNT_ID="account_prod_..."
# 1. Delete
curl -X DELETE "${BASE_URL}/api/whatsapp/accounts/${ACCOUNT_ID}" | jq .

# 2. Re-add (use same phone number)
curl -X POST "${BASE_URL}/api/whatsapp/add-account" \
  -H "Content-Type: application/json" \
  -d '{"name":"WA-01","phone":"+40712345678"}' | jq .

# 3. Continue from onboarding Step 2 (get QR)
```

---

### Checklist 4: Verify Firestore Writes

#### In Firebase Console

1. **Navigate:** [Firebase Console](https://console.firebase.google.com/) → Your Project → Firestore → Data

2. **Check `accounts` Collection:**
   - [ ] See 30 documents with ID = `account_prod_...`
   - [ ] Each document has: `status`, `phone`, `phoneE164`, `createdAt`, `updatedAt`
   - [ ] All have `status: "connected"` (or check individual statuses)

3. **Check `wa_sessions` Collection:**
   - [ ] See 30 documents (one per account)
   - [ ] Each document has `files` object with keys: `creds.json`, `pre-key-*.json`, `session-*.json`
   - [ ] Each has `updatedAt` timestamp (should be recent)

4. **Check `threads` Collection:**
   - [ ] If messages were sent/received, see thread documents
   - [ ] Document ID format: `{accountId}__{clientJid}`
   - [ ] Each thread has `accountId`, `clientJid`, `lastMessageAt`
   - [ ] Subcollection `messages` contains message documents (if any messages exist)

5. **Check `outbox` Collection:**
   - [ ] Only if account was disconnected when sending message
   - [ ] Documents with `status: queued | processing | sent | failed`
   - [ ] If empty, it's normal (means all messages were sent immediately)

6. **Check `inboundDedupe` Collection:**
   - [ ] Documents with ID format: `{accountId}__{messageId}`
   - [ ] Only visible if messages were received
   - [ ] Used to prevent duplicate processing

7. **Check `incidents` Collection:**
   - [ ] Only if errors occurred (qr_generation_failed, max_reconnect_attempts, logged_out)
   - [ ] Each has `accountId`, `type`, `severity`, `details`, `ts`

#### Quick Verification Script
```bash
# Count accounts in Firestore (via API)
curl "${BASE_URL}/api/whatsapp/accounts" | jq '.accounts | length'

# Should return: 30

# Check storage status
curl "${BASE_URL}/api/status/dashboard" | jq '.storage'

# Should return:
# {
#   "path": "/app/sessions",
#   "writable": true,
#   "totalAccounts": 30
# }
```

---

## Known Risks / Top 3 Blockers for Stable 30 Accounts

### Risk 1: Volume Mount Path Mismatch

**Problem:** If `SESSIONS_PATH` env var doesn't match volume mount path, sessions won't persist.

**Evidence:**
- Code: Lines 311-317 (SESSIONS_PATH priority logic)
- Config: `railway.toml` line 17 specifies `/app/sessions`
- Failure: Lines 346-352 (process.exit(1) if not writable)

**Mitigation:**
- ✅ Always set `SESSIONS_PATH=/app/sessions` to match `railway.toml`
- ✅ Verify logs show `Sessions dir writable: true`
- ✅ Test after redeploy: accounts should auto-reconnect

### Risk 2: WhatsApp Rate Limiting During Boot

**Problem:** Connecting all 30 accounts simultaneously may trigger WhatsApp rate limits.

**Evidence:**
- Boot sequence: Lines 3590-3595, 3614-3619 (staggered boot with 2-5s jitter)
- Manual addition: No jitter between manual `add-account` calls

**Mitigation:**
- ✅ Staggered boot is implemented (2-5s jitter automatically)
- ⚠️ Manual onboarding: Add accounts with 2-5s delay between calls
- ⚠️ If rate limited: Wait 5-10 minutes, then retry failed accounts

### Risk 3: Firestore Backup Failure (Silent Data Loss)

**Problem:** If Firestore is down or misconfigured, disk sessions may be lost on volume failure.

**Evidence:**
- Backup trigger: Lines 535-562 (wraps `saveCreds()` with Firestore backup)
- Restore logic: Lines 3143-3169 (restores from Firestore if disk missing)
- Failure handling: Lines 559-561 (logs error but continues)

**Mitigation:**
- ✅ Always set `FIREBASE_SERVICE_ACCOUNT_JSON` correctly
- ✅ Monitor logs for `Firestore backup failed` warnings
- ✅ Verify `wa_sessions` collection has backups (Firebase Console)
- ✅ Health check: `curl .../health | jq .firestore.status` should be `"connected"`

### Risk 4: Max Reconnect Attempts Exhausted

**Problem:** If account disconnects repeatedly, max reconnect attempts (5) may be exhausted, requiring manual QR regeneration.

**Evidence:**
- Max attempts: Line 308: `MAX_RECONNECT_ATTEMPTS = 5`
- Transition: Lines 803-823 (max attempts → needs_qr)

**Mitigation:**
- ✅ Monitor dashboard: `GET /api/status/dashboard` for accounts with `needsQR: true`
- ✅ Auto-repair: Use `POST /api/whatsapp/regenerate-qr/:accountId` endpoint
- ✅ Consider increasing `MAX_RECONNECT_ATTEMPTS` if needed (modify code line 308)

### Risk 5: Stale Connection Detection (5 minutes)

**Problem:** Connections without events for 5+ minutes are considered stale and may trigger recovery.

**Evidence:**
- Threshold: Line 143: `STALE_CONNECTION_THRESHOLD = 5 * 60 * 1000` (5 minutes)
- Check interval: Line 144: `HEALTH_CHECK_INTERVAL = 60000` (60 seconds)
- Recovery: Line 4235 (`checkStaleConnections()`)

**Mitigation:**
- ✅ Normal for accounts without recent messages (not a problem)
- ✅ Recovery will attempt reconnection automatically
- ✅ Monitor `reconnectAttempts` in dashboard to detect excessive reconnects

---

## Copy-Paste Quick Reference

### Setup Variables
```bash
export BASE_URL="https://your-service.railway.app"
export ADMIN_TOKEN="your-token"  # Optional
```

### Add Account
```bash
curl -X POST "${BASE_URL}/api/whatsapp/add-account" \
  -H "Content-Type: application/json" \
  -d '{"name":"WA-01","phone":"+40712345678"}' | jq .
```

### Get QR (HTML)
```bash
open "${BASE_URL}/api/whatsapp/qr/{accountId}"
```

### Check Status
```bash
curl "${BASE_URL}/api/status/dashboard" | jq '.summary'
```

### Regenerate QR
```bash
curl -X POST "${BASE_URL}/api/whatsapp/regenerate-qr/{accountId}"
```

### Health Check
```bash
curl "${BASE_URL}/health" | jq '{ok, sessions_dir_writable, firestore: .firestore.status}'
```

---

**END OF RUNBOOK**
