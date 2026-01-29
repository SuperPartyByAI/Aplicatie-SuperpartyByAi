# Firebase Functions deploy fix – summary

**Task:** Fix whatsapp legacy (Gen1→Gen2), CPU quota, sequential deploy.

---

## Files modified

| File | Changes |
|------|---------|
| `functions/index.js` | **Gen2 stub:** `exports.whatsapp` = `onRequest` (v2), region us-central1, 410 JSON. **No Gen1.** Comment: deploy only after `firebase functions:delete whatsapp --region us-central1 --force`. **Proxy:** `proxyOpts` → `memory: '128MiB'`, `cpu: 0.5`, `maxInstances: 1`. |
| `functions/processOutbox.js` | `maxInstances: 3` → `1`. |
| `scripts/firebase-deploy-functions-buckets.sh` | **whatsapp-proxy:** sequential deploy + sleep. **whatsapp-full:** `whatsappV4` + `processOutbox` only (no whatsapp). **whatsapp-stub:** `firebase deploy --only functions:whatsapp` + echo to delete Gen1 first. |
| `RUNBOOK_DEPLOY_PROD.md` | **C'')** Delete legacy Gen1 whatsapp then create Gen2 stub (CLI + GCP Console fallback). Troubleshooting updated. |

---

## What was done

- **whatsapp stub:** Gen2 `onRequest` only. **Delete Gen1 first**, then deploy; otherwise „Upgrading 1st Gen to 2nd Gen” fails. CLI: `firebase functions:delete whatsapp --region us-central1 --force`. Console fallback: Cloud Functions → 1st gen → whatsapp → Delete.
- **Proxy opts:** `memory: '128MiB'`, `cpu: 0.5`, `maxInstances: 1`.
- **processOutbox:** `maxInstances: 1`.
- **Deploy:** whatsapp-proxy sequential; whatsapp-full = whatsappV4 + processOutbox; whatsapp-stub = deploy whatsapp only (after delete).

---

## Deploy commands (exact)

```bash
nvm use 20
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# When prompted, paste: http://37.27.34.179:8080  (do not press Enter with empty value)

cd /Users/universparty/Aplicatie-SuperpartyByAi
./scripts/firebase-deploy-functions-buckets.sh whatsapp-proxy
./scripts/firebase-deploy-functions-buckets.sh whatsapp-full
./scripts/firebase-deploy-functions-buckets.sh ai

# whatsapp Gen2 stub (only after deleting Gen1):
# firebase delete often fails; use gcloud or GCP Console (RUNBOOK C''):
gcloud functions delete whatsapp --region=us-central1 --project=superparty-frontend --quiet
./scripts/firebase-deploy-functions-buckets.sh whatsapp-stub

# Verify 410:
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp"
```

**Verify:** `cd functions && npm ci && npm run build` passes. After delete + whatsapp-stub deploy, `curl` returns **410** + JSON deprecated.
