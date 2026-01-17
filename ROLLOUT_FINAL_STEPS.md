# Rollout Final Steps - Production Deployment

**Date:** 2026-01-17  
**Status:** Ready for production (all code complete)

---

## 🚀 **1. GitHub: Merge PR**

### **Steps:**
1. Open PR: `audit-whatsapp-30` → `main` (compare link available)
2. Verify commits include:
   - UI (Inbox/Chat/Client Profile)
   - Hardening (deleteAccount via proxy)
   - Documentation
3. **Merge** (squash or merge commit)
4. Verify Railway service is set to deploy from `main` branch

### **Fix "Could not compare to origin/main" (if needed):**
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
git fetch origin --prune
git branch -r | grep origin/main
# If not present:
git fetch origin main
```

---

## 🔥 **2. Firebase: Secrets + Deploy**

### **Commands:**
```bash
# Select project
firebase projects:list
firebase use <PROJECT_ID>

# Set secrets (REQUIRED)
firebase functions:secrets:set RAILWAY_WHATSAPP_URL
# Value: https://whats-upp-production.up.railway.app (or your Railway domain)

# If AI uses API key (check functions/whatsappExtractEventFromThread.js)
firebase functions:secrets:set GROQ_API_KEY
# OR: OPENAI_API_KEY (depending on your AI provider)

# Deploy
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### **Console Verifications:**
- [ ] **Firestore → Indexes:** All "Ready" (may take 10-60 minutes)
- [ ] **Functions:** All deployed (check logs for errors)
- [ ] **Rules Active:**
  - `threads/{threadId}`: `allow delete: if false` (NEVER DELETE)
  - `threads/{threadId}/messages/{messageId}`: `allow delete: if false`
  - `outbox`: `allow create, update, delete: if false` (server-only)
  - `evenimente`: create requires `createdBy`, `schemaVersion`, `isArchived=false`
  - `clients/{phoneE164}`: `allow delete: if false`

---

## 🚂 **3. Railway: Volume + Env + Redeploy**

### **Volume Configuration:**
- [ ] **Mount Path:** `/app/sessions`
- [ ] **Size:** 50GB (or as needed)

### **Environment Variables (Minimum):**
```
SESSIONS_PATH=/app/sessions
FIREBASE_SERVICE_ACCOUNT_JSON=<complete JSON>
ADMIN_TOKEN=<random-long-token>  # if backend uses admin endpoints
```

### **Redeploy Service**
- Trigger redeploy from Railway dashboard
- Wait for build + deploy to complete

### **Log Verifications:**
Search Railway logs for these patterns:

**✅ Success Indicators:**
```
sessions path exists/writable: true
Firebase initialized
/health 200
```

**❌ Error Indicators (if seen, investigate):**
```
sessions path NOT writable
Firebase init FAILED
/health 500
```

---

## ✅ **4. Smoke Test Commands (Railway)**

### **Health Check:**
```bash
curl -X GET https://whats-upp-production.up.railway.app/health
# Expected: 200 OK
```

### **List Accounts (via Railway direct - before proxy):**
```bash
curl -X GET https://whats-upp-production.up.railway.app/api/whatsapp/accounts
# Expected: { "success": true, "accounts": [...] }
```

### **Via Functions Proxy (after Firebase deploy):**
```bash
# Get Firebase ID token first (from Flutter app or Firebase CLI)
TOKEN="<your-firebase-id-token>"

curl -X GET \
  "https://us-central1-<PROJECT_ID>.cloudfunctions.net/whatsappProxyGetAccounts" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 **5. Acceptance Tests (Cap-Coadă)**

### **Test 1: Pair Account (WA-01)**
**App Flow:**
1. WhatsApp → Accounts → Add Account
2. Name: `WA-01`, Phone: `+40...`
3. QR code appears
4. Scan QR with phone (WhatsApp → Linked devices → Link a device)
5. Status becomes `connected`

**Railway Logs to Watch:**
```
✅ "Account WA-01 connected"
✅ "QR code generated"
❌ "needs_qr" (after scan should NOT appear)
```

**Firestore Verification:**
```bash
# Check account created
firebase firestore:get accounts/<accountId>
# Should show: status: "connected", waJid: "..."
```

---

### **Test 2: Receive Message (Client → WA-01)**
**Steps:**
1. From client phone: Send message to WA-01 number
2. In app: WhatsApp → Inbox → Select WA-01 → Open thread

**Expected:**
- Message appears in Chat screen (realtime)
- Firestore has `threads/{threadId}` and `threads/{threadId}/messages/{messageId}`

**Railway Logs to Watch:**
```
✅ "messages.upsert" event received
✅ "Message saved to Firestore"
```

**Firestore Verification:**
```bash
# Check thread exists
firebase firestore:get threads/<threadId>
# Should show: accountId: "WA-01", lastMessageAt: <timestamp>

# Check message exists
firebase firestore:get threads/<threadId>/messages/<messageId>
# Should show: direction: "inbound", body: "..."
```

---

### **Test 3: Send Message (WA-01 → Client)**
**Steps:**
1. In Chat screen: Type message → Send
2. Check client phone receives message
3. Check Firestore message status updates

**Expected:**
- Message sent via `sendViaProxy()` (NOT direct outbox write)
- Client receives message on WhatsApp
- Firestore message status: `queued` → `sent` → `delivered` → `read`

**Railway Logs to Watch:**
```
✅ "Outbox entry created" (server-side)
✅ "Message sent via WhatsApp"
✅ "Status updated: sent"
```

**Firestore Verification:**
```bash
# Check outbox (server-only, should exist)
firebase firestore:get outbox/<requestId>
# Should show: status: "sent", accountId: "WA-01"

# Check message in thread
firebase firestore:get threads/<threadId>/messages/<waMessageId>
# Should show: direction: "outbound", status: "sent" (or "delivered"/"read")
```

---

### **Test 4: CRM - Extract Event**
**Steps:**
1. In Chat: CRM Panel → "Extract Event"
2. Wait for AI extraction

**Expected:**
- Draft event shown (date, address, payment, roles)

**Functions Logs to Watch:**
```
✅ "whatsappExtractEventFromThread called"
✅ "AI extraction completed"
```

**Firestore Verification:**
```bash
# Check extraction audit
firebase firestore:get threads/<threadId>/extractions/<messageId>
# Should show: intent, entities, confidence, action
```

---

### **Test 5: CRM - Save Event**
**Steps:**
1. From Test 4: Review draft → "Save Event"

**Expected:**
- New document in `evenimente/{eventId}`
- `clients/{phoneE164}` auto-updated (trigger)

**Firestore Verification:**
```bash
# Check event created
firebase firestore:get evenimente/<eventId>
# Should show: phoneE164, date, address, payment, createdBy, schemaVersion: 3

# Check client profile updated (wait 5-10 seconds for trigger)
firebase firestore:get clients/<phoneE164>
# Should show: eventsCount: 1, lifetimeSpendPaid: <amount>, lastEventAt: <timestamp>
```

---

### **Test 6: CRM - Ask AI**
**Steps:**
1. In Client Profile: "Ask AI" → "Cât a cheltuit clientul X?"

**Expected:**
- Answer consistent with `clients/{phoneE164}.lifetimeSpendPaid`
- Sources listed (eventShortId, date)

**Functions Logs to Watch:**
```
✅ "clientCrmAsk called"
✅ "AI query completed"
```

---

## 🔍 **6. Log Patterns to Monitor**

### **Pairing (QR Scan):**
```
✅ SUCCESS:
- "QR code generated"
- "Account <id> connected"
- "Session restored from disk" (on next boot)

❌ ERRORS:
- "needs_qr" (after scan = pairing failed)
- "Session restore failed"
```

### **History Sync:**
```
✅ SUCCESS:
- "messaging-history.set event received"
- "History sync: <count> messages ingested"
- "lastHistorySyncAt updated"

❌ ERRORS:
- "History sync failed"
- "Batch write error"
```

### **Backfill (Manual Trigger):**
```
✅ SUCCESS:
- "Backfill started for account <id>"
- "Backfill completed: <threads> threads, <messages> messages"
- "lastBackfillAt updated"

❌ ERRORS:
- "Backfill failed: rate limit"
- "Backfill timeout"
```

### **Message Send/Receive:**
```
✅ SUCCESS:
- "Message received: <messageId>"
- "Message saved to Firestore"
- "Outbox entry created"
- "Message sent: <messageId>"

❌ ERRORS:
- "Failed to save message"
- "Outbox write failed"
- "WhatsApp send failed"
```

---

## 🎯 **7. Onboarding 30 Accounts**

### **Procedure:**
1. Pair accounts one by one: WA-01, WA-02, ... WA-30
2. After every 5 accounts:
   - Check Railway logs for reconnect loops
   - Verify no rate limiting errors
   - Confirm all accounts show `status: "connected"`

### **Redeploy Test (after 10 accounts):**
1. Trigger Railway redeploy
2. After restart, verify:
   - All accounts still `connected` (no re-pair required)
   - Sessions restored from `/app/sessions` volume
   - Logs show: "Session restored from disk" for each account

**Expected Logs After Redeploy:**
```
✅ "Sessions directory exists: true"
✅ "Session restored: WA-01"
✅ "Session restored: WA-02"
...
✅ "All sessions restored: 10/10"
```

---

## ⚠️ **8. Critical "Never Lose Data" Checks**

### **Never Enable TTL/Cleanup:**
- [ ] Do NOT set TTL policies on `threads`, `messages`, `evenimente`, `clients`
- [ ] Do NOT create cleanup jobs that delete these collections

### **Never Add Delete Endpoints:**
- [ ] Do NOT implement admin endpoints that delete `threads` or `messages`
- [ ] Rules block client deletes, but Admin SDK can bypass (avoid code that does this)

### **Verify Rules Block Client Deletes:**
```bash
# In Firebase Console → Firestore → Rules
# Search for: "allow delete: if false"
# Should appear for:
# - threads/{threadId}
# - threads/{threadId}/messages/{messageId}
# - outbox/{messageId}
# - evenimente/{eventId}
# - clients/{phoneE164}
```

---

## ✅ **9. Final Verification Checklist**

After all steps, verify:

**Backend:**
- [ ] Railway health: `/health` returns 200
- [ ] All 30 accounts paired and `connected`
- [ ] Sessions persist after redeploy (no re-pair)
- [ ] Logs show no reconnect loops

**Firebase:**
- [ ] All indexes "Ready"
- [ ] Functions deployed (no errors in logs)
- [ ] Rules active (NEVER DELETE enforced)

**Flutter:**
- [ ] Inbox shows threads per account
- [ ] Chat sends/receives messages
- [ ] CRM: Extract → Save → Client Profile → Ask AI works

**Data Integrity:**
- [ ] No TTL/cleanup enabled on conversations
- [ ] No delete endpoints for threads/messages
- [ ] Rules block client deletes

---

## 🚨 **Troubleshooting**

### **"Sessions path NOT writable"**
- Check volume mount: `/app/sessions`
- Check env var: `SESSIONS_PATH=/app/sessions`
- Verify volume exists in Railway dashboard

### **"Firebase init FAILED"**
- Check `FIREBASE_SERVICE_ACCOUNT_JSON` env var format (must be valid JSON)
- Verify service account has Firestore permissions

### **Accounts requiring re-pair after redeploy:**
- Volume not mounted correctly
- `SESSIONS_PATH` doesn't match mount path
- Sessions directory not persisted on volume

### **Indexes stuck "Building":**
- Wait 10-60 minutes (Firestore index build time)
- Check for errors in Firebase Console → Firestore → Indexes

---

## 📝 **Quick Reference Commands**

```bash
# Railway health
curl https://whats-upp-production.up.railway.app/health

# List accounts (Railway direct)
curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts

# Firestore check account
firebase firestore:get accounts/<accountId>

# Firestore check thread
firebase firestore:get threads/<threadId>

# Firestore check message
firebase firestore:get threads/<threadId>/messages/<messageId>

# Firestore check client profile
firebase firestore:get clients/<phoneE164>
```

---

**END OF ROLLOUT GUIDE**
