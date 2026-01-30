# Staff Inbox empty state + History sync – Livrabile

**Scop:** Empty state când conturi conectate dar 0 conversații; re-pair pentru import; loguri și config.

---

## Rezumat

- **Frontend:** Când există conturi conectate (allowed) dar 0 conversații, Staff Inbox afișează un chenar albastru (info callout) cu pașii de re-pair (Disconnect → Connect → Scan QR) și mențiunea că Sync/Backfill nu creează conversații noi.
- **Backend:** History sync la re-pair creează thread placeholders din `messaging-history.set`; backfill completează doar mesaje pentru thread-uri existente, nu creează thread-uri.
- **Config:** `WHATSAPP_SYNC_FULL_HISTORY` default `true`; documentat că nu trebuie să fie `false` pe Hetzner.
- **Loguri:** La history sync: `messaging-history.set event received; history chats: N`, apoi `messaging-history.set, Thread placeholders from history chats: X created.`; dacă 0, motivul e logat.

---

## Fișiere modificate

| Fișier | Modificări |
|--------|------------|
| `superparty_flutter/lib/screens/whatsapp/staff_inbox_screen.dart` | Empty state: chenar albastru cu pașii re-pair; bullet 2 cu „WhatsApp → Linked devices → Link a device”; folosire `showRepairCallout`. |
| `superparty_flutter/lib/utils/staff_inbox_empty_state.dart` | **Nou.** `showRepairCallout(connected, threads)` – predicate pentru afișarea callout-ului. |
| `superparty_flutter/test/utils/staff_inbox_empty_state_test.dart` | **Nou.** Unit tests pentru `showRepairCallout`. |
| `whatsapp-backend/server.js` | History sync: log „history chats: N”; capture `threadResult`; log „Thread placeholders from history chats: X created” + motiv când 0. Backfill: comentariu „Backfill NEVER creates threads”; log „No threads found (backfill never creates threads; re-pair to create)”. Același bloc de loguri și pentru `restoreAccount` onHistorySync. |
| `docs/VERIFICARE_SINCRONIZARE_HETZNER.md` | Notă env `WHATSAPP_SYNC_FULL_HISTORY`; secțiune „5a. Loguri așteptate la re-pair”. |
| `whatsapp-backend/__tests__/backfill-contract.spec.js` | **Nou.** Contract tests: backfill nu creează thread-uri (comment + log în sursă). |

---

## Acceptance criteria (bifate)

- [x] Re-pair (Disconnect → Connect → QR) determină apariția conversațiilor în Staff Inbox (threads create din history).
- [x] Backfill/sync completează mesaje doar în conversațiile deja existente.
- [x] Când există conturi conectate dar 0 conversații, UI arată chenarul albastru cu pașii de re-pair și mențiunea despre Sync/Backfill.
- [x] În loguri apare: „messaging-history.set, Thread placeholders from history chats: X created.”

---

## Verificare locală

### Flutter

```bash
cd superparty_flutter
flutter pub get
flutter test test/utils/staff_inbox_empty_state_test.dart
```

### Backend

```bash
cd whatsapp-backend
npm ci
npm test -- __tests__/backfill-contract.spec.js
```

---

## Deploy

### 1. Backend (Hetzner)

- Asigură-te că `WHATSAPP_SYNC_FULL_HISTORY` **nu** e `false` (implicit `true`). Dacă folosești env file, nu seta `WHATSAPP_SYNC_FULL_HISTORY=false`.
- Redeploy:

```bash
ssh root@37.27.34.179 "cd /opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend && git pull && npm ci --omit=dev && systemctl restart whatsapp-backend"
```

- Verificare:

```bash
curl -s http://37.27.34.179:8080/diag | head -20
```

### 2. Flutter (app)

- Build și distribuire APK/AAB ca de obicei (ex. workflow GitHub Actions pentru `superparty_flutter`).

---

## Verificare post-deploy

1. **Empty state:** Deschide Staff Inbox cu conturi conectate dar fără thread-uri (ex. cont nou, fără history sync). Trebuie să vezi chenarul albastru „Pentru a importa conversațiile și istoricul” cu pașii 1–3 și mențiunea Sync/Backfill.
2. **Re-pair:** Manage Accounts → Disconnect → Connect → Scan QR. Pe server (Hetzner):

   ```bash
   ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f --no-pager" | grep -E "messaging-history\.set|Thread placeholders"
   ```

   Așteptat: `messaging-history.set event received; history chats: N` și `messaging-history.set, Thread placeholders from history chats: X created.`
3. **Backfill:** Rulează Sync/Backfill. Cu 0 thread-uri, log: `No threads found for backfill (backfill never creates threads; re-pair to create)`.

---

## Exemple loguri așteptate

**La re-pair (history sync):**

```
📚 [accountId] messaging-history.set event received; history chats: 42
📚 [accountId] messaging-history.set, Thread placeholders from history chats: 42 created.
```

**Când 0 create (toate existau):**

```
📚 [accountId] messaging-history.set, Thread placeholders from history chats: 0 created.
📚 [accountId] messaging-history.set, 0 created — reason: all existed or skipped.
```

**Backfill fără thread-uri:**

```
📚 [accountId] No threads found for backfill (backfill never creates threads; re-pair to create)
```
