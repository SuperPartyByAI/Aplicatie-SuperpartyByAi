# 🛡️ PRODUCTION STABILITY IMPLEMENTATION

**Date**: 2026-01-18 03:00 UTC  
**Branch**: audit-whatsapp-30  
**Mode**: IMPLEMENTATION + SAFE OPS

---

## 📊 BASELINE AUDIT RESULTS

### ✅ Current State
- **Git**: Clean (audit-whatsapp-30, up to date)
- **Firebase Project**: superparty-frontend
- **legacy hosting Backend**: Healthy (v2.0.0, commit 892419e6)
  - Firestore: Connected
  - Accounts: 0/30
  - Uptime: 29556s
- **Functions Deployed**: 33 total (all v2 except one)

###  ⚠️ CRITICAL BLOCKER FOUND
**Legacy v1 Function**: `whatsapp` (v1, https, us-central1, 2048MB)
- **Status**: EXISTS and blocks clean deploys
- **Action**: MUST DELETE MANUALLY (Firebase Console required)

### ⚠️ DOCUMENTATION ISSUES
**Incorrect `--limit` flag** in 17 docs (should be `--lines`):
```
PR20_RELEASE_AUDIT.md (6 instances)
IMPLEMENTATION_COMPLETE_FINAL.md (1 instance)
ROLLOUT_COMMANDS_READY.md (1 instance - explicitly marked as ❌)
AI_CHAT_FINAL_COMMENT.md (1 instance)
MANUAL_ACCEPTANCE_TEST_CHECKLIST.md (5 instances)
AI_CHAT_TROUBLESHOOTING.md (4 instances)
DEPLOY-SIMPLU.md (1 instance)
FINAL_EXECUTION_REPORT.md (1 instance - marked as invalid)
```

---

## 🎯 IMPLEMENTATION PLAN

### STEP 1: CLEANUP (Delete Legacy, Fix Docs)
- [ ] Delete v1 "whatsapp" function (Firebase Console - MANUAL)
- [ ] Fix all --limit → --lines in docs
- [ ] Remove/update any placeholder commands

### STEP 2: PERMANENT ADMIN (Harden Existing)
- [x] bootstrapAdmin callable exists (functions/src/bootstrap_admin.ts)
- [x] Flutter service exists (admin_bootstrap_service.dart)
- [x] main.dart integration exists
- [ ] ADD: Retry logic to bootstrap call
- [ ] ADD: Debounce (prevent multiple calls per session)
- [ ] VERIFY: login_screen.dart uses SetOptions(merge: true)

### STEP 3: REGION ALIGNMENT (Fix Remaining Mismatches)
Current status from last deployment:
- whatsappExtractEventFromThread: us-central1 ✅
- clientCrmAsk: us-central1 ✅
- Flutter calls: us-central1 ✅
**Action**: VERIFY consistency, add region mapping comment

### STEP 4: RETRY/BACKOFF (New Implementation)
Create reusable retry helper:
- [ ] lib/services/retry_helper.dart
- [ ] Apply to: bootstrapAdmin, whatsappExtractEventFromThread, clientCrmAsk
- [ ] UI: Disable buttons during calls, show errors with traceId

### STEP 5: EXTRACTION CACHING (Server-Side)
- [ ] Implement cache logic in whatsappExtractEventFromThread.js
- [ ] Cache key: threadId + lastMessageId + extractorVersion
- [ ] Storage: threads/{threadId}/extractions/{cacheKey}
- [ ] Flutter: Show cache indicator, add "Re-extract" button

### STEP 6: OBSERVABILITY
- [ ] Add traceId to all callable requests
- [ ] Standardize error responses (code + message + traceId)
- [ ] Add traceId to extraction docs

### STEP 7: VALIDATION
- [ ] flutter analyze (0 errors)
- [ ] functions build
- [ ] Deploy updated functions
- [ ] Update acceptance tests doc

---

## 🚀 EXECUTION LOG

### STEP 1.1: Delete Legacy v1 Function

**Firebase Console URL**: https://console.firebase.google.com/project/superparty-frontend/functions

**Manual Steps Required**:
1. Open URL above
2. Find "whatsapp" function (v1, 2048MB, us-central1, https trigger)
3. Click 3 dots (...) → Delete
4. Confirm deletion

**Verification**:
```bash
firebase functions:list | grep "whatsapp.*v1"
# Expected: No results
```

**STATUS**: ⏳ REQUIRES USER ACTION

---

*Log continues as implementation progresses...*
