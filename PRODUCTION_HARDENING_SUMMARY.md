# Production Hardening Summary - CPU Quota + Warnings Fix

**Date:** 2026-01-18  
**Branch:** `audit-whatsapp-30`  
**Goal:** Fix CPU quota deployment failures + silence dist warnings

---

## 🔧 **Changes Made**

### **1. CPU Quota Reduction (maxInstances caps)**

**Global:** `setGlobalOptions` maxInstances: `10` → `2` (index.js:35)

**CRM AI Functions (maxInstances: 1):**
- `whatsappExtractEventFromThread` (whatsappExtractEventFromThread.js:36)
- `clientCrmAsk` (clientCrmAsk.js:30)
- `aggregateClientStats` (aggregateClientStats.js:21)

**Proxy HTTPS Functions (maxInstances: 1):**
- `whatsappProxySend` (whatsappProxy.js:450)
- `whatsappProxyGetAccounts` (whatsappProxy.js:749)
- `whatsappProxyAddAccount` (whatsappProxy.js:761)
- `whatsappProxyRegenerateQr` (whatsappProxy.js:773)
- `whatsappProxyDeleteAccount` (whatsappProxy.js:785)
- `whatsappProxyBackfillAccount` (whatsappProxy.js:797)

**Old AI Functions (maxInstances: 1):**
- `archiveEventAI` (archiveEventAI.js:1)
- `getEventeAI` (getEventeAI.js:1)
- `updateEventAI` (updateEventAI.js:1)
- `noteazaEventeAutomat` (noteazaEventeAutomat.js:1)
- `manageRoleAI` (manageRoleAI.js:1)
- `manageEvidenceAI` (manageEvidenceAI.js:1)
- `generateReportAI` (generateReportAI.js:1)
- `createEventFromAI` (createEventFromAI.js:13)
- `aiEventHandler` (aiEventHandler_v3.js:91)
- `chatWithAI` (index.js:351)

**Other:**
- `whatsappV4` maxInstances: `10` → `2` (index.js:339)

---

### **2. Dist Warnings Silenced**

**Files:** `functions/index.js` (lines 88-108, 882-898)

**Change:** Replaced unconditional `require('./dist/index.js')` with `fs.existsSync()` check + silent logging in production.

**Before:**
```javascript
try {
  const staffCallables = require('./dist/index.js');
  // ...
  console.log('✅ Staff/Admin callables exported');
} catch (e) {
  console.warn('⚠️ Staff/Admin callables not loaded...', e?.message || e);
}
```

**After:**
```javascript
const fs = require('fs');
const distPath = require('path').join(__dirname, 'dist/index.js');
if (fs.existsSync(distPath)) {
  try {
    const staffCallables = require('./dist/index.js');
    // ...
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_DIST_LOAD === 'true') {
      console.log('✅ Staff/Admin callables exported');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_DIST_LOAD === 'true') {
      console.warn('⚠️ Staff/Admin callables not loaded...', e?.message || e);
    }
  }
}
```

**Result:** Warnings only appear in non-production or when `DEBUG_DIST_LOAD=true`.

---

### **3. CORS Already Correct**

**Status:** All `whatsappProxy*` functions already use `cors: true` (whatsappProxy.js:449, 748, 760, 772, 784, 796).

**No changes needed** - CORS is properly configured.

---

## 📊 **Impact Summary**

### **CPU Quota Reduction:**

**Before:**
- Global: maxInstances: 10 (applied to all functions without explicit maxInstances)
- Total potential CPU: 10 × 14 AI functions + 10 × 6 proxy + 10 × 1 whatsappV4 = ~210 CPU units during deploy

**After:**
- Global: maxInstances: 2 (default fallback)
- CRM AI: maxInstances: 1 (3 functions)
- Proxy: maxInstances: 1 (6 functions)
- Old AI: maxInstances: 1 (10 functions)
- whatsappV4: maxInstances: 2
- Total potential CPU: ~2 × 3 + 1 × 16 + 2 = **~24 CPU units during deploy** (~88% reduction)

**Expected:** CPU quota errors should no longer occur during deployments.

---

## ✅ **Files Modified**

1. `functions/index.js` - Global maxInstances, chatWithAI, whatsappV4, dist warnings
2. `functions/whatsappExtractEventFromThread.js` - maxInstances: 1
3. `functions/clientCrmAsk.js` - maxInstances: 1
4. `functions/aggregateClientStats.js` - maxInstances: 1
5. `functions/whatsappProxy.js` - maxInstances: 1 (6 functions)
6. `functions/archiveEventAI.js` - maxInstances: 1
7. `functions/getEventeAI.js` - maxInstances: 1
8. `functions/updateEventAI.js` - maxInstances: 1
9. `functions/noteazaEventeAutomat.js` - maxInstances: 1
10. `functions/manageRoleAI.js` - maxInstances: 1
11. `functions/manageEvidenceAI.js` - maxInstances: 1
12. `functions/generateReportAI.js` - maxInstances: 1
13. `functions/createEventFromAI.js` - maxInstances: 1
14. `functions/aiEventHandler_v3.js` - maxInstances: 1

**Total: 14 files modified**

---

## 🧪 **Verification**

```bash
# Syntax check
cd functions && node -c index.js
# ✓ Syntax OK

# Verify maxInstances changes
grep -rn "maxInstances:" functions/*.js | grep -E "(whatsappExtractEventFromThread|clientCrmAsk|aggregateClientStats|whatsappProxy|archiveEventAI|getEventeAI|updateEventAI|noteazaEventeAutomat|manageRoleAI|manageEvidenceAI|generateReportAI|createEventFromAI|aiEventHandler|chatWithAI|whatsappV4|setGlobalOptions)"

# Verify dist warnings gated
grep -A 3 "fs.existsSync.*dist" functions/index.js

# Verify CORS (already correct)
grep "cors: true" functions/whatsappProxy.js
```

---

## 🚀 **Deploy**

```bash
firebase deploy --only functions
```

**Expected:** No CPU quota errors, no dist warnings in production logs.

---

## 📝 **Log Commands (Corrected)**

```bash
# View logs (no --limit flag, use --lines instead)
firebase functions:log --only clientCrmAsk --lines 120
firebase functions:log --only whatsappExtractEventFromThread --lines 120
firebase functions:log --only aggregateClientStats --lines 120
```

---

**END OF HARDENING SUMMARY**
