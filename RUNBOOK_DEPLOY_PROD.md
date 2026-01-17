# Runbook: Deploy WhatsApp CRM to Production

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30` → `main`  
**Status:** Ready for production deployment

---

## 📋 **Pre-Deployment Checklist**

### **A) GitHub / PR / Railway Source**

- [ ] PR from `audit-whatsapp-30` → `main` created and merged
- [ ] Railway service set to deploy from `main` branch (not `audit-whatsapp-30`)
- [ ] Confirm Railway runs **1 single instance** (until ownership/lease is complete on all accounts)

---

### **B) Firebase Deploy (REQUIRED before UI)**

**Commands:**
```bash
# 1. List projects
firebase projects:list

# 2. Select project
firebase use <PROJECT_ID>

# 3. Deploy rules, indexes, and functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

**Verification in Firebase Console:**
- [ ] Firestore Indexes = **Ready** (all indexes built)
- [ ] Functions = **Deployed** (check logs for errors)
- [ ] Rules active (verify `clients/messages/threads` "never delete" policies)

---

### **C) Firebase Secrets (REQUIRED for Functions)**

**Set secrets used by Functions:**

```bash
# Railway WhatsApp backend URL
firebase functions:secrets:set RAILWAY_WHATSAPP_URL
# Value: https://<your-railway-domain> (e.g., https://whats-upp-production.up.railway.app)

# AI provider key (if used in extraction/ask)
firebase functions:secrets:set OPENAI_API_KEY
# OR: GROQ_API_KEY (depends on your AI provider in functions)

# Optional: Admin emails (if using staffProfiles check)
firebase functions:secrets:set ADMIN_EMAILS
# Value: comma-separated emails
```

**Verify secrets:**
```bash
firebase functions:secrets:list
```

---

### **D) Railway Runtime (WhatsApp Backend)**

**Volume Configuration:**
- [ ] Persistent volume mount path: `/app/sessions`
- [ ] Volume size: 50GB (or as needed)

**Environment Variables:**
- [ ] `SESSIONS_PATH=/app/sessions` (must match mount path)
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON=...` (complete JSON service account)
- [ ] `ADMIN_TOKEN=...` (if using admin endpoints)
- [ ] Optional:
  - `WHATSAPP_SYNC_FULL_HISTORY=true`
  - `WHATSAPP_BACKFILL_COUNT=100`
  - `WHATSAPP_BACKFILL_THREADS=50`

**Post-Deploy Log Checks:**
```bash
# In Railway logs, confirm:
- "sessions dir exists/writable: true"
- "Firebase initialized"
- "/health 200"
```

---

### **E) Flutter (Post-UI) - Integration & Security**

**Confirm:**
- [ ] App uses same Firebase project as Functions/Firestore
- [ ] Send uses `sendViaProxy()` (NOT direct Firestore outbox writes)
- [ ] Event creation respects rules (`createdBy`, `schemaVersion`, `isArchived=false`)
- [ ] Inbox/Chat queries use correct fields (`orderBy` on existing fields)

---

### **F) Acceptance Tests (Minimal before 30 accounts)**

**Test Setup:**
- 2 WhatsApp accounts (2 phones) + 1 client (1 phone)

**Tests:**
1. **Thread Isolation:**
   - [ ] Same client sends message to WA-01 and WA-02
   - [ ] Verify 2 separate threads in Firestore (`threads/{WA01_accountId}__{clientJid}` and `threads/{WA02_accountId}__{clientJid}`)

2. **Receive:**
   - [ ] Client sends message → appears in Chat (Firestore + UI realtime)

3. **Send:**
   - [ ] Send from app → client receives → status updates (sent/delivered/read) in Firestore

4. **CRM Extraction:**
   - [ ] Extract Event → draft OK
   - [ ] Save Event → appears in `evenimente/{eventId}`
   - [ ] Trigger `aggregateClientStats` → updates `clients/{phoneE164}`

5. **CRM Ask AI:**
   - [ ] Ask: "Cât a cheltuit clientul X?"
   - [ ] Answer consistent with `evenimente` + `clients` aggregates

---

## 🔧 **Deployment Steps (Order)**

### **Step 1: Merge PR to Main**
```bash
# GitHub: Create PR audit-whatsapp-30 → main
# Review and merge
```

### **Step 2: Firebase Deploy**
```bash
firebase use <PROJECT_ID>
firebase functions:secrets:set RAILWAY_WHATSAPP_URL
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### **Step 3: Railway Deploy**
- Update service to deploy from `main`
- Verify volume mount + env vars
- Redeploy service
- Check logs for initialization success

### **Step 4: Flutter Build & Test**
- Build Flutter app (uses Firebase project from env)
- Test in staging/dev environment:
  - Pair account → Inbox → Chat → Send/Receive
  - CRM: Extract → Save → Client Profile → Ask AI

### **Step 5: Acceptance Tests**
- Run checklist F above
- Verify Firestore Console shows correct data structures

---

## 🚨 **Known Risks / Blockers**

1. **Index Build Time:** Firestore indexes may take 10-60 minutes to build. Do not start onboarding until all are "Ready".

2. **Railway Scale:** Run **1 instance only** until ownership/lease is complete on all 30 accounts. Multiple instances can cause race conditions on outbox leasing.

3. **Secrets Missing:** If `RAILWAY_WHATSAPP_URL` is not set, proxy functions will fail with 500 errors.

4. **Backend Health:** Railway backend must be healthy before Flutter can use proxy functions. Check `/health` endpoint.

---

## ✅ **Production Readiness Checklist (Final)**

- [ ] PR merged to `main`
- [ ] Firebase deploy successful (rules/indexes/functions)
- [ ] Firebase secrets set (RAILWAY_WHATSAPP_URL, AI keys)
- [ ] Railway volume + env vars configured
- [ ] Railway deploy successful (logs show healthy state)
- [ ] Flutter app configured (Firebase project matches)
- [ ] Acceptance tests passed (2 accounts + 1 client)
- [ ] All indexes "Ready" in Firebase Console
- [ ] No Flutter analyze errors
- [ ] Security: Delete account uses proxy (not direct Railway)

**If all checked → Ready for 30 accounts onboarding** 🚀

---

**END OF DEPLOY RUNBOOK**
