# Hardening Implementation Summary

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30`

---

## ✅ **Implemented Hardening Items**

### **1. Security: Delete Account via Proxy (Super-Admin Only)**

**Problem:** Flutter `deleteAccount()` called Railway backend directly, bypassing Firebase auth checks.

**Solution:**
- Added `whatsappProxyDeleteAccount` callable in `functions/whatsappProxy.js`
- Requires super-admin authentication (`requireSuperAdmin`)
- Updated `WhatsAppApiService.deleteAccount()` to call Functions proxy instead of Railway direct
- Enforces security: only super-admin can delete accounts

**Files Changed:**
- `functions/whatsappProxy.js` (added `deleteAccountHandler`, exported `deleteAccount`)
- `functions/index.js` (exported `whatsappProxyDeleteAccount`)
- `superparty_flutter/lib/services/whatsapp_api_service.dart` (updated `deleteAccount()` to use proxy)

---

### **2. Security: Backfill Account via Proxy (Optional)**

**Problem:** Backfill endpoint was only accessible via Railway admin token, not integrated with Firebase auth.

**Solution:**
- Added `whatsappProxyBackfillAccount` callable in `functions/whatsappProxy.js`
- Requires super-admin authentication
- Forwards to Railway `POST /api/whatsapp/backfill/:accountId`

**Files Changed:**
- `functions/whatsappProxy.js` (added `backfillAccountHandler`, exported `backfillAccount`)
- `functions/index.js` (exported `whatsappProxyBackfillAccount`)

**Note:** Flutter UI button for backfill can be added later if needed.

---

### **3. Flutter Schema Verification**

**Verified:**
- ✅ Inbox query uses `orderBy('lastMessageAt', descending: true)` → index exists in `firestore.indexes.json`
- ✅ Chat query uses `orderBy('tsClient')` → field exists in backend (`saveMessageToFirestore` writes `tsClient`)
- ✅ Client Profile query uses `orderBy('date', descending: true)` where `phoneE164` → index exists
- ✅ Send uses `sendViaProxy()` (not direct Firestore writes)
- ✅ Save Event writes with `createdBy`, `schemaVersion`, `isArchived=false` (passes rules)

---

## 🔍 **Audit Results**

### **Callable Exports (Confirmed):**
- ✅ `whatsappExtractEventFromThread` (region: us-central1)
- ✅ `clientCrmAsk` (region: us-central1)
- ✅ `whatsappProxyGetAccounts`
- ✅ `whatsappProxyAddAccount`
- ✅ `whatsappProxyRegenerateQr`
- ✅ `whatsappProxyDeleteAccount` (NEW)
- ✅ `whatsappProxyBackfillAccount` (NEW)
- ✅ `whatsappProxySend`

### **Firestore Indexes (Confirmed):**
- ✅ `threads`: `accountId ASC, lastMessageAt DESC` (for Inbox)
- ✅ `evenimente`: `phoneE164 ASC, date DESC` (for Client Profile)
- ✅ Additional indexes for `isArchived`, `assignedTo`, etc.

### **Security Rules (Confirmed):**
- ✅ `threads/{threadId}`: `allow delete: if false` (NEVER DELETE)
- ✅ `threads/{threadId}/messages/{messageId}`: `allow delete: if false` (NEVER DELETE)
- ✅ `outbox`: server-only writes (client blocked)
- ✅ `evenimente`: create requires `createdBy == uid`, `isArchived == false`, `schemaVersion in [2, 3]`

---

## 📝 **Remaining Tasks = 0 (Production Ready)**

All hardening items implemented:
- ✅ Delete account secured (proxy + super-admin)
- ✅ Backfill secured (proxy + super-admin) [optional]
- ✅ Flutter schema matches backend
- ✅ Indexes verified
- ✅ Security rules enforced
- ✅ No Flutter analyze errors

---

## 🚀 **Next Steps**

1. **Deploy:** Follow `RUNBOOK_DEPLOY_PROD.md`
2. **Test:** Run acceptance tests (2 accounts + 1 client)
3. **Onboard:** Start with 30 accounts (1 instance Railway)

---

**END OF HARDENING SUMMARY**
