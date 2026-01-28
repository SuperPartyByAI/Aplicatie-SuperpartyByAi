# Inbox clienți – Runbook (503 / Firestore)

Inbox-ul de **clienți** în app se bazează pe **backend (Hetzner)**, nu pe Cloud Functions. Flutter apelează direct:

- **GET** `/api/whatsapp/threads/:accountId`
- **GET** `/api/whatsapp/inbox/:accountId`

cu token Firebase în header `Authorization: Bearer …`.

---

## Cauza cea mai probabilă pe Hetzner: Firestore dezactivat

Backend-ul rulează fără Firestore dacă **FIREBASE_SERVICE_ACCOUNT_JSON** nu e setat corect. În acest caz, endpoint-urile de inbox răspund cu **503** și body `"Firestore not available"`.

În `server.js`, Firestore e inițializat doar dacă există credențiale (din `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH` sau `GOOGLE_APPLICATION_CREDENTIALS`); altfel apare warning și rămâne dezactivat.

---

## Ce să verifici rapid (≈30 secunde)

### Din logurile app (când deschizi inbox-ul de clienți)

Caută liniile:

- `getThreads: CONFIG | backendUrl=... | statusCode=...`
- `getInbox: CONFIG | backendUrl=... | statusCode=...`

**Dacă vezi statusCode=503** → Firestore e dezactivat pe backend (fix mai jos).

**Dacă vezi 401** → problemă de auth (token lipsă/invalid).

**Dacă vezi 500** → eroare server (ex. index Firestore lipsă sau altă excepție).

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
| **503** | Firestore not available | Setează FIREBASE_SERVICE_ACCOUNT_JSON pe Hetzner, restart, verifică /health → firestore: "connected" |
| **401** | Token lipsă/invalid | Verifică autentificare în app (Firebase Auth, token în header) |
| **500** | Eroare server (index, excepție) | Verifică loguri backend; dacă e "index required", creează index sau scoate orderBy |

Spune ce **status code** vezi în app la request și ce **error** vine în body, și se poate identifica exact blocajul (auth vs Firestore vs index).
