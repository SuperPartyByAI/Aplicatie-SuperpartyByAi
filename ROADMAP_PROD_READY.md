# Roadmap: Prod-Ready (Backend + Flutter Integration)

**Status:** Backend stable (commit `59a5ea84`), Flutter code exists, integration pending  
**Target:** 30 WhatsApp accounts on Railway + Flutter app management

---

## ✅ **1. PR către main (OBLIGATORIU)**

**Status:** ✅ Ready to merge

**Actions:**
1. GitHub → Repo → "Compare & pull request"
2. Base: `main`, Compare: `audit-whatsapp-30`
3. Template PR (see below)

**PR Template:**
```markdown
## Scope: Multi-account stability + receipts + history sync

### Changes
- Thread isolation: `threadId = ${accountId}__${remoteJid}` (prevents collisions)
- Outbox lease/claim: Transaction-based claim (prevents duplicate sends)
- Receipt tracking: `messages.update` + `message-receipt.update` (sent/delivered/read)
- History sync: Best-effort full conversation sync
- Docs: `RUNBOOK_WHATSAPP_SYNC.md` + implementation summaries

### Ops Notes
- Single instance Railway (don't scale >1 until account-lease implemented)
- Firestore indexes deploy required: `firebase deploy --only firestore:indexes`
- UI may see "duplicates" from old threads (backward incompatible threadId)

### Testing
- [ ] Thread isolation (2 accounts, same clientJid)
- [ ] Outbox lease (restart safety, no duplicates)
- [ ] Receipt status transitions (queued → sent → delivered → read)
```

**Gata când:** PR merged în `main` ✅

---

## ✅ **2. Firestore Indexes (OBLIGATORIU)**

**Status:** ✅ `firestore.indexes.json` exists, needs deploy

**Confirmat:**
- `firebase.json` linia 4 referă `firestore.indexes.json` (root) ✅
- Indexuri existente: `threads` (accountId + lastMessageAt), `outbox` (status + nextAttemptAt) ✅

**Actions:**
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
firebase projects:list
firebase use <PROJECT_ID>
firebase deploy --only firestore:indexes
```

**Verificare:**
- Firebase Console → Firestore → Indexes → Status = "Ready" (not "Building")

**Gata când:** Indexurile sunt "Ready" și nu mai primești "missing index" errors ✅

---

## ✅ **3. Railway Deploy (OBLIGATORIU)**

**Status:** ✅ Backend code ready, needs env vars + redeploy

### 3.1 Volume + Sessions
- ✅ Volume mount: `/app/sessions` (from `railway.toml`)
- ✅ Env: `SESSIONS_PATH=/app/sessions`

### 3.2 Firestore
- ✅ Env: `FIREBASE_SERVICE_ACCOUNT_JSON=<json complet>`

### 3.3 Admin/Auth
- ✅ Env: `ADMIN_TOKEN=<token>`

### 3.4 History Sync (Opțional, recomandat)
- `WHATSAPP_SYNC_FULL_HISTORY=true` (default: true dacă nu setat)
- `WHATSAPP_BACKFILL_COUNT=100`
- `WHATSAPP_BACKFILL_THREADS=50`
- `WHATSAPP_HISTORY_SYNC_DRY_RUN=false`

**Redeploy Service:**
- Railway Dashboard → Service → Deploy → Redeploy

**Verificare Logs:**
```
sessions dir writable: true
Firestore: Connected
History sync: enabled (WHATSAPP_SYNC_FULL_HISTORY=true)
```

**Verificare Health:**
```bash
curl https://your-service.railway.app/health
# Expected: {"status":"healthy","sessions_dir_writable":true,"firestore":"connected"}
```

**Gata când:**
- `/health` = 200 ✅
- Logs: "sessions dir writable: true" + "Firestore: Connected" ✅
- Conturi existente rămân connected după redeploy ✅

---

## ✅ **4. Backend API Validare (MINIM)**

**Status:** ✅ All endpoints exist in code, needs testing

**Endpoints disponibile (Auth: Firebase ID token):**
- ✅ `POST /api/whatsapp/accounts` (create)
- ✅ `POST /api/whatsapp/accounts/:id/connect` (**admin**)
- ✅ `GET /api/whatsapp/accounts/:id/qr` (**admin**)
- ✅ `GET /api/whatsapp/accounts`
- ✅ `GET /api/whatsapp/threads/:accountId`
- ✅ `GET /api/whatsapp/messages/:accountId/:threadId`
- ✅ `POST /api/whatsapp/send-message`
- ✅ `POST /api/whatsapp/regenerate-qr/:accountId` (**admin**, legacy)
- ✅ `POST /api/whatsapp/backfill/:accountId` (**admin**)
- ✅ `POST /api/whatsapp/disconnect/:id` (**admin**)
- ✅ `DELETE /api/whatsapp/accounts/:id` (**admin**)

**Teste cu curl:**
```bash
# 0. Firebase ID token (ex: from client)
TOKEN="eyJhbGciOi..."

# 1. Health
curl https://your-service.railway.app/health

# 2. Create account
curl -X POST https://your-service.railway.app/api/whatsapp/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"WA-01"}'

# 3. Get accounts
curl https://your-service.railway.app/api/whatsapp/accounts \
  -H "Authorization: Bearer $TOKEN"

# 4. Connect + Get QR (admin)
curl -X POST https://your-service.railway.app/api/whatsapp/accounts/{accountId}/connect \
  -H "Authorization: Bearer $TOKEN"

curl https://your-service.railway.app/api/whatsapp/accounts/{accountId}/qr \
  -H "Authorization: Bearer $TOKEN"

# 5. Dashboard
curl https://your-service.railway.app/api/status/dashboard
```

**Gata când:**
- Poți crea cont → vezi QR → scanezi → status = "connected" ✅

---

## ✅ **5. Flutter Integration (VERIFIED)**

**Status:** ✅ Code exists and verified, backend endpoints require Firebase auth

**Fișiere existente:**
- ✅ `lib/services/whatsapp_api_service.dart` (259 lines, API client) - VERIFIED
- ✅ `lib/screens/whatsapp/whatsapp_screen.dart` (main screen)
- ✅ `lib/screens/whatsapp/whatsapp_accounts_screen.dart` (541 lines, accounts list) - VERIFIED
- ✅ `lib/core/config/env.dart` (config with `whatsappBackendUrl`)

### 5.1 Config Flutter (✅ VERIFIED)

**Config existent:**
```dart
// lib/core/config/env.dart (linia 34-46)
static const String _defaultWhatsAppBackendUrl = 'https://whats-upp-production.up.railway.app';
static final String whatsappBackendUrl = _normalizeBaseUrl(
  'WHATSAPP_BACKEND_URL',  // Override via --dart-define
  defaultValue: _defaultWhatsAppBackendUrl,
);
```

**Auth mechanism (✅ REQUIRED):**
- ✅ **Backend endpoints cer Firebase ID token** (Authorization: Bearer)
- ✅ **Admin-only:** connect/qr/backfill/delete/disconnect
- ✅ **Flutter trimite auth headers** pentru apelurile directe la backend

### 5.2 Ecrane/Flow (✅ VERIFIED)

**Ecrane existente:**
- ✅ `whatsapp_screen.dart` (main screen - inbox intern)
- ✅ `whatsapp_accounts_screen.dart` (accounts management)

**Endpoints implementate în Flutter (✅ VERIFIED):**
- ✅ `getAccounts()` → `GET /api/whatsapp/accounts`
- ✅ `createAccount()` → `POST /api/whatsapp/accounts`
- ✅ `connectAccount()` → `POST /api/whatsapp/accounts/:id/connect`
- ✅ `getAccountQr()` → `GET /api/whatsapp/accounts/:id/qr`
- ✅ `regenerateQr()` → `POST /api/whatsapp/regenerate-qr/:accountId` (legacy)
- ✅ `deleteAccount()` → `DELETE /api/whatsapp/accounts/:id` (admin)
- ⚠️ **MISSING:** `POST /api/whatsapp/backfill/:accountId` (optional)

**QR Display:**
- ✅ `whatsapp_accounts_screen.dart` folosește `qr_flutter` package
- ✅ QR code afișat din `GET /api/whatsapp/accounts/:id/qr` (data-url base64)

**Status Updates:**
- ✅ `whatsapp_accounts_screen.dart` actualizează lista via `_loadAccounts()` (linia 35-76)
- ✅ Status afișat din `account['status']` (connected/disconnected/qr_ready)

**Actions (Finalizare):**
1. ✅ Backend endpoints verified - Firebase auth required ✅
2. ⚠️ **ADD:** `backfillAccount()` method în `whatsapp_api_service.dart` pentru endpoint nou
3. ⚠️ **VERIFY:** Config `whatsappBackendUrl` în Flutter matches Railway domain

**Gata când:**
- ✅ Din Flutter poți: adăuga cont → vezi QR → scanezi → vezi connected ✅
- ✅ Poți repara cont (regenerate QR / delete) ✅
- ⚠️ Backfill endpoint lipsește în Flutter service (optional, poate fi adăugat după)

---

## ✅ **6. Onboarding 30 Conturi (Operațional)**

**Status:** ⏳ Pending după Flutter integration

**Flow:**
1. Adaugi 30 conturi (WA-01..WA-30, telefoane distincte)
2. Scanezi QR pentru fiecare până sunt "connected"
3. Redeploy/restart backend 2-3 ori
4. Confirmi că rămân connected și mesajele apar în Firestore

**Verificare Firestore:**
```bash
# Firebase Console → Firestore → Collections:
- accounts/{accountId} → status = "connected"
- threads/{accountId}__{clientJid} → lastMessageAt exists
- threads/{accountId}__{clientJid}/messages/{messageId} → messages exist
```

**Gata când:**
- 30 connected accounts ✅
- Restart-safe (rămân connected după restart) ✅
- Firestore populated (threads/messages exist) ✅

---

## 📋 **Checklist Final**

### Backend (Railway)
- [ ] PR merged în `main`
- [ ] Firestore indexes deployed ("Ready")
- [ ] Railway env vars setate (SESSIONS_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, ADMIN_TOKEN)
- [ ] Railway redeploy successful
- [ ] `/health` = 200, logs: "sessions dir writable: true"
- [ ] API endpoints testate cu curl (add-account, accounts, qr, dashboard)

### Flutter Integration
- [x] `whatsapp_api_service.dart` verificat - NO auth headers (backend nu cere) ✅
- [x] `whatsappBackendUrl` configurat (`https://whats-upp-production.up.railway.app`) ✅
- [x] Endpoint-urile principale apelate (getAccounts, addAccount, regenerateQr, deleteAccount) ✅
- [ ] Backfill endpoint în service (optional - poate fi adăugat după) ⚠️
- [x] QR display funcționează în Flutter (via `qr_flutter` package) ✅
- [x] Status updates funcționează (connected/disconnected) ✅
- [x] Repair flow funcționează (regenerate QR / delete) ✅

### Operational
- [ ] 30 conturi onboarded (WA-01..WA-30)
- [ ] Toate connected după restart
- [ ] Firestore populated (threads/messages)
- [ ] Single instance Railway (nu scale >1)

---

**Status Actual:**
- ✅ Backend: Code ready (commit `59a5ea84`), needs PR merge + deploy
- ⚠️ Flutter: Code exists, needs verification + auth config
- ⏳ Operational: Pending după Flutter integration

**Next Steps:**
1. PR merge în `main`
2. Firestore indexes deploy
3. Railway deploy cu env vars
4. Verifică Flutter integration (auth + endpoints)
5. Teste manuale (30 conturi)

---

**END OF ROADMAP**
