# Pipeline ingestie – de ce nu apar conversațiile în Inbox

Problema **nu** e în UI-ul Inbox, ci în **pipeline-ul de ingestie**: conversațiile apar în aplicație doar dacă backend-ul WhatsApp a scris deja `threads` / `messages` în Firestore (prin **history sync** sau **backfill**).

---

## Pipeline (cap-coadă)

1. **Backend (Hetzner)** – ingestie:
   - **History sync:** la pairing/re-pair, `messaging-history.set` → backend creează **thread placeholders** din `chats` (pentru toate conversațiile), apoi ingestează mesajele în Firestore. Inbox arată conversațiile; backfill le poate umple.
   - **Backfill:** `/api/whatsapp/backfill/:accountId` (sau `whatsappProxyBackfillAccount`) → umple goluri / istoric pe thread-uri existente.
   - **Realtime:** `messages.upsert` → scrie mesaje noi în `threads/{threadId}/messages`; creează thread-ul dacă nu există.

2. **Firestore** – sursa de adevăr pentru listă:
   - `threads` (query: `accountId`, `lastMessageAt`), `threads/{id}/messages`.

3. **Flutter (Inbox)** – citire:
   - Ia **conturi** din `getAccounts` / `getAccountsStaff` (proxy → backend).
   - Filtrează doar conturile cu **`status == 'connected'`** (plus excluderi admin, etc.).
   - Pentru fiecare `accountId` permis, **abonează la Firestore** `threads` (stream), nu la `getThreads` API.
   - Dacă nu există date în Firestore pentru acel `accountId`, vezi **0 threads** chiar dacă ai „3–4 conturi conectate”.

**Concluzie:** Lista din Inbox se bazează pe **Firestore**. Fără ingestie (history sync / backfill / realtime) → Firestore gol pentru acel account → 0 conversații.

---

## Thread-uri `__[object Object]` / `__[obiect Obiect]` și „deduplicare”

**Simptom:** În Firestore apar thread-uri cu id de forma  
`account_prod_...__[object Object]` sau `...__[obiect Obiect]`, iar în colecții ca „deduplicare” / „inboundDedupe” vezi doc-uri cu `canonicalMessageId`, `createdAt` etc.

**Cauză:** Undeva se folosea `remoteJid` / JID-ul ca obiect (ex. din Baileys) în concatenare pentru `threadId` sau pentru id-uri, rezultând `[object Object]`.

**Fix (backend):** S-a introdus `ensureJidString()` peste tot unde se construiește `threadId` sau se scrie în `threads` / `contacts` / receipt handlers:  
`messages.update`, `message-receipt.update`, AutoReply fallback, protocol skip log.  
Asigură-te că rulezi ultima versiune a backend-ului pe Hetzner.

**Curățare (opțional):** Thread-urile invalide existente (`*__[object Object]`, `*__[obiect Obiect]`) pot fi șterse manual din Firestore (colecția `threads`). Subcolecțiile `messages` se șterg odată cu thread-ul. „Deduplicare” / `inboundDedupe` e folosită doar pentru deduplicare; mesajele reale sunt în `threads/{threadId}/messages`.

---

## Cele 3 cauze cele mai frecvente (în ordine)

### 1) Nu s-a rulat backfill pentru conturile noi

**Simptom:** Contul apare **connected**, dar `threadsCount = 0` în Inbox.

**Cauză:** Ai doar mesaje noi (realtime) sau nimic; **istoricul** nu a fost niciodată ingerat.

**Fix:**
- În **Inbox Angajați**: apasă „Sync / Backfill history”. Backfill-ul e permis pentru **angajați** (nu doar admin) – proxy `whatsappProxyBackfillAccount` acceptă orice user cu `staffProfiles` sau admin.
- Sau manual: Backend `POST /api/whatsapp/backfill/:accountId` (Hetzner), respectiv proxy `whatsappProxyBackfillAccount`.
- Apoi refresh Inbox (pull-to-refresh sau repornește ecranul).

**Fără thread-uri:** Backfill completează doar **thread-uri existente**. Dacă `threadsCount = 0`, nu există thread-uri → backfill nu creează nimic. Atunci e nevoie de **history sync** (re-pair: scan QR din nou pentru acel cont) sau mesaje noi (realtime). Verifică `WHATSAPP_SYNC_FULL_HISTORY=true` pe backend.

**Relevant:** `docs/WHATSAPP_AUTO_BACKFILL.md`, `whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md` (manual backfill, auto-backfill).

---

### 2) Split Railway vs Hetzner (o parte lovește încă Railway)

**Simptom:** Manage Accounts / QR sau unele requesturi merg într-un loc, iar **ingestia**/threads în altul → nu vezi conversații.

**Cauză:** 
- Flutter: `Env.whatsappBackendUrl` – dacă nu e setat `--dart-define=WHATSAPP_BACKEND_URL`, se folosește **default-ul** (acum Hetzner în repo).
- Functions: proxy folosește `WHATSAPP_BACKEND_BASE_URL` (secret/config). Dacă secretul sau config-ul indică încă Railway (sau alt URL), upstream-ul e greșit.

**Fix minim:**
- **Functions:** aliniază upstream-ul la Hetzner:  
  `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL`  
  sau  
  `firebase functions:config:set whatsapp.backend_base_url="http://37.27.34.179:8080"`  
  (sau domeniul tău).
- **Flutter:** fie lași default-ul Hetzner din `env.dart`, fie impui explicit  
  `--dart-define=WHATSAPP_BACKEND_URL=http://...` la build/run.

**Verificare:** `STANDARDIZE_HETZNER_BACKEND.md`, `functions/lib/backend-url.js`. Nu ar trebui să existe **RAILWAY_WHATSAPP_URL** / fallback Railway în pipeline-ul activ (getAccounts, getThreads, backfill, send).

---

### 3) Backend-ul nu e „alive” / active sau pierde sesiuni

**Simptom:** Backend-ul nu procesează events (history / messages) → Firestore nu se umple.

**Verificări rapide:**
- **Health:**  
  `curl -s http://HETZNER_IP:8080/health | jq`  
  → `firestore: "connected"`, `connected` / `accounts_total` ok.
- **Dashboard:**  
  `curl -s http://HETZNER_IP:8080/api/status/dashboard | jq`  
  → `summary.connected`, status per account, `lastBackfillAt` / `lastHistorySyncAt`.
- **Mode:**  
  `curl -s http://HETZNER_IP:8080/ready | jq`  
  → `mode: "active"`. Dacă `passive`, backfill-ul nu rulează.
- **Sesiuni:** După restart, toate conturile cer din nou QR? → sesiuni nepersistate (volume/path). Verifică `SESSIONS_PATH`, mount-uri pe Hetzner.

**Relevant:** `whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`, `whatsapp-backend/artifacts/LONGRUN-RUNBOOK.md`.

---

## Ce să cauți în loguri (să identifici cauza)

### Flutter

- **`[StaffInboxScreen]`**  
  - `DEBUG accountsCount=… accountIds=… statusByAccount=…`  
  - `Rebuild from cache: … threadsCount=…`  
  - `0 docs for accountId=…`  
- **`[WhatsAppInboxScreen]`**  
  - Același tip de DEBUG / `threadsCount`.
- **`[WhatsAppApiService]`**  
  - `getAccounts` / `getAccountsStaff`: `accountsCount=…`, `waMode=…`, `id:status` per account.  
  - `getThreads`: `statusCode=…`, `threadsCount=…` (când se folosește getThreads, e.g. diagnostics).

### Functions / backend

- **`waMode=passive`** sau **`BACKEND PASSIVE`** → backend nu e activ; nu se face sync.
- **`timeout`** → backend URL greșit sau backend lent; verifică `WHATSAPP_BACKEND_BASE_URL` (Hetzner).
- **`backend_error`** → eroare de la backend sau proxy.

### Interpretare scurtă

- **accountsCount > 0, toate connected, dar threadsCount = 0** → foarte probabil **(1) lipsă backfill** sau **(3) backend nu scrie** (PASSIVE, sesiuni, etc.).
- **getThreads OK dar 0 threads** → același lucru: lipsă ingestie pentru acel `accountId`.
- **Timeout / backend_error** → **(2) URL greșit** sau **(3) backend down**.

Dacă trimiți 10–20 linii din log (zona `[StaffInboxScreen]` / `[WhatsAppInboxScreen]` + orice `getThreads` / `status=`) se poate spune imediat care din cele 3 cauze e activă.

---

## Aliniere Railway vs Hetzner (checklist)

- [ ] **Functions:** `WHATSAPP_BACKEND_BASE_URL` (secret sau config) = URL Hetzner. Fără `RAILWAY_*` în pipeline-ul de proxy.
- [ ] **Flutter:** `Env.whatsappBackendUrl` = Hetzner (default în `env.dart` sau `--dart-define=WHATSAPP_BACKEND_URL=...`).
- [ ] **Backend:** rulat pe Hetzner; `SESSIONS_PATH` corect; `firestore` connected.

---

## Mesaje trimise din app nu sunt livrate (outbound)

**Simptom:** Trimiți din aplicație, vezi „Message sent!”, dar destinatarul nu primește mesajul (nici după minute).

**Important:** „Message sent!” apare imediat după ce proxy-ul pune mesajul în coadă (`outbox`). Livrarea reală o face **backend-ul** (outbox worker). Dacă worker-ul nu rulează sau eșuează, mesajul rămâne „trimis” în app dar nu ajunge la destinatar.

**Pipeline trimitere:**
1. App → **whatsappProxySend** (Functions) → creează doc în Firestore `outbox` (status `queued`) + mesaj optimist în thread → răspunde 200 → UI afișează „Message sent!”.
2. **Backend (Hetzner) outbox worker** citește `outbox` (status `queued`, `nextAttemptAt <= now`), trimite efectiv via WhatsApp (Baileys), actualizează `outbox` → `sent` și mesajul din thread.

**Cauze frecvente:**

- **Backend în PASSIVE:** Worker-ul de outbox **nu** procesează când backend-ul e în mod PASSIVE. Mesajele rămân `queued` și nu sunt livrate.
  - Verificare: `curl -s http://HETZNER_IP:8080/ready | jq` → `mode` trebuie să fie `active`.
- **Contul WhatsApp deconectat:** Worker-ul sare peste mesaje dacă `account.status !== 'connected'`. Reconectează contul (QR) din Manage Accounts.
- **ProcessOutbox (Functions) e dezactivat în mod normal:** Trigger-ul Firestore `processOutbox` e **oprit implicit** (ar trimite la backend fără auth → 401). Livrarea se face **doar** prin worker-ul de outbox din backend. Asigură-te că backend-ul rulează, e ACTIVE și are acces la Firestore.
- **Backend și Functions folosesc Firestore diferit:** Worker-ul citește `outbox` din Firestore. Dacă backend-ul folosește alt proiect/DB decât Functions, nu vede documentele create de proxy.

**Verificări rapide (în ordine):**

1. **Mode backend:**  
   `curl -s http://HETZNER_IP:8080/ready | jq`  
   → `mode: "active"`. Dacă `passive`, outbox worker nu procesează.

2. **Dashboard outbox:**  
   `curl -s http://HETZNER_IP:8080/api/status/dashboard | jq`  
   → `queuedCount`: câte mesaje stau în coadă; `outboxLagSeconds`: cât stau deja; `failedLast5m`: eșecuri recente.  
   Dacă `queuedCount` crește și rămâne mare sau `outboxLagSeconds` e ridicat → worker-ul nu procesează (PASSIVE, cont deconectat) sau erori la trimitere.

3. **Firestore `outbox`:**  
   Verifică documente cu `status == 'queued'` sau `'failed'`.  
   `queued` care stau mult → worker nu rulează sau contul deconectat.  
   `failed` → citește `lastError`; reconectează contul sau verifică JID / network.

4. **Health:**  
   `curl -s http://HETZNER_IP:8080/health | jq`  
   → `firestore: "connected"`, conturi `connected`.

---

## Doc și cod relevant

- **Creare thread-uri și backfill:** `docs/THREAD_CREATION_AND_BACKFILL.md` — cele 3 moduri (history sync, mesaje noi, backfill) și ce să faci când nu vezi conversații.
- **Pipeline / sync:** `whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`, `docs/WHATSAPP_AUTO_BACKFILL.md`, `FINAL_STATUS_CAP_COADA.md`.
- **Backfill:** `POST /api/whatsapp/backfill/:accountId`, `whatsappProxyBackfillAccount`, Manage Accounts → buton „Backfill history”.
- **Inbox / filtrare:** `superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart` (conturi `status == 'connected'`, Firestore `threads`), `whatsapp_inbox_screen.dart`.
- **Verificare split inbox:** `docs/VERIFICATION_INBOX_SPLIT.md`.
