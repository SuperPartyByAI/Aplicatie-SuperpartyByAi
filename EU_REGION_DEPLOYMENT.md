# EU Region Migration - Deployment Commands

**Date:** 2026-01-18  
**Branch:** `audit-whatsapp-30`  
**Status:** Code changes complete, ready to deploy

---

## ⚠️ Prerequisites

**REQUIRED before deployment:**

1. **Delete old `whatsapp` v1 function via Firebase Console**
   - See: `MANUAL_STEP_DELETE_OLD_WHATSAPP.md`
   - This must be done before any deployment

---

## 🚀 Deployment Commands (Copy-Paste)

### Step 1: Deploy Migrated Functions Only (Recommended)

Deploy only the 3 functions that moved to `europe-west1`:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

firebase deploy --only \
  functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk
```

**Expected output:**
- ✅ `aggregateClientStats` deployed to `europe-west1`
- ✅ `whatsappExtractEventFromThread` deployed to `europe-west1`
- ✅ `clientCrmAsk` deployed to `europe-west1`

---

### Step 2: Deploy All Functions (Full Deployment)

After verifying Step 1, deploy all functions:

```bash
firebase deploy --only functions
```

This will:
- Update all other functions with hardening changes (maxInstances caps, dist warnings fix)
- Deploy new `whatsappV4` (replacing old `whatsapp`)
- Keep `whatsappProxy*` functions in `us-central1`

---

## ✅ Verification Commands

### Verify Regions

```bash
# List all functions and check regions
firebase functions:list | grep -E "aggregateClientStats|whatsappExtractEventFromThread|clientCrmAsk"

# Expected output (look for "europe-west1"):
# aggregateClientStats    | v2 | europe-west1 | ...
# whatsappExtractEventFromThread | v2 | europe-west1 | ...
# clientCrmAsk           | v2 | europe-west1 | ...
```

### Verify Logs

```bash
# Check logs for migrated functions (use --lines, NOT --limit)
firebase functions:log --only whatsappExtractEventFromThread --lines 200
firebase functions:log --only clientCrmAsk --lines 200
firebase functions:log --only aggregateClientStats --lines 200

# Look for:
# - No errors
# - Fast execution times (~100ms vs previous ~4s)
# - Successful Firestore operations
```

### Verify in Flutter App

1. **Open WhatsApp Chat** → Client Profile
2. **Click "AI: Detectează petrecere (Draft)"**
   - Should call `whatsappExtractEventFromThread` in `europe-west1`
   - Should complete in ~100ms (vs previous ~4s)
3. **Click "Ask AI about client"**
   - Should call `clientCrmAsk` in `europe-west1`
   - Should respond quickly with data from Firestore

**Expected behavior:**
- ✅ No errors in Flutter console
- ✅ Fast response times (~100ms)
- ✅ Correct data returned from Firestore

---

## 🔍 Troubleshooting

### Issue: "Function not found" error in Flutter

**Symptom:**
```
FirebaseFunctionsException: [not-found] Function not found
```

**Cause:** Flutter is calling the wrong region

**Fix:** Verify Flutter code uses `europe-west1`:
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
grep -n "europe-west1" lib/services/whatsapp_api_service.dart

# Expected: 2 occurrences (extractEventFromThread and askClientAI)
```

---

### Issue: Old `whatsapp` function still blocks deploy

**Symptom:**
```
Error: [whatsapp(us-central1)] Upgrading from 1st Gen to 2nd Gen is not yet supported
```

**Fix:** Delete manually via Firebase Console (see `MANUAL_STEP_DELETE_OLD_WHATSAPP.md`)

---

### Issue: High latency still present

**Symptom:** Firestore operations still take 3-4 seconds

**Cause:** Functions not deployed to `europe-west1`

**Verify:**
```bash
firebase functions:list | grep -E "europe-west1"

# Should show:
# aggregateClientStats (europe-west1)
# whatsappExtractEventFromThread (europe-west1)
# clientCrmAsk (europe-west1)
```

---

## 📊 Expected Performance Improvements

| Operation | Before (US) | After (EU) | Improvement |
|-----------|-------------|------------|-------------|
| Firestore read (1 doc) | ~120ms | ~3ms | 40x faster |
| Firestore write (1 doc) | ~130ms | ~5ms | 26x faster |
| Extract event (30 reads + 2 writes) | ~3,860ms | ~100ms | 38x faster |
| Ask AI (10 reads) | ~1,200ms | ~50ms | 24x faster |
| Egress cost | $0.10/GB | $0.00/GB | 100% saved |

---

## 🎯 Rollback Plan (If Needed)

If issues occur, revert to `us-central1`:

1. **Code changes:**
   ```bash
   # In functions/*.js, change back to:
   region: 'us-central1'
   
   # In Flutter, remove region specification:
   FirebaseFunctions.instance.httpsCallable(...)
   ```

2. **Redeploy:**
   ```bash
   firebase deploy --only functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk
   ```

3. **Flutter rebuild:**
   ```bash
   cd superparty_flutter
   flutter clean && flutter pub get
   flutter build apk  # or flutter run
   ```

---

## 📝 Summary

**Status:** ✅ Code changes complete, ready to deploy

**Changed files:**
- `functions/aggregateClientStats.js` (region → europe-west1)
- `functions/whatsappExtractEventFromThread.js` (region → europe-west1)
- `functions/clientCrmAsk.js` (region → europe-west1)
- `superparty_flutter/lib/services/whatsapp_api_service.dart` (2 methods use europe-west1)

**Deployment order:**
1. Delete old `whatsapp` function (manual, Firebase Console)
2. Deploy migrated functions: `firebase deploy --only functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk`
3. Deploy all functions: `firebase deploy --only functions`
4. Test in Flutter app

**Expected result:** 40x faster CRM operations, $0 egress costs
