# Inbox clienți – Runbook (503 / Firestore)

Inbox-ul de **clienți** în app se bazează pe **backend (Hetzner)** sau pe **proxy Cloud Functions** (ex. pe iOS simulator). Flutter apelează:

- **GET** `/api/whatsapp/threads/:accountId` (direct la `backendUrl` sau via `whatsappProxyGetThreads`)
- **GET** `/api/whatsapp/inbox/:accountId` (direct la `backendUrl` sau via `whatsappProxyGetInbox`)

cu token Firebase în header `Authorization: Bearer <idToken>`.

**Notă:** 401 de la `whatsappProxyGetInbox` fără `Authorization: Bearer <idToken>` e comportament corect — confirmă că funcția e live și middleware-ul de auth rulează înainte de forward.

---

## Cauza cea mai probabilă pe Hetzner: Firestore dezactivat

Backend-ul rulează fără Firestore dacă **FIREBASE_SERVICE_ACCOUNT_JSON** nu e setat corect. În acest caz, endpoint-urile de inbox răspund cu **503** și body `"Firestore not available"`.

În `server.js`, Firestore e inițializat doar dacă există credențiale (din `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH` sau `GOOGLE_APPLICATION_CREDENTIALS`); altfel apare warning și rămâne dezactivat.

---

## Ce să verifici rapid (≈30 secunde)

### Din logurile app (când deschizi inbox-ul de clienți)

Caută liniile:

- `getThreads: ... tokenPresent=... | endpointUrl=...` apoi `getThreads: CONFIG | backendUrl=... | statusCode=...`
- `getInbox: ... tokenPresent=... | endpointUrl=...` apoi `getInbox: CONFIG | backendUrl=... | statusCode=...`

Din cod, `getThreads()` lovește `GET $backendUrl/api/whatsapp/threads/$accountId` (sau proxy); `getInbox()` lovește `GET $backendUrl/api/whatsapp/inbox/$accountId?limit=$limit` (sau proxy). Status code-ul din log spune imediat dacă problema e pe Hetzner sau pe auth din app.

### Din logurile backend (pe Hetzner)

Caută mesajul că credențialele Firebase nu sunt setate / Firestore e disabled, de ex.:

- `❌ Firebase Admin init failed. No valid credentials found.`
- `⚠️  Continuing without Firestore...`

---

## Fix pe Hetzner

1. Setează **FIREBASE_SERVICE_ACCOUNT_JSON** pe container/serviciu (JSON-ul de service account Firebase, ca string valid).
2. Repornește backend-ul. Inițializarea din `server.js` depinde de variabila asta (sau de `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS`).
3. După restart, verifică `/health`: câmpul **firestore** trebuie să fie **"connected"**.  
   Exemplu: `curl http://37.27.34.179:8080/health` → `"firestore": "connected"`.

---

## Dacă Firestore e "connected", dar inbox-ul tot e gol/eroare

Endpoint-ul de threads folosește query pe `threads` cu `where(accountId == …)` și (în unele variante) sortare pe `lastMessageAt`. Dacă în log apare eroare de tip **"The query requires an index"**, trebuie creat index compus (`accountId` + `lastMessageAt`) în Firestore sau scos `orderBy` și sortat în memorie pe backend.

---

## Interpretare rapidă după status code

| Status | Cauză probabilă | Acțiune |
|--------|------------------|--------|
| **200** | Backend răspunde OK | Dacă UI e gol, problema e după request (parsing / afișare / date inexistente). |
| **401** + în log `tokenPresent=false` | Nu trimiți token (sau request-ul pleacă înainte ca auth să fie gata) | Tokenul vine din `FirebaseAuth.instance.currentUser.getIdToken()` și e pus în `Authorization: Bearer ...`. Folosește `_requireIdToken()` înainte de request. |
| **401** + în log `tokenPresent=true` | Token invalid/expirat sau backend respinge tokenul | Retry cu refresh (`getIdToken(true)`) sau verificare token pe server. |
| **503** | Backend fără Firestore | Setează FIREBASE_SERVICE_ACCOUNT_JSON pe Hetzner, restart, verifică /health → firestore: "connected". |
| **500** | Excepție pe backend | Verifică logurile de pe Hetzner pentru ruta respectivă + requestId; dacă e "index required", creează index sau scoate orderBy. |

**Important:** Când `getInbox`/`getThreads` merg direct la `backendUrl` (device real), status code-ul din log vine de la Hetzner. Când merg prin proxy (simulator), vine de la Cloud Function; 401 fără token confirmă că funcția e live și auth-ul rulează.

Spune ce **status code** vezi în app la request și ce **error** vine în body (și dacă `tokenPresent=true/false`), și se poate identifica exact blocajul (auth vs Firestore vs index).
