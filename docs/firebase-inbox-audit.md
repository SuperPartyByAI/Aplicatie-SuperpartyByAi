# Firebase Structure Report – Staff Inbox & WhatsApp

**Scop:** Identificarea cauzelor pentru care nu apar conversațiile/mesajele în Staff Inbox („3 conturi conectate, 0 conversații”).

**Data:** 2026-01-28

---

## 1. Schema Firestore (din cod)

### 1.1 Colecții folosite

| Colecție | Path | Cine scrie | Cine citește | Partiționare |
|----------|------|------------|--------------|--------------|
| `threads` | `/threads/{threadId}` | Backend (Hetzner) Admin SDK | Flutter UI (Staff Inbox, WhatsApp Inbox, Chat) | `threadId = accountId__clientJid` |
| `threads/{id}/messages` | subcolecție | Backend, processOutbox (Functions) | Flutter ChatScreen | `messageId` = wa message id |
| `threads/{id}/extractions` | subcolecție | Functions (AI extract) | Flutter | - |
| `accounts` | `/accounts/{accountId}` | Backend | Functions, scripts; **nu** Flutter direct | `accountId` din Baileys |
| `config/whatsapp_inbox` | `/config/whatsapp_inbox` | Script `set_admin_only_account.mjs` | Doar rules engine (`get`) | `adminOnlyAccountIds: string[]` |
| `outbox` | `/outbox/{requestId}` | Functions (whatsappProxy), Backend | Flutter (status) | - |

- **`whatsapp_threads`** / **`whatsapp_messages`**: există în rules, marcate „ACTIVE”, dar **nu sunt folosite** de Staff Inbox sau de backend pentru threads/messages. UI și backend folosesc **`threads`** + **`threads/{id}/messages`**.

### 1.2 Chei și path-uri exacte

- **Thread:** `threadId = accountId + "__" + clientJid` (ex: `a6c9ff8d:45__40712345678@s.whatsapp.net`).  
- **Backend** scrie în `threads` la history sync (`ensureThreadsFromHistoryChats`), la realtime (`handleMessagesUpsert`), la backfill (doar actualizări pe thread existent).  
- **UI** citește din `threads` cu query:  
  `collection('threads').where('accountId', '==', accountId).orderBy('lastMessageAt', 'desc').limit(200)`.

**Concluzie:** Backend și UI folosesc **același** path `threads`. Nu există write în A și read din B.

**Bug identificat (fix aplicat):** Query-ul Inbox folosește `orderBy('lastMessageAt', descending: true)`. Firestore **exclude** documentele care nu au câmpul din `orderBy`. Threads create sau actualizate **doar** prin mesaje **outbound** nu primeau `lastMessageAt` (doar inbound îl seta) → nu apăreau în Inbox. Fix: în `message_persist.js` se scriu mereu `lastMessageAt` și `lastMessageAtMs` la fiecare update thread (inbound și outbound).

---

## 2. Ce scrie backend vs ce citește UI

| Acțiune | Backend (Hetzner) | UI (Staff Inbox) |
|---------|-------------------|------------------|
| Threads | `db.collection('threads').doc(threadId).set(..., { merge: true })` | `buildThreadsQuery(accountId).snapshots()` → `threads` |
| Messages | `threads.doc(threadId).collection('messages').doc(msgId).set(...)` | `threads.doc(threadId).collection('messages').orderBy('tsClient', 'desc')` în ChatScreen |
| Accounts | Backend scrie în `accounts`. Lista de conturi din Staff Inbox vine din **API** (`getAccountsStaff` → Functions → Hetzner), **nu** din Firestore. | - |

**Determinarea conversațiilor în UI:**  
Staff Inbox obține `accountId`-uri din API (conturi conectate, excluse admin phone). Pentru fiecare `accountId` se subscribe la `buildThreadsQuery(accountId)`. Rezultatul este lista de threads pentru acel cont.

---

## 3. Rules & permisiuni

### 3.1 `threads` și `threads/{id}/messages`

- **Read:**  
  - Admin (email strict) **sau**  
  - Employee (`hasStaffProfile()`) ȘI (`config/whatsapp_inbox` inexistent **sau** `accountId` **nu** e în `adminOnlyAccountIds`) **sau**  
  - User cu `users/{uid}.myWhatsAppAccountId == accountId` ȘI același check pentru admin-only.
- **Create/update/delete:** `false` (doar server, Admin SDK).

`config/whatsapp_inbox`: `allow read, write: if false`. Doar rules engine folosește `get()` pentru a citi `adminOnlyAccountIds`; clientul nu citește acest doc.

### 3.2 Posibilă problemă `exists` / `get`

Regula folosește:
```text
!exists(/databases/.../config/whatsapp_inbox)
|| !(resource.data.accountId in get(...config/whatsapp_inbox).data.adminOnlyAccountIds)
```
Dacă documentul **nu** există, `!exists` e true. Comportamentul standard Firebase este short‑circuit pentru `||`, deci `get()` nu ar trebui evaluat. Dacă totuși s-ar evalua (ex. implementare diferită), `get()` pe doc inexistent eșuează → deny.  
**Recomandare:** Dacă apar deny-uri inexplicabile când `config/whatsapp_inbox` lipsește, trebuie refăcută regula astfel încât `get()` să nu fie niciodată apelat când `!exists(...)`.

### 3.3 Erori de permission în UI

- La **stream error** pe threads, UI setează `_firestoreErrorCode` și `_errorMessage`.  
- `permission-denied` → „Rules/RBAC blocked. Nu ai permisiune de citire pe threads.”  
- `failed-precondition` → „Index mismatch. Verifică indexurile Firestore pentru threads.”

Dacă rules blochează, utilizatorul ar trebui să vadă aceste mesaje, nu doar „0 conversații”.

---

## 4. Indexuri și query-uri

### 4.1 Query threads (Staff Inbox)

- **Query:** `threads`  
  `where('accountId', '==', accountId)`  
  `orderBy('lastMessageAt', 'desc')`  
  `limit(200)`  
- **Index:** În `firestore.indexes.json` există index compus:  
  `accountId` ASC, `lastMessageAt` DESC (collection `threads`).  
- **Surse:** `threads_query.dart`, `audit_whatsapp_inbox_schema.mjs` (aceeași structură).

### 4.2 Messages (ChatScreen)

- **Query:** `threads/{threadId}/messages`  
  `orderBy('tsClient', 'desc')`.  
- **Index:** `fieldOverrides` pentru `messages`, câmpul `tsClient` (ASC/DESC, collection group).

### 4.3 Lipsă index

- Lipsa indexului pentru threads produce `failed-precondition`; UI afișează „Index mismatch…”.  
- Pentru „0 conversații” fără mesaj de index, cauza nu e indexul.

---

## 5. Cloud Functions / triggers

- **whatsappProxy:**  
  - Citește `threads` (getThreads, send-message flow).  
  - Scrie în `outbox`, actualizează `threads` (owner, etc.) la trimitere.  
- **processOutbox:** Procesează `outbox`; scrie în `threads` / `messages` la send.  
- **Creare threads:** O face **Hetzner backend** (history sync, realtime), nu Functions.  
- Functions folosesc același Firestore (proiectul Firebase al app-ului).

---

## 6. Config proiect / env

- **Firebase project:** `.firebaserc` → `superparty-frontend`. Flutter folosește `DefaultFirebaseOptions.currentPlatform` (proiectul e același).  
- **Backend (Hetzner):** Firebase Admin din `firebaseCredentials.js` (env `FIREBASE_SERVICE_ACCOUNT_*` / `GOOGLE_APPLICATION_CREDENTIALS`); `project_id` din service account. CORS permite `superparty-frontend`.  
- **Emulator:** Flutter poate folosi emulatorul (Firestore, Auth, Functions) când `USE_FIREBASE_EMULATOR=true` / `USE_EMULATORS=true`. Fără emulator → prod.  
- **Mismatch proiect:** Nu s-a găsit dovezi că UI citește dintr-un proiect și backend scrie în altul.

---

## 7. Multi-account mapping („3 conturi, 0 conversații”)

- Staff Inbox primește conturile din **getAccountsStaff** (API).  
- Filtrează după `status == 'connected'` și exclude contul cu phone `0737571397` (admin).  
- Pentru fiecare `accountId` rămas se deschide stream Firestore pe `threads` cu `where('accountId', '==', accountId)`.  
- Dacă în Firestore **nu există** niciun `thread` cu acel `accountId`, stream-ul returnează 0 doc-uri → „0 conversații”.  
- Thread-urile se creează la **history sync** (re-pair: Disconnect → Connect → Scan QR) sau la **primer mesaj** (realtime). **Backfill-ul nu creează** thread-uri noi.

**Concluzie:** „3 conturi, 0 conversații” este consistent cu: **conturile există (API), dar în Firestore nu există încă threads pentru acele `accountId`-uri** (nu s-a făcut re-pair / history sync sau nu s-a primit/trimis niciun mesaj).

---

## 8. Pipeline: history sync vs backfill

- **History sync (`messaging-history.set`):** La re-pair, backend creează **thread placeholders** în `threads` din `chats` și poate persista mesaje.  
- **Backfill:** Completează doar **mesaje** pentru thread-uri **deja existente**; **nu** creează thread-uri noi.  
- Dacă nu există threads (nici history sync, nici mesaje), backfill-ul nu rezolvă „0 conversații”.

---

## 9. Suspecți (prioritizați)

| Prioritate | Suspect | Dovezi / observații |
|------------|---------|----------------------|
| **1** | **Nu există threads în Firestore** pentru `accountId`-urile celor 3 conturi | UI și backend folosesc același `threads`. Query-urile sunt per `accountId`. History sync / mesaje creează threads. |
| 2 | **Rules** blochează read | Ar trebui să apară „Rules/RBAC blocked” în UI. Verifică dacă userul e employee (`staffProfiles`) și dacă `config/whatsapp_inbox` + `adminOnlyAccountIds` sunt setate corect. |
| 3 | **Index** lipsă | Ar trebui „Index mismatch…”. Verifică `firebase deploy --only firestore:indexes` și `firestore.indexes.json`. |
| 4 | **`config/whatsapp_inbox` inexistent + `get()` evaluat** | Teoretic deny; short‑circuit normally evită. Dacă există deny fără alt motiv, verifică refactorul rules. |
| 5 | **Mismatch proiect / emulator vs prod** | Nu s-a găsit în cod; CORS și config indică același proiect. |

---

## 10. Fix minim recomandat

**Cauza cea mai probabilă:** Niciun thread în Firestore pentru `accountId`-urile respective.

**Acțiuni:**

1. **Re-pair:** Manage Accounts → Disconnect pentru fiecare cont → Connect → Scan QR. Asta declanșează history sync și crearea de thread placeholders.  
2. **Verificare pe backend:** După re-pair, în loguri ar trebui:  
   `messaging-history.set event received; history chats: N`  
   `messaging-history.set, Thread placeholders from history chats: X created.`  
3. **Verificare în Firestore:**  
   - `threads` cu `accountId` în `{id1, id2, id3}` (din API).  
   - Poți folosi `audit_whatsapp_inbox_schema.mjs` cu acești `accountId`.  
4. **Instrumentare (opțional):** Loguri în UI la subscribe (accountIds, count per snapshot) și la Firestore error (code, message), ca în secțiunea 11.

---

## 11. Instrumentare minimală (diagnostic)

- La **subscribe** threads per account: log `accountIds` folosiți și, la fiecare snapshot, `accountId` → `docs.length`.  
- La **Firestore stream error:** log explicit `code` și `message`; păstrați afișarea în UI a `_errorMessage` / `_firestoreErrorCode` (nu doar `console.debug`).  
- (Opțional) La **scriere** threads în backend: log path `threads/{threadId}`, `accountId`, `clientJid` (sau hash).

---

## 12. Reproducere și verificare

### 12.1 Confirmare threads după re-pair

1. Disconnect → Connect → Scan QR pentru un cont.  
2. Pe backend (ex. Hetzner): `journalctl -u whatsapp-backend -f | grep -E 'messaging-history\.set|Thread placeholders'`.  
3. În Firestore: `threads` unde `accountId == <acel accountId>`.  
4. În Staff Inbox: reîmprospătare; ar trebui să apară conversațiile pentru acel cont.

### 12.2 Confirmare backfill nu creează threads

- Backfill folosește doar thread-uri existente; log: „No threads found for backfill (backfill never creates threads; re-pair to create)” când nu există threads.  
- Nu se face `threads.doc(...).set` în backfill pentru doc-uri noi.

### 12.3 Loguri așteptate (backend)

- History sync:  
  `📚 [accountId] messaging-history.set event received; history chats: N`  
  `📚 [accountId] messaging-history.set, Thread placeholders from history chats: X created.`  
- Backfill (fără threads):  
  `📚 [accountId] No threads found for backfill (backfill never creates threads; re-pair to create)`.

### 12.4 Ce vezi în UI

- **0 conversații, fără mesaj de eroare:** Cel mai probabil 0 threads în Firestore pentru `accountId`-urile afișate.  
- **„Rules/RBAC blocked”:** Probleme de rules / `adminOnlyAccountIds` / `staffProfiles`.  
- **„Index mismatch”:** Lipsă index pentru query-ul `threads` (sau messages).

---

## 13. Instrumentare adăugată (diagnostic)

- **Staff Inbox** (`staff_inbox_screen.dart`):
  - La **subscribe** threads: log `[Firebase-inbox-audit] StaffInbox threads query: accountIds=..., collection=threads, where=accountId==<id>, orderBy=lastMessageAt desc, limit=200`.
  - La **snapshot**: log `[Firebase-inbox-audit] StaffInbox threads result: accountId=... count=...`.
  - La **Firestore error**: log `[Firebase-inbox-audit] Firestore threads error: accountId=... code=... message=...`; UI afișează `_errorMessage` și `_firestoreErrorCode` (nu doar console).
- Caută în loguri după `[Firebase-inbox-audit]` pentru debug.

---

## 14. Fix minim (dacă e rules)

Dacă vezi **permission-denied** pe threads când `config/whatsapp_inbox` **nu** există (și rules short‑circuit nu e de ajuns), poți face rules mai defensive:

- Acum: `!exists(config) || !(accountId in get(config).data.adminOnlyAccountIds)`.
- Variantă sigură: evita orice `get(config)` când `!exists(config)` — e.g. două branch-uri separate în regula de read (unul pentru `!exists`, unul pentru `exists && !(accountId in get(...).adminOnlyAccountIds)`). Nu schimba rules fără reproducere; doar dacă logurile confirmă deny în acel caz.

---

## 15. Fișiere relevante

| Rol | Fișier |
|-----|--------|
| Query threads | `superparty_flutter/lib/utils/threads_query.dart` |
| Staff Inbox streams | `superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart` |
| Firestore rules | `firestore.rules` (match `threads`, `config/whatsapp_inbox`) |
| Indexuri | `firestore.indexes.json` |
| Backend history sync | `whatsapp-backend/server.js` (`ensureThreadsFromHistoryChats`, `onHistorySync`) |
| Backend backfill | `whatsapp-backend/server.js` (`backfillAccountMessages`) |
| Audit schema | `scripts/audit_whatsapp_inbox_schema.mjs` |
| Config admin-only | `scripts/set_admin_only_account.mjs` |
| **Verify accountIds vs threads** | `scripts/verify_inbox_account_ids.mjs` — listează accounts, rulează query threads per accountId, exclude admin, raportează count. Confirms API ids = thread accountIds. |

---

## 16. Fișiere modificate (audit + diagnostic)

| Fișier | Modificări |
|--------|------------|
| `docs/firebase-inbox-audit.md` | **Nou.** Raport Firebase (schema, rules, indexuri, suspects, fix, reproducere). |
| `superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart` | Loguri `[Firebase-inbox-audit]`: la subscribe (accountIds, query), la snapshot (accountId, count), la Firestore error (code, message). |
| `whatsapp-backend/whatsapp/message_persist.js` | **Fix structură Firestore:** `lastMessageAt` și `lastMessageAtMs` se scriu **mereu** la update thread (inbound + outbound). Fără asta, threads create/actualizate doar prin outbound nu aveau aceste câmpuri → erau excluse de `orderBy('lastMessageAt')` → nu apăreau în Inbox. |

---

## 17. Output final (H) – rezumat

1. **Firebase Structure Report:** acest document (`docs/firebase-inbox-audit.md`). Conține schema (colecții/path-uri), ce scrie backend vs ce citește UI, rules (inclusiv posibilă problemă exists/get), indexuri, suspects prioritați, fix minim, pași de reproducere/verificare.
2. **Fix minim:**  
   - **Operațional:** Re-pair (Disconnect → Connect → Scan QR) pentru a declanșa history sync și crearea de thread placeholders. Backfill nu creează threads.  
   - **Cod:** Doar instrumentare (loguri `[Firebase-inbox-audit]` în Staff Inbox). Fără schimbări de rules/indexuri/funcționalitate; niciun diff pentru „fix” în sens de bug în aplicație.  
   - **Rules:** Dacă reproducești permission-denied când `config/whatsapp_inbox` lipsește, aplică hardening din §14.
3. **Reproducere și verificare:**  
   - Confirmare threads după re-pair: §12.1.  
   - Confirmare backfill nu creează threads: §12.2.  
   - Loguri așteptate (backend): §12.3.  
   - Ce vezi în UI: §12.4.  
   - Loguri diagnostic (Flutter): caută `[Firebase-inbox-audit]` în console.
