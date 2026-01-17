# Manual Step Required: Delete Old `whatsapp` Function

## Problem

Firebase does not allow automatic upgrade from v1 (1st Gen) to v2 (2nd Gen) functions.
The old `whatsapp(us-central1)` function must be manually deleted before deployment can proceed.

## Solution

### Option 1: Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `superparty-frontend`
3. Navigate to: **Functions** (left sidebar)
4. Find function: `whatsapp` (us-central1, Node.js 20, 1st Gen)
5. Click the **3 dots menu** → **Delete**
6. Confirm deletion

### Option 2: Firebase CLI (If interactive mode available)

```bash
firebase functions:delete whatsapp --region us-central1
```

**Note:** This requires interactive confirmation (y/n), which may not work in non-interactive terminals.

### Option 3: Direct Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `superparty-frontend`
3. Navigate to: **Cloud Functions** → **1st gen**
4. Find: `whatsapp` (us-central1)
5. Select checkbox → **DELETE**

---

## After Deletion

Once the old function is deleted, run:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase deploy --only functions
```

The deployment will now succeed without the v1→v2 upgrade conflict.

---

## Technical Details

**Old function (to be deleted):**
- Name: `whatsapp`
- Region: `us-central1`
- Generation: **1st Gen (v1)**
- Memory: 2048 MB
- Runtime: Node.js 20
- Trigger: HTTPS

**Replacement (already in code):**
- Name: `whatsappV4`
- Generation: **2nd Gen (v2)**
- Memory: 512 MiB
- maxInstances: 2 (reduced from 10)
- Runtime: Node.js 20
- Trigger: HTTPS

---

## Status

**Current state:** Code changes complete, deployment blocked by v1→v2 upgrade limitation.

**Next step:** Manual deletion of old `whatsapp` function via Firebase Console.

**After deletion:** Run `firebase deploy --only functions` to deploy all hardening changes.
