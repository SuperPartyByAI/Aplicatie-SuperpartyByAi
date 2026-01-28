# WhatsApp CRM Migration – Final Summary

**Scope:** GetMessages removed, Send via proxy only, Firestore-only messages, WHATSAPP_BACKEND_URL config.

---

## 1. Fișiere modificate

| Fișier | Modificare |
|--------|------------|
| `functions/whatsappProxy.js` | Eliminat `getMessagesHandler` și `exports.getMessagesHandler`. Comentariu: GetMessages removed, send uses whatsappProxySend. |
| `functions/lib/backend-url.js` | Folosește `WHATSAPP_BACKEND_BASE_URL` / `WHATSAPP_BACKEND_URL` / `BACKEND_BASE_URL` (Hetzner). |
| `docs/WHATSAPP_PROD_RUNBOOK.md` | Troubleshooting 404/HTML; notă tsClient; deploy/index/secrets deja documentate. |
| `superparty_flutter/.../README_CRM_FLOW.md` | 404/HTML fix; `orderBy('tsClient', descending: true)` în doc. |
| `ACCEPTANCE_CHECKLIST_CRM_WHATSAPP.md` | Secțiune **Migration** (Inbox refresh, Chat Firestore, Send proxy, no GetMessages). |

**Deja în repo (nu modificate acum):**
- `functions/index.js`: export `whatsappProxyGetMessages` deja scos.
- Flutter: chat stream `orderBy('tsClient', desc)`, `sendViaProxy`, inbox `onRefresh` async.
- CI: `WHATSAPP_BACKEND_URL` în whatsapp-ci.
- Smoke: `WHATSAPP_BACKEND_URL` + Hetzner default, http/https.
- `firestore.indexes.json`: fieldOverrides `messages` + `tsClient`.

---

## 2. Verificări făcute

- **Audit:** `git grep` getMessages/whatsappProxyGetMessages în Flutter → doar README („we do NOT use”). Zero apeluri.
- **Functions tests:** `npm test` → 166 passed.
- **Flutter analyze:** 0 erori (doar info/hint).
- **Smoke:** Backend health PASS. „All Functions Deployed” FAIL dacă `whatsappProxySend` nu e deployat (normal până la deploy manual).

---

## 3. Comenzi deploy + verify (copy-paste)

### Deploy

```bash
firebase use superparty-frontend   # sau default / alias tău
cd functions && npm install && cd ..

firebase deploy --only firestore:indexes
firebase deploy --only firestore:rules
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
```

### Secrets

```bash
firebase functions:secrets:set WHATSAPP_BACKEND_URL
# Valoare ex.: http://37.27.34.179:8080
```

### Verify

```bash
firebase functions:list | grep whatsappProxySend
# Trebuie: whatsappProxySend(us-central1)
```

### Smoke send (curl – necesită ID token)

```bash
curl -sS -X POST "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxySend" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "EXISTENT_THREAD_ID",
    "accountId": "EXISTENT_ACCOUNT_ID",
    "toJid": "40712345678@s.whatsapp.net",
    "text": "Test",
    "clientMessageId": "test-'$(date +%s)'"
  }'
```

**Succes:** JSON `{"success":true,"requestId":"...","duplicate":false}`. **Eșec:** 404/HTML = funcție nedeployată sau proiect/regiune greșite.

---

## 4. Checklist acceptanță (migrare)

1. **Inbox refresh** – pull-to-refresh, threads din Firestore.
2. **Chat stream** – mesaje din `threads/{threadId}/messages`, fără GetMessages.
3. **Send** – `sendViaProxy` → 2xx JSON, „Message sent!”.
4. **Logs** – zero request către `whatsappProxyGetMessages`.

---

## 5. Ce trebuie făcut manual

- **Deploy Functions** (inclusiv `whatsappProxySend`) dacă nu sunt deployate.
- **Setare secret** `WHATSAPP_BACKEND_URL`.
- **Smoke curl** după deploy (cu token).

Dacă workflow-ul nu poate fi push-uit (lipsă scope): aplică manual modificările din branch în CI (whatsapp-ci folosește deja `WHATSAPP_BACKEND_URL`).
