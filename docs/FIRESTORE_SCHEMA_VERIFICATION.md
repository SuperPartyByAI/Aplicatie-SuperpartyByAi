# Verificare schema Firestore – threads & mesaje WhatsApp

Document de referință pentru verificarea că **threads** și **mesaje** se salvează corect în Firestore (colecții `threads`, `threads/{threadId}/messages`).

---

## 1. Structura așteptată

### 1.1 Colecția `threads`

- **ID document**: `{accountId}__{clientJid}`  
  - Ex: `account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443__40775389751@s.whatsapp.net`  
  - Pentru LID: `...__10728895467667@lid`  
  - **Invalid**: `...__[object Object]` → bug (JID obiect în loc de string); acum evitat prin `ensureJidString`.

| Câmp | Tip | Descriere |
|------|-----|-----------|
| `accountId` | string | ID cont WhatsApp |
| `clientJid` | string (sau map) | JID remote. Poate fi map cu `canonicalJid`/`rawJid`; Flutter folosește `_readString` cu `mapKeys`. |
| `canonicalThreadId` | string? | Același format ca ID-ul doc, când există canonicalizare |
| `lastMessageAt` | Timestamp | Ultima actualizare conversație |
| `lastMessageText` / `lastMessagePreview` | string? | Preview ultim mesaj (inbound) |
| `lastMessageDirection` | string | `inbound` / `outbound` |
| `displayName` | string? | Nume contact/grup |
| `phone` / `phoneE164` / `phoneNumber` | string? | Telefon normalizat (când e cazul) |
| `isLid` | bool? | `true` pentru JID @lid |
| `lastBackfillAt` | Timestamp? | Ultim backfill |
| Alte câmpuri | - | `ownerUid`, `coWriterUids`, `profilePictureUrl`, etc. |

### 1.2 Subcolecția `threads/{threadId}/messages`

- **ID document**: `waMessageId` (ex. `0d5c08d66efeed77f2213b3b`) sau `stableKeyHash`-based.

| Câmp | Tip | Descriere |
|------|-----|-----------|
| `accountId` | string | ID cont |
| `body` | string? | Text mesaj; **gol** pentru document/fără caption – **este OK** |
| `direction` | string | `inbound` / `outbound` |
| `messageType` | string | `text`, `document`, `image`, `video`, etc. |
| `clientJid` | string sau map | JID conversație. Poate fi string sau map cu `canonicalJid`/`rawJid` (istoric/migrări). Flutter folosește `_readString` cu `mapKeys`. |
| `tsClient` / `tsServer` | Timestamp | Timestamp client/server |
| `status` | string | ex. `sent`, `delivered`, `queued` |
| `providerMessageId` / `waMessageIdRaw` | string? | ID mesaj WhatsApp |
| `mediaType` | string? | Când e media |
| `source` | string? | ex. `sincronizare_istoric` |

---

## 2. Ce verifici când „se salvează corect”

1. **Thread IDs valide**  
   - Toate ID-urile din `threads` sunt `{accountId}__{jid}` cu `jid` string valid (terminat în `@s.whatsapp.net`, `@lid`, `@g.us`).  
   - **Nu** există `...[object Object]` sau `...[obiect Obiect]`.

2. **Mesaje cu `body` gol**  
   - Pentru `messageType` = `document` (sau alte media fără caption), `body` / `corp` poate fi `""` sau `null`.  
   - Normal; conținutul relevant e în `mediaType`, caption, filename etc.

3. **Deduplicare**  
   - Logica de dedupe folosește `stableKeyHash`, `providerMessageId`, etc.  
   - Duplicatele pot apărea în tool-uri de audit; important e că **scrierea** folosește chei stabile.

4. **LID vs număr**  
   - Thread-uri `@lid` pot avea `phoneE164` / `resolvedJid` `null` până la rezolvare.  
   - Verifică doar că `clientJid` e setat corect.

5. **„Deduplicare” vs „mesaje” sub un thread**  
   - Sub un thread avem **o singură** subcolecție de mesaje: `threads/{id}/messages` (în backend) sau `fire/.../mesaje` (dacă proiectul folosește schema în română).  
   - **Nu** scriem într-o subcolecție „deduplicare” sub thread. Dacă în Console vezi „deduplicare” **și** „mesaje”, „deduplicare” poate fi etichetă UI, altă funcționalitate sau legacy; **nu e din fluxul WhatsApp** (backend scrie doar în `messages` / `mesaje`).  
   - Deduplicarea se face prin: (a) **ID document stabil** (hash) pentru mesaj – un doc per mesaj; (b) colecția **`inboundDedupe`** (rădăcină) `{accountId}__{messageId}` înainte de salvare.  
   - Dacă același ID de document apare atât la „deduplicare” cât și la „mesaje”, e posibil să fie **același** conținut afișat în două locuri (UI) sau o altă sursă care scrie „deduplicare”. **Nu e eroare** în setarea noastră.

6. **ID document vs „ID-ul mesajului canonic”**  
   - ID-ul **documentului** (ex. `77aed8665a23279e19179461cf53dc8afc0e1a53`) e hash stabil; îl folosim pentru dedupe și persist.  
   - Câmpul **„ID-ul mesajului canonic”** (ex. `1f478cee32a1231a8ad15ff0`) e opțional, folosit de unele migrări/tool-uri. Poate coexista cu ID-ul de doc – **nu e eroare**.

---

## 3. Protecții împotriva `[object Object]` în threadId

- **`ensureJidString(value)`** (backend):  
  - Returnează JID-ul ca string valid sau `null`.  
  - Evită folosirea de obiecte care s-ar stringifica la `[object Object]`.

- Folosire:
  - **saveMessageToFirestore**: `from = ensureJidString(msg.key.remoteJid)`; dacă `!from`, mesajul nu se salvează.
  - **saveMessagesBatch** (history sync): același pattern; mesajele cu `remoteJid` invalid se sar.
  - **message_persist.writeMessageIdempotent**: dacă `threadId` conține `[object Object]` sau `[obiect Obiect]`, scrierea se abandonează.
  - **Contacts batch**: `contact.id` se normalizează cu `ensureJidString` înainte de a scrie în `contacts`.

- **Realtime** (historySyncNotification): fetch-ul imediat se declanșează doar dacă `ensureJidString(from)` e valid.

---

## 4. Inbox Angajați vs My Inbox – ce conturi și ce structură

- **Inbox Angajați**: folosește **doar conturile staff** (toate conturile WhatsApp **în afară** de 0737571397). Ex.: `account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443`. Thread-urile sunt `account_prod_26ec...__{jid}`.
- **My Inbox**: un singur cont, cel din `users/{uid}.myWhatsAppAccountId` (ex. contul tău personal). De obicei `account_prod_f869ce13d00bc7d7aa13ef18c16f3bd5` (0737571397).
- **Inbox Admin**: doar contul 0737571397 (același ID ca My Inbox când ești admin).

Structura pe care o vezi în Firestore (thread + `messages`) e **aceeași** pentru toate inbox-urile. Diferă doar **ce `accountId`** interogăm. Dacă inspecționezi `account_prod_f869ce13d00bc7d7aa13ef18c16f3bd5__...` → e **My Inbox / Admin**. Dacă inspecționezi `account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443__...` → e **Inbox Angajați** (staff).

- **„ID cont” / „cont_prod” în Console**: Consola Firestore poate afișa „ID cont” (sau „cont_prod”) ca etichetă pentru câmpul `accountId`. Valoarea rămasă e `account_prod_...` (nu un câmp separat „cont_prod”).
- **`clientJid` map vs string**: Uneori `clientJid` e **map** (`canonicalJid`, `rawJid`, etc.), nu string. Flutter citește cu `_readString(..., mapKeys: ['canonicalJid','jid','clientJid','remoteJid'])`, deci e OK.

---

## 5. Cum verifici în consola Firestore

1. **Threads**  
   - Filtrezi `accountId` = cont cunoscut (staff sau admin).  
   - ID-urile documentelor trebuie să fie `{accountId}__{jid}`; **fără** `[object Object]` / `[obiect Obiect]`.

2. **Messages**  
   - Sub `threads/{threadId}/messages`:  
     - `body` gol la documente = OK.  
     - `direction`, `messageType`, `tsClient`/`tsServer` = prezente și coerente.

3. **Dump structură „as saved”**  
   - `node scripts/dump_firestore_inbox_sample.mjs --project <project> --accountId <id>`  
   - sau `--threadId "account_prod_...__..."` pentru un thread anume.  
   - Afișează un thread + câteva mesaje ca JSON (cu Timestamp → ISO). Folosește-l pentru a compara cu ce vezi în Console.

4. **Deduplicare**  
   - Rulezi scripturile din `whatsapp-backend/scripts/` (ex. `audit-firestore-duplicates.js`) conform documentației lor.

**Checklist rapid „se salvează OK”** (per account):

- [ ] Thread-uri: `accountId` setat, `lastMessageAt` prezent, ID-uri **fără** `[obiect Obiect]` / `[object Object]`.
- [ ] Mesaje: `direction` inbound/outbound, `tsClient` (sau `createdAt`) prezent, `body` poate fi gol la documente/media.
- [ ] Pentru Inbox Angajați: conturi staff (`account_prod_26ec...` etc.), fără contul admin 0737571397.
- [ ] Pentru My Inbox: doar `myWhatsAppAccountId` (ex. `account_prod_f869...`).

---

## 6. Referințe cod

- **Scriere threads/mesaje**: `whatsapp-backend/whatsapp/message_persist.js` (`writeMessageIdempotent`).  
- **History sync**: `whatsapp-backend/server.js` → `saveMessagesBatch`, `saveMessageToFirestore`.  
- **`ensureJidString`**: `whatsapp-backend/server.js` (helper), folosit la persist și la contacts batch.  
- **Canonicalizare**: `whatsapp-backend/lib/wa-canonical.js`, `buildCanonicalThreadId`; `server.js` → `canonicalClientKey`, `buildCanonicalThreadId`.

---

## 7. De ce nu apar mesajele în chat

Câteva cauze frecvente și ce s-a făcut:

### 7.1 `tsClient` lipsă / null

- **Problema**: Chat-ul face `orderBy('tsClient', descending: true)` pe `threads/{threadId}/messages`. Firestore **exclude** documentele cu `tsClient == null` din query-uri sortate → mesajele respective „dispar”.
- **Fix**: În `message_persist` există **fallback**: dacă `messageTimestamp` lipsește, setăm `tsClient` = `Timestamp.now()` (și `tsClientMs`). Astfel nu mai scriem niciodată `tsClient` null.

### 7.2 LID vs canonical – mesajele rămân pe @lid

- **Problema**: Inbox-ul **ascunde** thread-urile @lid când există un thread **canonical** (`redirectTo` sau același contact cu `@s.whatsapp.net`). Lista arată doar thread-ul canonical. Mesajele vechi au fost salvate pe thread-ul **@lid**; cele noi pe **canonical**. Când deschizi canonical-ul, vezi doar mesajele de acolo → „lipsesc” cele vechi.
- **Fix**: Rulează migrarea **LID → canonical** ca să copiezi mesajele de pe @lid în thread-ul canonical:
  - `whatsapp-backend/scripts/migrate-lid-threads.js` (vezi README-ul din script).
- **Verificare**: În Firestore, sub `threads/...__...@lid` există mesaje; sub `threads/...__...@s.whatsapp.net` (canonical) sunt mai puține sau zero. După migrare, canonical ar trebui să aibă toate mesajele.

### 7.3 Thread-uri invalide `[object Object]` / `[obiect Obiect]`

- **Problema**: Au existat thread-uri cu ID-uri care conțineau `[object Object]` sau `[obiect Obiect]`. Mesajele pentru **mai multe contacte** au fost salvate într-un singur thread invalid (ex. My Inbox). Nu mai se creează altele noi (vezi secțiunea 3), dar cele vechi rămân.
- **Filtru în app**: My Inbox, Inbox Angajați, Inbox Admin etc. **exclud** thread-urile al căror ID conține `[object Object]` sau `[obiect Obiect]`, astfel că nu mai apar în listă.
- **Migrare mesaje** (recuperare conversații):
  - `node scripts/migrate_object_object_thread_messages.mjs --project <project> [--dry-run] [--hide-after]`
  - Citește mesajele din thread-urile invalide, extrage JID din `clientJidRaw` / `clientJid`, și le **copiază** în thread-uri corecte `accountId__jid`. Apoi poți marca invalidul `hidden` cu `--hide-after`.
  - Rulează întâi `--dry-run`, apoi fără pentru migrare.
- **Curățare** (după migrare, opțional):
  - `node scripts/cleanup_object_object_threads.mjs --project <project> [--dry-run] [--hide] [--delete]`
  - `--dry-run`: doar listează thread-urile invalide.
  - `--hide`: setează `hidden=true`, `archived=true` (nedistructiv).
  - `--delete`: șterge thread-urile invalide și subcolecția `messages` (distructiv).

### 7.4 Index pentru `tsClient`

- Chat-ul folosește `orderBy('tsClient', descending: true)` pe `messages`. Trebuie index în Firestore (ex. `fieldOverrides` pentru `messages` + `tsClient`).
- Dacă lipsește indexul → `failed-precondition` la stream, nu doar „lista goală”. Verifică `firestore.indexes.json` și `firebase deploy --only firestore:indexes`.

---

## 8. Rezumat

- **Thread IDs**: mereu `{accountId}__{jid}` cu `jid` string valid; `[object Object]` / `[obiect Obiect]` evitate prin `ensureJidString` și validare în `message_persist`.  
- **Mesaje**: `body` gol la documente e așteptat; `tsClient` are mereu fallback (nu null). `clientJid` poate fi string sau map; Flutter folosește `_readString` cu `mapKeys`.  
- **Verificare**: inspecție în Firestore + `dump_firestore_inbox_sample.mjs` + scripturi de audit; pentru „nu apar mesajele” vezi secțiunea 7.
