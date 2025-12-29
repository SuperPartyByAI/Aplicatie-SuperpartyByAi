# RAILWAY SERVICE CONFIGURATION - MANUAL STEPS

**Service URL:** https://railway.com/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f

**Status:** Service exists but needs configuration

---

## REQUIRED CONFIGURATION

### 1. Root Directory

Go to: Service Settings → Source

Set **Root Directory:** `whatsapp-backend`

This tells Railway to build from the whatsapp-backend subdirectory.

---

### 2. Environment Variables

Go to: Service → Variables

Add these variables:

```bash
# Firebase Admin SDK (from .github/secrets-backup/firebase-service-account.json)
GOOGLE_APPLICATION_CREDENTIALS_JSON=<paste entire JSON file content>

# Node environment
NODE_ENV=production
PORT=8080
```

**To get GOOGLE_APPLICATION_CREDENTIALS_JSON:**
```bash
cat /workspaces/Aplicatie-SuperpartyByAi/.github/secrets-backup/firebase-service-account.json
```

Copy the entire JSON output and paste as the value.

---

### 3. Build & Start Commands

Railway should auto-detect from railway.toml:
- **Build:** `npm install`
- **Start:** `node server.js`

If not auto-detected, set manually in Service Settings → Deploy.

---

### 4. Healthcheck

Should be auto-configured from railway.toml:
- **Path:** `/health`
- **Timeout:** 30s
- **Interval:** 20s

---

### 5. Deploy

After configuration:
1. Click "Deploy" button
2. Wait 2-3 minutes for build
3. Service will auto-start

---

## VERIFICATION

Once deployed, the service will have a public URL like:
```
https://<service-name>-<random>.up.railway.app
```

Test with:
```bash
curl https://YOUR-SERVICE-URL/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "commit": "c9269fed",
  "uptime": 123.45,
  "accounts": {
    "total": 0,
    "connected": 0
  }
}
```

---

## TROUBLESHOOTING

**Issue:** Build fails with "Cannot find module"
- **Solution:** Verify root directory is set to `whatsapp-backend`

**Issue:** Service crashes on start
- **Solution:** Check logs for Firebase credentials error. Verify GOOGLE_APPLICATION_CREDENTIALS_JSON is set correctly.

**Issue:** Health endpoint returns 404
- **Solution:** Service not deployed or wrong URL. Check Railway dashboard for actual service URL.

---

**Next:** After successful deploy, proceed to FAZA 2 (API validation).
