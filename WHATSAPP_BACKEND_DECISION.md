# WhatsApp backend decision (source of truth)

## Decision

**Canonical backend going forward: Firebase Cloud Functions `whatsappV4` (project `superparty-frontend`).**

## Evidence (what exists today)

### Firebase Functions implementation exists and is deployable

`functions/index.js` exports the HTTP function:

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

It implements control-plane endpoints (accounts, QR, send, connect page):

```86:205:c:\src\Aplicatie-SuperpartyByAi\functions\index.js
app.get('/api/whatsapp/accounts', (req, res) => { ... });
app.post('/api/whatsapp/add-account', async (req, res) => { ... });
app.post('/api/whatsapp/accounts/:accountId/regenerate-qr', async (req, res) => { ... });
app.delete('/api/whatsapp/accounts/:accountId', async (req, res) => { ... });
app.post('/api/whatsapp/send', async (req, res) => { ... });
app.post('/api/whatsapp/send-message', async (req, res) => { ... });
app.get('/connect/:accountId', async (req, res) => { ... });
```

### Separate Railway backend exists but is not integrated with the Flutter app

The React `kyc-app` currently targets Railway directly:

```6:6:c:\src\Aplicatie-SuperpartyByAi\kyc-app\kyc-app\src\components\WhatsAppAccounts.jsx
const WHATSAPP_URL = 'https://whats-upp-production.up.railway.app';
```

Flutter does **not** use a backend for WhatsApp management today; it just opens a `wa.me` link:

```3:50:c:\src\Aplicatie-SuperpartyByAi\superparty_flutter\lib\services\whatsapp_service.dart
String url = 'https://wa.me/$cleanPhone';
```

## Why `whatsappV4` is canonical

- **Security alignment**: the management app already uses Firebase Auth; `whatsappV4` can enforce **super-admin** via Firebase ID token (control plane must be super-admin only).
- **Single platform**: same Firebase project (`.firebaserc`) and the same Firestore instance for `whatsapp_threads` / `whatsapp_messages`.
- **Future-proof**: enables moving outbound sending behind callables and enforcing Owner/co-writer policy using Firebase Auth identities.

## Consolidation plan (minimal, non-breaking)

1) Keep Railway backend running for the existing `kyc-app` (no immediate break).
2) Treat `whatsappV4` as canonical for internal tooling and new features.
3) Migrate `kyc-app` to `whatsappV4` later:
   - Replace Railway base URL with `https://us-central1-superparty-frontend.cloudfunctions.net/whatsappV4`
   - Add Firebase Auth ID token to requests (Authorization Bearer).
4) Once migrated, decommission Railway endpoints or keep them admin-token protected behind VPN.

