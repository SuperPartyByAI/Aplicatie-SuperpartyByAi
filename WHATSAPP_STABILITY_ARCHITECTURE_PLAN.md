# WhatsApp Web 30 Accounts - Long-Term Stability Architecture Plan

**Generated:** 2025-01-27  
**Goal:** Stable, persistent architecture for 30 WhatsApp Web sessions on Railway

---

## Executive Summary

This document provides a comprehensive architecture and implementation plan to maintain 30 WhatsApp Web sessions online on Railway with maximum stability and recoverability. The plan prioritizes session persistence, crash recovery, and deployment resilience over speed.

---

## 1. Current State Inventory

### 1.1 Repo Structure
```
Aplicatie-SuperpartyByAi/
├── whatsapp-backend/          # Main Railway deployment
│   ├── server.js              # Primary entrypoint (4535 lines)
│   ├── package.json           # Node 20.x, Baileys 7.0.0-rc.9
│   ├── Dockerfile             # node:20-slim
│   ├── .baileys_auth/         # Local session storage (1495 files)
│   └── lib/
│       └── persistence/
│           └── firestore-auth.js  # Firestore backup layer
├── railway.json               # Railway deployment config
└── whatsapp-server.js         # Alternative server (Socket.io version)
```

### 1.2 Runtime Stack
- **Language:** Node.js 20.x
- **Framework:** Express.js
- **WhatsApp Library:** `@whiskeysockets/baileys` v7.0.0-rc.9
- **Session Storage:** `useMultiFileAuthState` (multi-file auth state)
- **Backup:** Firestore (`USE_FIRESTORE_BACKUP = true`)
- **Platform:** Railway (Linux containers)

### 1.3 Current Session Storage Path Logic
**Location:** `server.js` lines 311-317

```javascript
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));
```

**Priority Order:**
1. `SESSIONS_PATH` env var (if set)
2. `RAILWAY_VOLUME_MOUNT_PATH/baileys_auth` (if volume mounted)
3. Fallback: `./whatsapp-backend/.baileys_auth` (EPHEMERAL on Railway)

**Session Structure per Account:**
- `{authDir}/{accountId}/creds.json` - Authentication credentials
- `{authDir}/{accountId}/app-state-sync-key-*.json` - State sync keys
- `{authDir}/{accountId}/app-state-sync-version-*.json` - State versions

### 1.4 Railway Configuration
**File:** `railway.json` (root level)

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd whatsapp-backend && npm install"
  },
  "deploy": {
    "startCommand": "cd whatsapp-backend && node server.js",
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "healthcheckInterval": 20
  }
}
```

### 1.5 Current Architecture Pattern
- **Single Process Model:** One Node.js process manages all 30 accounts
- **Connection Map:** In-memory `Map<accountId, connection>` (lines 284-285)
- **Health Monitoring:** `connectionHealth` Map tracking last events (lines 142-144)
- **Recovery:** Firestore restore on cold start (lines 3072-3153)
- **Graceful Shutdown:** SIGTERM/SIGINT handlers (NOT present in visible code)

### 1.6 Missing Pieces (Gaps)
1. ❌ **Persistent Volume:** No explicit Railway volume mount configuration
2. ❌ **Status Dashboard:** No per-account status UI endpoint
3. ❌ **Graceful Shutdown:** SIGTERM handler exists but may not flush all 30 sessions
4. ❌ **Session Validation:** No startup check to verify all 30 sessions are restorable
5. ❌ **Health Check Granularity:** `/health` only checks overall service, not per-account
6. ❌ **Log Redaction:** Phone numbers may leak in logs (maskPhone exists but not universally used)
7. ❌ **Account Lifecycle:** No explicit startup sequence for all 30 accounts
8. ❌ **Onboarding Flow:** No documented QR flow for 30 accounts

---

## 2. Stability Requirements

### 2.1 Definition of "Stable"

**Session Persistence:**
- Sessions survive container restarts
- Sessions survive Railway redeploys
- Sessions survive browser crashes
- Session files stored on persistent volume (not `/tmp` or container filesystem)

**Crash Recovery:**
- Browser crash → auto-detect → auto-restart browser context
- Process crash → Railway auto-restart → restore all 30 sessions from disk
- Network hiccup → reconnection logic with exponential backoff

**Deploy Recovery:**
- Redeploy → load all sessions from persistent volume → reconnect all 30 accounts
- Zero manual intervention required for healthy sessions
- Failed sessions surface QR codes via status API

**Health Checks:**
- Liveness: Service responds to HTTP requests
- Readiness: All 30 accounts loaded, Firestore connected, volume mounted
- Per-account: Each account has status ("connected", "disconnected", "needs_qr", etc.)

**Monitoring:**
- Real-time status dashboard showing all 30 accounts
- Log aggregation with redaction (no plaintext phone numbers)
- Alerting on repeated failures (same account failing > 3 times/hour)

### 2.2 Failure Modes

| Failure Mode | Detection | Recovery | Time to Recover |
|--------------|-----------|----------|-----------------|
| Container restart | Railway health check fails | Auto-restart → load sessions from disk | 30-60s |
| Railway redeploy | Git push triggers deploy | New container → load sessions from volume | 60-120s |
| Browser crash | Socket disconnects, no events | Auto-detect → restart browser context | 5-10s |
| WhatsApp logout | QR code required, disconnected event | Mark as "needs_qr", surface via API | Immediate |
| Network hiccup | Connection timeout | Exponential backoff retry | 1-5s |
| Firestore outage | Firestore write fails | Continue with disk-only, log warning | N/A (graceful degradation) |
| Volume unmount | `SESSIONS_PATH` not writable | Fallback to Firestore restore, alert | Immediate |

---

## 3. Target Architecture (Recommended)

### 3.1 Architecture Decision: Single Process with 30 Contexts

**Decision:** Use **Option A** - Single Node.js process managing 30 browser contexts

**Rationale:**
- ✅ Lower memory overhead (one browser process)
- ✅ Shared connection pool
- ✅ Simpler deployment (one service on Railway)
- ✅ Easier debugging (all logs in one place)
- ✅ Current codebase already follows this pattern

**Rejected Options:**
- ❌ **30 worker processes:** Too much memory (30x browser processes = ~6GB RAM)
- ❌ **Queue + workers:** Over-engineering for fixed 30 accounts

### 3.2 Isolation Level: Separate User Data Dir per Account

**Recommended:** One browser context per account with separate `userDataDir`

**Implementation:**
- Each account gets: `{SESSIONS_PATH}/WA-{01..30}/`
- Within each dir: `baileys_auth/` + `browser_cache/` (optional)
- Baileys auth files stored at: `{SESSIONS_PATH}/WA-01/baileys_auth/creds.json`

**Benefits:**
- Complete isolation (one account crash doesn't affect others)
- Easier debugging (session files organized by account)
- Supports future scaling (can move accounts to separate processes)

### 3.3 Persistent Volume Layout on Railway

**Recommended Path Structure:**
```
/data/sessions/
├── WA-01/
│   ├── baileys_auth/
│   │   ├── creds.json
│   │   ├── app-state-sync-key-*.json
│   │   └── app-state-sync-version-*.json
│   └── metadata.json  (optional: phone, lastConnected, status)
├── WA-02/
│   └── baileys_auth/...
├── ... (WA-03 through WA-30)
└── .volume-info.json  (created on first mount: timestamp, checksum)
```

**Environment Variable:**
```bash
SESSIONS_PATH=/data/sessions
```

**Railway Volume Configuration:**
- Volume name: `whatsapp-sessions-volume`
- Mount path: `/data/sessions`
- Size: 1GB (sufficient for 30 sessions + metadata)

### 3.4 Minimal UI/Control Plane

**Status Dashboard Endpoint:** `GET /api/status/dashboard`

**Response Format:**
```json
{
  "timestamp": "2025-01-27T12:00:00Z",
  "service": {
    "status": "healthy",
    "uptime": 86400,
    "version": "2.0.0"
  },
  "storage": {
    "path": "/data/sessions",
    "writable": true,
    "totalAccounts": 30
  },
  "accounts": [
    {
      "accountId": "WA-01",
      "phone": "+407****97",  // masked
      "status": "connected",
      "lastEventAt": "2025-01-27T11:59:45Z",
      "lastMessageAt": "2025-01-27T11:58:12Z",
      "reconnectCount": 0,
      "needsQR": false
    },
    {
      "accountId": "WA-02",
      "phone": "+407****23",
      "status": "needs_qr",
      "lastEventAt": "2025-01-27T10:15:30Z",
      "needsQR": true,
      "qrCode": "data:image/png;base64,..."  // only if needsQR=true
    },
    // ... 28 more accounts
  ],
  "summary": {
    "connected": 28,
    "disconnected": 1,
    "needs_qr": 1,
    "total": 30
  }
}
```

**Simple HTML Dashboard:** `GET /dashboard`

- Table showing all 30 accounts with status badges
- Color coding: green (connected), yellow (disconnected), red (needs_qr)
- Refresh button (auto-refresh every 10s)
- QR code display (click account row to show QR)

### 3.5 Secrets + Environment Variables Layout

**Required Environment Variables (Railway):**

```bash
# Application
PORT=8080
NODE_ENV=production

# Session Storage (CRITICAL)
SESSIONS_PATH=/data/sessions

# Firebase (for backup/restore)
FIREBASE_SERVICE_ACCOUNT_JSON={...}  # JSON string

# Admin/Health
ADMIN_TOKEN=secure-random-token
LONGRUN_ADMIN_TOKEN=secure-random-token

# Optional: Timeouts
WHATSAPP_CONNECT_TIMEOUT_MS=60000
STALE_CONNECTION_THRESHOLD_MS=300000

# Optional: Logging
LOGTAIL_SOURCE_TOKEN=...  # if using Logtail
SENTRY_DSN=...  # if using Sentry
```

**No Hardcoded Values:**
- All secrets via Railway environment variables
- Session paths via `SESSIONS_PATH` env var
- No hardcoded phone numbers or tokens

---

## 4. Implementation Steps (Ordered)

### 4.1 Step 1: Configure Railway Persistent Volume

**Action:** Create and mount persistent volume on Railway

**Railway Dashboard Steps:**
1. Open Railway project → Service → Volumes
2. Create new volume: `whatsapp-sessions-volume`
3. Set size: 1GB
4. Mount path: `/data/sessions`
5. Attach to service: `whatsapp-backend`

**Verification:**
```bash
# After deploy, check logs:
📁 SESSIONS_PATH: /data/sessions
📁 Sessions dir exists: true
📁 Sessions dir writable: true
```

**File Changes:** None (code already uses `SESSIONS_PATH` env var)

---

### 4.2 Step 2: Standardize Account ID Naming

**Current:** `accountId = account_${env}_${hash}` (line 68-73)  
**Recommended:** `accountId = WA-01`, `WA-02`, ... `WA-30`

**Rationale:**
- Human-readable
- Easy to map to phone numbers in admin dashboard
- Matches volume directory structure

**File Changes:** `server.js`

**Implementation:**
```javascript
// Replace generateAccountId() with fixed mapping
const ACCOUNT_IDS = Array.from({ length: 30 }, (_, i) => `WA-${String(i + 1).padStart(2, '0')}`);

// When adding account, use sequential ID:
// accountId = ACCOUNT_IDS[connections.size] || generateAccountId(phone)
```

**Alternative (if phone mapping needed):**
- Keep deterministic `generateAccountId(phone)` for uniqueness
- Add `displayName: WA-01` metadata field
- Store mapping in Firestore: `account_metadata/{accountId} → { displayName: "WA-01", phone: "+407..." }`

**Recommendation:** Keep deterministic hashing for uniqueness, add display names as metadata.

---

### 4.3 Step 3: Implement Graceful Shutdown Handler

**File:** `server.js` (add after line 4500, before module.exports)

**Implementation:**
```javascript
// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️  Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`🛑 ${signal} received, starting graceful shutdown...`);

  try {
    // 1. Stop accepting new connections
    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // 2. Close all WhatsApp connections gracefully
    const closePromises = [];
    for (const [accountId, account] of connections.entries()) {
      if (account.socket) {
        console.log(`🔌 [${accountId}] Closing socket...`);
        closePromises.push(
          account.socket.end().catch(err => {
            console.error(`❌ [${accountId}] Socket close error:`, err.message);
          })
        );
      }
    }

    await Promise.allSettled(closePromises);
    console.log('✅ All sockets closed');

    // 3. Save all sessions to disk (should already be saved, but force flush)
    for (const [accountId, account] of connections.entries()) {
      if (account.saveCreds) {
        try {
          await account.saveCreds();
          console.log(`💾 [${accountId}] Credentials flushed`);
        } catch (err) {
          console.error(`❌ [${accountId}] Flush error:`, err.message);
        }
      }
    }

    // 4. Backup to Firestore (if available)
    if (USE_FIRESTORE_BACKUP && firestoreAvailable) {
      console.log('💾 Backing up all sessions to Firestore...');
      // Iterate through all session directories and backup
      // (implementation details in Step 4.4)
    }

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Graceful shutdown error:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Testing:**
```bash
# Deploy to Railway
# Trigger redeploy via Railway dashboard
# Check logs for "graceful shutdown" messages
```

---

### 4.4 Step 4: Enhanced Boot Sequence (Load All 30 Sessions)

**Current:** Accounts loaded on-demand via `/api/whatsapp/add-account`  
**Recommended:** Load all 30 sessions from disk on startup

**File:** `server.js` (add after Firebase initialization, before Express routes)

**Implementation:**
```javascript
// Boot sequence: Load all sessions from disk
async function bootSequence() {
  console.log('🚀 Starting boot sequence...');

  // 1. Verify persistent volume is mounted
  if (!fs.existsSync(authDir)) {
    console.error(`❌ Auth directory not found: ${authDir}`);
    console.error('   Check SESSIONS_PATH env var and Railway volume mount');
    process.exit(1);
  }

  if (!isWritable) {
    console.error(`❌ Auth directory not writable: ${authDir}`);
    process.exit(1);
  }

  // 2. Scan for existing session directories
  const sessionDirs = fs.readdirSync(authDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`📁 Found ${sessionDirs.length} session directories`);

  // 3. Restore accounts from Firestore (if available) or disk
  const restorePromises = [];
  for (const accountId of sessionDirs) {
    const sessionPath = path.join(authDir, accountId);
    const credsPath = path.join(sessionPath, 'creds.json');

    if (fs.existsSync(credsPath)) {
      // Has disk session, restore it
      console.log(`🔄 [${accountId}] Restoring from disk...`);
      restorePromises.push(restoreSingleAccount(accountId).catch(err => {
        console.error(`❌ [${accountId}] Restore failed:`, err.message);
      }));
    } else if (USE_FIRESTORE_BACKUP && firestoreAvailable) {
      // No disk session, try Firestore restore
      console.log(`🔄 [${accountId}] No disk session, trying Firestore...`);
      restorePromises.push(restoreSingleAccount(accountId).catch(err => {
        console.error(`❌ [${accountId}] Firestore restore failed:`, err.message);
      }));
    }
  }

  await Promise.allSettled(restorePromises);

  const connectedCount = Array.from(connections.values())
    .filter(acc => acc.status === 'connected').length;

  console.log(`✅ Boot sequence complete: ${connectedCount}/${sessionDirs.length} accounts connected`);
}

// Start boot sequence after Express setup, before server.listen()
// (Place this call at end of server.js, before module.exports)
```

**Call Order:**
```javascript
// At end of server.js:
(async () => {
  await bootSequence();
  
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
})();
```

---

### 4.5 Step 5: Status Tracking + Health Endpoint

**File:** `server.js` (add new endpoint)

**Implementation:**
```javascript
// Status dashboard endpoint
app.get('/api/status/dashboard', async (req, res) => {
  try {
    const accounts = [];
    let connectedCount = 0;
    let disconnectedCount = 0;
    let needsQRCount = 0;

    for (const [accountId, account] of connections.entries()) {
      const status = account.status || 'unknown';
      if (status === 'connected') connectedCount++;
      else if (status === 'disconnected') disconnectedCount++;
      else if (status === 'needs_qr' || account.qr) needsQRCount++;

      accounts.push({
        accountId,
        phone: account.phone ? maskPhone(account.phone) : null,
        status,
        lastEventAt: account.lastEventAt ? new Date(account.lastEventAt).toISOString() : null,
        lastMessageAt: account.lastMessageAt ? new Date(account.lastMessageAt).toISOString() : null,
        reconnectCount: account.reconnectCount || 0,
        needsQR: !!account.qr,
        qrCode: account.qr ? await QRCode.toDataURL(account.qr) : null,
      });
    }

    res.json({
      timestamp: new Date().toISOString(),
      service: {
        status: 'healthy',
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        version: VERSION,
      },
      storage: {
        path: authDir,
        writable: isWritable,
        totalAccounts: connections.size,
      },
      accounts: accounts.sort((a, b) => a.accountId.localeCompare(b.accountId)),
      summary: {
        connected: connectedCount,
        disconnected: disconnectedCount,
        needs_qr: needsQRCount,
        total: connections.size,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enhanced health check (readiness)
app.get('/health', (req, res) => {
  const checks = {
    service: true,
    storage: {
      path: authDir,
      exists: fs.existsSync(authDir),
      writable: isWritable,
    },
    firestore: firestoreAvailable && !!db,
    accounts: {
      total: connections.size,
      connected: Array.from(connections.values()).filter(acc => acc.status === 'connected').length,
    },
  };

  const isReady = checks.storage.exists && checks.storage.writable && checks.firestore;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'healthy' : 'unhealthy',
    checks,
  });
});
```

---

### 4.6 Step 6: Logging with Redaction

**File:** `server.js` (add utility function, use throughout)

**Implementation:**
```javascript
// Enhanced log redaction
function redactLogMessage(message) {
  if (typeof message !== 'string') {
    message = JSON.stringify(message);
  }

  // Redact phone numbers (E.164 format: +40737571397)
  message = message.replace(/\+\d{10,15}/g, (match) => maskPhone(match));

  // Redact tokens (Bearer tokens, etc.)
  message = message.replace(/Bearer\s+[A-Za-z0-9_-]{20,}/g, 'Bearer [REDACTED]');

  // Redact Firebase service account keys
  message = message.replace(/"private_key":\s*"[^"]+"/g, '"private_key": "[REDACTED]"');

  return message;
}

// Safe logger wrapper
function safeLog(level, accountId, message, ...args) {
  const redactedMessage = redactLogMessage(message);
  const redactedArgs = args.map(arg => {
    if (typeof arg === 'string') return redactLogMessage(arg);
    if (typeof arg === 'object' && arg !== null) {
      return JSON.parse(redactLogMessage(JSON.stringify(arg)));
    }
    return arg;
  });

  console[level](`[${accountId || 'SYSTEM'}]`, redactedMessage, ...redactedArgs);
}

// Replace all console.log calls:
// console.log(`✅ [${accountId}] Connected`) 
// → safeLog('log', accountId, '✅ Connected')
```

**Note:** This is a large refactor. Start with critical paths (connection events, errors).

---

### 4.7 Step 7: Metrics/Logging (Structured Logs)

**File:** `server.js` (add structured logging)

**Implementation:**
```javascript
const pino = require('pino');
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    phone: (phone) => maskPhone(phone),
    accountId: (id) => id,
  },
});

// Use structured logging:
logger.info({ accountId: 'WA-01', event: 'connected', phone: '+40737571397' });
// Output: {"level":"info","accountId":"WA-01","event":"connected","phone":"+407****97"}
```

---

## 5. Railway Deployment Plan (Step-by-Step)

### 5.1 Step 1: Create Persistent Volume

**Railway Dashboard:**
1. Navigate to Project → `whatsapp-backend` service
2. Go to **Volumes** tab
3. Click **New Volume**
4. Configure:
   - **Name:** `whatsapp-sessions-volume`
   - **Size:** 1GB
   - **Mount Path:** `/data/sessions`
5. Click **Create**
6. Wait for volume to be provisioned (1-2 minutes)

**Verification:**
```bash
# Check Railway logs after deploy:
# Should see: "📁 SESSIONS_PATH: /data/sessions"
```

---

### 5.2 Step 2: Set Environment Variable

**Railway Dashboard:**
1. Service → **Variables** tab
2. Add variable:
   - **Key:** `SESSIONS_PATH`
   - **Value:** `/data/sessions`
3. Save

**Deploy Trigger:**
- Railway will redeploy automatically after variable change

---

### 5.3 Step 3: Verify Build Image Includes Dependencies

**Current Dockerfile:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

**Status:** ✅ Sufficient (Baileys doesn't require Chromium; it uses WebSocket connections)

**No Changes Needed:** Baileys is a WebSocket library, not a browser automation tool.

---

### 5.4 Step 4: Memory/CPU Sizing Guidance

**Current Railway Plan:** (Check your plan in Railway dashboard)

**Recommended Minimum:**
- **Memory:** 1GB (2GB preferred for 30 accounts)
- **CPU:** 1 vCPU (2 vCPU preferred)

**Reasoning:**
- Each Baileys connection: ~10-20MB memory
- 30 connections: ~300-600MB
- Node.js base: ~100-200MB
- Total: ~400-800MB (1GB with headroom)

**Railway Pricing:**
- Hobby plan (512MB RAM): ❌ Insufficient
- Starter plan (1GB RAM): ⚠️  Tight but workable
- Developer plan (2GB RAM): ✅ Recommended

---

### 5.5 Step 5: Add Readiness/Liveness Checks

**Current:** `/health` endpoint exists  
**Enhancement:** Update `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd whatsapp-backend && npm install"
  },
  "deploy": {
    "startCommand": "cd whatsapp-backend && node server.js",
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "healthcheckInterval": 20,
    "readinessProbe": {
      "path": "/health",
      "initialDelaySeconds": 30,
      "periodSeconds": 10,
      "timeoutSeconds": 5,
      "successThreshold": 1,
      "failureThreshold": 3
    },
    "livenessProbe": {
      "path": "/health",
      "initialDelaySeconds": 60,
      "periodSeconds": 30,
      "timeoutSeconds": 10,
      "successThreshold": 1,
      "failureThreshold": 3
    }
  }
}
```

**Note:** Railway may not support all Kubernetes probe fields. Use Railway dashboard to configure health checks.

---

### 5.6 Step 6: First-Time Onboarding (QR Flow for 30 Accounts)

**Process:**

1. **Deploy with empty volume** (first deploy)
2. **Add accounts one-by-one via API:**
   ```bash
   for i in {1..30}; do
     curl -X POST https://your-railway-url.railway.app/api/whatsapp/add-account \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer ${ADMIN_TOKEN}" \
       -d "{\"name\": \"WA-${i}\", \"phone\": \"+407XXXXXXXX\"}"
   done
   ```

3. **For each account:**
   - API returns QR code in response (or check `/api/status/dashboard`)
   - Scan QR code with phone
   - Wait for connection (status changes to "connected")
   - Session saved to `/data/sessions/WA-{01..30}/baileys_auth/`

4. **Verify all 30 sessions:**
   ```bash
   curl https://your-railway-url.railway.app/api/status/dashboard | jq '.summary'
   # Should show: { "connected": 30, "needs_qr": 0, "total": 30 }
   ```

**Alternative:** Use dashboard UI at `/dashboard` to scan QR codes visually.

---

## 6. Verification Checklist

### 6.1 Restart Container → Sessions Still Valid

**Test:**
```bash
# 1. Deploy to Railway
# 2. Wait for all 30 accounts to connect
# 3. Manually restart service (Railway dashboard → Restart)
# 4. Check logs for boot sequence
# 5. Verify all accounts reconnect automatically
```

**Expected Logs:**
```
🚀 Starting boot sequence...
📁 Found 30 session directories
🔄 [WA-01] Restoring from disk...
✅ [WA-01] Connected! Session persisted at: /data/sessions/WA-01/baileys_auth
...
✅ Boot sequence complete: 30/30 accounts connected
```

**Success Criteria:**
- All 30 accounts reconnect within 2 minutes
- No manual QR scans required
- Status dashboard shows all "connected"

---

### 6.2 Redeploy → Sessions Still Valid

**Test:**
```bash
# 1. Push code change to trigger redeploy
git commit --allow-empty -m "test: trigger redeploy"
git push

# 2. Watch Railway deploy logs
# 3. Verify boot sequence restores all sessions
```

**Expected:** Same as restart test (all sessions restored from volume)

---

### 6.3 Browser Crash → Auto Restart + Reattach

**Note:** Baileys doesn't use a browser (it's a WebSocket library). "Browser crash" = connection disconnection.

**Test:**
```bash
# 1. Simulate network disconnect (kill Railway service network)
# 2. Verify reconnection logic triggers
# 3. Check logs for reconnection attempts
```

**Expected Logs:**
```
⚠️  [WA-01] Connection closed
🔄 [WA-01] Attempting reconnection (attempt 1/5)...
✅ [WA-01] Reconnected after 2s
```

**Success Criteria:**
- Reconnection within 10 seconds
- No manual intervention required

---

### 6.4 One Account Logged Out → Only That Account Needs QR

**Test:**
```bash
# 1. Logout one account manually (on phone: WhatsApp → Linked Devices → Remove)
# 2. Check status dashboard: /api/status/dashboard
```

**Expected:**
- Only one account shows `status: "needs_qr"`
- Other 29 accounts remain `status: "connected"`
- QR code available in dashboard response

---

### 6.5 Logs Contain No Secrets

**Test:**
```bash
# 1. Deploy with redaction enabled
# 2. Check Railway logs for any plaintext:
#    - Phone numbers (should be +407****97 format)
#    - Tokens (should be [REDACTED])
#    - Firebase keys (should be [REDACTED])
```

**Command:**
```bash
# Download logs and search:
railway logs | grep -E '\+\d{10,}|Bearer\s+\w{20,}|private_key' | head -20
```

**Expected:** Zero matches (all redacted)

---

## 7. Rollback Plan

### 7.1 If Volume Mount Fails

**Symptom:** Logs show "Auth directory not writable"

**Rollback:**
1. Remove `SESSIONS_PATH` env var
2. Service will fallback to `.baileys_auth` (ephemeral)
3. Sessions will restore from Firestore backup (if enabled)
4. Fix volume mount, then set `SESSIONS_PATH` again

**Prevention:** Add health check that fails if volume not writable (Step 4.5)

---

### 7.2 If Boot Sequence Hangs

**Symptom:** Service never starts listening on PORT

**Rollback:**
1. Add timeout to boot sequence (max 5 minutes)
2. Log warning but continue if timeout reached
3. Service starts, accounts restore in background

**Code Change:**
```javascript
async function bootSequence() {
  const BOOT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const bootPromise = loadAllSessions(); // existing logic
  
  await Promise.race([
    bootPromise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Boot timeout')), BOOT_TIMEOUT)
    )
  ]).catch(err => {
    console.warn('⚠️  Boot sequence timeout, continuing with partial restore');
  });
}
```

---

### 7.3 If Firestore Backup Fails

**Symptom:** Firestore writes fail, but disk sessions work

**Behavior:** Service continues with disk-only storage (graceful degradation)

**No Rollback Needed:** Firestore is backup layer, not primary storage

---

## 8. Missing Components Summary

### 8.1 What is Missing (Stop Condition)

**After code review, these are missing:**

1. ❌ **Railway Volume Configuration:**
   - No evidence of persistent volume created in Railway
   - `SESSIONS_PATH` env var may not be set
   - **Where I looked:** `railway.json`, `server.js` (lines 311-317)
   - **Fix:** Create volume via Railway dashboard (Step 5.1)

2. ❌ **Status Dashboard Endpoint:**
   - `/api/status/dashboard` endpoint not found in code
   - **Where I looked:** `server.js` (searched for "dashboard", "status")
   - **Fix:** Add endpoint (Step 4.5)

3. ❌ **Graceful Shutdown Handler:**
   - SIGTERM handler may exist but not comprehensive for 30 accounts
   - **Where I looked:** `server.js` (grep "SIGTERM", "graceful")
   - **Fix:** Add comprehensive handler (Step 4.3)

4. ❌ **Boot Sequence for All Sessions:**
   - Accounts loaded on-demand, not on startup
   - **Where I looked:** `server.js` (bootSequence, restoreAccount functions)
   - **Fix:** Add boot sequence (Step 4.4)

5. ❌ **Log Redaction:**
   - `maskPhone()` exists but not used everywhere
   - **Where I looked:** `server.js` (grep "maskPhone", "console.log")
   - **Fix:** Add redaction utility (Step 4.6)

---

## 9. Next Steps (Priority Order)

1. **IMMEDIATE:** Create Railway persistent volume (Step 5.1)
2. **IMMEDIATE:** Set `SESSIONS_PATH=/data/sessions` env var (Step 5.2)
3. **HIGH:** Add status dashboard endpoint (Step 4.5)
4. **HIGH:** Implement graceful shutdown (Step 4.3)
5. **HIGH:** Add boot sequence to load all sessions (Step 4.4)
6. **MEDIUM:** Add log redaction (Step 4.6)
7. **LOW:** Add structured logging (Step 4.7)

---

## 10. Appendix: File Search Summary

**Files Searched:**
- `/whatsapp-backend/server.js` (4535 lines, read partially)
- `/whatsapp-backend/package.json` (dependencies checked)
- `/whatsapp-backend/Dockerfile` (checked for Chromium deps)
- `/railway.json` (deployment config checked)
- `/whatsapp-backend/lib/persistence/firestore-auth.js` (exists, not read)

**Files Not Found (but expected):**
- No `Procfile` (using Railway Nixpacks instead)
- No `nixpacks.toml` (using default Nixpacks detection)
- No explicit volume mount config in code (must be done in Railway dashboard)

---

**END OF DOCUMENT**
