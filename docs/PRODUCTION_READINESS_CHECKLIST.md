# Production readiness checklist – WhatsApp sync

Use this after code changes to verify end-to-end flow and deployment.

## Pre-requisites

- Firebase CLI logged in: `firebase login`
- Project selected: `firebase use <alias>` (e.g. `default` or `superparty-frontend`)
- Backend (Hetzner) running and reachable (Functions use secret `WHATSAPP_BACKEND_BASE_URL`)

---

## 1. Firestore indexes

**Why:** Chat streams `threads/{threadId}/messages` with `orderBy('tsClient', descending: true)`. Index required.

**Commands:**

```bash
firebase deploy --only firestore:indexes
firebase firestore:indexes
```

**Success:** `Deploy complete!` and `messages` + `tsClient` in index list (or field overrides).

---

## 2. Firestore rules

**Why:** `outbox` is server-only; client must not write.

**Commands:**

```bash
firebase deploy --only firestore:rules
```

**Check:** `outbox` has `allow create, update, delete: if false;`.

---

## 3. Secrets (backend URL)

**Why:** `processOutbox` and proxy handlers (getAccounts, etc.) forward to backend. They use `WHATSAPP_BACKEND_BASE_URL` (Firebase secret or `functions.config().whatsapp.backend_base_url`).

**Commands:**

```bash
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
# Value e.g.: http://37.27.34.179:8080
firebase functions:secrets:access WHATSAPP_BACKEND_BASE_URL
```

**Success:** Secret is set; access prints the value (or confirms presence).

---

## 4. Cloud Functions – whatsappProxySend

**Why:** Flutter sends via `sendViaProxy()` → POST `whatsappProxySend`. No client write to `outbox`.

**Commands:**

```bash
cd functions
npm install
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
firebase functions:list | grep whatsappProxySend
```

**Success:** `whatsappProxySend` appears in list (us-central1). No 404/HTML when calling the endpoint.

**Smoke test (requires ID token):**

```bash
curl -sS -X POST "https://us-central1-<project>.cloudfunctions.net/whatsappProxySend" \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"_","accountId":"_","toJid":"_@s.whatsapp.net","text":"x","clientMessageId":"test-1"}'
```

Expect JSON (e.g. 404 thread, 403, or 200 with `success`). **Not** HTML.

---

## 5. Flutter app

**Checks:**

- `flutter analyze lib/` – no errors.
- Run app → WhatsApp → Inbox → open thread. Messages load from Firestore (no `whatsappProxyGetMessages` in logs).
- Send message → logs show `sendViaProxy` / `whatsappProxySend`; success or clear error.
- No "permission denied" on `outbox` (client never writes there).
- Status viewer: "Tap to load media" → tap → "Media unavailable" (getMediaUrl stub). No crash.

---

## 6. E2E validation

| Step | Action | Success |
|------|--------|---------|
| 1 | Firestore: `threads` has docs; `threads/{id}/messages` has docs with `tsClient` | Structure OK |
| 2 | App: send message in chat | Logs: sendViaProxy, 2xx JSON |
| 3 | Firestore: `outbox/{requestId}` created (server-side) | Doc exists, status `queued` → `sent`/`failed` |
| 4 | Logs: no request to `whatsappProxyGetMessages` | Zero hits |

---

## 7. What to run manually (no CI access)

If you have Firebase/project access:

1. `firebase deploy --only firestore:indexes`
2. `firebase deploy --only firestore:rules`
3. `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL`
4. `firebase deploy --only functions:whatsappProxySend` (and other proxy functions as needed)
5. `firebase functions:list | grep whatsappProxySend`
6. Smoke `curl` to `whatsappProxySend` with Bearer token

If you **cannot** deploy (no workflow scope / no Firebase access): run the above locally or ask a project owner. Mark completed steps in this checklist.

---

## References

- **Runbook:** `docs/WHATSAPP_PROD_RUNBOOK.md`
- **CRM flow:** `superparty_flutter/lib/screens/whatsapp/README_CRM_FLOW.md`
- **Backend URL:** `functions/lib/backend-url.js` (WHATSAPP_BACKEND_BASE_URL only; default Hetzner `http://37.27.34.179:8080`)
