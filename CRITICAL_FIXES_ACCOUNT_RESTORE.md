# Critical Fixes - Account Restore + Error Handling

## Probleme Identificate

### 1. Account Restore - Doar "connected" ✅ FIXAT
**Problema:** `restoreAccountsFromFirestore()` restaura doar accounts cu status='connected', ignorând accounts în pairing phase (qr_ready, connecting, awaiting_scan).

**Impact:** După restart/redeploy, accounts în pairing phase dispar → getAccounts returnează 0 → regenerateQr dă 500 "Account not found".

**Fix Aplicat:**
- ✅ `restoreAccountsFromFirestore()` restaura acum TOATE accounts în pairing phase + connected
- ✅ `restoreSingleAccount()` restaura acum TOATE accounts în pairing phase + connected

**Before:**
```javascript
const snapshot = await db.collection('accounts').where('status', '==', 'connected').get();
```

**After:**
```javascript
// CRITICAL FIX: Restore ALL accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
const pairingStatuses = ['qr_ready', 'connecting', 'awaiting_scan', 'connected'];
const snapshot = await db.collection('accounts')
  .where('status', 'in', pairingStatuses)
  .get();
```

### 2. Error Handling - 500 Generic ✅ DEJA FIXAT
**Status:** regenerateQr returnează 404 pentru "Account not found" (nu 500 generic).

**Verificare:**
- ✅ Linia 3696: `return res.status(404).json({ error: 'account_not_found', ... })`
- ✅ Linia 3848-3860: Try-catch prinde toate excepțiile și returnează 500 cu mesaj structurat

### 3. Rate Limiting ✅ DEJA IMPLEMENTAT
**Status:** Rate limiting există: 30 requests/minute per IP.

**Verificare:**
- ✅ Linia 352-361: `qrRegenerateLimiter` - 30 requests/minute per IP

### 4. QR Validity Window ✅ DEJA IMPLEMENTAT
**Status:** QR validity window există: 60 seconds (WhatsApp standard).

**Verificare:**
- ✅ Linia 3743: `const QR_EXPIRY_MS = 60 * 1000;`
- ✅ Linia 3745-3756: Returnează QR existent dacă este valid (< 60s)

---

## Fix-uri Aplicate

### Fix 1: Account Restore - Include Pairing Phase
**File:** `whatsapp-backend/server.js:5490-5493`

**Modificări:**
1. ✅ Restaura TOATE accounts în pairing phase (qr_ready, connecting, awaiting_scan) + connected
2. ✅ Nu mai ignoră accounts în pairing phase după restart

**Before:**
```javascript
const snapshot = await db.collection('accounts').where('status', '==', 'connected').get();
```

**After:**
```javascript
// CRITICAL FIX: Restore ALL accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
const pairingStatuses = ['qr_ready', 'connecting', 'awaiting_scan', 'connected'];
const snapshot = await db.collection('accounts')
  .where('status', 'in', pairingStatuses)
  .get();
```

### Fix 2: restoreSingleAccount - Include Pairing Phase
**File:** `whatsapp-backend/server.js:4801-4804`

**Modificări:**
1. ✅ Restaura TOATE accounts în pairing phase (qr_ready, connecting, awaiting_scan) + connected
2. ✅ Nu mai ignoră accounts în pairing phase

**Before:**
```javascript
if (data.status !== 'connected') {
  console.log(`⚠️  [${accountId}] Account status is ${data.status}, skipping restore`);
  return;
}
```

**After:**
```javascript
// CRITICAL FIX: Restore accounts in pairing phase (qr_ready, connecting, awaiting_scan) + connected
const restorableStatuses = ['qr_ready', 'connecting', 'awaiting_scan', 'connected'];
if (!restorableStatuses.includes(data.status)) {
  console.log(`⚠️  [${accountId}] Account status is ${data.status}, skipping restore (not in restorable statuses: ${restorableStatuses.join(', ')})`);
  return;
}
```

---

## Teste

### Test 1: Account Restore după Restart
```bash
# 1. Add account → QR apare (status: qr_ready)
# 2. Restart Railway backend
# 3. Verifică Railway logs:
# Expected: 📦 Found X accounts in Firestore (statuses: qr_ready, connecting, awaiting_scan, connected)
# Expected: 🔄 [account_xxx] Restoring account (status: qr_ready)
# Expected: Account rămâne vizibil după restart
```

### Test 2: getAccounts după Restart
```bash
# 1. Add account → QR apare (status: qr_ready)
# 2. Restart Railway backend
# 3. Call getAccounts:
# Expected: accountsCount=1 (nu 0)
# Expected: Account status: qr_ready (nu dispare)
```

### Test 3: regenerateQr după Restart
```bash
# 1. Add account → QR apare (status: qr_ready)
# 2. Restart Railway backend
# 3. Call regenerateQr:
# Expected: 200 OK sau 202 "already in progress" (nu 500 "Account not found")
```

---

## Logs Expected (După Deploy)

### Railway Backend (După Restart)
```
🔄 Restoring accounts from Firestore...
📦 Found 1 accounts in Firestore (statuses: qr_ready, connecting, awaiting_scan, connected)
🔄 [account_xxx] Restoring account (status: qr_ready)
✅ Account restore complete: 1 accounts loaded
```

### getAccounts (După Restart)
```
📋 [GET /accounts/req_xxx] In-memory accounts: 1
📋 [GET /accounts/req_xxx] Firestore accounts: 1 total
📋 [GET /accounts/req_xxx] Total accounts: 1
✅ [GET /accounts/req_xxx] Response: 1 accounts, waMode=active
```

---

## Files Modified

1. ✅ `whatsapp-backend/server.js:5490-5493` - Account restore include pairing phase
2. ✅ `whatsapp-backend/server.js:4801-4804` - restoreSingleAccount include pairing phase

---

## Root Cause Summary

**Problema:** După restart/redeploy, accounts în pairing phase (qr_ready, connecting, awaiting_scan) nu erau restaurate → map-ul intern gol → regenerateQr dă 500 "Account not found".

**Fix:** 
- ✅ Restaura TOATE accounts în pairing phase + connected
- ✅ Accounts rămân vizibile după restart
- ✅ regenerateQr nu mai dă 500 "Account not found"

**Status:** Toate fix-urile sunt implementate și gata pentru deploy! 🚀
