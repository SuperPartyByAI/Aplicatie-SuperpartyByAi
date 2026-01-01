# DEPLOY RUNBOOK - Railway WhatsApp Backend

## Problem: Deploy Stuck (Commit Mismatch)

**Symptoms:**

- `/health` shows old commit hash
- New code not reflected in production
- Uptime keeps increasing (no restart)
- New endpoints return 404

**Detection:**

- Deploy Guard creates incident `deploy_stuck` after 10 minutes of mismatch
- Check: `curl https://whats-upp-production.up.railway.app/health | jq '.commit'`
- Compare with: `git log --oneline -1` (latest commit)

---

## Solution A: Railway UI (RECOMMENDED)

**Steps:**

1. Go to: https://railway.app/project/<your-project-id>
2. Click on "whatsapp-backend" service
3. Click "Deployments" tab
4. Find latest commit (check commit message matches GitHub)
5. Click "Redeploy" button
6. Wait 60-90 seconds for build + deploy
7. Verify: `curl https://whats-upp-production.up.railway.app/health | jq '.commit'`
8. Confirm commit hash matches latest

**If "Approval Required" appears:**

- Click "Approve" button
- Wait for deploy to complete

---

## Solution B: Railway CLI

**One-time setup:**

```bash
npm install -g @railway/cli
railway login
```

**Deploy commands:**

```bash
cd /path/to/Aplicatie-SuperpartyByAi
railway link  # Select project + service when prompted
railway up --service whatsapp-backend
```

**Verify:**

```bash
curl https://whats-upp-production.up.railway.app/health | jq '.commit'
```

**Check logs if deploy fails:**

```bash
railway logs --service whatsapp-backend
```

---

## Solution C: Force Push (Nuclear Option)

**When to use:** Railway not detecting commits

```bash
cd /path/to/Aplicatie-SuperpartyByAi
git commit --allow-empty -m "trigger: force Railway redeploy"
git push origin main
```

**Wait 90 seconds, then verify:**

```bash
curl https://whats-upp-production.up.railway.app/health | jq '.commit'
```

---

## Solution D: Manual Restart (Last Resort)

**Railway UI:**

1. Go to service settings
2. Click "Restart" button
3. Wait for service to come back up
4. Verify `/health`

**Note:** This does NOT deploy new code, only restarts current deployment.

---

## Verification Checklist

After any deploy solution:

```bash
# 1. Check commit hash
curl https://whats-upp-production.up.railway.app/health | jq '.commit'

# 2. Check new endpoints (should NOT be 404)
curl "https://whats-upp-production.up.railway.app/api/longrun/status-now?token=YOUR_TOKEN"

# 3. Check boot timestamp (should be recent)
curl https://whats-upp-production.up.railway.app/health | jq '.bootTimestamp'

# 4. Check uptime (should be low, < 5 minutes)
curl https://whats-upp-production.up.railway.app/health | jq '.uptime'
```

---

## Common Issues

### Issue: Build fails silently

**Symptoms:** Railway shows "Deploying..." but never completes

**Solution:**

1. Check Railway build logs for errors
2. Common causes:
   - Missing dependencies in package.json
   - Syntax errors in new code
   - Environment variables not set
3. Fix errors locally first:
   ```bash
   cd whatsapp-backend
   npm install
   node -c server.js  # Check syntax
   npm start  # Test locally
   ```

### Issue: Wrong root directory

**Symptoms:** Railway builds but doesn't find code

**Solution:**

1. Check railway.json or railway.toml
2. Verify `build.buildCommand` includes `cd whatsapp-backend`
3. Verify `deploy.startCommand` includes `cd whatsapp-backend`

### Issue: Watch paths too restrictive

**Symptoms:** Changes to certain files don't trigger deploy

**Solution:**

1. Railway Settings → Watch Paths
2. Ensure includes: `whatsapp-backend/**`
3. Or remove watch paths to watch entire repo

---

## Prevention: Deploy Guard

**Automatic detection:**

- Deploy Guard checks every 5 minutes
- Creates incident if mismatch > 10 minutes
- Incident includes:
  - Expected commit
  - Deployed commit
  - Duration of mismatch
  - Remediation steps

**Check incidents:**

```bash
# Via Firestore console
# Collection: wa_metrics/longrun/incidents
# Filter: type == "deploy_stuck"
```

---

## Emergency Contacts

**If all solutions fail:**

1. Check Railway status page: https://status.railway.app
2. Check Railway Discord: https://discord.gg/railway
3. File Railway support ticket with:
   - Project ID
   - Service name
   - Commit hash stuck on
   - Expected commit hash
   - Build logs (if available)

---

## Post-Deploy Actions

After successful deploy:

1. **Verify evidence endpoints:**

   ```bash
   curl "https://whats-upp-production.up.railway.app/api/longrun/status-now?token=YOUR_TOKEN"
   ```

2. **Run bootstrap:**

   ```bash
   curl -X POST "https://whats-upp-production.up.railway.app/api/longrun/bootstrap?token=YOUR_TOKEN"
   ```

3. **Check Firestore docs created:**
   - wa_metrics/longrun/runs/{runKey}
   - wa_metrics/longrun/state/current
   - wa_metrics/longrun/probes/\* (bootstrap probes)

4. **Monitor for 10 minutes:**
   - Check heartbeats continue
   - Check no new incidents
   - Check deploy guard doesn't trigger

---

## Rollback Procedure

**If new deploy breaks production:**

1. **Railway UI:**
   - Go to Deployments
   - Find last known good deployment
   - Click "Redeploy"

2. **Git revert:**

   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Verify rollback:**
   ```bash
   curl https://whats-upp-production.up.railway.app/health
   ```

---

## Maintenance Window

**For major changes:**

1. Announce maintenance window
2. Set service to "Sleep" in Railway (optional)
3. Deploy changes
4. Test thoroughly
5. Wake service
6. Monitor for 30 minutes

---

## Logs Access

**Railway UI:**

- Service → Logs tab
- Filter by level (error, warn, info)
- Search for specific terms

**Railway CLI:**

```bash
railway logs --service whatsapp-backend --tail 100
railway logs --service whatsapp-backend --follow
```

**Firestore incidents:**

```
Collection: wa_metrics/longrun/incidents
Query: ORDER BY tsStart DESC LIMIT 10
```

---

## Success Criteria

Deploy is successful when:

- ✅ `/health` commit == latest GitHub commit
- ✅ New endpoints return 200 (not 404)
- ✅ Boot timestamp is recent (< 5 min ago)
- ✅ Uptime is low (< 5 minutes)
- ✅ No deploy_stuck incidents
- ✅ Heartbeats continue writing
- ✅ No error logs in Railway

---

**Last Updated:** 2025-12-29  
**Version:** 1.0  
**Maintainer:** Ona AI
