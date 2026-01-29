# WhatsApp Inbox Verification — Canonical Query + Schema Audit

## TASK 1 — Code-level enforcement ✅

All three inbox screens use the **same** canonical helper:

- **`superparty_flutter/lib/utils/threads_query.dart`**  
  `buildThreadsQuery(accountId)` =  
  `collection('threads').where('accountId', isEqualTo: accountId).orderBy('lastMessageAt', descending: true).limit(200)`

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
