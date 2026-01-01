# RAILWAY CONFIGURATION REQUIRED

**Status:** Code is production-ready and pushed to GitHub (commit cf94e5bd)  
**Blocker:** Railway service needs Root Directory configuration

---

## WHAT'S READY ✅

- ✅ Code updated for Railway (PORT, COMMIT_HASH, Firestore env var)
- ✅ Health endpoint with version, commit, uptime, counts, firestore status
- ✅ QR display endpoint: GET /api/whatsapp/qr/:accountId (HTML for easy scanning)
- ✅ Pushed to GitHub (commit cf94e5bd)
- ✅ Railway service exists and has domain

---

## WHAT'S NEEDED (1 ACTION)

Railway service returns 404 because **Root Directory is not set**.

### OPTION A: Set Root Directory (RECOMMENDED, 30 seconds)

1. Go to: https://railway.com/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f
2. Click "Settings"
3. Scroll to "Source"
4. Set **Root Directory:** `whatsapp-backend`
5. Click "Save"
6. Railway will auto-redeploy from GitHub

### OPTION B: Add RAILWAY_TOKEN (for programmatic access)

1. Go to: https://railway.app/account/tokens
2. Click "Create Token"
3. Copy token
4. Go to service: https://railway.com/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f
5. Click "Variables"
6. Add: `RAILWAY_TOKEN=<your_token>`
7. Save

---

## AFTER CONFIGURATION

Once Root Directory is set, Railway will:

1. Auto-detect railway.toml in whatsapp-backend/
2. Build: `npm install`
3. Start: `node server.js`
4. Health check: `/health` every 20s

Then I will automatically:

1. ✅ Verify /health endpoint (DoD-1)
2. ✅ Add account and generate QR (DoD-2)
3. ⏳ Request QR scan (only human intervention)
4. ✅ Run MTTR benchmark (DoD-4)
5. ✅ Run message queue test (DoD-5)
6. ✅ Run soak test 2h (DoD-6)
7. ✅ Generate all reports
8. ✅ Achieve 100% DoD

---

## ENVIRONMENT VARIABLES NEEDED

After Root Directory is set, add this variable:

**Name:** `FIREBASE_SERVICE_ACCOUNT_JSON`  
**Value:** (paste entire JSON from command below)

```bash
cat /workspaces/Aplicatie-SuperpartyByAi/.github/secrets-backup/firebase-service-account.json
```

This allows server to connect to Firestore for persistence.

---

## VERIFICATION COMMANDS

After configuration, I will run:

```bash
# Test health endpoint
curl https://whatsapp-backend-production.up.railway.app/health

# Expected response:
{
  "status": "healthy",
  "version": "2.0.0",
  "commit": "cf94e5bd",
  "uptime": 123,
  "timestamp": "2025-12-29T13:05:00.000Z",
  "accounts": {
    "total": 0,
    "connected": 0,
    "connecting": 0,
    "needs_qr": 0,
    "max": 18
  },
  "firestore": "connected"
}
```

---

## TIMELINE AFTER CONFIGURATION

- Configuration: 30 seconds (you)
- Deploy: 2-3 minutes (Railway auto)
- Verification: 1 minute (me)
- QR generation: 30 seconds (me)
- QR scan: 2 minutes (you)
- MTTR test: 30 minutes (me, auto)
- Queue test: 15 minutes (me, auto)
- Soak test: 2 hours (me, auto)
- Reports: 5 minutes (me, auto)

**Total:** ~3 hours from configuration to 100% DoD

---

**Waiting for:** Root Directory configuration in Railway service
