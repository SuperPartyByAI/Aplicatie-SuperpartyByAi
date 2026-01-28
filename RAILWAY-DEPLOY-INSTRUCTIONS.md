# legacy hosting Deployment Instructions - WhatsApp Backend v2.0.0

**Status:** Local tests 100% passed, ready for legacy hosting deployment  
**Code:** Commits 639acbb3, fd2a9842 pushed to GitHub  
**Evidence:** LOCAL-TEST-SUCCESS.md, evidence-local-test.json

---

## Prerequisites

1. legacy hosting account (https://legacy hosting.app)
2. GitHub repo connected to legacy hosting
3. Firebase service account credentials

---

## Deployment Steps

### Option A: legacy hosting Dashboard (Recommended)

#### Step 1: Create New Service

1. Go to https://legacy hosting.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose: `SuperPartyByAI/Aplicatie-SuperpartyByAi`
5. Click "Deploy"

#### Step 2: Configure Service

**Root Directory:**

```
whatsapp-backend
```

**Build Command:** (auto-detected from legacy hosting.toml)

```
npm install
```

**Start Command:** (from legacy hosting.toml)

```
node server.js
```

#### Step 3: Add Environment Variables

Go to service → Variables → Add:

```bash
# Firebase Admin SDK
FIREBASE_PROJECT_ID=superparty-frontend
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@superparty-frontend.iam.gserviceaccount.com

# Node environment
NODE_ENV=production
PORT=8080
```

**Important:** Get Firebase credentials from Firebase Console:

1. Go to Project Settings → Service Accounts
2. Click "Generate new private key"
3. Copy values from downloaded JSON:
   - `project_id` → FIREBASE_PROJECT_ID
   - `private_key` → FIREBASE_PRIVATE_KEY (keep \n characters)
   - `client_email` → FIREBASE_CLIENT_EMAIL

#### Step 4: Deploy

1. Click "Deploy" button
2. Wait for build to complete (~2-3 minutes)
3. Service will auto-start

#### Step 5: Get Service URL

1. Go to service → Settings → Domains
2. Copy the legacy hosting-provided domain:
   ```
   https://whats-app-ompro.ro
   ```

#### Step 6: Verify Deployment

```bash
# Test health endpoint
curl https://whats-app-ompro.ro/health

# Expected response:
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2025-12-29T12:20:00.000Z",
  "accounts": {
    "total": 0,
    "connected": 0
  }
}
```

---

### Option B: legacy hosting CLI

#### Step 1: Install legacy hosting CLI

```bash
npm install -g @legacy hosting/cli
```

#### Step 2: Login

```bash
legacy hosting login
```

#### Step 3: Link Project

```bash
cd whatsapp-backend
legacy hosting link
```

Select existing project or create new one.

#### Step 4: Add Environment Variables

```bash
legacy hosting variables set FIREBASE_PROJECT_ID=superparty-frontend
legacy hosting variables set FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@superparty-frontend.iam.gserviceaccount.com
legacy hosting variables set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
legacy hosting variables set NODE_ENV=production
legacy hosting variables set PORT=8080
```

#### Step 5: Deploy

```bash
legacy hosting up
```

#### Step 6: Get Service URL

```bash
legacy hosting domain
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://whats-app-ompro.ro/health | jq .
```

**Expected:**

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "accounts": {
    "total": 0,
    "connected": 0
  }
}
```

### 2. Add First Account

```bash
curl -X POST https://whats-app-ompro.ro/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+40700000001"}' | jq .
```

**Expected:**

```json
{
  "success": true,
  "account": {
    "id": "account_XXXXXXXXXX",
    "status": "connecting",
    "createdAt": "2025-12-29T12:20:00.000Z"
  }
}
```

### 3. Get QR Code

Wait 3 seconds, then:

```bash
curl https://whats-app-ompro.ro/api/whatsapp/accounts | jq '.accounts[0]'
```

**Expected:**

```json
{
  "id": "account_XXXXXXXXXX",
  "phoneNumber": "+40700000001",
  "status": "qr_ready",
  "qrCode": "data:image/png;base64,iVBORw0KG...",
  "createdAt": "2025-12-29T12:20:00.000Z"
}
```

### 4. Display QR Code

**Option A: Browser**

1. Copy the `qrCode` value (entire data URL)
2. Open browser
3. Paste in address bar
4. Press Enter
5. QR code displays

**Option B: Terminal (if qrencode installed)**

```bash
curl -s https://whats-app-ompro.ro/api/whatsapp/accounts | \
  jq -r '.accounts[0].qrCode' | \
  sed 's/data:image\/png;base64,//' | \
  base64 -d | \
  qrencode -t ANSIUTF8
```

### 5. Scan QR Code

1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code displayed
5. Wait for connection

### 6. Verify Connection

```bash
curl https://whats-app-ompro.ro/api/whatsapp/accounts | jq '.accounts[0].status'
```

**Expected:** `"connected"`

---

## Troubleshooting

### Issue: Health endpoint returns 404

**Cause:** Service not deployed or wrong URL

**Solution:**

1. Check legacy hosting dashboard for deployment status
2. Verify service is running (not sleeping)
3. Check logs: `legacy hosting logs`

### Issue: Health endpoint returns 500

**Cause:** Missing environment variables or Firebase credentials invalid

**Solution:**

1. Check legacy hosting variables are set correctly
2. Verify FIREBASE_PRIVATE_KEY has \n characters preserved
3. Check logs for specific error: `legacy hosting logs`

### Issue: QR code is null

**Cause:** fetchLatestBaileysVersion not called or Baileys version mismatch

**Solution:**

1. Verify server.js has the fix (line ~135):
   ```javascript
   const { version } = await fetchLatestBaileysVersion();
   const sock = makeWASocket({ auth: state, version, ... });
   ```
2. Check logs for 405 errors
3. Restart service: `legacy hosting service restart`

### Issue: Account stuck in "connecting"

**Cause:** Connection timeout or WhatsApp server unreachable

**Solution:**

1. Wait 30 seconds (connection timeout)
2. Status should change to "needs_qr"
3. Generate new QR code
4. Check logs for specific error

---

## Monitoring

### View Logs

**legacy hosting Dashboard:**

1. Go to service → Deployments
2. Click on latest deployment
3. View logs in real-time

**legacy hosting CLI:**

```bash
legacy hosting logs
```

### Key Log Messages

**Success:**

```
🚀 WhatsApp Backend v2.0.0 running on port 8080
📱 [account_XXX] QR Code generated
✅ [account_XXX] Connected successfully
```

**Errors:**

```
❌ [account_XXX] Connection failed: <reason>
⚠️ [account_XXX] Connection timeout after 30s
🔄 [account_XXX] Reconnecting (attempt X/5)
```

---

## Next Steps After Deployment

1. ✅ Deploy to legacy hosting (this guide)
2. ⏳ Generate QR and connect first account
3. ⏳ Test MTTR (reconnection speed)
4. ⏳ Test message queue (100% delivery)
5. ⏳ Run soak test (2 hours, >99% uptime)
6. ⏳ Document production readiness (100%)

---

## Files Reference

- **server.js** - Production server code (v2.0.0)
- **legacy hosting.toml** - legacy hosting configuration
- **package.json** - Dependencies
- **LOCAL-TEST-SUCCESS.md** - Local test results (100% passed)
- **evidence-local-test.json** - Machine-readable evidence

---

**Generated:** 2025-12-29T12:20:00Z  
**Code Version:** legacy hosting v2.0.0  
**Commits:** 639acbb3, fd2a9842  
**Local Tests:** 7/7 PASSED (100%)
