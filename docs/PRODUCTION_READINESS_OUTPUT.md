# Production readiness – output summary

## 1. Fișiere modificate (aceste sesiuni) + motiv

| Fișier | Motiv |
|--------|--------|
| **`docs/WHATSAPP_PROD_RUNBOOK.md`** | Deploy Functions (firebase use, verify, secrets); secțiune **2b** Firestore indexes + `firebase deploy --only firestore:indexes`; **E2E validation** (Firestore, send, no GetMessages) + manual checks. |
| **`docs/PRODUCTION_READINESS_CHECKLIST.md`** | Checklist nou: indexuri, rules, secrets, whatsappProxySend, Flutter, E2E. Comenzi exacte și criterii de succes. |
| **`docs/PRODUCTION_READINESS_OUTPUT.md`** | Acest rezumat (fișiere, diff-uri, checklist). |
| **`superparty_flutter/lib/services/whatsapp_api_service.dart`** | `getMediaUrl` stub: returnează `{url: null, unimplemented: true}` (fără throw). UI poate afișa „Media unavailable”. |
| **`superparty_flutter/lib/screens/whatsapp/whatsapp_status_viewer_screen.dart`** | `_mediaUnavailable`; `_resolveMediaUrl` → `(String?, bool)`. După tap, dacă `unimplemented`: „Media unavailable”, fără tap; altfel „Tap to load media”. |
| **`superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`** | `_loadThreads` → `Future<void> async`; `onRefresh` → `await _loadThreads(forceRefresh: true)`. |
| **`superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`** | Stream messages: `orderBy('tsClient', descending: true)`, `limit(200)`; send via `sendViaProxy` (nu outbox direct). |
| **`superparty_flutter/lib/screens/whatsapp/README_CRM_FLOW.md`** | Notă: nu folosim `whatsappProxyGetMessages`; mesajele vin doar din Firestore. |
| **`functions/index.js`** | Eliminat export `whatsappProxyGetMessages`; comentariu că mesajele vin din Firestore, send folosește `whatsappProxySend`. |
| **`.github/workflows/whatsapp-ci.yml`** | Folosește `WHATSAPP_BACKEND_BASE_URL` pentru testele Functions. |

**Firestore:** `firestore.indexes.json` – deja există `fieldOverrides` pentru `messages` + `tsClient` (ASC/DESC). Nu s-a schimbat.

**Rules:** `outbox` rămâne `allow create, update, delete: if false;`. Fără modificări.

---

## 2. Patch / diff (esențial)

### `functions/index.js`

```diff
-exports.whatsappProxyGetMessages = onRequest(
-  {
-    region: 'us-central1',
-    cors: true,
-    maxInstances: 1,
-    secrets: [whatsappBackendBaseUrl, whatsappBackendUrl],
-  },
-  wrapWithSecrets(whatsappProxy.getMessagesHandler, [whatsappBackendBaseUrl, whatsappBackendUrl])
-);
+// whatsappProxyGetMessages removed: messages come only from Firestore threads/{threadId}/messages.
+// Flutter must not call this endpoint. Send uses whatsappProxySend.
```

### `superparty_flutter/lib/services/whatsapp_api_service.dart`

```diff
+  /// Resolve storage path to signed/media URL. Not implemented; status viewer
+  /// will not resolve storage paths until backend exposes an endpoint.
+  /// Returns { url: string? | null, unimplemented: true } so UI can show "Media unavailable".
+  Future<Map<String, dynamic>> getMediaUrl({required String storagePath}) async {
+    return {'url': null, 'unimplemented': true};
+  }
```

### `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`

```diff
-  void _loadThreads({bool forceRefresh = false}) {
+  Future<void> _loadThreads({bool forceRefresh = false}) async {
     _rebuildThreadsFromCache();
   }
...
-                                      _loadThreads(forceRefresh: true);
+                                      await _loadThreads(forceRefresh: true);
```

### `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`

- Send: `sendViaProxy(...)` în loc de scriere directă în `outbox`.
- Stream: `orderBy('tsClient', descending: true)`, `limit(200)`.

### `superparty_flutter/lib/screens/whatsapp/whatsapp_status_viewer_screen.dart`

- `_mediaUnavailable: Set<String>`, `_resolveMediaUrl` → `(String?, bool)`.
- După tap: dacă `unimplemented` → „Media unavailable”, `onTap: null`; altfel „Tap to load media”.

---

## 3. Checklist deploy + test (comenzi exacte)

Vezi **`docs/PRODUCTION_READINESS_CHECKLIST.md`**.

**Rezumat rapid:**

1. **Indexuri:** `firebase deploy --only firestore:indexes` → `Deploy complete!`
2. **Rules:** `firebase deploy --only firestore:rules`
3. **Secrets:** `firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL` (ex. `http://37.27.34.179:8080`)
4. **Functions:**  
   `firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,...`  
   `firebase functions:list | grep whatsappProxySend` → trebuie să apară.
5. **Flutter:** `flutter analyze lib/` fără erori; run → Inbox → Chat → Send; loguri fără `whatsappProxyGetMessages`.
6. **Smoke send:**  
   `curl -X POST https://us-central1-<project>.cloudfunctions.net/whatsappProxySend -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{...}'`  
   → răspuns JSON (nu HTML).

---

## 4. Ce trebuie rulat manual (fără acces CI/infra)

| Pas | Comandă / acțiune | Verificare |
|-----|-------------------|------------|
| Indexuri | `firebase deploy --only firestore:indexes` | Executat în sesiune: **Deploy complete!** |
| List functions | `firebase functions:list \| grep whatsappProxySend` | **Făcut:** `whatsappProxySend` **nu** apare în listă (doar `whatsappV4` / `whatsapp`). Deploy proxy necesar. |
| Deploy send | `firebase deploy --only functions:whatsappProxySend` | Trebuie rulat manual. |
| Set secret | `firebase functions:secrets:set WHATSAPP_BACKEND_URL` | Trebuie rulat manual. |
| Smoke curl | `curl -X POST .../whatsappProxySend ...` | După deploy + secret. |

---

## 5. Verificări efectuate

- **`firebase deploy --only firestore:indexes`:** rulat → **Deploy complete!**
- **`firebase functions:list`:** proiect `superparty-frontend`; `whatsappProxySend` nu e în listă → **deploy necesar.**
- **`flutter analyze lib/`:** 0 erori (doar info).
- **`npm test` (functions):** 166 passed.
- **`git grep` getMessages / whatsappProxyGetMessages în Flutter:** 0 apeluri (doar mențiune în README).

---

## 6. Referințe

- Runbook: `docs/WHATSAPP_PROD_RUNBOOK.md`
- Checklist: `docs/PRODUCTION_READINESS_CHECKLIST.md`
- CRM flow: `superparty_flutter/lib/screens/whatsapp/README_CRM_FLOW.md`
- Backend URL: `functions/lib/backend-url.js` (WHATSAPP_BACKEND_BASE_URL standard, fallback to functions.config().whatsapp.backend_base_url).
