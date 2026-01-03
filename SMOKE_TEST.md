# SMOKE TEST - WhatsApp Baileys Stability

**Purpose:** Manual verification of WhatsApp (Baileys) integration stability
**Related Issue:** #3
**Last Updated:** 2026-01-01

---

## 🎯 Test Objectives

Verify that WhatsApp integration is stable and production-ready:

- ✅ Session persistence across restarts
- ✅ Robust reconnection with backoff
- ✅ Message deduplication
- ✅ Outbox idempotency
- ✅ Client data persistence
- ✅ Observability and monitoring

---

## 📋 Prerequisites

### Environment

- Railway deployment running
- Redis connected
- Firebase configured
- WhatsApp account ready for testing

### Tools Needed

- Browser (for Railway logs)
- WhatsApp mobile app
- Terminal (for API calls)
- Postman/curl (optional)

### Test Data

- Test phone number: `+40XXXXXXXXX` (your test number)
- Admin token: Check Railway variables

---

## 🧪 Test Suite

---

## TEST 1: Session Persistence (Cold Restart x3)

**Objective:** Verify session persists across restarts without requiring QR scan

### Steps:

#### 1.1 Initial Setup

```bash
# Get current deployment status
curl https://whats-upp-production.up.railway.app/health

# Expected: status: "healthy"
```

#### 1.2 Connect WhatsApp Account

1. Navigate to Railway logs
2. Look for QR code or pairing code
3. Scan QR with WhatsApp mobile app
4. Wait for "✅ Connected" in logs

**Expected Result:**

```
✅ [account_XXX] Connected
📱 WhatsApp account ready
```

#### 1.3 First Restart

1. In Railway Dashboard → Deployments
2. Click "Redeploy" on current deployment
3. Wait for restart (~2 minutes)
4. Check logs

**Expected Result:**

```
🔄 Restoring accounts from Firestore...
📦 Found 1 connected accounts in Firestore
✅ [account_XXX] Session restored from disk
✅ [account_XXX] Connected (no QR needed)
```

**❌ FAIL if:** QR code appears again

#### 1.4 Second Restart

1. Redeploy again
2. Wait for restart
3. Check logs

**Expected Result:**

```
✅ [account_XXX] Session restored from disk
✅ [account_XXX] Connected (no QR needed)
```

#### 1.5 Third Restart

1. Redeploy again
2. Wait for restart
3. Check logs

**Expected Result:**

```
✅ [account_XXX] Session restored from disk
✅ [account_XXX] Connected (no QR needed)
```

### Pass Criteria:

- ✅ All 3 restarts reconnect WITHOUT QR code
- ✅ Session data persists in Railway Volume
- ✅ Connection time < 30 seconds per restart

---

## TEST 2: Reconnect Robustness

**Objective:** Verify exponential backoff and reconnect logic

### Steps:

#### 2.1 Simulate Network Disconnect

1. Turn off WiFi on WhatsApp mobile device
2. Wait 30 seconds
3. Check Railway logs

**Expected Result:**

```
⚠️ [account_XXX] Connection lost
🔄 [account_XXX] Attempting reconnect (attempt 1/5)
⏳ Backoff: 2 seconds
```

#### 2.2 Verify Backoff

1. Keep WiFi off
2. Observe logs for multiple retry attempts

**Expected Result:**

```
🔄 Attempt 1: backoff 2s
🔄 Attempt 2: backoff 4s
🔄 Attempt 3: backoff 8s
🔄 Attempt 4: backoff 16s
🔄 Attempt 5: backoff 32s
```

#### 2.3 Successful Reconnect

1. Turn WiFi back on
2. Wait for reconnection
3. Check logs

**Expected Result:**

```
✅ [account_XXX] Reconnected successfully
📱 WhatsApp account ready
```

### Pass Criteria:

- ✅ Exponential backoff observed (2s, 4s, 8s, 16s, 32s)
- ✅ Reconnects automatically when network returns
- ✅ No duplicate connections created
- ✅ Logs show clear disconnect reason

---

## TEST 3: Inbox Deduplication

**Objective:** Verify same message creates only ONE Firestore document

### Steps:

#### 3.1 Send Test Message

1. From WhatsApp mobile, send message to test account
2. Message: "TEST_DEDUP_001"
3. Wait 5 seconds
4. Check Firestore

**Expected Result:**

```
Firestore: threads/{threadId}/messages/{messageId}
- waMessageId: unique_id_from_baileys
- content: "TEST_DEDUP_001"
- timestamp: ...
```

#### 3.2 Simulate Duplicate Delivery

1. Check Railway logs for message processing
2. Look for messageId

**Expected Result:**

```
📨 [account_XXX] PROCESSING: INBOUND message msg_abc123 from +40XXX
💾 [account_XXX] Saving to Firestore: threads/thread_123/messages/msg_abc123
✅ Message saved
```

#### 3.3 Verify No Duplicates

1. Query Firestore for messages with same content
2. Count documents

**Expected Result:**

- Only 1 document with content "TEST_DEDUP_001"
- Document ID = messageId from Baileys

### Pass Criteria:

- ✅ Same message = 1 Firestore document
- ✅ messageId is unique and deterministic
- ✅ No duplicate documents created

---

## TEST 4: Outbox Idempotency

**Objective:** Verify retry logic and status transitions

### Steps:

#### 4.1 Queue Test Message

```bash
# Create test message in wa_outbox
curl -X POST https://whats-upp-production.up.railway.app/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+40XXXXXXXXX",
    "message": "TEST_OUTBOX_001"
  }'
```

**Expected Result:**

```json
{
  "success": true,
  "messageId": "msg_xyz789",
  "status": "queued"
}
```

#### 4.2 Verify Status Transition

1. Check Firestore `wa_outbox` collection
2. Find document with messageId
3. Observe status changes

**Expected Result:**

```
Initial: status = "queued"
After processing: status = "sent"
```

#### 4.3 Simulate Retry

1. Manually set status back to "queued" in Firestore
2. Wait for worker to process
3. Check status again

**Expected Result:**

```
Status: "queued" → "sent"
No duplicate messages sent
```

### Pass Criteria:

- ✅ Status transitions: queued → sent
- ✅ Retry doesn't create duplicate messages
- ✅ Idempotent processing (same message ID = same result)

---

## TEST 5: Client Data Persistence

**Objective:** Verify deterministic accountId and no duplicates

### Steps:

#### 5.1 Check Account ID Generation

1. Connect WhatsApp with phone: +40123456789
2. Check logs for accountId

**Expected Result:**

```
📱 Generated accountId: account_40123456789
```

#### 5.2 Restart and Verify Same ID

1. Redeploy application
2. Check logs for accountId

**Expected Result:**

```
📱 Restored accountId: account_40123456789
(Same ID as before)
```

#### 5.3 Check Firestore

1. Query `wa_accounts` collection
2. Count documents for this phone number

**Expected Result:**

- Only 1 document with accountId = account_40123456789
- No duplicates

### Pass Criteria:

- ✅ accountId is deterministic (same phone = same ID)
- ✅ No duplicate accounts in Firestore
- ✅ Account data persists across restarts

---

## TEST 6: Observability

**Objective:** Verify logs and health endpoint

### Steps:

#### 6.1 Check Health Endpoint

```bash
curl https://whats-upp-production.up.railway.app/health
```

**Expected Result:**

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "commit": "fc48935c",
  "uptime": 3600,
  "accounts": {
    "total": 1,
    "connected": 1,
    "connecting": 0,
    "needs_qr": 0
  },
  "firestore": "connected"
}
```

#### 6.2 Verify Structured Logs

1. Open Railway logs
2. Look for structured log format

**Expected Result:**

```
✅ [account_XXX] Connected
📨 [account_XXX] PROCESSING: INBOUND message
💾 [account_XXX] Saved to Firestore
⚠️ [account_XXX] Connection lost
🔄 [account_XXX] Attempting reconnect
```

#### 6.3 Check Cache Stats

```bash
curl https://whats-upp-production.up.railway.app/api/cache/stats
```

**Expected Result:**

```json
{
  "success": true,
  "cache": {
    "enabled": true,
    "type": "redis",
    "connected": true
  }
}
```

### Pass Criteria:

- ✅ /health endpoint returns 200 OK
- ✅ Logs are structured with [accountId] prefix
- ✅ Cache stats endpoint works
- ✅ All metrics are accurate

---

## 📊 Test Results Template

### Test Execution Log

**Date:** **\*\***\_**\*\***
**Tester:** **\*\***\_**\*\***
**Environment:** Production / Staging
**Deployment ID:** **\*\***\_**\*\***

| Test                        | Status          | Notes |
| --------------------------- | --------------- | ----- |
| 1. Session Persistence (x3) | ⬜ PASS ⬜ FAIL |       |
| 2. Reconnect Robustness     | ⬜ PASS ⬜ FAIL |       |
| 3. Inbox Deduplication      | ⬜ PASS ⬜ FAIL |       |
| 4. Outbox Idempotency       | ⬜ PASS ⬜ FAIL |       |
| 5. Client Data Persistence  | ⬜ PASS ⬜ FAIL |       |
| 6. Observability            | ⬜ PASS ⬜ FAIL |       |

**Overall Result:** ⬜ PASS ⬜ FAIL

**Issues Found:**

- **Recommendations:**

- ***

## 🚨 Failure Scenarios

### If Session Persistence Fails:

1. Check Railway Volume is mounted: `/app/sessions`
2. Check SESSIONS_PATH environment variable
3. Check disk space in Railway
4. Review logs for "Session saved" messages

### If Reconnect Fails:

1. Check network connectivity
2. Review backoff logic in code
3. Check Firestore for retry count
4. Verify no infinite loops

### If Deduplication Fails:

1. Check messageId generation
2. Verify Firestore document IDs
3. Review message processing logic
4. Check for race conditions

### If Outbox Fails:

1. Check wa_outbox collection exists
2. Verify status field updates
3. Review worker processing logic
4. Check for stuck messages

---

## 📞 Support

**Issues?**

- Check Railway logs first
- Review Firestore data
- Check environment variables
- Contact: dev team

**Documentation:**

- Issue #3: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/issues/3
- QA Report: QA_REPORT_ISSUE_3.md
- Production Features: PRODUCTION_FEATURES.md

---

## ✅ Sign-off

**QA Approval:**

- [ ] All tests passed
- [ ] No critical issues found
- [ ] Production ready

**Signed:** **\*\***\_**\*\***
**Date:** **\*\***\_**\*\***
