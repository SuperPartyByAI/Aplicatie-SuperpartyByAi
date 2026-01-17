# WhatsApp 30 Accounts - Railway Stability Readiness

**Generated:** 2025-01-27  
**Goal:** Long-term stable 30 WhatsApp Web sessions on Railway (server-based, not dependent on laptop)

---

## PHASE 1: Codebase Inventory

### A) WhatsApp Backend Code Location

**Entrypoint:** `whatsapp-backend/server.js` (4535 lines)  
**Library:** `@whiskeysockets/baileys` v7.0.0-rc.9 (WebSocket-based, **NO browser required**)  
**Runtime:** Node.js 20.x  
**Framework:** Express.js

**Key Files:**
- `whatsapp-backend/server.js` - Main entrypoint, connection management, API endpoints
- `whatsapp-backend/lib/persistence/firestore-auth.js` - Firestore backup layer
- `whatsapp-backend/lib/wa-bootstrap.js` - Bootstrap utilities
- `whatsapp-backend/lib/wa-stability-manager.js` - Stability/reconnection logic
- `railway.json` - Railway deployment configuration

**Responsibilities:**
- **Session Storage:** `useMultiFileAuthState()` from Baileys (line 520, 3153)
- **Connect:** `createConnection()` function (line 490)
- **Reconnect:** Auto-recovery via `recoverStaleConnection()` (line 1150)
- **Message Handling:** WebSocket events via Baileys socket

### B) Session Persistence and Storage

**Location:** `server.js` lines 311-342

```javascript
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));
```

**Current Behavior:**
1. ✅ Uses `SESSIONS_PATH` env var if set
2. ⚠️  Falls back to `RAILWAY_VOLUME_MOUNT_PATH/baileys_auth` (if volume mounted)
3. ❌ Final fallback: `./whatsapp-backend/.baileys_auth` (**EPHEMERAL on Railway**)

**Session Structure:**
- Per account: `{authDir}/{accountId}/creds.json`
- State files: `{authDir}/{accountId}/app-state-sync-key-*.json`
- Version files: `{authDir}/{accountId}/app-state-sync-version-*.json`

**Firestore Backup:**
- ✅ Enabled: `USE_FIRESTORE_BACKUP = true` (line 160)
- ✅ Backup on `saveCreds()`: Wraps Baileys saveCreds to also write to Firestore `wa_sessions` collection (lines 523-551, 3156-3180)
- ✅ Restore: `restoreAccount()` can restore from Firestore if disk session missing (lines 3112-3138)

**Risk:** If `SESSIONS_PATH` is not set and no Railway volume is mounted, sessions are stored in ephemeral container filesystem → **sessions lost on redeploy**.

### C) Multi-Account Architecture

**Representation:**
- In-memory: `connections` Map (line 284) - `Map<accountId, {id, name, phone, sock, status, ...}>`
- Disk: `{authDir}/{accountId}/` directories (one per account)
- Firestore: `accounts` collection (metadata) + `wa_sessions` collection (encrypted session files)

**Account ID Format:**
- Current: `account_${env}_${hash}` (line 68-73) - deterministic hash from phone number
- Not using fixed `WA-01..WA-30` format

**Boot Sequence:**
- ✅ **Partially implemented:** `restoreAccountsFromFirestore()` called in `app.listen()` callback (line 4028)
- ⚠️  **Gap:** Only restores accounts from Firestore (where `status='connected'`)
- ❌ **Missing:** Does NOT scan disk for session directories and restore them
- ❌ **Missing:** Does NOT load all accounts deterministically (WA-01..WA-30)

**Boot Flow:**
```
1. Server starts (line 4021)
2. restoreAccountsFromFirestore() called (line 4028)
3. Queries Firestore: accounts where status='connected' (line 3530)
4. For each Firestore account: restoreAccount() (line 3556)
5. restoreAccount() loads from disk OR Firestore backup (line 3109-3144)
6. Creates Baileys socket and adds to connections Map
```

**On Disconnect:**
- ✅ Auto-reconnect exists: `recoverStaleConnection()` (line 1150)
- ✅ Health monitoring: Stale connection check every 60s (line 4031)
- ✅ Backoff: Uses `reconnectAttempts` Map (line 285), max 5 attempts (line 308)
- ⚠️  Reconnect only triggers if Firestore status='connected', not if disk session exists

**Add Account Flow:**
- ✅ Endpoint: `POST /api/whatsapp/add-account` (line ~2170)
- ✅ Generates QR code for pairing
- ✅ Saves to Firestore `accounts` collection
- ✅ Creates session directory on disk

### D) Railway Deploy Assumptions

**Configuration:**
- ✅ `railway.json` exists (root level)
- ✅ Builder: Nixpacks (auto-detects Node.js)
- ✅ Start command: `cd whatsapp-backend && node server.js`
- ✅ Health check: `/health` (30s timeout, 20s interval)

**Required Environment Variables:**
- ✅ `PORT` - Railway injects automatically
- ⚠️  `SESSIONS_PATH` - **CRITICAL** - must be set to persistent volume path
- ✅ `FIREBASE_SERVICE_ACCOUNT_JSON` - Firestore credentials
- ✅ `ADMIN_TOKEN` - Optional, for protected endpoints
- ⚠️  `RAILWAY_VOLUME_MOUNT_PATH` - **MAY BE USED** if `SESSIONS_PATH` not set

**Persistent Volume:**
- ❌ **NOT FOUND:** No explicit Railway volume mount configuration in code
- ⚠️  **ASSUMED:** Volume must be created manually via Railway dashboard
- ⚠️  **GAP:** No verification that volume is mounted and writable on startup

---

## PHASE 2: Railway Stability Requirements

### MUST-HAVE (for stability on Railway)

#### 1. Persistent Volume Mounted
**Status:** ❌ **MISSING**  
**Requirement:** Railway volume must be mounted at a fixed path (e.g., `/data/sessions`)  
**Current:** Falls back to ephemeral `.baileys_auth` if `SESSIONS_PATH` not set  
**Fix:** Create Railway volume manually, set `SESSIONS_PATH=/data/sessions`

#### 2. SESSIONS_PATH Points to Volume
**Status:** ⚠️  **PARTIAL**  
**Requirement:** `SESSIONS_PATH` env var must point to mounted volume path  
**Current:** Code checks `SESSIONS_PATH` first (line 314), but no validation it's writable  
**Fix:** Add startup validation that `SESSIONS_PATH` is writable, fail fast if not

#### 3. Graceful Shutdown Handles SIGTERM and Flushes Sessions
**Status:** ⚠️  **PARTIAL**  
**Requirement:** SIGTERM handler must close all sockets and flush auth state  
**Current:** SIGTERM handler exists (line 4508) but:
- Calls `sock.end()` for all connections (line 4527)
- Releases Firestore leases (line 4517)
- ❌ **MISSING:** Does NOT explicitly call `saveCreds()` to flush session files
- ❌ **MISSING:** Does NOT wait for all saves to complete before exit

**Fix:** Enhance SIGTERM handler to:
```javascript
for (const [accountId, account] of connections.entries()) {
  if (account.saveCreds) {
    await account.saveCreds(); // Flush session to disk
  }
  if (account.sock) {
    account.sock.end(); // Close socket
  }
}
```

#### 4. Auto-Load All Known Accounts on Boot
**Status:** ⚠️  **PARTIAL**  
**Requirement:** Boot sequence should scan disk for session directories and restore all found accounts  
**Current:** Only restores from Firestore (accounts where `status='connected'`)  
**Gap:** If Firestore is unavailable or account not in Firestore, disk sessions are ignored  
**Fix:** Add disk scan to boot sequence:
```javascript
// Scan authDir for session directories
const sessionDirs = fs.readdirSync(authDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

// For each directory with creds.json, restore account
for (const accountId of sessionDirs) {
  const credsPath = path.join(authDir, accountId, 'creds.json');
  if (fs.existsSync(credsPath)) {
    await restoreAccount(accountId, { status: 'connected' });
  }
}
```

#### 5. Auto-Reconnect Strategy with Backoff + Limits
**Status:** ✅ **IMPLEMENTED**  
**Current:**
- Health monitoring every 60s (line 4031)
- Stale connection detection (5 minutes without events, line 143)
- Auto-recovery with retry logic (line 1150)
- Max reconnect attempts: 5 (line 308)
- Backoff: Uses exponential backoff in reconnect logic

**Verification:** Code exists, behavior needs runtime testing

#### 6. Status Dashboard Endpoint with Per-Account State
**Status:** ❌ **MISSING**  
**Requirement:** Endpoint returning JSON with per-account status (CONNECTED / CONNECTING / QR_REQUIRED / DISCONNECTED / BANNED/LOGGED_OUT)  
**Current:** 
- ✅ `/api/whatsapp/accounts` exists (line ~2180) - returns accounts but basic format
- ❌ No `/api/status/dashboard` endpoint
- ❌ No per-account detailed status with QR codes

**Fix:** Add endpoint:
```javascript
app.get('/api/status/dashboard', async (req, res) => {
  const accounts = [];
  for (const [accountId, account] of connections.entries()) {
    accounts.push({
      accountId,
      phone: maskPhone(account.phone),
      status: account.status, // CONNECTED / CONNECTING / QR_REQUIRED / DISCONNECTED
      lastEventAt: account.lastEventAt,
      needsQR: !!account.qr,
      qrCode: account.qr ? await QRCode.toDataURL(account.qr) : null,
    });
  }
  res.json({ accounts, summary: {...} });
});
```

#### 7. Healthcheck Endpoint for Railway
**Status:** ✅ **IMPLEMENTED**  
**Current:** `/health` endpoint exists (line ~1380)  
**Returns:**
- Service status
- Firestore connection status
- Storage checks (if enhanced)
- Account counts

**Enhancement needed:** Add storage writability check to health endpoint

#### 8. Minimal Logs + Masked IDs
**Status:** ⚠️  **PARTIAL**  
**Current:**
- ✅ `maskPhone()` function exists (line 80)
- ⚠️  Not used consistently throughout codebase
- ⚠️  Some console.log statements may leak phone numbers

**Fix:** Audit all log statements and ensure `maskPhone()` is used

### NICE-TO-HAVE

#### 9. Metrics (Counts, Last Seen, Reconnect Attempts)
**Status:** ⚠️  **PARTIAL**  
**Current:** 
- Connection health Map exists (line 142) with `lastEventAt`, `reconnectCount`
- No metrics endpoint exposed
- Metrics not aggregated

**Enhancement:** Add `/api/metrics` endpoint returning aggregated stats

#### 10. Admin Endpoints Protected (Basic Auth Token)
**Status:** ✅ **IMPLEMENTED**  
**Current:**
- ✅ `requireAdmin` middleware exists (line 292)
- ✅ `ADMIN_TOKEN` env var (line 147)
- ✅ Some endpoints use `requireAdmin` (e.g., `/admin/queue/test` line 3589)

**Verification:** Endpoints are protected, but not all admin actions use it

#### 11. Alerting Hook (Optional)
**Status:** ❌ **NOT IMPLEMENTED**  
**Requirement:** Optional webhook/alerting for repeated failures  
**Current:** No alerting mechanism

---

## PHASE 3: Decision - Firefox vs No-Browser

### Primary Recommendation: Baileys (No Browser) ✅

**Decision:** **BAILEYS (NO BROWSER)** - This is the correct and stable approach for Railway.

**Rationale:**
1. ✅ **Already in use:** Codebase uses `@whiskeysockets/baileys` v7.0.0-rc.9
2. ✅ **No GUI required:** Baileys is a WebSocket library, not browser automation
3. ✅ **Lower resource usage:** ~10-20MB per connection vs ~200-500MB per browser instance
4. ✅ **More stable:** No browser crashes, no headless Chrome/Firefox issues
5. ✅ **Faster:** Direct WebSocket connection to WhatsApp servers
6. ✅ **Persistent sessions:** Baileys auth state persists to disk (creds.json)

**Firefox/Chrome WhatsApp Web on Railway:**
- ❌ Requires GUI/headless browser (Playwright/Puppeteer)
- ❌ High RAM usage (200-500MB per browser instance = 6-15GB for 30 accounts)
- ❌ Fragile: Browser crashes, memory leaks, reconnection issues
- ❌ Needs profile persistence (complex volume management)
- ❌ Often breaks: WhatsApp Web detection, QR code timeouts
- ❌ Only consider if Baileys cannot meet a hard requirement (unlikely)

**Conclusion:** Codebase is already on the correct path. No changes needed to library choice.

---

## PHASE 4: Gap Analysis - "What We Have" vs "What We Need"

| Item | Current State (File/Line) | Risk | Fix Needed (Exact Change) |
|------|---------------------------|------|---------------------------|
| **Persistent Volume** | No explicit Railway volume config | 🔴 **HIGH** | Manual: Create Railway volume, mount at `/data/sessions`, set `SESSIONS_PATH=/data/sessions` |
| **SESSIONS_PATH Validation** | Checks env var exists but no writability check on startup | 🔴 **HIGH** | Add startup validation: If `SESSIONS_PATH` not writable, fail fast with clear error |
| **Boot Auto-Load from Disk** | Only restores from Firestore (`restoreAccountsFromFirestore` line 3520) | 🔴 **HIGH** | Add disk scan in boot sequence: Scan `authDir` for directories with `creds.json`, restore all found |
| **Per-Account Status Dashboard** | `/api/whatsapp/accounts` exists but basic format | 🟡 **MEDIUM** | Add `/api/status/dashboard` endpoint with detailed per-account status (CONNECTED/QR_REQUIRED/etc.) |
| **Graceful Shutdown Flush** | SIGTERM handler exists (line 4508) but doesn't flush sessions | 🟡 **MEDIUM** | Enhance SIGTERM: Call `saveCreds()` for all accounts before `sock.end()` |
| **Account ID Naming** | Uses hash-based IDs (`account_${env}_${hash}`) | 🟢 **LOW** | Optional: Add `WA-01..WA-30` display names as metadata (keep hash IDs for uniqueness) |
| **Log Redaction** | `maskPhone()` exists but not used everywhere | 🟢 **LOW** | Audit logs, replace plaintext phone numbers with `maskPhone()` calls |

---

## PHASE 5: Implementation Plan (Safe, High-Impact Gaps)

### Gap 1: Add Startup Validation for SESSIONS_PATH

**File:** `whatsapp-backend/server.js` (after line 342)  
**Change:**
```javascript
// Verify SESSIONS_PATH is writable (fail fast if not)
if (!isWritable) {
  console.error('❌ CRITICAL: Auth directory is not writable!');
  console.error(`   Path: ${authDir}`);
  console.error('   Check: SESSIONS_PATH env var and Railway volume mount');
  process.exit(1);
}
```

**Impact:** High - Prevents silent failures where sessions are lost

---

### Gap 2: Add Disk Scan to Boot Sequence

**File:** `whatsapp-backend/server.js` (modify `restoreAccountsFromFirestore` or add new function)  
**Change:** Add disk scan BEFORE Firestore restore:

```javascript
async function restoreAccountsFromDisk() {
  console.log('🔄 Scanning disk for session directories...');
  
  if (!fs.existsSync(authDir)) {
    console.log('⚠️  Auth directory does not exist, skipping disk scan');
    return;
  }

  const sessionDirs = fs.readdirSync(authDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`📁 Found ${sessionDirs.length} session directories on disk`);

  for (const accountId of sessionDirs) {
    const sessionPath = path.join(authDir, accountId);
    const credsPath = path.join(sessionPath, 'creds.json');

    if (fs.existsSync(credsPath)) {
      // Check if already in connections (from Firestore restore)
      if (!connections.has(accountId)) {
        console.log(`🔄 [${accountId}] Restoring from disk (not in Firestore)...`);
        try {
          await restoreAccount(accountId, {
            status: 'connected',
            name: accountId,
            phone: null, // Will be loaded from session
          });
        } catch (error) {
          console.error(`❌ [${accountId}] Disk restore failed:`, error.message);
        }
      } else {
        console.log(`✅ [${accountId}] Already restored from Firestore, skipping disk restore`);
      }
    }
  }

  console.log(`✅ Disk scan complete: ${connections.size} total accounts loaded`);
}
```

**Call order in `app.listen()`:**
```javascript
// Restore accounts after server starts
await restoreAccountsFromFirestore(); // Existing
await restoreAccountsFromDisk(); // NEW - fills gaps
```

**Impact:** High - Ensures all disk sessions are loaded even if Firestore unavailable

---

### Gap 3: Add Status Dashboard Endpoint

**File:** `whatsapp-backend/server.js` (add before `app.listen()`)  
**Change:**
```javascript
// Status dashboard endpoint
app.get('/api/status/dashboard', async (req, res) => {
  try {
    const accounts = [];
    let connectedCount = 0;
    let disconnectedCount = 0;
    let needsQRCount = 0;
    let connectingCount = 0;

    for (const [accountId, account] of connections.entries()) {
      const status = account.status || 'unknown';
      
      if (status === 'connected') connectedCount++;
      else if (status === 'disconnected') disconnectedCount++;
      else if (status === 'connecting') connectingCount++;
      else if (status === 'needs_qr' || account.qr) needsQRCount++;

      const accountData = {
        accountId,
        phone: account.phone ? maskPhone(account.phone) : null,
        status,
        lastEventAt: account.lastEventAt ? new Date(account.lastEventAt).toISOString() : null,
        lastMessageAt: account.lastMessageAt ? new Date(account.lastMessageAt).toISOString() : null,
        reconnectCount: account.reconnectCount || 0,
        needsQR: !!account.qr,
      };

      // Include QR code only if needsQR is true
      if (account.qr) {
        try {
          accountData.qrCode = await QRCode.toDataURL(account.qr);
        } catch (err) {
          console.error(`❌ [${accountId}] QR code generation failed:`, err.message);
        }
      }

      accounts.push(accountData);
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
        connecting: connectingCount,
        disconnected: disconnectedCount,
        needs_qr: needsQRCount,
        total: connections.size,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Impact:** High - Provides visibility into all 30 accounts

---

### Gap 4: Enhance Graceful Shutdown

**File:** `whatsapp-backend/server.js` (modify SIGTERM handler at line 4508)  
**Change:** Replace existing SIGTERM handler:

```javascript
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, starting graceful shutdown...');

  // Stop lease refresh
  if (leaseRefreshTimer) {
    clearInterval(leaseRefreshTimer);
  }

  // Stop long-run jobs
  if (longrunJobsModule && longrunJobsModule.stopJobs) {
    await longrunJobsModule.stopJobs();
  }

  // Flush all sessions to disk
  console.log('💾 Flushing all sessions to disk...');
  const flushPromises = [];
  for (const [accountId, account] of connections.entries()) {
    if (account.saveCreds) {
      flushPromises.push(
        account.saveCreds().catch(err => {
          console.error(`❌ [${accountId}] Save failed:`, err.message);
        })
      );
    }
  }
  await Promise.allSettled(flushPromises);
  console.log('✅ All sessions flushed to disk');

  // Release Firestore leases
  await releaseLeases();

  // Close all sockets
  console.log('🔌 Closing all WhatsApp connections...');
  const closePromises = [];
  for (const [accountId, account] of connections.entries()) {
    if (account.sock) {
      closePromises.push(
        new Promise((resolve) => {
          try {
            account.sock.end();
            resolve();
          } catch (err) {
            console.error(`❌ [${accountId}] Socket close error:`, err.message);
            resolve(); // Continue even if close fails
          }
        })
      );
    }
  }
  await Promise.allSettled(closePromises);
  console.log('✅ All sockets closed');

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
});
```

**Impact:** Medium - Ensures sessions are persisted before container terminates

---

## PHASE 6: Railway Manual Setup Steps

### Step 1: Create Persistent Volume

1. Open Railway dashboard: https://railway.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0
2. Navigate to `whatsapp-backend` service
3. Go to **Volumes** tab
4. Click **New Volume**
5. Configure:
   - **Name:** `whatsapp-sessions-volume`
   - **Size:** 1GB (sufficient for 30 sessions)
   - **Mount Path:** `/data/sessions`
6. Click **Create**
7. Wait for volume provisioning (1-2 minutes)

**Verification:** Check service logs after deploy:
```
📁 SESSIONS_PATH: /data/sessions
📁 Sessions dir writable: true
```

---

### Step 2: Set Environment Variable

1. In Railway dashboard, go to `whatsapp-backend` service → **Variables** tab
2. Add new variable:
   - **Key:** `SESSIONS_PATH`
   - **Value:** `/data/sessions`
3. Save

**Railway will automatically redeploy after variable change**

---

### Step 3: Verify Restart/Redeploy Persistence

1. **Test restart:**
   - In Railway dashboard, click **Restart** on `whatsapp-backend` service
   - Watch logs for boot sequence
   - Verify: All 30 accounts reconnect automatically (no manual QR scans)

2. **Test redeploy:**
   - Push a code change (or empty commit)
   - Watch Railway deploy logs
   - Verify: All sessions restored from `/data/sessions` volume

**Expected Logs:**
```
🚀 Starting boot sequence...
📁 Found 30 session directories on disk
🔄 [WA-01] Restoring from disk...
✅ [WA-01] Connected! Session persisted at: /data/sessions/WA-01/baileys_auth
...
✅ Boot sequence complete: 30/30 accounts connected
```

---

### Step 4: Verify Instance Resources

1. In Railway dashboard, check service settings
2. Verify:
   - **Memory:** At least 1GB (2GB recommended)
   - **CPU:** 1 vCPU (2 vCPU recommended)

**Current Railway Plan:** Check in dashboard (Starter/Developer plan typically has 1-2GB RAM)

**Resource Usage:**
- Per Baileys connection: ~10-20MB
- 30 connections: ~300-600MB
- Node.js base: ~100-200MB
- **Total:** ~400-800MB (1GB with headroom)

---

## Summary: What's Implemented vs Missing

### ✅ Implemented (Already Working)

1. **Baileys Integration:** WebSocket-based, no browser needed ✅
2. **Session Storage:** `useMultiFileAuthState()` with Firestore backup ✅
3. **Auto-Reconnect:** Health monitoring + stale connection recovery ✅
4. **Boot Sequence:** Restores accounts from Firestore on startup ✅
5. **Graceful Shutdown:** SIGTERM handler exists (needs enhancement) ✅
6. **Health Check:** `/health` endpoint for Railway ✅
7. **Admin Protection:** `requireAdmin` middleware with token ✅

### ❌ Missing (Critical Gaps)

1. **Persistent Volume:** No Railway volume configured → **MANUAL SETUP REQUIRED**
2. **Disk Boot Scan:** Only restores from Firestore, ignores disk sessions → **CODE FIX NEEDED**
3. **Status Dashboard:** No `/api/status/dashboard` endpoint → **CODE FIX NEEDED**
4. **Shutdown Flush:** SIGTERM doesn't flush sessions → **CODE FIX NEEDED**
5. **Startup Validation:** No check that `SESSIONS_PATH` is writable → **CODE FIX NEEDED**

### 🟡 Partial (Needs Enhancement)

1. **Log Redaction:** `maskPhone()` exists but not used everywhere
2. **Account Naming:** Uses hash IDs instead of WA-01..WA-30 (low priority)

---

## Next Steps (Priority Order)

### IMMEDIATE (Manual - Railway Dashboard)
1. Create Railway persistent volume (Step 1 above)
2. Set `SESSIONS_PATH=/data/sessions` env var (Step 2 above)

### HIGH PRIORITY (Code Changes - Small, Safe)
1. Add startup validation for `SESSIONS_PATH` writability (Gap 1)
2. Add disk scan to boot sequence (Gap 2)
3. Add status dashboard endpoint (Gap 3)
4. Enhance graceful shutdown to flush sessions (Gap 4)

### MEDIUM PRIORITY (Optional)
1. Audit logs for redaction
2. Add metrics endpoint

---

## Verification Checklist

After implementing fixes and Railway setup:

- [ ] Railway volume created and mounted at `/data/sessions`
- [ ] `SESSIONS_PATH=/data/sessions` env var set
- [ ] Startup logs show: "Sessions dir writable: true"
- [ ] Boot sequence restores all 30 accounts from disk
- [ ] `/api/status/dashboard` returns JSON with all 30 accounts
- [ ] Restart service → all accounts reconnect automatically
- [ ] Redeploy → all sessions persist (no manual QR scans needed)
- [ ] SIGTERM handler flushes sessions (check logs on restart)
- [ ] No plaintext phone numbers in logs

---

**END OF DOCUMENT**
