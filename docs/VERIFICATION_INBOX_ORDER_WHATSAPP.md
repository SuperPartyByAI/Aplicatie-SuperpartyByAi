# Verificare ordine Inbox = WhatsApp (telefon)

Ordinea conversațiilor trebuie să fie **identică** cu WhatsApp pe telefon: thread-ul cu **ultimul mesaj** (inbound sau outbound) primele.

## Modificări aplicate

- **Backend:** `lastMessageAt` / `lastMessageAtMs` se actualizează la **orice** mesaj nou (inbound + outbound). Opțional: `lastInboundAtMs` doar pentru inbound.
- **Frontend:** Sortare cu `threadTimeMs` (fallback: `lastMessageAtMs` → `lastMessageAt` → `lastMessageTimestamp` → `updatedAt` → 0). Aceeași logică în Staff Inbox, WhatsApp Inbox, Employee Inbox.
- **Backfill:** Scriptul `migrate_threads_backfill_lastMessageAt.mjs` completează și `lastMessageAtMs`.

## Pași de verificare

### 1. Backfill (thread-uri vechi)

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

# Lista de accountId-uri angajați (unul per linie), ex. employee_accounts.txt
# Opțional: doar un accountId
node scripts/migrate_threads_backfill_lastMessageAt.mjs \
  --project superparty-frontend \
  --accountId <ACCOUNT_ID> \
  --dryRun

# După verificare:
node scripts/migrate_threads_backfill_lastMessageAt.mjs \
  --project superparty-frontend \
  --accountId <ACCOUNT_ID> \
  --apply
```

Pentru mai multe conturi (ex. angajați):

```bash
node scripts/migrate_threads_backfill_lastMessageAt.mjs \
  --project superparty-frontend \
  --accountIdsFile scripts/employee_accounts.txt \
  --dryRun

# apoi --apply
```

### 2. Firestore

- Deschide un document `threads/{threadId}`.
- Confirmă că există `lastMessageAt` și `lastMessageAtMs`.
- Trimite un mesaj **outbound** din app → verifică că `lastMessageAt` / `lastMessageAtMs` se actualizează.
- Trimite un mesaj **inbound** (de pe telefon) → same check.

### 3. Test manual în UI

1. Alege două conversații **A** și **B**.
2. Trimite un mesaj **OUTBOUND** în **B** (din aplicație / integrare).
3. Verifică că **B** urcă pe **locul 1** în:
   - **WhatsApp Inbox (All Accounts)**
   - **Inbox Angajați**
4. Trimite un mesaj **INBOUND** în **A** (de pe telefon).
5. Verifică că **A** urcă pe **locul 1** în ambele ecrane.

### 4. Schema guard (backend)

La outbound când se face doar update pe thread (fără persistare mesaj), backend-ul verifică după update că thread-ul are `lastMessageAt`. Dacă lipsește, apare în log:

```
[schema-guard] Thread <hash> missing lastMessageAt after outbound update (accountId=<hash>)
```

### 5. Format / lint / build

```bash
# Flutter
cd superparty_flutter
dart format lib/utils/thread_sort_utils.dart lib/screens/whatsapp/employee_inbox_screen.dart
dart analyze lib/utils/thread_sort_utils.dart lib/screens/whatsapp/employee_inbox_screen.dart
flutter pub get && flutter build apk --debug

# Backend (lint pre-existent în alte fișiere)
cd whatsapp-backend && npm run lint
```

## Fișiere modificate

- `whatsapp-backend/whatsapp/message_persist.js` – `lastInboundAtMs`, comentarii.
- `whatsapp-backend/server.js` – schema-guard după `updateThreadLastMessageForOutbound`.
- `scripts/migrate_threads_backfill_lastMessageAt.mjs` – backfill `lastMessageAtMs`, comentarii.
- `superparty_flutter/lib/utils/thread_sort_utils.dart` – `threadTimeMs` robust (num), comentarii.

## Query / index

- Employee Inbox folosește `buildThreadsQuery(accountId)` cu `orderBy('lastMessageAt', descending: true)`.
- **Nu** s-a reintrodus un `orderBy` care necesită index nou; se păstrează query-ul simplu per account + sortare în memorie cu `threadTimeMs` după merge.
