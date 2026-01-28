# DEPLOY RUNBOOK - Hetzner WhatsApp Backend

## Problem: Deploy Stuck (Commit Mismatch)

**Symptoms:**

- `/health` shows old commit hash
- New code not reflected in production
- Uptime keeps increasing (no restart)
- New endpoints return 404

**Detection:**

- Deploy Guard creates incident `deploy_stuck` after 10 minutes of mismatch
- Check: `curl https://whats-app-ompro.ro/health | jq '.commit'`
- Compare with: `git log --oneline -1` (latest commit)

---

## Solution A: SSH Deploy Script (RECOMMENDED)

**Steps:**

1. Connect to Hetzner server:
   ```bash
   ssh root@37.27.34.179
   ```

2. Navigate to backend directory:
   ```bash
   cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend
   ```

3. Run deploy script:
   ```bash
   RESTART_AFTER_UPDATE=true bash scripts/server-update-safe.sh
   ```

4. Wait 60-90 seconds for npm install + restart
5. Verify: `curl https://whats-app-ompro.ro/health | jq '.commit'`
6. Confirm commit hash matches latest

**If script doesn't restart automatically:**

```bash
sudo systemctl restart whatsapp-backend
```

---

## Solution B: Manual SSH Deploy

**One-time setup:**

```bash
ssh root@37.27.34.179
```

**Deploy commands:**

```bash
cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend

# Stash any local changes
git stash -u

# Fetch and checkout latest
git fetch origin cursor/baileys-fix
git checkout cursor/baileys-fix
git reset --hard origin/cursor/baileys-fix

# Install dependencies
npm ci

# Restart service
sudo systemctl restart whatsapp-backend
```

**Verify:**

```bash
curl https://whats-app-ompro.ro/health | jq '.commit'
```

**Check logs if deploy fails:**

```bash
sudo journalctl -u whatsapp-backend -f --lines 100
```

---

## Solution C: Force Push (Nuclear Option)

**When to use:** Server not detecting commits

```bash
cd /path/to/Aplicatie-SuperpartyByAi
git commit --allow-empty -m "trigger: force Hetzner redeploy"
git push origin cursor/baileys-fix
```

**Then SSH and deploy:**

```bash
ssh root@37.27.34.179
cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend
git pull origin cursor/baileys-fix
npm ci
sudo systemctl restart whatsapp-backend
```

**Wait 90 seconds, then verify:**

```bash
curl https://whats-app-ompro.ro/health | jq '.commit'
```

---

## Solution D: Manual Restart (Last Resort)

**SSH to server:**

```bash
ssh root@37.27.34.179
sudo systemctl restart whatsapp-backend
```

**Wait for service to come back up:**

```bash
sudo systemctl status whatsapp-backend
```

**Verify `/health`:**

```bash
curl https://whats-app-ompro.ro/health
```

**Note:** This does NOT deploy new code, only restarts current deployment.

---

## Verification Checklist

After any deploy solution:

```bash
# 1. Check commit hash
curl https://whats-app-ompro.ro/health | jq '.commit'

# 2. Check new endpoints (should NOT be 404)
curl "https://whats-app-ompro.ro/api/longrun/status-now?token=YOUR_TOKEN"

# 3. Check boot timestamp (should be recent)
curl https://whats-app-ompro.ro/health | jq '.bootTimestamp'

# 4. Check uptime (should be low, < 5 minutes)
curl https://whats-app-ompro.ro/health | jq '.uptime'
```

---

## Common Issues

### Issue: Build fails silently

**Symptoms:** Service shows "active" but code not updated

**Solution:**

1. Check systemd logs for errors:
   ```bash
   sudo journalctl -u whatsapp-backend -n 100
   ```
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

### Issue: Wrong branch

**Symptoms:** Deploy succeeds but code doesn't match

**Solution:**

1. Check current branch on server:
   ```bash
   ssh root@37.27.34.179
   cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend
   git branch
   ```
2. Verify branch matches deployment target (usually `cursor/baileys-fix`)
3. Checkout correct branch:
   ```bash
   git checkout cursor/baileys-fix
   git pull origin cursor/baileys-fix
   npm ci
   sudo systemctl restart whatsapp-backend
   ```

### Issue: Service won't start

**Symptoms:** `systemctl restart` fails or service crashes

**Solution:**

1. Check service status:
   ```bash
   sudo systemctl status whatsapp-backend
   ```
2. Check logs for errors:
   ```bash
   sudo journalctl -u whatsapp-backend -n 200
   ```
3. Common causes:
   - Port 8080 already in use
   - Missing environment variables
   - Firestore credentials invalid
4. Fix and restart:
   ```bash
   sudo systemctl restart whatsapp-backend
   sudo systemctl status whatsapp-backend
   ```

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

1. Check Hetzner server status via SSH
2. Verify network connectivity: `ping 37.27.34.179`
3. Check systemd service: `sudo systemctl status whatsapp-backend`
4. Review logs: `sudo journalctl -u whatsapp-backend -n 500`

---

## Post-Deploy Actions

After successful deploy:

1. **Verify evidence endpoints:**

   ```bash
   curl "https://whats-app-ompro.ro/api/longrun/status-now?token=YOUR_TOKEN"
   ```

2. **Run bootstrap:**

   ```bash
   curl -X POST "https://whats-app-ompro.ro/api/longrun/bootstrap?token=YOUR_TOKEN"
   ```

3. **Check Firestore docs created:**
   - wa_metrics/longrun/runs/{runKey}
   - wa_metrics/longrun/state/current
   - wa_metrics/longrun/probes/* (bootstrap probes)

4. **Monitor for 10 minutes:**
   - Check heartbeats continue
   - Check no new incidents
   - Check deploy guard doesn't trigger

---

## Rollback Procedure

**If new deploy breaks production:**

1. **SSH to server:**

   ```bash
   ssh root@37.27.34.179
   cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend
   ```

2. **Git revert:**

   ```bash
   git log --oneline -10  # Find last good commit
   git checkout <last-good-commit-hash>
   npm ci
   sudo systemctl restart whatsapp-backend
   ```

3. **Or revert in repo and redeploy:**

   ```bash
   git revert HEAD
   git push origin cursor/baileys-fix
   # Then follow Solution A or B above
   ```

4. **Verify rollback:**
   ```bash
   curl https://whats-app-ompro.ro/health
   ```

---

## Maintenance Window

**For major changes:**

1. Announce maintenance window
2. SSH to server and stop service (optional):
   ```bash
   sudo systemctl stop whatsapp-backend
   ```
3. Deploy changes (Solution A or B)
4. Test thoroughly
5. Start service if stopped:
   ```bash
   sudo systemctl start whatsapp-backend
   ```
6. Monitor for 30 minutes

---

## Logs Access

**SSH to server:**

```bash
ssh root@37.27.34.179
```

**Systemd logs:**

```bash
# Last 100 lines
sudo journalctl -u whatsapp-backend -n 100

# Follow logs (real-time)
sudo journalctl -u whatsapp-backend -f

# Filter by level
sudo journalctl -u whatsapp-backend -p err
```

**Application logs:**

```bash
# If logs are written to file
tail -f /var/log/whatsapp-backend/app.log
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
- ✅ No error logs in systemd

---

## Server Information

**Hetzner Server:**
- IP: `37.27.34.179`
- Domain: `https://whats-app-ompro.ro`
- Service: `whatsapp-backend` (systemd)
- Path: `/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`
- Branch: `cursor/baileys-fix`

**Health Check:**
```bash
curl https://whats-app-ompro.ro/health
```

---

**Last Updated:** 2026-01-28  
**Version:** 2.0 (Hetzner)  
**Maintainer:** Ona AI
