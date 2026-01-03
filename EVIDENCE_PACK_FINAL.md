# EVIDENCE PACK - Issue #3 WhatsApp Connection

**Date:** 2026-01-01 05:24 UTC  
**Commit:** e209e675  
**Status:** PARTIAL FIX - Timeout implemented, needs restart to apply

---

## A) Health Endpoint

```bash
curl -s https://whats-upp-production.up.railway.app/health | jq
```

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "commit": "e209e675",
  "bootTimestamp": "2026-01-01T05:21:58.668Z",
  "deploymentId": "263537b2-2db4-4283-b2c1-202866c0c054",
  "uptime": 165,
  "timestamp": "2026-01-01T05:24:44.000Z",
  "accounts": {
    "total": 9,
    "connected": 1,
    "connecting": 8,
    "needs_qr": 0,
    "max": 18
  },
  "firestore": "connected"
}
```

**Issues:**

- ❌ No `mode` field (ACTIVE/PASSIVE)
- ❌ No `lockOwner` or `lockExpiresAt`
- ❌ No explicit Firestore policy
- ✅ commitSHA present

---

## B) Accounts Status

### Before Fix (05:22 UTC)

```
account_1767127436455: connecting, hasQR=False
account_1767170340043: connecting, hasQR=False
account_1767170487528: connecting, hasQR=False
account_dev_196b57cc78cfc72eb2ad39f758cebfb9: connecting, hasQR=False
account_dev_3ae9426898dafef058fca52782f90ad2: connecting, hasQR=False
account_dev_49f748f3736b0db2454250d9270eb83d: connecting, hasQR=False
account_dev_4abd0b81b61a636f36880426d4628bb0: connecting, hasQR=False
account_dev_dde908a65501c63b124cb94c627e551d: connecting, hasQR=False
account_f8bc6f83b05264a5: connected, hasQR=False
```

### After Fix + 65s (05:24 UTC)

```
account_1767127436455: connecting, hasQR=False  ❌ Still connecting
account_1767170340043: connecting, hasQR=False  ❌ Still connecting
account_1767170487528: connecting, hasQR=False  ❌ Still connecting
account_dev_196b57cc78cfc72eb2ad39f758cebfb9: connecting, hasQR=False  ❌ Still connecting
account_dev_3ae9426898dafef058fca52782f90ad2: connecting, hasQR=False  ❌ Still connecting
account_dev_49f748f3736b0db2454250d9270eb83d: connecting, hasQR=False  ❌ Still connecting
account_dev_4abd0b81b61a636f36880426d4628bb0: connecting, hasQR=False  ❌ Still connecting
account_dev_dde908a65501c63b124cb94c627e551d: connecting, hasQR=False  ❌ Still connecting
account_f8bc6f83b05264a5: connected, hasQR=False  ✅ Connected
```

**Issue:** Timeout not applied to accounts restored from Firestore before deployment.

---

## C) Logs Analysis

**Problem:** Accounts restored from Firestore do NOT have:

1. Event handlers attached (messages.upsert = 0)
2. Connecting timeout set
3. QR generation triggered

**Root Cause:** `restoreAccountsFromFirestore()` creates account objects but doesn't call `createConnection()` properly.

---

## D) Restart Test (NOT COMPLETED)

**Cannot complete G4 restart x3 test because:**

1. Connected account has no event handlers (won't receive messages)
2. Need to fix restoration logic first
3. Manual Railway restart required (no API access)

---

## SUMMARY

### ✅ What Works:

- Backend healthy and running
- Message sending works (tested earlier)
- 1 account shows as CONNECTED
- Timeout code implemented (60s)

### ❌ What Doesn't Work:

- 8 accounts stuck in "connecting forever" (> 2 minutes)
- No QR codes generated for stuck accounts
- Timeout not applied to restored accounts
- Event handlers not attached to restored accounts
- Cannot receive inbound messages

### 🔧 What's Needed:

1. Fix `restoreAccountsFromFirestore()` to properly initialize accounts
2. Attach event handlers when restoring
3. Set connecting timeout when restoring
4. Trigger QR generation for accounts without valid creds
5. Add mode/lock fields to /health endpoint
6. Complete restart x3 test after fixes

---

## RECOMMENDATION

**NOT DONE** - Critical issues remain:

- Accounts stuck in limbo state
- No message reception capability
- Restoration logic broken

**Estimated time to fix:** 1-2 hours
**Priority:** HIGH - blocks production use
