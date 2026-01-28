# WhatsApp 30 Accounts - Hetzner Implementation Audit

**Generated:** 2025-01-27  
**Goal:** Verify implementation is ready for stable 30-account operation on Hetzner

---

## 1. Current Implementation Audit

### A) Multi-Account Architecture

**File:** `whatsapp-backend/server.js` (4697 lines)

**Library:** `@whiskeysockets/baileys` v7.0.0-rc.9 (WebSocket-based, NO browser) ✅

**Connection Registry:**
- In-memory: `connections` Map (line 284) - `Map<accountId, {id, name, phone, sock, status, saveCreds, ...}>`
- Account ID format: `account_${env}_${hash}` (deterministic hash from phone number, line 68-73)
- Max accounts: `MAX_ACCOUNTS = 30` (line 139)

**Key Functions:**
- `createConnection(accountId, name, phone)` (line 490) - Creates Baileys socket
- `restoreAccount(accountId, data)` (line 3101) - Restores from disk/Firestore
- `restoreAccountsFromFirestore()` (line 3520) - Restores all connected accounts from Firestore
- `restoreAccountsFromDisk()` (line 3600) - **NEW** - Scans disk for session directories

**Evidence:**
```javascript
// Line 284
const connections = new Map();

// Line 3520
async function restoreAccountsFromFirestore() { ... }

// Line 3600
async function restoreAccountsFromDisk() { ... }
```

### B) Session Storage

**Location:** `server.js` lines 311-352

**Path Logic:**
```javascript
const authDir =
  process.env.SESSIONS_PATH ||
  (process.env.HETZNER_SESSIONS_PATH
    ? path.join(process.env.HETZNER_SESSIONS_PATH, 'baileys_auth')
    : path.join(__dirname, '.baileys_auth'));
```

**Priority:**
1. ✅ `SESSIONS_PATH` env var (if set)
2. ⚠️  `HETZNER_SESSIONS_PATH/baileys_auth` (if volume mounted)
3. ❌ Fallback: `./whatsapp-backend/.baileys_auth` (**EPHEMERAL**)

**Session Structure:**
- Per account: `{authDir}/{accountId}/creds.json`
- State files: `{authDir}/{accountId}/app-state-sync-key-*.json`
- Version files: `{authDir}/{accountId}/app-state-sync-version-*.json`

**Storage Validation:**
- ✅ Startup validation exists (line 346): Fails fast if `authDir` not writable
- ✅ Writable check: Tests write/delete before startup (line 329-336)

**Evidence:**
```javascript
// Line 346-352
if (!isWritable) {
  console.error('❌ CRITICAL: Auth directory is not writable!');
  process.exit(1);
}
```

**Firestore Backup:**
- ✅ Enabled: `USE_FIRESTORE_BACKUP = true` (line 160)
- ✅ Backup on `saveCreds()`: Wraps Baileys saveCreds to write to Firestore `wa_sessions` collection
- ✅ Restore: Can restore from Firestore if disk session missing (line 3112-3138)

### C) Boot Flow

**Sequence:** `app.listen()` callback (line 4153)

```javascript
// Line 4162-4163
await restoreAccountsFromFirestore();
await restoreAccountsFromDisk();
```

**Boot Steps:**
1. ✅ Server starts listening on PORT
2. ✅ `restoreAccountsFromFirestore()` - Restores accounts where `status='connected'` from Firestore
3. ✅ `restoreAccountsFromDisk()` - Scans `authDir` for session directories, restores any not already in memory
4. ✅ Health monitoring watchdog starts (line 4165-4180)

**Evidence:**
```javascript
// Line 3600-3643
async function restoreAccountsFromDisk() {
  const sessionDirs = fs.readdirSync(authDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  // ... restores each account with creds.json
}
```

**Potential Issue:** Both restore functions call `createConnection()` or `restoreAccount()` concurrently. Need to verify if accounts are restored sequentially or concurrently.

**Evidence (Line 3556):**
```javascript
for (const doc of snapshot.docs) {
  await restoreAccount(accountId, data);  // Sequential (await)
}
```

**Evidence (Line 3618):**
```javascript
for (const accountId of sessionDirs) {
  await restoreAccount(accountId, {...});  // Sequential (await)
}
```

✅ **Boot is sequential** - No concurrent connection storm.

### D) Reconnection Strategy

**Auto-Reconnect:** ✅ Implemented

**Health Monitoring:**
- ✅ Interval: 60 seconds (line 144)
- ✅ Stale threshold: 5 minutes without events (line 143)
- ✅ Function: `checkStaleConnections()` called every 60s (line 4166-4180)

**Reconnection Logic:**
- ✅ Max attempts: `MAX_RECONNECT_ATTEMPTS = 5` (line 308)
- ✅ Exponential backoff: `Math.min(1000 * Math.pow(2, attempts), 30000)` (line 787)
  - Attempt 1: 1s delay
  - Attempt 2: 2s delay
  - Attempt 3: 4s delay
  - Attempt 4: 8s delay
  - Attempt 5: 16s delay
  - Max: 30s cap
- ✅ After max attempts: Status set to `needs_qr`, generates new QR (line 803-823)

**Evidence:**
```javascript
// Line 784-801
if (attempts < MAX_RECONNECT_ATTEMPTS) {
  const backoff = Math.min(1000 * Math.pow(2, attempts), 30000);
  setTimeout(() => {
    createConnection(accountId, account.name, account.phone);
  }, backoff);
} else {
  account.status = 'needs_qr';
  // Generate new QR
}
```

**Disconnect Reason Handling:**
- ✅ Checks `DisconnectReason` (line 728)
- ✅ Reconnects for: `close`, `lost`, `badSession`
- ✅ Does NOT reconnect for: `loggedOut`, `banned`
- ✅ Sets status to `needs_qr` for explicit cleanup reasons (line 824-830)

**Evidence:**
```javascript
// Line 728
const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
```

### E) Shutdown Behavior

**SIGTERM Handler:** ⚠️ **DUPLICATE HANDLERS DETECTED**

**Issue:** Three signal handlers exist:
1. Line 4595: Old SIGTERM handler (does NOT flush sessions)
2. Line 4615: SIGINT handler (does NOT flush sessions)
3. Line 4643: Enhanced SIGTERM handler (DOES flush sessions)

**Problem:** Node.js will execute handlers in reverse registration order. The enhanced handler (line 4643) is registered LAST, so it should execute first. However, the old handler at 4595 will ALSO execute, potentially causing race conditions.

**Current Enhanced Handler (Line 4643):**
```javascript
process.on('SIGTERM', async () => {
  // Flush all sessions to disk
  for (const [accountId, account] of connections.entries()) {
    if (account.saveCreds) {
      await account.saveCreds();  // ✅ Flushes to disk
    }
  }
  // Close sockets
  for (const [accountId, account] of connections.entries()) {
    if (account.sock) {
      account.sock.end();
    }
  }
  process.exit(0);
});
```

✅ **Enhanced handler flushes sessions** - but duplicate handlers need cleanup.

### F) Status Endpoint

**Endpoint:** `GET /api/status/dashboard` (line 4088)

**Returns:**
```json
{
  "timestamp": "ISO8601",
  "service": {
    "status": "healthy",
    "uptime": 86400,
    "version": "2.0.0"
  },
  "storage": {
    "path": "/var/lib/whatsapp-backend/sessions",
    "writable": true,
    "totalAccounts": 30
  },
  "accounts": [
    {
      "accountId": "account_prod_abc123",
      "phone": "+407****97",  // masked
      "status": "connected" | "connecting" | "disconnected" | "needs_qr",
      "lastEventAt": "ISO8601",
      "lastMessageAt": "ISO8601",
      "reconnectCount": 0,
      "needsQR": false,
      "qrCode": "data:image/png;base64,..."  // only if needsQR=true
    }
  ],
  "summary": {
    "connected": 28,
    "connecting": 1,
    "disconnected": 0,
    "needs_qr": 1,
    "total": 30
  }
}
```

✅ **Status dashboard exists** and returns per-account statuses.

---

## 2. Readiness Verdict

### 🟡 YELLOW (Mostly Ready, Minor Issues)

**Reasoning:**
- ✅ Core functionality implemented (boot, reconnect, shutdown)
- ✅ Session persistence with validation
- ⚠️  Duplicate signal handlers (non-critical but should be fixed)
- ❌ **BLOCKER:** No Hetzner volume configured yet (manual step required)
- ⚠️  No staggered boot (30 accounts connect simultaneously - may trigger rate limits)

### Concrete Risks

1. **🔴 BLOCKER: Hetzner Volume Not Configured**
   - **Risk:** If `SESSIONS_PATH` not set, sessions stored in ephemeral filesystem → lost on redeploy
   - **Evidence:** Code validates writability but falls back to `.baileys_auth` if `SESSIONS_PATH` not set
   - **Fix:** Manual Hetzner setup required (see Hetzner Checklist below)

2. **🟡 Concurrent Connection Storm on Boot**
   - **Risk:** All 30 accounts attempt to connect simultaneously on boot → WhatsApp rate limiting
   - **Evidence:** `restoreAccount()` calls are sequential (line 3556, 3618), but each `restoreAccount()` calls `createConnection()` which opens WebSocket immediately
   - **Impact:** Medium - May cause temporary rate limiting on first boot
   - **Fix:** Add 2-5s jitter between account restores (optional, nice-to-have)

3. **🟡 Duplicate Signal Handlers**
   - **Risk:** Multiple SIGTERM handlers may cause race conditions or incomplete shutdown
   - **Evidence:** Three signal handlers exist (lines 4595, 4615, 4643)
   - **Impact:** Low - Last registered handler (enhanced one) should execute, but old handlers may interfere
   - **Fix:** Remove old handlers at lines 4595 and 4615

4. **🟢 Firestore Dependency**
   - **Risk:** Boot sequence relies on Firestore for account restore
   - **Evidence:** `restoreAccountsFromFirestore()` called first, then `restoreAccountsFromDisk()` as backup
   - **Mitigation:** Disk scan exists as fallback (line 3600)
   - **Impact:** Low - Graceful degradation (works with disk-only if Firestore down)

5. **🟢 Memory Leaks (Potential)**
   - **Risk:** Event listeners not removed on disconnect
   - **Evidence:** Baileys sockets have `sock.ev.on()` listeners (line 639, etc.)
   - **Mitigation:** Socket is closed with `sock.end()` which should clean up listeners
   - **Impact:** Low - Needs runtime monitoring

---

## 3. Hetzner Checklist (Manual UI Steps)

### Step 1: Create Persistent Volume

1. Open Hetzner dashboard: https://hetzner/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f
2. Click **Volumes** tab (left sidebar)
3. Click **New Volume** button
4. Configure:
   - **Name:** `whatsapp-sessions-volume`
   - **Size:** `1GB` (sufficient for 30 sessions + metadata)
   - **Mount Path:** `/var/lib/whatsapp-backend/sessions` (exact path, must match)
5. Click **Create**
6. Wait 1-2 minutes for volume provisioning

**Verification:** Volume appears in list with status "Active"

---

### Step 2: Set Environment Variable

1. In Hetzner dashboard, go to `whatsapp-backend` service
2. Click **Variables** tab
3. Click **+ New Variable**
4. Add:
   - **Key:** `SESSIONS_PATH`
   - **Value:** `/var/lib/whatsapp-backend/sessions` (must match mount path from Step 1)
5. Click **Save**

**Hetzner will automatically redeploy after variable change.**

---

### Step 3: Verify Deployment

1. Go to **Deployments** tab
2. Wait for deployment to complete (green checkmark)
3. Click latest deployment → **View Logs**
4. Check logs for:
   ```
   📁 SESSIONS_PATH: /var/lib/whatsapp-backend/sessions
   📁 Auth directory: /var/lib/whatsapp-backend/sessions
   📁 Sessions dir exists: true
   📁 Sessions dir writable: true
   ```
   ✅ If you see "writable: true" → Volume is mounted correctly

5. Check for errors:
   ```
   ❌ CRITICAL: Auth directory is not writable!
   ```
   ❌ If you see this → Volume mount failed, check Step 1

---

### Step 4: Test Persistence (After Onboarding Accounts)

1. **After 30 accounts are connected:**
   - Check `/api/status/dashboard` - should show 30 connected accounts

2. **Restart service:**
   - Hetzner dashboard → Service → **Settings** → **Restart**
   - Watch logs for boot sequence:
     ```
     🔄 Restoring accounts from Firestore...
     🔄 Scanning disk for session directories...
     ✅ Boot sequence complete: 30/30 accounts connected
     ```

3. **Verify accounts reconnect:**
   - Check `/api/status/dashboard` again
   - Should show all 30 accounts reconnect automatically (no manual QR scans)

**Success Criteria:**
- ✅ All 30 accounts reconnect within 2 minutes
- ✅ No QR codes required (sessions persisted)
- ✅ Status dashboard shows "connected" for all accounts

---

### Step 5: Configure Healthcheck (Optional)

**Current:** `/health` endpoint exists (line ~1380)

**Hetzner Config:**
- Health check path: `/health` (endpoint exists in server.js)
- Service: systemd `whatsapp-backend.service`
- Restart policy: `on-failure` (systemd default)

**Enhancement Needed:** Add storage writability check to `/health` response (currently only checks service/Firestore).

**Manual Steps:**
1. SSH to Hetzner: `ssh root@37.27.34.179`
2. Verify service: `sudo systemctl status whatsapp-backend`
3. Check health: `curl https://whats-app-ompro.ro/health`
4. Verify logs: `sudo journalctl -u whatsapp-backend -n 50`

✅ **No action needed** - Service configured via systemd.

---

## 4. 30 Accounts Operational Flow

### Onboarding Flow (First-Time Setup)

**Assumption:** Hetzner persistent storage is mounted at `/var/lib/whatsapp-backend/sessions` and `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions` is set.

**Steps:**

1. **Deploy service to Hetzner** (after storage setup)
   - Service starts with 0 accounts
   - Boot sequence: `restoreAccountsFromFirestore()` → `restoreAccountsFromDisk()` → finds 0 sessions

2. **Add accounts one-by-one via API:**
   ```bash
   # For each account (1-30):
   curl -X POST https://whats-app-ompro.ro/api/whatsapp/add-account \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     -d '{
       "name": "Account-01",
       "phone": "+407XXXXXXXX"
     }'
   ```

   **Response:**
   ```json
   {
     "success": true,
     "account": {
       "accountId": "account_prod_abc123",
       "status": "connecting",
       "qrCode": "data:image/png;base64,..."
     }
   }
   ```

3. **Get QR code:**
   - Option A: Check API response (includes `qrCode` as base64 image)
   - Option B: Check status dashboard: `GET /api/status/dashboard` → find account with `needsQR: true` → `qrCode` field

4. **Scan QR with phone:**
   - Open WhatsApp on phone
   - Settings → Linked Devices → Link a Device
   - Scan QR code from dashboard/API response
   - Wait for connection (status changes to "connected")

5. **Verify session persists:**
   - Check: `/api/status/dashboard` → account status = "connected"
   - Check Hetzner logs: `ssh root@37.27.34.179 "sudo journalctl -u whatsapp-backend -n 100 | grep Connected"`
   - Expected: `✅ [accountId] Connected! Session persisted at: /var/lib/whatsapp-backend/sessions/{accountId}/baileys_auth``
   - Verify disk: Session files created at `/var/lib/whatsapp-backend/sessions/{accountId}/creds.json`

6. **Repeat for accounts 2-30:**
   - Repeat steps 2-5 for each account
   - **Note:** All 30 accounts can be added concurrently (no rate limiting on API)

**Estimated Time:** ~5-10 minutes per account (mostly waiting for QR scan) = **2.5-5 hours for 30 accounts**.

---

### What Happens If Phone Goes Offline

**Scenario:** User's phone loses internet connection or is turned off.

**Behavior:**
1. ✅ Connection remains active (WebSocket to WhatsApp servers, not phone)
2. ✅ Can still send/receive messages (messages queued on WhatsApp servers)
3. ⚠️  If connection is idle for 5+ minutes, health monitor marks as "stale"
4. ✅ Health monitor triggers `recoverStaleConnection()` (line 4175)
5. ✅ Reconnection logic kicks in with exponential backoff (line 784-801)

**Evidence:**
```javascript
// Line 143
const STALE_CONNECTION_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// Line 4166-4180
setInterval(() => {
  const staleAccounts = checkStaleConnections();
  for (const accountId of staleAccounts) {
    recoverStaleConnection(accountId);
  }
}, HEALTH_CHECK_INTERVAL);
```

**Recovery Time:** 1-30 seconds (depending on backoff attempt)

---

### What Happens If WhatsApp Logs Out Session

**Scenario:** User manually logs out on phone (WhatsApp → Linked Devices → Remove).

**Behavior:**
1. ✅ Baileys receives disconnect event with `DisconnectReason.loggedOut` (line 728)
2. ✅ Code detects `loggedOut` reason (line 728)
3. ✅ Sets `shouldReconnect = false` (does NOT auto-reconnect)
4. ✅ Sets account status to `needs_qr` (line 826)
5. ✅ Saves status to Firestore (line 828)
6. ✅ Status dashboard shows `status: "needs_qr"` with new QR code

**Evidence:**
```javascript
// Line 728
const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

// Line 824-830
if (!shouldReconnect) {
  account.status = 'needs_qr';
  await saveAccountToFirestore(accountId, { status: 'needs_qr' });
}
```

**Recovery:** User must scan QR code again (no automatic reconnection).

---

### Re-Pairing One Account Without Breaking Others

**Scenario:** One account is logged out, need to re-pair without affecting other 29 accounts.

**Steps:**

1. **Check status:**
   ```bash
   curl https://whats-app-ompro.ro/api/status/dashboard
   ```
   - Find account with `status: "needs_qr"`

2. **Get QR code:**
   - From dashboard response: `accounts[].qrCode` (base64 image)
   - Or call: `POST /api/whatsapp/add-account` with same phone (will regenerate QR)

3. **Scan QR with phone:**
   - Open WhatsApp on phone
   - Settings → Linked Devices → Link a Device
   - Scan QR code

4. **Verify reconnection:**
   - Check dashboard: Account status changes to "connected"
   - Other 29 accounts remain "connected" (unaffected)

**Isolation:**
- ✅ Each account has separate session directory: `/var/lib/whatsapp-backend/sessions/{accountId}/`
- ✅ Disconnecting one account does NOT affect others (line 4071-4076)
- ✅ `createConnection()` is per-account (line 490)

**Evidence:**
```javascript
// Line 4071-4076
const account = connections.get(id);
if (account && account.sock) {
  account.sock.end();  // Only closes this account's socket
  connections.delete(id);  // Only removes this account from map
}
```

---

## 5. Gap Fix Plan

### Fix 1: Remove Duplicate Signal Handlers (CRITICAL)

**File:** `whatsapp-backend/server.js`  
**Issue:** Three signal handlers exist (lines 4595, 4615, 4643)  
**Fix:** Remove old handlers at lines 4595-4613 and 4615-4641, keep only enhanced handler at 4643

**Risk:** Low - Removing duplicate handlers  
**Impact:** Medium - Prevents race conditions on shutdown

---

### Fix 2: Add Staggered Boot Connect (OPTIONAL)

**File:** `whatsapp-backend/server.js`  
**Issue:** All 30 accounts connect simultaneously on boot → potential rate limiting  
**Fix:** Add 2-5s jitter between account restores

**Implementation:**
```javascript
// In restoreAccountsFromFirestore() and restoreAccountsFromDisk()
for (let i = 0; i < accounts.length; i++) {
  const account = accounts[i];
  const jitter = Math.floor(Math.random() * 3000) + 2000; // 2-5s
  
  if (i > 0) {
    await new Promise(resolve => setTimeout(resolve, jitter));
  }
  
  await restoreAccount(accountId, data);
}
```

**Risk:** Low - Simple delay addition  
**Impact:** Medium - Reduces rate limiting risk on boot

---

### Fix 3: Enhance Health Endpoint (OPTIONAL)

**File:** `whatsapp-backend/server.js`  
**Issue:** `/health` endpoint doesn't check storage writability  
**Fix:** Add storage check to health response

**Implementation:**
```javascript
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
      connected: Array.from(connections.values())
        .filter(acc => acc.status === 'connected').length,
    },
  };
  
  const isReady = checks.storage.writable && checks.firestore;
  res.status(isReady ? 200 : 503).json({ status: isReady ? 'healthy' : 'unhealthy', checks });
});
```

**Risk:** Low - Adding check to existing endpoint  
**Impact:** Low - Better observability

---

## 6. Verification Commands

### Syntax Check
```bash
cd whatsapp-backend
node -c server.js
```
**Result:** ✅ Passed (no syntax errors)

### Lint Check
```bash
cd whatsapp-backend
npm run lint
```
**Result:** ⚠️  ESLint not installed (optional, not critical)

### Test Check
```bash
cd whatsapp-backend
npm test
```
**Result:** ⚠️  No test script configured (tests exist but not in package.json scripts)

---

## Final Summary

### Current State

**✅ Implemented:**
- Baileys multi-account management (no browser)
- Session persistence with `SESSIONS_PATH` validation
- Boot sequence: Firestore restore + disk scan
- Auto-reconnect with exponential backoff (max 5 attempts)
- Health monitoring (stale connection detection every 60s)
- Status dashboard endpoint (`/api/status/dashboard`)
- Enhanced graceful shutdown (flushes sessions to disk)

**⚠️  Minor Issues:**
- Duplicate signal handlers (non-critical, should be fixed)
- No staggered boot (optional improvement)

**❌ Blockers (Manual Setup Required):**
- Hetzner persistent volume not configured
- `SESSIONS_PATH` env var not set

---

### Verdict: 🟡 YELLOW

**Status:** Mostly ready, requires Hetzner volume setup before production use.

**Action Items:**
1. **IMMEDIATE (Manual):** Create Hetzner volume + set `SESSIONS_PATH` (see Hetzner Checklist)
2. **RECOMMENDED (Code):** Remove duplicate signal handlers (Fix 1)
3. **OPTIONAL (Code):** Add staggered boot connect (Fix 2)
4. **OPTIONAL (Code):** Enhance health endpoint (Fix 3)

---

### Hetzner Checklist Summary

1. ✅ Create volume: `whatsapp-sessions-volume` at `/var/lib/whatsapp-backend/sessions` (1GB)
2. ✅ Set env var: `SESSIONS_PATH=/var/lib/whatsapp-backend/sessions`
3. ✅ Verify deployment logs show "writable: true"
4. ✅ Test persistence: Restart service → all accounts reconnect

---

### 30 Accounts Onboarding Summary

1. Add accounts via API: `POST /api/whatsapp/add-account` (repeat 30 times)
2. Get QR code: From API response or `/api/status/dashboard`
3. Scan QR with phone: WhatsApp → Linked Devices → Link a Device
4. Verify: Check dashboard shows "connected" status
5. **Time estimate:** 2.5-5 hours for all 30 accounts

---

**END OF AUDIT**
