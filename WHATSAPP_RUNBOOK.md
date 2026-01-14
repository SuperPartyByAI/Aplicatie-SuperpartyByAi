# WhatsApp runbook (alive vs dead, pairing, send)

This runbook is for confirming the WhatsApp backend is alive and pairing works end-to-end.

## Implementations found (evidence)

### A) Firebase Functions (canonical going forward): `whatsappV4`

Export:

```280:288:c:\src\Aplicatie-SuperpartyByAi\functions\index.js
exports.whatsappV4 = onRequest(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 10,
  },
  app
);
```

Endpoints:

```86:205:c:\src\Aplicatie-SuperpartyByAi\functions\index.js
app.get('/api/whatsapp/accounts', (req, res) => { ... });
app.post('/api/whatsapp/add-account', async (req, res) => { ... });
app.post('/api/whatsapp/accounts/:accountId/regenerate-qr', async (req, res) => { ... });
app.delete('/api/whatsapp/accounts/:accountId', async (req, res) => { ... });
app.post('/api/whatsapp/send', async (req, res) => { ... });
app.post('/api/whatsapp/send-message', async (req, res) => { ... });
app.get('/connect/:accountId', async (req, res) => { ... });
```

Security:
- Control-plane endpoints are **super-admin only** (Firebase ID token required).

### B) Railway backend (legacy / external): `whats-upp-production.up.railway.app`

`kyc-app` uses it today:

```6:6:c:\src\Aplicatie-SuperpartyByAi\kyc-app\kyc-app\src\components\WhatsAppAccounts.jsx
const WHATSAPP_URL = 'https://whats-upp-production.up.railway.app';
```

## Which one the internal Flutter app uses today

Flutter does **not** use either backend for “pairing”; it opens a WhatsApp deep link:

```3:50:c:\src\Aplicatie-SuperpartyByAi\superparty_flutter\lib\services\whatsapp_service.dart
String url = 'https://wa.me/$cleanPhone';
```

## Canonical URL (Firebase)

Project ID comes from `.firebaserc`:

```1:5:c:\src\Aplicatie-SuperpartyByAi\.firebaserc
{
  "projects": {
    "default": "superparty-frontend"
  }
}
```

**Base URL:**

`https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV4`

## Runbook: verify `whatsappV4` (copy/paste)

### Preconditions

- You need a **Firebase ID token** for the super-admin user (`ursache.andrei1995@gmail.com`).
  - Put it into an env var: `ID_TOKEN`.

### 1) Health

```bash
export BASE="https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV4"
curl -sS "$BASE/health" | jq
```

Expected:
- JSON with `status: "healthy"`

### 2) Create account (triggers QR)

```bash
curl -sS -X POST "$BASE/api/whatsapp/add-account" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test WA","phone":"+40700000000"}' | jq
```

Expected:
- `{ success: true, account: { id, status, ... } }`

### 3) List accounts (wait for `qr_ready`)

```bash
curl -sS "$BASE/api/whatsapp/accounts" \
  -H "Authorization: Bearer $ID_TOKEN" | jq
```

Expected:
- `accounts[].status` transitions to `qr_ready`
- When `qr_ready`: `accounts[].qrCode` is present (data URL)

### 4) Open connect page and scan QR

Open in browser (token can be passed as query param for the HTML page):

`$BASE/connect/<ACCOUNT_ID>?token=$ID_TOKEN`

Expected:
- page shows `QR_READY` with QR image
- after scan, status becomes `CONNECTED`

### 5) Send a message

```bash
curl -sS -X POST "$BASE/api/whatsapp/send-message" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"<ACCOUNT_ID>","to":"+407xxxxxxxx","message":"ping"}' | jq
```

Expected:
- `{ success: true, ... }`

## Common failure modes

- **401 missing_auth_token / invalid_auth_token**: you didn’t provide a valid `ID_TOKEN`.
- **403 super_admin_only**: token is valid but not for the super-admin email.
- **No QR appears**: Baileys session cannot initialize (check Cloud Functions logs for `whatsappV4`).

## Where to look (logs)

- Cloud Functions logs for `whatsappV4` (GCP / Firebase Functions logs).

