# Runbook: Deploy WhatsApp CRM to Production

**Date:** 2026-01-26  
**Branch:** `main`  
**Status:** Ready for production deployment  
**Backend:** Hetzner (generic backend base URL). No legacy hosting dependency.

---

## 📋 **Pre-Deployment Checklist**

### **A) GitHub / PR**

- [ ] PR to `main` created and merged
- [ ] WhatsApp backend (Hetzner) runs **1 single instance** (until ownership/lease is complete on all accounts)

---

### **B) Firebase Deploy (REQUIRED before UI)**

**Commands:**
```bash
# 1. List projects
firebase projects:list

# 2. Select project
firebase use <PROJECT_ID>

# 3. Deploy rules, indexes, and functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

**Verification in Firebase Console:**
- [ ] Firestore Indexes = **Ready** (all indexes built)
- [ ] Functions = **Deployed** (check logs for errors)
- [ ] Rules active (verify `clients/messages/threads` "never delete" policies)

---

### **C) Firebase Secrets (REQUIRED for Functions)**

**Set secrets used by Functions.** La prompt **nu apăsa Enter gol** – lipește întotdeauna valoarea, altfel apare „Secret Payload cannot be empty”.

```bash
# WhatsApp backend base URL (Hetzner or your backend host)
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# Value: http://37.27.34.179:8080 (lipit la prompt, nu Enter gol)

# AI provider key (if used in extraction/ask)
firebase functions:secrets:set OPENAI_API_KEY
# OR: GROQ_API_KEY (depends on your AI provider in functions)

# Optional: Admin emails (if using staffProfiles check)
firebase functions:secrets:set ADMIN_EMAILS
# Value: comma-separated emails
```

**Verify secrets:**
```bash
firebase functions:secrets:list
```

---

### **C') Firebase Functions deploy (Node 20 + buckets)**

**Recomandat:** Rulează deploy cu **Node 20** (nvm) și bucket-uri pentru a evita CPU quota și izola eșecurile.

```bash
# 0) Node 20 (obligatoriu pentru Firebase Functions)
nvm install 20
nvm use 20
node -v   # trebuie v20.x.x

# 1) Secret backend URL – NU apăsa Enter gol! La prompt lipește valoarea.
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# Când cere valoarea, lipește exact: http://37.27.34.179:8080

# 2) Deploy pe bucket-uri (din root repo)
cd /Users/universparty/Aplicatie-SuperpartyByAi
./scripts/firebase-deploy-functions-buckets.sh whatsapp-proxy
./scripts/firebase-deploy-functions-buckets.sh whatsapp-full
./scripts/firebase-deploy-functions-buckets.sh ai

# 3) whatsapp Gen2 stub (doar după ștergerea Gen1 – vezi C''):
#    firebase functions:delete whatsapp --region us-central1 --force
#    ./scripts/firebase-deploy-functions-buckets.sh whatsapp-stub
```

**Bucket-uri:** `whatsapp-proxy` | `whatsapp-full` | `whatsapp-stub` | `ai` | `staff` | `all`. Vezi `scripts/firebase-deploy-functions-buckets.sh`.

---

### **C'') Delete legacy Gen1 whatsapp, then create Gen2 stub**

Funcția **whatsapp(us-central1)** din cod e **Gen2** stub (410 JSON). Firebase **nu permite upgrade** Gen1→Gen2; trebuie să **ștergi** mai întâi Gen1, apoi să deployezi stub-ul.

**Dacă apare „undergoing 2nd Gen upgrade … can not be deleted”:** upgrade-ul a rămas blocat. **Anulează mai întâi** upgrade-ul, apoi șterge.

**Pasul 0 – Abort upgrade (doar dacă delete dă „undergoing 2nd Gen upgrade”):**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://cloudfunctions.googleapis.com/v2/projects/superparty-frontend/locations/us-central1/functions/whatsapp:abortFunctionUpgrade"
```
Așteaptă câteva secunde, apoi treci la **Pasul 1**.

**Pasul 1 – Șterge Gen1**

**A) gcloud:**
```bash
gcloud functions delete whatsapp --region=us-central1 --project=superparty-frontend --quiet
```

**B) Firebase CLI:** `firebase functions:delete whatsapp --region us-central1 --force`  
Dacă vezi `failed to delete` sau `undergoing upgrade` → rulează **Pasul 0**, apoi **A)** din nou.

**C) GCP Console (dacă CLI / gcloud eșuează):**
1. [Cloud Functions – superparty-frontend](https://console.cloud.google.com/functions/list?project=superparty-frontend).
2. Filtrează **1st gen** → **whatsapp** → **Delete**.

**Pasul 2 – Deploy Gen2 stub (doar după ștergere):**
```bash
nvm use 20
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase deploy --only "functions:whatsapp"
# sau: ./scripts/firebase-deploy-functions-buckets.sh whatsapp-stub
```

**Verificare:** `firebase functions:list` → whatsapp (2nd gen). Apoi:
```bash
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp"
```
Trebuie **410** + JSON `{"success":false,"error":"deprecated","message":"This endpoint is deprecated. Use whatsappProxy* endpoints."}`.  
*(Dacă proiectul e altul, înlocuiește `superparty-frontend` în URL.)*

**Notă:** `whatsapp-full` **nu** include `whatsapp`; deployează doar `whatsappV4` + `processOutbox`. Stub-ul `whatsapp` se deployează separat după ștergerea Gen1.

**Troubleshooting (Functions):**
- **"Secret Payload cannot be empty"** – ai apăsat Enter fără valoare. Rulează din nou `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL` și lipește `http://37.27.34.179:8080`.
- **"Upgrading from 1st Gen to 2nd Gen is not yet supported"** – Gen1 `whatsapp` încă există. Șterge-o cu **gcloud** sau **GCP Console** (vezi **C'')**), apoi `firebase deploy --only functions:whatsapp`. `firebase functions:delete` poate eșua → folosește Console.
- **"Quota exceeded for total allowable CPU"** – proxy secvențial (whatsapp-proxy); `FIREBASE_DEPLOY_SLEEP=5` dacă e nevoie.

---

### **Fix 403 on /whatsapp (legacy public stub)**

**Symptoms:** `curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp` returns **HTTP 403 Forbidden** (HTML from Google Frontend), not 410 JSON.

**Why:** Invoker auth is required. **Gen2** functions deploy to Cloud Run; unauthenticated callers get 403 unless `invoker: 'public'` (code) or IAM `allUsers` + `roles/run.invoker` (gcloud) is set. **Gen1** uses `roles/cloudfunctions.invoker` for `allUsers`.

**Goal:** `/whatsapp` is a **public legacy stub** returning 410 JSON (deprecated). Unauthenticated access only for this endpoint. **Do not change whatsappProxy\***; they stay secured.

---

**1) Gen1 vs Gen2 (from code)**

| Source | Conclusion |
|--------|------------|
| `functions/index.js` | `exports.whatsapp` uses `onRequest` from `firebase-functions/v2/https` → **Gen2** (Cloud Run). |

If it used `firebase-functions/v1` and `functions.region().https.onRequest`, it would be **Gen1**.

---

**2) Gen2 – unauthenticated access**

**A) In code (preferred):** `onRequest({ region, invoker: 'public', ... }, handler)`. The stub already sets `invoker: 'public'`. Redeploy:

```bash
firebase deploy --only functions:whatsapp
```

**B) Fallback (if 403 persists):** Grant Cloud Run Invoker to `allUsers`:

```bash
gcloud run services add-iam-policy-binding whatsapp \
  --region=us-central1 \
  --member='allUsers' \
  --role='roles/run.invoker' \
  --project=superparty-frontend
```

List services if the name differs:

```bash
gcloud run services list --region=us-central1 --project=superparty-frontend
```

**Verify IAM:**

```bash
gcloud run services get-iam-policy whatsapp --region=us-central1 --project=superparty-frontend --format=json | grep -A2 allUsers
```

---

**3) Gen1 (only if whatsapp were Gen1)**

```bash
gcloud functions add-invoker-policy-binding whatsapp \
  --region=us-central1 \
  --member='allUsers' \
  --project=superparty-frontend
```

---

**4) Verification**

```bash
curl -i "https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp"
curl -i "https://whatsapp-168752018174.us-central1.run.app"
```

*(Replace `168752018174` with your project number if different; see `gcloud run services list`.)*

**Expected:** `HTTP/1.1 410 Gone` and JSON:

```json
{"success":false,"error":"deprecated","message":"This endpoint is deprecated. Use whatsappProxy* endpoints."}
```

---

**5) How to verify (checklist)**

- [ ] `functions/index.js`: `exports.whatsapp` uses `onRequest` from `firebase-functions/v2/https` (Gen2) and `invoker: 'public'`.
- [ ] Deploy: `firebase deploy --only functions:whatsapp`.
- [ ] `curl -i https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp` → **410** + JSON.
- [ ] `curl -i https://whatsapp-168752018174.us-central1.run.app` → **410** + JSON.
- [ ] If 403: run `gcloud run services add-iam-policy-binding whatsapp ...` (see 2B), then re-check curl.
- [ ] whatsappProxy* endpoints unchanged and remain secured.

---

### **D) Hetzner Backend (WhatsApp)**

**Runtime:**
- [ ] WhatsApp backend (`whatsapp-backend`) deployed on Hetzner (or your host)
- [ ] Persistent storage for sessions (e.g. `/app/sessions`)
- [ ] Env: `SESSIONS_PATH`, `FIREBASE_SERVICE_ACCOUNT_JSON`, etc.

**Deploy (path-agnostic):** Repo path can vary (e.g. `/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend`). Use `systemctl cat whatsapp-backend` to get `WorkingDirectory`, then deploy there. See **`whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`** → **Deploy on Hetzner** for SSH one-liners (`git pull`, `npm ci`, `systemctl restart`, `curl …/diag`). **If `git pull` fails with `Permission denied (publickey)`:** use **Fix Hetzner deployment (git pull fails: deploy key)** in that runbook (deploy key, HTTPS+PAT, or SCP fallback). **If `curl …/diag` returns 404:** server is old; fix deploy path/restart or deploy key first.

**Post-Deploy Log Checks:**
- [ ] "sessions dir exists/writable: true"
- [ ] "Firebase initialized"
- [ ] `GET /health` returns 200
- [ ] `GET /diag` returns 200 JSON (not 404)

---

### **E) Flutter (Post-UI) – Integration & Security**

**Confirm:**
- [ ] App uses same Firebase project as Functions/Firestore
- [ ] Send uses `sendViaProxy()` (NOT direct Firestore outbox writes)
- [ ] Event creation respects rules (`createdBy`, `schemaVersion`, `isArchived=false`)
- [ ] Inbox/Chat queries use correct fields (`orderBy` on existing fields)

---

### **F) Acceptance Tests (Minimal before 30 accounts)**

**Test Setup:** 2 WhatsApp accounts (2 phones) + 1 client (1 phone)

**Tests:**
1. **Thread Isolation:** Same client → WA-01 and WA-02 → 2 separate threads in Firestore
2. **Receive:** Client sends → appears in Chat (Firestore + UI realtime)
3. **Send:** Send from app → client receives → status updates in Firestore
4. **CRM Extraction:** Extract Event → draft OK → Save → `evenimente/{eventId}`
5. **CRM Ask AI:** Ask "Cât a cheltuit clientul X?" → answer consistent with aggregates

---

## 🔧 **Deployment Steps (Order)**

### **Step 1: Merge PR to Main**
```bash
# GitHub: Create PR → main, review and merge
```

### **Step 2: Firebase Deploy**
```bash
firebase use <PROJECT_ID>
# Secrets: firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL → paste http://37.27.34.179:8080
# Deploy rules/indexes:
firebase deploy --only firestore:rules,firestore:indexes
# Deploy Functions (Node 20 + buckets): vezi C') mai sus
./scripts/firebase-deploy-functions-buckets.sh whatsapp-proxy
./scripts/firebase-deploy-functions-buckets.sh whatsapp-full
./scripts/firebase-deploy-functions-buckets.sh ai
```

### **Step 3: Hetzner Backend**
- Deploy `whatsapp-backend` to Hetzner (or your host). **Path-agnostic:** run `systemctl cat whatsapp-backend` on server to get `WorkingDirectory`; use that dir for `git pull` + `npm ci --omit=dev` + `systemctl restart whatsapp-backend`. See **`whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`** → **Deploy on Hetzner** for SSH one-liners.
- Configure sessions volume + env vars
- Verify `GET /health` 200 and `GET /diag` 200 JSON. **If /diag returns 404,** deploy path or restart is wrong; redeploy in `WorkingDirectory` and restart.

### **Step 4: Flutter Build & Test**
- Build Flutter app (uses Firebase project from env)
- Test: Pair account → Inbox → Chat → Send/Receive, CRM Extract/Save/Ask AI

### **Step 5: Acceptance Tests**
- Run checklist F above
- Verify Firestore Console shows correct data structures

---

## 🚨 **Known Risks / Blockers**

1. **Index Build Time:** Firestore indexes may take 10–60 minutes. Do not onboard until all are "Ready".
2. **Backend Scale:** Run **1 instance only** until ownership/lease is complete. Multiple instances can cause race conditions on outbox.
3. **Secrets Missing:** If `WHATSAPP_BACKEND_BASE_URL` is not set, proxy functions return 500 `configuration_missing`.
4. **Backend Health:** Backend must be healthy before Flutter can use proxy. Check `/health`.

---

## ✅ **Production Readiness Checklist (Final)**

- [ ] PR merged to `main`
- [ ] Firebase deploy successful (rules/indexes/functions)
- [ ] Firebase secrets set (`WHATSAPP_BACKEND_BASE_URL`, AI keys)
- [ ] Hetzner backend deployed (sessions + env), `/health` 200
- [ ] Flutter app configured (Firebase project matches)
- [ ] Acceptance tests passed (2 accounts + 1 client)
- [ ] All indexes "Ready" in Firebase Console
- [ ] No Flutter analyze errors
- [ ] Security: Delete account uses proxy (not direct backend)

**If all checked → Ready for 30 accounts onboarding** 🚀

---

**END OF DEPLOY RUNBOOK**
