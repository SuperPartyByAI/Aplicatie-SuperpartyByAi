# Staff Inbox Setup & Verification

## Overview

Staff Inbox (Inbox Angajați) requires:
1. **Cloud Run IAM** - Services must be publicly invokable (allUsers -> roles/run.invoker)
2. **Functions Proxy** - Must forward Authorization header to Hetzner backend
3. **Flutter** - Must send Firebase ID token in Authorization header
4. **RBAC** - User must have staff profile in Firestore (`staffProfiles/{uid}`) or be admin

## Quick Setup

### 1. Deploy Functions

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase use superparty-frontend
firebase deploy --only functions:whatsappProxyGetAccountsStaff,functions:whatsappProxyGetInbox
```

### 2. Apply Cloud Run IAM (REQUIRED)

**Linux/Mac:**
```bash
./scripts/cloudrun_make_public.sh
```

**Windows PowerShell:**
```powershell
.\scripts\cloudrun_make_public.ps1
```

**Manual (if scripts fail):**
```bash
PROJECT_ID="superparty-frontend"
REGION="us-central1"

gcloud run services add-iam-policy-binding whatsappproxygetaccountsstaff \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID"

gcloud run services add-iam-policy-binding whatsappproxygetinbox \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID"
```

### 3. Verify IAM

```bash
# List services
gcloud run services list --project superparty-frontend --region us-central1 | grep -i whatsappproxy

# Check IAM policies
gcloud run services get-iam-policy whatsappproxygetaccountsstaff --region us-central1 --project superparty-frontend | grep -E "allUsers|run.invoker"
gcloud run services get-iam-policy whatsappproxygetinbox --region us-central1 --project superparty-frontend | grep -E "allUsers|run.invoker"
```

**Expected output:** Should see `allUsers` with `roles/run.invoker`

### 4. Smoke Test (No Token)

```bash
# Should get 401 from your app (not Cloud Run error)
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccountsStaff"
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetInbox?accountId=TEST"
```

**Expected:** 401 with JSON body `{"success": false, "error": "missing_auth_token", ...}`

**If you see:** HTML page with "The request was not authenticated/authorized to invoke this service" → IAM not configured correctly

### 5. Verify Staff Profile (RBAC)

If you get 403 `employee_only`, user needs staff profile:

```bash
# Check if user has staff profile
firebase firestore:get staffProfiles/{USER_UID}

# Or create one (if you have admin access)
# In Firestore console: Create document at staffProfiles/{USER_UID} with:
# {
#   "role": "staff" | "gm" | "admin",
#   "createdAt": <timestamp>,
#   ...
# }
```

**Admin emails** (auto-allowed, no Firestore doc needed):
- `ursache.andrei1995@gmail.com` (super admin)
- Emails in `ADMIN_EMAILS` env var (comma-separated)

## Verification Checklist

### A. IAM Configuration
- [ ] `gcloud run services get-iam-policy whatsappproxygetaccountsstaff` shows `allUsers` + `roles/run.invoker`
- [ ] `gcloud run services get-iam-policy whatsappproxygetinbox` shows `allUsers` + `roles/run.invoker`
- [ ] `curl` without token returns 401 JSON (not Cloud Run HTML error)

### B. Functions Logs
After opening Staff Inbox in app:

```bash
firebase functions:log --only whatsappProxyGetAccountsStaff --lines 60
firebase functions:log --only whatsappProxyGetInbox --lines 60
```

**Expected logs:**
- `[whatsappProxy/getAccountsStaff] Calling backend: ...`
- `[whatsappProxy/forwardRequest] Forwarding Authorization header (prefix: ...)`
- NOT: "The request was not authenticated/authorized to invoke this service"

### C. Flutter App Logs
When opening Staff Inbox, should see:
```
[WhatsAppApiService] getAccountsStaff: BEFORE request | ... | tokenPresent=true | ...
[WhatsAppApiService] getAccountsStaff: AFTER response | statusCode=200 | ...
```

**If statusCode=401:**
- `error: "missing_auth_token"` → Token not sent from Flutter
- `error: "unauthorized"` → Token invalid/expired

**If statusCode=403:**
- `error: "employee_only"` → User not in staffProfiles or admin list

### D. Backend Health
```bash
curl -s http://37.27.34.179:8080/health
```

**Expected:**
```json
{
  "ok": true,
  "status": "healthy",
  "service": "whatsapp-backend",
  "version": "2.0.0",
  "commit": "...",
  "firestore": "connected",
  ...
}
```

## Troubleshooting

### Problem: "The request was not authenticated/authorized to invoke this service"

**Cause:** Cloud Run IAM not configured

**Fix:**
1. Run `./scripts/cloudrun_make_public.sh` (or `.ps1` on Windows)
2. Verify with `gcloud run services get-iam-policy ...`
3. Wait 1-2 minutes for IAM changes to propagate

### Problem: 401 "missing_auth_token"

**Cause:** Flutter not sending Authorization header

**Check:**
- Flutter logs show `tokenPresent=true` in BEFORE request
- `_requireIdToken()` is called before request
- User is logged in (`FirebaseAuth.instance.currentUser != null`)

### Problem: 401 "unauthorized" / "Missing token" (from Hetzner)

**Cause:** Authorization header not forwarded from Functions to Hetzner

**Check Functions logs:**
- Should see `[whatsappProxy/forwardRequest] Forwarding Authorization header`
- If you see "No Authorization header in options.headers" → handler not extracting header correctly

**Fix:** Verify `getAccountsStaffHandler` and `getInboxHandler` extract `authHeader` from `req.headers.authorization || req.headers.Authorization`

### Problem: 403 "employee_only"

**Cause:** User not in staffProfiles or admin list

**Fix:**
1. Add user to `staffProfiles/{uid}` in Firestore with `role: "staff"` (or "gm"/"admin")
2. OR add user email to `ADMIN_EMAILS` env var in Functions
3. OR user email is `ursache.andrei1995@gmail.com` (super admin)

### Problem: 503 from Hetzner

**Cause:** Backend in PASSIVE mode or Firestore unavailable

**Check:**
- `curl http://37.27.34.179:8080/health` → `firestore: "connected"`
- `curl http://37.27.34.179:8080/ready` → `mode: "active"`

## Outputs for Verification

After setup, provide these outputs:

```bash
# 1. Services list
gcloud run services list --region us-central1 --project superparty-frontend | grep -i whatsappproxy

# 2. IAM policies
gcloud run services get-iam-policy whatsappproxygetinbox --region us-central1 --project superparty-frontend | grep -E "allUsers|run.invoker"
gcloud run services get-iam-policy whatsappproxygetaccountsstaff --region us-central1 --project superparty-frontend | grep -E "allUsers|run.invoker"

# 3. Smoke test (no token)
curl -i https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccountsStaff

# 4. Functions logs (after opening Staff Inbox in app)
firebase functions:log --only whatsappProxyGetAccountsStaff --lines 60

# 5. Backend health
curl -s http://37.27.34.179:8080/health
```

Plus Flutter logs (10-20 lines) when opening Staff Inbox showing:
- `getAccountsStaff: BEFORE ... tokenPresent=...`
- `getAccountsStaff: AFTER ... statusCode=...`
