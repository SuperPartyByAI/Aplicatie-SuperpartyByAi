# WhatsApp Inbox Verification — Canonical Query + Schema Audit

## TASK 1 — Code-level enforcement ✅

All three inbox screens use the **same** canonical helper:

- **`superparty_flutter/lib/utils/threads_query.dart`**  
  `buildThreadsQuery(accountId)` =  
  `collection('threads').where('accountId', isEqualTo: accountId).orderBy('lastMessageAt', descending: true).limit(1000)`  
  Index: `accountId` ASC + `lastMessageAt` DESC (see `firestore.indexes.json`). `lastMessageAt` = canonical last activity (inbound+outbound).

- **WhatsApp Inbox (canonical):** `whatsapp_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`
- **Employee Inbox:** `employee_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`
- **Staff Inbox:** `staff_inbox_screen.dart` → `buildThreadsQuery(accountId).snapshots().listen(...)`

No `collectionGroup`, no `whereIn`, no extra server-side filters. Filters (hidden/archived/broadcast/redirectTo) are in-memory only.

---

## If Inbox Angajați is still empty

Query-ul e canonic; dacă **audit + migrate dry-run** sunt OK (threads există, `lastMessageAt` valid), cauza e în altă parte: **rules/RBAC** sau **lista de accountIds** sau **lipsă threads** pentru accountIds-urile angajatului.

### Ce faci (în ordine)

1. **Deschizi Employee/Staff Inbox** ca angajat **non-admin** și cauți în log:
   - `accountIds queried: [...]`
   - orice `FirebaseException code=...`

2. **Interpretare rapidă**

   | Log | Cauză |
   |-----|--------|
   | **permission-denied** | Firestore Rules/RBAC blochează read pentru angajați. |
   | **failed-precondition** | Index (cu query canonic + index existent, de obicei nu mai apare). |
   | **Fără eroare, dar listă goală** | accountIds greșite/goale sau nu există threads pentru acele conturi. |

3. **Dacă vezi permission-denied**
   - Confirmă că rules au `isEmployee()` pe **read** pentru `threads` și `threads/{threadId}/messages`.
   - Apoi: `firebase deploy --only firestore:rules`

4. **Dacă nu e eroare dar e gol**
   - Ia un **accountId** din `accountIds queried` (din Employee/Staff Inbox) și rulează audit pentru **acel** accountId (nu pentru unul „care merge” la tine):
     ```bash
     cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
     node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ACCOUNT_ID_DIN_LOG>
     ```
   - Dacă auditul zice **threadsCount=0** pentru acel ID → Inbox Angajați e gol pentru că nu există threads pentru conturile lui (sau mapping-ul de conturi e greșit).

### Ce să trimiți ca să identifice exact cazul

Doar **2 linii** din log la deschiderea Inbox Angajați:
1. `accountIds queried: [...]`
2. orice `FirebaseException code=...` (dacă există)

Cu ele se poate spune exact care dintre cele 3 cazuri e și ce schimbare minimă mai lipsește.

---

## Diagnostic: Backfill vs UI (unde e problema?)

**Important:** Mesajul din log **"Backfill started (runs asynchronously)"** confirmă doar că request-ul a ajuns la endpoint (prin Functions proxy), **nu** că mesajele „history” sunt deja scrise în Firestore. Endpoint-ul este explicit async.

Ca să afli rapid dacă problema e la **backend/backfill** sau la **UI**, urmează diagnosticul în ordinea de mai jos.

### 1) Verifică dacă „history” chiar a ajuns în Firestore (fără să ghicești)

Din **WhatsApp Accounts** screen, pe contul conectat:

1. Apasă **Backfill history** (butonul există pentru admin când status e `connected`).
2. Apoi apasă iconița **🐞 „Verify Firestore (debug)”** (în `kDebugMode`), care deschide **WhatsAppBackfillDiagnosticScreen**.

Pe ecranul de diagnostic, verificarea face:

- numără **thread-urile** pentru `accountId`;
- verifică dacă există **măcar 1 mesaj** în subcolecția `threads/{threadId}/messages` (sample);

și îți afișează **Threads OK/EMPTY** + **Messages OK/EMPTY**.

**Interpretare:**

| Rezultat diagnostic | Unde e problema |
|--------------------|------------------|
| **Threads OK, Messages EMPTY** | Problema e la **backend/backfill** (mesajele nu sunt scrise în `threads/.../messages`), nu la UI. |
| **Messages OK** dar în UI „tot nu apare history” | Problema e la **afișare/queries** în ecranul de conversație (UI). |

### 2) Dacă „Messages EMPTY”: verifică dacă backfill-ul rulează sau e blocat

**Important:** Job-ul de backfill e **async** (pornire cu delay/jitter/cooldown). După ce apeși „Backfill history”, **așteaptă 1–3 minute** și re-verifică diagnosticul; dacă verifici imediat, poți concluziona greșit că nu funcționează.

În **Firestore**, în `accounts/{accountId}`, verifică statusul de auto-backfill (câmpuri din runbook):

- `lastAutoBackfillStatus.running`
- `lastAutoBackfillStatus.ok`
- `lastAutoBackfillStatus.errorCode` / `errorMessage`
- `lastAutoBackfillAttemptAt`, `lastAutoBackfillSuccessAt` (cooldown)

Apoi verifică **semnalele de efect** ale backfill-ului:

- în `threads/{threadId}/messages` trebuie să apară documente noi;
- `threads/{threadId}.lastBackfillAt` (dacă există) se actualizează;
- `accounts/{accountId}.lastBackfillStats` / `lastBackfillResult` (threads, messages, errors).

Dacă rulezi backfill și **nimic** din cele de mai sus nu se mișcă (după 1–3 min), următorul check e dacă instanța backend e **active**:

```bash
curl -s http://HETZNER_IP:8080/ready | jq
```

- `mode: "active"` → ar trebui să proceseze backfill.
- `mode: "passive"` → nu rulează tick-urile de backfill.

### 3) Dacă „Messages OK” în diagnostic, dar în UI nu vezi history

Confirmă pe **un document de mesaj** din Firestore că are timestamp-uri și câmpuri corecte:

- modelul de mesaj suportă: `tsClient`, `tsServer`, `createdAt`, `syncedAt`, `syncSource`.

**Check concret pentru UI:** În ecranul de conversație (chat), query-ul pentru mesaje trebuie să fie consistent:
- **orderBy** pe `tsClient` sau `createdAt` (desc pentru „ultimele N”);
- **limit** suficient de mare (ex. 200) ca să includă și mesajele din history;
- **fără filtru** care exclude mesajele din history: dacă există `where('syncSource', '==', 'realtime')` sau similar, mesajele cu `syncSource=history_sync` / `backfill` nu vor apărea – elimină sau adaptează filtrul.

Dacă mesajele există dar UI nu le arată, problema e de obicei:

- **query-ul** din ecranul de conversație (filtre / `orderBy` / `limit`);
- **maparea** câmpurilor de timestamp (string vs int vs Timestamp) în model/parsing.

### 4) Posibilă cauză concretă (din loguri)

Dacă **StaffInboxScreen** face backfill de mai multe ori și „rebuild from cache” rămâne la aceeași listă de threads (ex. 561), asta e compatibil cu:

- backfill-ul **pornește** async, dar **nu scrie** efectiv mesaje → diagnosticul va arăta **Messages EMPTY**; sau
- backfill-ul **scrie**, dar verifici doar **lista de thread-uri** (care poate rămâne 561), nu subcolecțiile de mesaje.

**Concluzie:** Dacă spui ce îți arată **WhatsAppBackfillDiagnosticScreen** la „Messages (sample)” (**OK** vs **EMPTY**), se poate indica exact următorul loc de reparat (backend vs UI), fără pași în plus.

### Ordine „amestecată” în Inbox Angajați (ex: 6h ago / 7h ago)

Dacă conversațiile par amestecate (în special în grupurile cu același „Xh ago”):

1. **Cauză frecventă:** thread-uri fără `lastMessageAtMs` (vechi, nereparate) – toate primesc timp 0 și sunt ordonate doar după id (arbitrar).
2. **Ce faci:**
   - Pe backend: lasă auto-repair să ruleze după backfill (ENV `AUTO_REPAIR_THREADS_ENABLED=true`) sau rulează scriptul de backfill pentru thread-uri vechi ca să completeze `lastMessageAt` + `lastMessageAtMs` din ultimul mesaj.
   - În Firestore: verifică că `threads/{id}` au câmpurile `lastMessageAt` și `lastMessageAtMs` (number, ms) setate.
   - În app: **pull-to-refresh** în Inbox Angajați sau închide/redeschide ecranul ca să reîncarci din Firestore și să se reaplice sortarea (desc după `threadTimeMs`, tie-break după thread id).

Sortarea în app folosește: `lastMessageAtMs` → `lastMessageAt` → `updatedAt` → `lastMessageTimestamp`; când timpul e egal, ordinea e stabilă după id-ul thread-ului.

---

## Employee inbox order = phone order

Ordinea conversațiilor în **Inbox Angajați** (și Staff / WhatsApp Inbox) trebuie să fie **identică** cu WhatsApp pe telefon: thread-ul cu **ultimul mesaj** (inbound sau outbound) pe primul loc.

### De ce e corect acum

- **Câmp canonic „last activity”:** `lastMessageAt` + `lastMessageAtMs` se actualizează pentru **inbound și outbound** (`message_persist.js` la persist, `updateThreadLastMessageForOutbound` când skip persist pentru outbound).
- **Query:** `orderBy(lastMessageAt, desc).limit(1000)` — index `accountId` ASC + `lastMessageAt` DESC. Ordinea reflectă ultima activitate, deci top-N e corect.
- **Sortare client:** `threadTimeMs` din `thread_sort_utils.dart`, prioritate: `lastMessageAtMs` → `lastMessageAt` → `updatedAt` → `lastMessageTimestamp` → `0`. Tie-breaker stabil pe thread id. Folosit de Employee, Staff, WhatsApp Inbox.
- **Auto-backfill:** Scheduler periodic + on-connect; distributed lease on **accounts/{accountId}** (autoBackfillLeaseUntil, autoBackfillLeaseHolder, autoBackfillLeaseAcquiredAt). **Auto-repair** runs after each backfill: sets `lastMessageAt`/`lastMessageAtMs` from latest message for threads where missing (ENV: `AUTO_REPAIR_THREADS_ENABLED`, `AUTO_REPAIR_THREADS_LIMIT_PER_RUN`, `AUTO_REPAIR_COOLDOWN_MINUTES`; stored in accounts/{id}.lastAutoRepairAt, lastAutoRepairResult). ENV: `WHATSAPP_AUTO_BACKFILL_ENABLED`, `WHATSAPP_BACKFILL_INTERVAL_SECONDS`, `WHATSAPP_BACKFILL_CONCURRENCY`, `WHATSAPP_BACKFILL_COOLDOWN_MINUTES`. Admin: `POST /api/admin/backfill/:accountId`, `GET /api/admin/backfill/:accountId/status`.

### Comenzi de verificare

```bash
# Flutter
cd superparty_flutter
dart analyze lib/utils/thread_sort_utils.dart lib/utils/threads_query.dart lib/screens/whatsapp/employee_inbox_screen.dart lib/screens/whatsapp/staff_inbox_screen.dart lib/screens/whatsapp/whatsapp_inbox_screen.dart
flutter build apk --debug
```

```bash
# Backend lint (whatsapp-backend)
cd whatsapp-backend && npm run lint
```

```bash
# Backfill (dry-run apoi apply)
cd Aplicatie-SuperpartyByAi
node scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ACCOUNT_ID> --dryRun
node scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ACCOUNT_ID> --apply
# sau --accountIdsFile <path> (un accountId per linie) pentru conturile angajaților
```

### Pași manuali

- **(a) Outbound:** Alege o conversație **B** care nu e prima. Trimite un mesaj **outbound** în B (din app / integrare). Verifică că **B** urcă pe **locul 1** în Inbox Angajați.
- **(b) Inbound:** Alege o conversație **A** care nu e prima. Primește un mesaj **inbound** în A (de pe telefon). Verifică că **A** urcă pe **locul 1** în Inbox Angajați.
- **(c) Firestore:** Deschide `threads/{threadId}`. După un mesaj (inbound sau outbound), confirmă că `lastMessageAt` și `lastMessageAtMs` sunt actualizate.
- **(d) Auto-backfill + repair:** Conectezi un account → aștepți un tick (interval WHATSAPP_BACKFILL_INTERVAL_SECONDS sau 12 min) → vezi în log `Backfill start accountId=…` și `[repair] start accountId=…`. În Firestore: `threads/{id}/messages` crește; `threads/{id}.lastMessageAt` și `lastMessageAtMs` se setează (inclusiv prin repair dacă lipseau). `accounts/{id}.lastAutoRepairAt`, `lastAutoRepairResult` (updatedThreads, scanned, durationMs). Inbox Angajați: conversația cu ultimul mesaj (inbound/outbound) urcă sus.

### Schema-guard (backend)

După update outbound-only pe thread, backend-ul verifică (fire-and-forget) că thread-ul are câmpul canonic. Dacă lipsește, apare în log:

- `[schema-guard] Thread <hash> missing canonical lastMessageAt after outbound update (accountId=<hash>)`
- `[schema-guard] Thread <hash> has lastMessageAt but missing lastMessageAtMs after outbound (accountId=<hash>)`

**Unde se citește:** `server.js` ~154–168 (`updateThreadLastMessageForOutbound` → `ref.get()` schema-guard).

### Fișiere relevante

| Fișier | Ce face |
|--------|---------|
| `whatsapp-backend/whatsapp/message_persist.js` | Setează `lastMessageAt` / `lastMessageAtMs` inbound+outbound (liniile 281–288); `lastInboundAt` / `lastInboundAtMs` doar inbound. |
| `whatsapp-backend/server.js` | `updateThreadLastMessageForOutbound` (liniile 137–170): setează canonical + schema-guard. |
| `superparty_flutter/lib/utils/threads_query.dart` | `buildThreadsQuery`: `orderBy(lastMessageAt, desc).limit(1000)` (liniile 8–11), doc index. |
| `superparty_flutter/lib/utils/thread_sort_utils.dart` | `threadTimeMs` (liniile 8–31), `parseAnyTimestamp` (liniile 34–57); canonical last activity. |
| `superparty_flutter/lib/screens/whatsapp/employee_inbox_screen.dart` | Sort desc `threadTimeMs` + tie-break thread id (liniile 254–264). |
| `scripts/migrate_threads_backfill_lastMessageAt.mjs` | Backfill `lastMessageAt` + `lastMessageAtMs` (derive din ultimul mesaj sau din `lastMessageAt` existent); `--dryRun` / `--apply`, `--accountIdsFile` (liniile 10–12, 168–195). |
| `whatsapp-backend/lib/wa-auto-backfill.js` | Scheduler auto-backfill; ENV WHATSAPP_*; lease on **accounts/{accountId}** (autoBackfillLeaseUntil/Holder/AcquiredAt); optional ctx.runRepair after backfill; lastBackfillStatus/lastBackfillError/lastBackfillStats. |
| `whatsapp-backend/lib/wa-thread-repair.js` | deriveLastActivityFromMessage (pure); used by repair. |
| `whatsapp-backend/server.js` | repairThreadsLastActivityForAccount; runRepair in auto-backfill ctx (cooldown, lastAutoRepairAt, lastAutoRepairResult); POST/GET /api/admin/backfill/:accountId. |

### De ce repară "phone order" și query-ul

- **Query:** `orderBy(lastMessageAt)` + `lastMessageAt` actualizat inbound+outbound → thread-urile **nu sunt excluse** din rezultate când outbound. Limit 1000 e suficient; top‑N e **corect** pentru că orderBy reflectă ultima activitate.
- **Sort client:** Fallback `updatedAt` acoperă edge case-uri când canonical lipsește (thread-uri vechi, migrări), dar acum canonical e mereu setat.
- **No "dispare din top"**: Thread-ul care primește outbound urcă în query (serverside) și apoi e sortat corect client (threadTimeMs). Înainte, outbound nu actualiza `lastMessageAt` → thread-ul nu urca în query → putea să dispară din top 200.

### Rezultate verificare (rulat local)

| Comandă | Rezultat |
|---------|----------|
| `dart format ...` | 0 fișiere modificate (deja formatate) |
| `dart analyze ...` | **0 erori** în fișierele modificate; 8 warnings preexistente în `employee_inbox_screen` (unused vars, curly braces, etc.) |
| `flutter build apk --debug` | **✓ Built** `build/app/outputs/flutter-apk/app-debug.apk` (19.5s) |
| `npm run lint` (backend) | Erori preexistente în alte fișiere; **0 erori noi** în `message_persist.js`, `server.js` |

---

## Run audit — credentials

Fără credențiale valide, **query-ul nu rulează deloc**; „Summary: scannedThreads=0” e doar efectul lipsei de creds. Rezolvă una din variantele de mai jos.

### Option 1 (ADC — Application Default Credentials, fără JSON key)

#### Pas 0 (opțional) — curățare ADC incomplet

```bash
gcloud auth application-default revoke -q || true
```

#### Pas 1 — login ADC (fără browser)

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --no-browser
```

Cum funcționează: comanda îți dă un URL → îl deschizi în browser → alegi contul corect → Allow → copiezi code → îl lipești în terminal.

#### Pas 2 — setează project și quota project (după „Credentials saved”)

În browser: contul corect → **Allow** (nu Cancel) → copiezi code → îl lipești în terminal. Apoi:

```bash
gcloud config set project superparty-frontend
gcloud auth application-default set-quota-project superparty-frontend
ls -la ~/.config/gcloud/application_default_credentials.json
```

#### Pas 3 — verifică ADC, apoi rulează auditul

Dacă `application_default_credentials.json` există:

```bash
ls -la ~/.config/gcloud/application_default_credentials.json
gcloud auth application-default print-access-token >/dev/null && echo "ADC OK"
```

Apoi audit (și verifică exit code imediat după):

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
echo $?
```

**Notă despre `echo $?`:** trebuie rulat imediat după comanda `node ...`. Altfel, `$?` va fi exit code-ul unei alte comenzi.

#### Execuție efectivă (copy-paste, în ordine)

Rulează exact asta. Pasul de login este **interactiv**: îți dă URL → deschizi în browser → Allow → copiezi code → lipești în terminal.

```bash
gcloud auth application-default revoke -q || true

gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --no-browser

gcloud config set project superparty-frontend
gcloud auth application-default set-quota-project superparty-frontend

ls -la ~/.config/gcloud/application_default_credentials.json
gcloud auth application-default print-access-token >/dev/null && echo "ADC OK"

cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
echo $?
```

**Ce să trimiți ca să identifice blocajul:**

- ultimele ~30 linii din `gcloud auth application-default login ... --no-browser` (**fără** codul lipit)
- output complet `ls -la ~/.config/gcloud/application_default_credentials.json`
- output complet al auditului + `echo $?` imediat după

**Dacă primești: „scope … not consented”**

Cauze tipice:

- ai închis pagina înainte de Allow
- ai apăsat Cancel
- contul (ex. Workspace) are restricții

Fix:

- rulează din nou `gcloud auth application-default login ... --no-browser`
- folosește contul corect
- apasă Allow

**Verificare că e corect**

După `gcloud auth application-default login ... --no-browser` și pașii 2–3:

- `~/.config/gcloud/application_default_credentials.json` există
- auditul nu mai dă „Could not load the default credentials”
- `echo $?` după audit ar trebui să fie **0** dacă auditul a rulat OK și nu a decis să eșueze pe anomalii

#### B) Dacă după ADC primești PERMISSION_DENIED

Autentificarea e OK; contul Google nu are roluri suficiente pe proiect. Minim recomandat:

- **audit (read-only):** `roles/datastore.viewer`
- **migrate --apply (scriere):** `roles/datastore.user`

După ce primești rolurile, rerulezi auditul.

#### C) Dacă ADC e blocat de Workspace / policy

Folosește service account JSON (local, necomitat):

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
echo $?
```

#### D) Diagnostic rapid

Dacă trimiți output-ul complet al comenzii `gcloud auth application-default login ... --no-browser` (**doar erorile/mesajele, fără codul de autorizare**) și apoi output-ul auditului, se poate spune imediat dacă mai e problemă de consent sau doar de IAM roles.

### Opțiunea 2: Service Account JSON (fără să-l pui în git)

Obține un JSON key (GCP/Firebase Console) pentru un service account cu acces la Firestore:
- **audit:** read e suficient  
- **migrate --apply:** trebuie write pe Firestore  

Salvează-l într-o locație sigură (ex. în afara repo-ului):

```
/Users/universparty/keys/superparty-frontend-sa.json
```

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/universparty/keys/superparty-frontend-sa.json"
cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
```

Dacă îl pui în repo (doar local): `functions/serviceAccountKey.json`. Verifică că e ignorat:

```bash
git check-ignore -v functions/serviceAccountKey.json
```

### După ce trece auditul — migrate (dry-run)

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/functions
node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443 --dryRun
```

### Ce output să trimiți ca să confirmi că e ok

După ce rezolvi credențialele, trimite **doar**:

1. **Din audit:** linia  
   `Summary: scannedThreads=... missingLastMessageAt=... anomalies=...`
2. **Dacă apare:** orice `PERMISSION_DENIED` / `FAILED_PRECONDITION` sau alt cod de eroare.

Fără credențiale valide rămâi blocat doar pe „no credentials”; nu se ajunge la schema/index.

---

## Interpreting audit results

| Result | Meaning |
|--------|--------|
| **threadsCount > 0** for a staff/employee accountId | Data exists; UI should show threads (if rules allow). |
| **0 threads** for that accountId | No data for those accounts, or wrong project/env. |
| **Anomalies** on `lastMessageAt` (missing / wrong type) | Run migration: `--dryRun` first, then `--apply`. |
| **permission-denied** in Flutter logs | Not schema — **rules/RBAC**. |

---

## Quick check (30 seconds, no scripts)

1. Open **Employee** or **Staff Inbox**.
2. In logs, search for:
   - `accountIds queried: [...]`
   - Any `FirebaseException code=...`

**Interpretation:**

- **Empty `accountIds queried`** → Problem *before* Firestore (RBAC / getAccountsStaff / mapping).
- **`FirebaseException code=failed-precondition`** → Index/query mismatch or index still building.
- **`FirebaseException code=permission-denied`** → Rules/RBAC.

With those two log lines, you can tell which of the three causes it is.

---

## TASK 2 & 3 — Scripts

- **Audit (read-only):** `scripts/audit_whatsapp_inbox_schema.mjs`  
  - Creds: ADC (`gcloud auth application-default login`) sau `GOOGLE_APPLICATION_CREDENTIALS` / fișiere din repo (vezi secțiunea Run audit).  
  - La lipsă credențiale: iese cu eroare, **fără** Summary (query-ul nu rulează).  
  - Exits non-zero dacă >5% din threads sample lipsesc `lastMessageAt`.

- **Migration (write, guarded):** `scripts/migrate_threads_backfill_lastMessageAt.mjs`  
  - Default **dry run** (no writes). Use `--apply` to write.  
  - Backfills `thread.lastMessageAt` from latest message in `threads/{id}/messages` (tsClient desc, fallback createdAt desc).

---

## Manual checklist

- [ ] Log in as **non-admin employee**.
- [ ] Open **WhatsApp → Staff Inbox** or **Employee Inbox**.
- [ ] If **empty**: run audit for those accountIds; check **0 threads** vs **permission-denied** vs **failed-precondition** (see above).

---

## Flutter analyze

```bash
cd superparty_flutter && flutter analyze
```

Expected: **0 errors** (warnings/infos only).

---

## Git — include new files + clean commit

```bash
# Preview full diff (including new files)
git add -N superparty_flutter/lib/utils/threads_query.dart \
        superparty_flutter/lib/utils/inbox_schema_guard.dart \
        scripts/audit_whatsapp_inbox_schema.mjs \
        scripts/migrate_threads_backfill_lastMessageAt.mjs \
        VERIFICATION_WHATSAPP_INBOX.md
git diff --no-color --stat
git diff --no-color

# Commit
git add superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/employee_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart \
        superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart \
        superparty_flutter/lib/utils/threads_query.dart \
        superparty_flutter/lib/utils/inbox_schema_guard.dart \
        scripts/audit_whatsapp_inbox_schema.mjs \
        scripts/migrate_threads_backfill_lastMessageAt.mjs \
        VERIFICATION_WHATSAPP_INBOX.md
git commit -m "WhatsApp: canonical threads query + schema audit tools"
```
