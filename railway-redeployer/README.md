# Railway Redeployer - In-Platform Fallback

## Purpose

Automatic redeploy trigger when Railway autodeploy fails. Runs as separate Railway service, monitors health endpoint, triggers redeploy via GraphQL API.

## Setup (OPERATOR 1-CLICK)

### Step 1: Create Railway Token

1. Go to: https://railway.app/account/tokens
2. Click "Create Token"
3. Name: "Redeployer Token"
4. Copy token value

### Step 2: Get Service IDs

1. Go to your Railway project
2. Click on "whatsapp-backend" service
3. Click "Settings" tab
4. Copy "Service ID" (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
5. Copy "Environment ID" from URL or settings

### Step 3: Deploy Redeployer Service

1. In Railway project, click "New Service"
2. Select "GitHub Repo"
3. Select this repo: `Aplicatie-SuperpartyByAi`
4. Set Root Directory: `railway-redeployer`
5. Click "Deploy"

### Step 4: Set Environment Variables

In the new redeployer service, add these variables:

```
RAILWAY_TOKEN=<token from step 1>
TARGET_SERVICE_ID=<service ID from step 2>
TARGET_ENVIRONMENT_ID=<environment ID from step 2>
HEALTH_URL=https://whats-upp-production.up.railway.app/health
CHECK_INTERVAL_MS=300000
MISMATCH_THRESHOLD_MS=600000
```

### Step 5: Verify

Check redeployer logs:
```
🚀 Railway Redeployer started
   Target service: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Target environment: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Health URL: https://whats-upp-production.up.railway.app/health
   Check interval: 300000ms
   Mismatch threshold: 600000ms
📊 Status: commit=xxxxxxxx, uptime=XXXXs
```

## How It Works

1. **Monitor:** Checks `/health` every 5 minutes
2. **Detect:** If uptime > 2 hours (proxy for stuck deploy)
3. **Wait:** Waits 10 minutes to confirm mismatch
4. **Redeploy:** Triggers redeploy via Railway GraphQL API
5. **Reset:** Resets tracking after successful redeploy

## Manual Trigger

If you need to trigger redeploy manually:

1. Restart the redeployer service (it will check immediately on start)
2. OR set `MISMATCH_THRESHOLD_MS=0` temporarily (triggers immediately)

## Troubleshooting

### "GraphQL errors: Unauthorized"

- Token is invalid or expired
- Create new token with correct permissions
- Update `RAILWAY_TOKEN` env var

### "Failed to get deployments"

- `TARGET_SERVICE_ID` or `TARGET_ENVIRONMENT_ID` is wrong
- Verify IDs in Railway settings
- Ensure token has access to project

### Redeploy not triggering

- Check logs for errors
- Verify health endpoint is accessible
- Check uptime threshold (default 2 hours)
- Lower `MISMATCH_THRESHOLD_MS` for faster trigger

## Cost

- Minimal: ~$0.01/month (always-on service, low CPU/memory)
- Runs only GraphQL queries + HTTP checks
- No heavy processing

## Security

- Token should have minimal permissions (deploy only)
- Store token in Railway env vars (encrypted)
- Do not commit token to git

## Maintenance

- Monitor redeployer logs weekly
- Update token if expired
- Adjust thresholds based on deploy patterns

## Alternative: Railway CLI

If you prefer CLI over in-platform service:

```bash
# One-time setup
npm install -g @railway/cli
railway login

# Manual redeploy
railway redeploy --service whatsapp-backend

# Automated (cron)
0 */2 * * * railway redeploy --service whatsapp-backend
```

## Fallback: Force Push

If redeployer fails:

```bash
cd /path/to/repo
git commit --allow-empty -m "trigger: force redeploy"
git push origin main
```
