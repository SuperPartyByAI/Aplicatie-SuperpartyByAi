# Old `whatsapp` Function – Stub vs Delete

## Current approach (recommended): Stub

We now export a **Gen1 stub** `whatsapp` that returns **410 Deprecated**. Deploy no longer tries to delete the old function; it updates it. Unblock deploy without manual delete.

See **`docs/FIREBASE_FUNCTIONS_DEPLOY_FIXES.md`** for deploy buckets and cleanup.

---

## Optional: Delete `whatsapp` manually

If you want to remove the legacy function entirely (after deploy works with stub):

### Via Firebase / GCP Console

### Step-by-Step Instructions

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Login with your Google account

2. **Select Project**
   - Click on project: **`superparty-frontend`**

3. **Navigate to Functions**
   - Click **"Functions"** in the left sidebar
   - You'll see a list of deployed functions

4. **Find the Old Function**
   - Look for: **`whatsapp`**
   - Region: `us-central1`
   - Generation: **1st gen** (Node.js 20)
   - Memory: 2048 MB

5. **Delete the Function**
   - Click the **3 dots menu** (⋮) on the right side of the `whatsapp` function row
   - Select **"Delete"**
   - Confirm deletion when prompted

6. **Wait for Deletion**
   - Deletion takes ~30 seconds
   - Refresh the Functions list to confirm it's gone

---

## After Manual Deletion

Once the old function is deleted, deploy the new functions:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase deploy --only functions
```

---

## Verification Commands

After successful deployment:

```bash
# List all deployed functions
firebase functions:list | grep -E "whatsapp"

# Expected output:
# whatsappV4 (v2, us-central1) - replacement for old whatsapp
# whatsappExtractEventFromThread (v2, us-central1)
# whatsappProxy* functions (v2, us-central1)

# View logs (correct syntax with --lines)
firebase functions:log --only whatsappV4 --lines 100
firebase functions:log --only whatsappExtractEventFromThread --lines 100
```

---

## Technical Details

**Old function (to be deleted):**
- Name: `whatsapp`
- Region: `us-central1`
- Generation: **1st Gen (v1)**
- Memory: 2048 MB
- Runtime: Node.js 20
- Trigger: HTTPS
- **Status:** Must be manually deleted

**Replacement (already in code):**
- Name: `whatsappV4`
- Generation: **2nd Gen (v2)**
- Memory: 512 MiB
- maxInstances: 2 (reduced from 10)
- Runtime: Node.js 20
- Trigger: HTTPS
- **Status:** Ready to deploy after v1 deletion

---

### Via CLI

```bash
firebase functions:delete whatsapp --region us-central1 --force
```

If that fails, use GCP Console below.

### Google Cloud Console

If Firebase Console doesn't work, use Google Cloud Console:

1. Go to: https://console.cloud.google.com/
2. Select project: **`superparty-frontend`**
3. Navigate to: **Cloud Functions** → **1st gen** tab
4. Find: `whatsapp` (us-central1)
5. Select checkbox → Click **DELETE** button
6. Confirm deletion

---

## Status

✅ **Stub in place** – `whatsapp` returns 410; deploy not blocked  
⏭️ **Optional** – Delete via Console/CLI if you want to remove the function entirely; then remove the stub export from `index.js`

