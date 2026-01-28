# Firebase deploy – pași CLI + link-uri verificare (iPhone Safari)

**Proiect:** `superparty-frontend`  
**Regiune Functions WhatsApp:** `us-central1`

---

## 1. Proiect Firebase

### Alias → projectId (din `.firebaserc`)

| Alias    | projectId           |
|----------|---------------------|
| default  | superparty-frontend |

### Regiune și URL-uri

- **Regiune:** `us-central1`
- **Base URL Functions:**  
  `https://us-central1-superparty-frontend.cloudfunctions.net`
- **Exemple:**
  - `whatsappProxySend`:  
    `https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxySend`
  - `whatsappProxyGetAccounts`:  
    `https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccounts`

---

## 2. Link-uri Firebase Console (copy/paste, iPhone Safari)

- **Overview:**  
  https://console.firebase.google.com/project/superparty-frontend/overview

- **Functions:**  
  https://console.firebase.google.com/project/superparty-frontend/functions

- **Firestore → Indexes:**  
  https://console.firebase.google.com/project/superparty-frontend/firestore/indexes

- **Firestore → Data:**  
  https://console.firebase.google.com/project/superparty-frontend/firestore

- **Project Settings:**  
  https://console.firebase.google.com/project/superparty-frontend/settings/general

- **Secret Manager (GCP):**  
  https://console.cloud.google.com/security/secret-manager?project=superparty-frontend

---

## 3. Pași CLI (copy/paste)

```bash
firebase --version
```

```bash
firebase login
```

```bash
firebase projects:list
```

```bash
firebase use default
```

(proiectul `superparty-frontend` e setat ca `default` în `.firebaserc`)

```bash
firebase functions:list | grep whatsapp
```

---

## 4. Secrets

### Config backend URL

În cod se folosesc, în ordine:

1. `BACKEND_BASE_URL` (preferred, generic)
2. `WHATSAPP_BACKEND_BASE_URL` (current standard)
3. `WHATSAPP_BACKEND_URL` (legacy)

`getBackendBaseUrl()` din `functions/lib/backend-url.js` citește din `process.env`; Functions le iau din Secret Manager via `defineSecret`.

### Comenzi obligatorii

Setează **cel puțin unul** dintre cele două:

```bash
firebase functions:secrets:set WHATSAPP_BACKEND_URL
```

(la prompt introdu ex. `http://37.27.34.179:8080`)

**SAU:**

```bash
firebase functions:secrets:set WHATSAPP_BACKEND_BASE_URL
```

(aceeași valoare)

Alte secrets folosite în proiect (nu obligatorii pentru WhatsApp minimal): `GROQ_API_KEY` (pentru AI).

---

## 5. Firestore indexes

În `firestore.indexes.json` există deja `fieldOverrides` pentru:

- **collectionGroup:** `messages`
- **fieldPath:** `tsClient`
- **indexes:** ASC și DESC, `COLLECTION_GROUP`

Deploy:

```bash
firebase deploy --only firestore:indexes
```

---

## 6. Deploy Functions

### Minim pentru app (WhatsApp)

- `whatsappProxySend` – trimitere mesaje
- `whatsappProxyGetAccounts` – listă conturi
- `whatsappProxyAddAccount` – add account / QR
- `whatsappProxyRegenerateQr` – regenerate QR
- `whatsappProxyGetThreads` – listă threads (dacă folosit)
- `whatsappProxyDeleteAccount` – ștergere cont
- `whatsappProxyBackfillAccount` – backfill (super-admin)
- `processOutbox` – worker outbox (trimite mesajele către backend)

### Comandă deploy (listă completă)

```bash
firebase deploy --only functions:whatsappProxySend,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr,functions:whatsappProxyGetThreads,functions:whatsappProxyDeleteAccount,functions:whatsappProxyBackfillAccount,functions:processOutbox
```

### Deploy rules (opțional dar recomandat)

```bash
firebase deploy --only firestore:rules
```

---

## 7. Verificare post-deploy

### 7.1. `whatsappProxySend` există (nu 404/HTML)

Fără auth (poate 401, dar **nu** 404 și **nu** HTML):

```bash
curl -sS -o /dev/null -w "%{http_code}" -X POST "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxySend" \
  -H "Content-Type: application/json" \
  -d '{}'
```

- **401:** OK (endpoint există, cere auth).
- **404 sau răspuns HTML:** Funcția nu e deployată sau proiect/regiune greșit.

### 7.2. `whatsappProxyGetMessages` – 404 este OK

`whatsappProxyGetMessages` **nu mai există**. Mesajele vin doar din Firestore `threads/{threadId}/messages`. Flutter nu o mai apelează. Dacă apelezi manual și primești **404**, e comportament așteptat.

### 7.3. Smoke send (cu token)

Înlocuiești `YOUR_FIREBASE_ID_TOKEN` cu un ID token Firebase (ex. din app după login).

```bash
curl -sS -X POST "https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxySend" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "UN_THREAD_ID_REAL",
    "accountId": "UN_ACCOUNT_ID_REAL",
    "toJid": "40712345678@s.whatsapp.net",
    "text": "Test deploy",
    "clientMessageId": "test-'$(date +%s)'"
  }'
```

**Succes:** JSON de tip `{"success":true,"requestId":"...","duplicate":false}`.  
**401:** Token invalid/expirat.  
**403:** user nu e owner/co-writer pe thread.  
**404:** thread inexistent.  
**404 + HTML:** funcția nedeployată / proiect greșit.

---

## 8. Rezumat și ordine

### Ce se deployează

1. **Firestore indexes** – `messages.tsClient` (ASC/DESC), etc.
2. **Firestore rules** – (opțional)
3. **Functions** – proxy-uri WhatsApp + `processOutbox`.
4. **Secrets** – `WHATSAPP_BACKEND_URL` (sau `WHATSAPP_BACKEND_BASE_URL`).

### Ordine recomandată

1. `firebase login` + `firebase use default`
2. `firebase functions:secrets:set WHATSAPP_BACKEND_URL`
3. `firebase deploy --only firestore:indexes`
4. `firebase deploy --only firestore:rules`
5. `firebase deploy --only functions:whatsappProxySend,...` (comanda din secțiunea 6)
6. `firebase functions:list | grep whatsapp`
7. Verificare curl (7.1 și 7.3).

### Checklist test în app (iPhone)

- [ ] Deschizi app → WhatsApp → Accounts: lista de conturi se încarcă (fără crash).
- [ ] WhatsApp → Inbox: alegi cont → lista de conversații se încarcă.
- [ ] Inbox → deschizi un thread → Chat: mesajele apar din Firestore (sau „No messages yet”).
- [ ] Trimiți un mesaj → „Message sent!”; mesajul apare în chat.
- [ ] Dacă ceva e în fundal (ex. status), nu apare 404/HTML pentru GetMessages (nu se mai folosește).

### Link-uri rapide (iPhone Safari)

- Overview: https://console.firebase.google.com/project/superparty-frontend/overview  
- Functions: https://console.firebase.google.com/project/superparty-frontend/functions  
- Firestore Indexes: https://console.firebase.google.com/project/superparty-frontend/firestore/indexes  
- Secret Manager: https://console.cloud.google.com/security/secret-manager?project=superparty-frontend  
