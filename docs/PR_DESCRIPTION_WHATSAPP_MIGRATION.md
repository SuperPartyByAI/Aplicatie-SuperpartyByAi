# PR: WhatsApp CRM migration – GetMessages removed, Send via proxy, WHATSAPP_BACKEND_URL

**Branch:** `chore/remove-legacy hosting` → migrated to Hetzner  
**Commit:** `e88fc34f`

---

## Summary

- **Flutter** nu mai folosește `getMessages` / `whatsappProxyGetMessages`; mesajele vin doar din Firestore `threads/{threadId}/messages` (Stream).
- **Send** se face exclusiv prin `whatsappProxySend` → outbox server-side (Admin SDK). Outbox rămâne server-only în Firestore rules.
- **Config** folosește `WHATSAPP_BACKEND_BASE_URL` (standard) cu fallback la `functions.config().whatsapp.backend_base_url` (Hetzner).
- **CI** (whatsapp-ci) folosește `WHATSAPP_BACKEND_BASE_URL` pentru testele Functions.
- **Docs / runbook**: 404/HTML = funcție nedeployată sau proiect/regiune greșit; pași deploy/verify actualizați.

---

## Changes in this PR

| Area | Change |
|------|--------|
| **functions/whatsappProxy.js** | Eliminat `getMessagesHandler` și `exports.getMessagesHandler` (dead code). |
| **functions/lib/backend-url.js** | Folosește `WHATSAPP_BACKEND_BASE_URL` (standard) cu fallback la `functions.config().whatsapp.backend_base_url` (Hetzner). |
| **docs/WHATSAPP_PROD_RUNBOOK.md** | Troubleshooting 404/HTML; notă tsClient pentru index. |
| **README_CRM_FLOW.md** | 404/HTML fix; `orderBy('tsClient', descending: true)` în doc. |
| **ACCEPTANCE_CHECKLIST_CRM_WHATSAPP** | Secțiune **Migration** (Inbox, Chat Firestore, Send proxy, no GetMessages). |
| **docs/** | `MIGRATION_WHATSAPP_CRM_FINAL.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `PRODUCTION_READINESS_OUTPUT.md`. |
| **scripts/firebase_deploy_whatsapp.sh** | Script login + deploy (indexes, rules, Functions). |

*(Alte modificări din branch – index.js fără export GetMessages, Flutter chat/inbox/sendViaProxy, CI WHATSAPP_BACKEND_URL – pot fi în commit-uri anterioare pe același branch.)*

---

## Checklist before merge

- [ ] `firebase use <alias>`
- [ ] `firebase deploy --only firestore:indexes`
- [ ] `firebase deploy --only firestore:rules`
- [ ] `firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,...`
- [ ] `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL` (ex. `http://37.27.34.179:8080`)
- [ ] `firebase functions:list | grep whatsappProxySend` → funcția apare
- [ ] Smoke send: `curl -X POST .../whatsappProxySend -H "Authorization: Bearer <token>" ...` → JSON 2xx
- [ ] App: Inbox refresh, Chat stream Firestore, Send → „Message sent!”, fără request la `whatsappProxyGetMessages`

---

## Deploy + verify (copy-paste)

```bash
firebase use superparty-frontend
cd functions && npm install && cd ..
firebase deploy --only firestore:indexes
firebase deploy --only firestore:rules
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
firebase functions:list | grep whatsappProxySend
```

---

## References

- `docs/MIGRATION_WHATSAPP_CRM_FINAL.md` – rezumat + comenzi
- `docs/PRODUCTION_READINESS_CHECKLIST.md` – checklist deploy
- `scripts/firebase_deploy_whatsapp.sh` – deploy script
