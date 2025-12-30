# Inbound Probe Setup Guide

**Purpose:** Enable end-to-end message delivery testing by sending probe messages from a dedicated sender account to the operator account.

**Status:** BLOCKED - Requires second Baileys account configuration

---

## Architecture

```
Probe Sender Account (WhatsApp)
  ↓ (sends probe message)
Operator Account (WhatsApp)
  ↓ (receives message)
Baileys Backend (Railway)
  ↓ (detects probe message)
Firestore (wa_metrics/longrun/probes/IN_{timestamp})
```

---

## Prerequisites

1. **Two WhatsApp accounts:**
   - Operator account: Already connected (receives customer messages)
   - Probe sender account: NEW - dedicated for testing

2. **Phone numbers:**
   - Operator: Already configured
   - Probe sender: Need new number (can be virtual)

3. **Firestore config:**
   - `operatorAccountId`: Set to operator's Baileys account ID
   - `probeSenderAccountId`: Set to probe sender's Baileys account ID
   - `operatorJid`: Set to operator's WhatsApp JID (phone@s.whatsapp.net)
   - `operatorPhone`: Set to operator's phone number

---

## Step 1: Add Probe Sender Account

### Option A: Add via API

```bash
curl -X POST https://whats-upp-production.up.railway.app/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Probe Sender",
    "phone": "+40700000000"
  }'
```

**Response:**
```json
{
  "success": true,
  "accountId": "account_1767080000000",
  "qrCode": "data:image/png;base64,...",
  "pairingCode": "ABCD-EFGH"
}
```

### Option B: Add via UI

1. Go to: https://superparty-frontend.web.app/chat-clienti
2. Click tab **⚙️ Accounts**
3. Click **+ Adaugă Cont**
4. Name: "Probe Sender"
5. Phone: "+40700000000" (optional)
6. Scan QR code with WhatsApp

---

## Step 2: Get Account IDs

### Get Operator Account ID

```bash
curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq '.accounts[] | select(.name | contains("Operator")) | {id, name, phone}'
```

**Example output:**
```json
{
  "id": "account_1767044290665",
  "name": "Operator Account",
  "phone": "+40712345678"
}
```

### Get Probe Sender Account ID

```bash
curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq '.accounts[] | select(.name | contains("Probe")) | {id, name, phone}'
```

**Example output:**
```json
{
  "id": "account_1767080000000",
  "name": "Probe Sender",
  "phone": "+40700000000"
}
```

---

## Step 3: Update Firestore Config

### Via Firestore Console

1. Go to: https://console.firebase.google.com/project/superparty-frontend/firestore
2. Navigate to: `wa_metrics/longrun/config/current`
3. Click "Edit document"
4. Update fields:
   ```json
   {
     "operatorAccountId": "account_1767044290665",
     "probeSenderAccountId": "account_1767080000000",
     "operatorJid": "40712345678@s.whatsapp.net",
     "operatorPhone": "+40712345678"
   }
   ```
5. Click "Update"

### Via API (if implemented)

```bash
curl -X POST https://whats-upp-production.up.railway.app/api/admin/longrun/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${LONGRUN_ADMIN_TOKEN}" \
  -d '{
    "operatorAccountId": "account_1767044290665",
    "probeSenderAccountId": "account_1767080000000",
    "operatorJid": "40712345678@s.whatsapp.net",
    "operatorPhone": "+40712345678"
  }'
```

---

## Step 4: Implement Inbound Probe Logic

### Current Code (Placeholder)

`lib/longrun-jobs-v2.js` line 245-275:

```javascript
async function runInboundProbe() {
  const now = new Date();
  const probeKey = `IN_${now.toISOString().slice(0, 13).replace(/[:-]/g, '')}`;
  
  try {
    console.log(`🔍 Inbound probe: ${probeKey}`);
    
    const probeRef = db.collection('wa_metrics').doc('longrun').collection('probes').doc(probeKey);
    const probeDoc = await probeRef.get();
    
    if (probeDoc.exists) {
      console.log(`⚠️  Probe ${probeKey} already exists, skipping`);
      return;
    }
    
    // TODO: Send message from PROBE_SENDER to OPERATOR_ACCOUNT
    // For now, mark as PASS (will be implemented after probe sender setup)
    
    await probeRef.set({
      probeKey,
      type: 'inbound',
      ts: admin.firestore.FieldValue.serverTimestamp(),
      tsIso: now.toISOString(),
      result: 'PASS',
      instanceId,
      commitHash: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'unknown',
      serviceVersion: '2.0.0',
      note: 'Probe sender required for full implementation'
    });
    
    console.log(`✅ Inbound probe PASS: ${probeKey}`);
  } catch (error) {
    console.error(`❌ Inbound probe FAIL: ${probeKey}`, error.message);
  }
}
```

### Required Implementation

Replace TODO section with:

```javascript
// Get config
const configRef = db.collection('wa_metrics').doc('longrun').collection('config').doc('current');
const configDoc = await configRef.get();
const config = configDoc.data();

if (!config.probeSenderAccountId || !config.operatorJid) {
  throw new Error('Probe sender or operator not configured');
}

// Get probe sender client
const probeSenderClient = global.clients.get(config.probeSenderAccountId);
if (!probeSenderClient || probeSenderClient.state !== 'open') {
  throw new Error('Probe sender not connected');
}

// Send probe message
const probeMessage = `PROBE_${probeKey}`;
const startTs = Date.now();

await probeSenderClient.sendMessage(config.operatorJid, {
  text: probeMessage
});

// Wait for message to be received (max 30s)
const received = await waitForProbeMessage(probeMessage, 30000);

const latencyMs = Date.now() - startTs;

await probeRef.set({
  probeKey,
  type: 'inbound',
  ts: admin.firestore.FieldValue.serverTimestamp(),
  tsIso: now.toISOString(),
  result: received ? 'PASS' : 'FAIL',
  latencyMs,
  instanceId,
  commitHash: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'unknown',
  serviceVersion: '2.0.0',
  probeSenderAccountId: config.probeSenderAccountId,
  operatorJid: config.operatorJid
});
```

### Helper Function

Add to `lib/longrun-jobs-v2.js`:

```javascript
function waitForProbeMessage(probeMessage, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    
    const messageHandler = (msg) => {
      if (msg.body === probeMessage) {
        cleanup();
        resolve(true);
      }
    };
    
    const cleanup = () => {
      clearTimeout(timeout);
      // Remove message listener
      // (implementation depends on Baileys event system)
    };
    
    // Add message listener
    // (implementation depends on Baileys event system)
  });
}
```

---

## Step 5: Test Inbound Probe

### Manual Test

1. **Send test message:**
   ```bash
   # From probe sender WhatsApp
   # Send to operator: "TEST_PROBE_MANUAL"
   ```

2. **Check if received:**
   ```bash
   # Check Railway logs
   railway logs --filter "TEST_PROBE_MANUAL"
   ```

### Automated Test

1. **Trigger probe manually:**
   ```javascript
   // In Railway console or local
   const { runInboundProbe } = require('./lib/longrun-jobs-v2');
   await runInboundProbe();
   ```

2. **Check probe result:**
   ```bash
   curl https://whats-upp-production.up.railway.app/api/admin/longrun/probes | jq '.probes[] | select(.type=="inbound") | {probeKey, result, latencyMs}'
   ```

**Expected output:**
```json
{
  "probeKey": "IN_2025123008",
  "result": "PASS",
  "latencyMs": 1234
}
```

---

## Step 6: Enable Scheduled Probes

After successful manual test:

1. **Verify config:**
   ```bash
   curl https://whats-upp-production.up.railway.app/api/admin/longrun/config | jq '.config | {probeSenderAccountId, operatorJid}'
   ```

2. **Restart Railway service:**
   ```bash
   railway service restart
   ```

3. **Verify probe schedule:**
   ```bash
   # Check logs for "Inbound probe: IN_..."
   railway logs --filter "Inbound probe"
   ```

4. **Monitor probe results:**
   ```bash
   # Check every 6 hours
   curl https://whats-upp-production.up.railway.app/api/admin/longrun/probes | jq '.probes[] | select(.type=="inbound")'
   ```

---

## Troubleshooting

### Problem: Probe sender not connected

**Symptoms:**
- Error: "Probe sender not connected"
- Probe result: FAIL

**Solution:**
1. Check probe sender status:
   ```bash
   curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq '.accounts[] | select(.id=="account_1767080000000")'
   ```

2. If status != "connected":
   - Scan QR code again
   - Check WhatsApp app on probe sender phone

### Problem: Message not received

**Symptoms:**
- Probe result: FAIL
- Latency: 30000ms (timeout)

**Solution:**
1. Check operator account status:
   ```bash
   curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts | jq '.accounts[] | select(.id=="account_1767044290665")'
   ```

2. Check if operator JID is correct:
   - Format: `{phone}@s.whatsapp.net`
   - Example: `40712345678@s.whatsapp.net` (no + prefix)

3. Test manual message:
   - Send from probe sender to operator
   - Check if received in Railway logs

### Problem: Config not found

**Symptoms:**
- Error: "Probe sender or operator not configured"

**Solution:**
1. Verify config exists:
   ```bash
   curl https://whats-upp-production.up.railway.app/api/admin/longrun/config | jq '.config'
   ```

2. Update config (see Step 3)

---

## Maintenance

### Rotating Probe Sender

If probe sender account needs to be changed:

1. Add new probe sender account (Step 1)
2. Update config with new `probeSenderAccountId` (Step 3)
3. Disconnect old probe sender:
   ```bash
   curl -X POST https://whats-upp-production.up.railway.app/api/whatsapp/disconnect/{old_account_id}
   ```

### Monitoring Probe Health

```bash
# Get probe pass rate (last 7 days)
curl https://whats-upp-production.up.railway.app/api/admin/longrun/probes | jq '[.probes[] | select(.type=="inbound")] | group_by(.result) | map({result: .[0].result, count: length})'
```

**Expected output:**
```json
[
  {"result": "PASS", "count": 28},
  {"result": "FAIL", "count": 0}
]
```

---

## Status Checklist

- [ ] Probe sender account added
- [ ] Probe sender connected (QR scanned)
- [ ] Operator account ID identified
- [ ] Firestore config updated
- [ ] Inbound probe logic implemented
- [ ] Manual test successful
- [ ] Scheduled probes enabled
- [ ] Monitoring configured

**Current Status:** BLOCKED - Awaiting probe sender account setup

---

**END OF SETUP GUIDE**
