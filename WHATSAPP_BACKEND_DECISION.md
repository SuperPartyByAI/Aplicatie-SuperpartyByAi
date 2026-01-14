# WhatsApp backend decision (source of truth)

## Decision

**Canonical backend (production): Railway long-running `whatsapp-connector/` (Baileys + Firestore mirror).**

Rationale:
- Baileys requires long-running runtime + **persistent volume** for auth state; Firebase Functions are not suitable.
- The app uses Firebase Auth **only for employees**; the connector enforces employee/super-admin permissions using Firebase ID tokens.

## Evidence (what exists today)

### Canonical connector exists and is used by Flutter

Flutter sends messages via connector HTTP API and attaches Firebase ID token:

```7:12:superparty_flutter/lib/services/whatsapp_api_service.dart
/// - Sends Firebase ID token in `Authorization: Bearer`.
```

Connector runtime exposes `/health`, `/api/send`, `/api/accounts/*`:

```282:588:whatsapp-connector/src/server.js
app.get('/health', async (_req, res) => { ... });
app.post('/api/send', async (req, res) => { ... });
app.post('/api/accounts', async (req, res) => { ... });
```

### Legacy backends exist in repo (NOT canonical)

The React `kyc-app` currently targets Railway directly:

```6:6:kyc-app/kyc-app/src/components/WhatsAppAccounts.jsx
const WHATSAPP_URL = 'https://whats-upp-production.up.railway.app';
```

Firebase Functions `whatsappV4` exists and is deployable, but it is **legacy** and must not be used as the canonical system:

```1:5:functions/index.js
const { onRequest, onCall } = require('firebase-functions/v2/https');
```

## Why `whatsapp-connector/` is canonical

- **Correct runtime**: long-running + persistent auth state volume (Baileys).
- **Security alignment**: uses Firebase Auth ID tokens and a super-admin email allowlist.
- **Single schema**: writes only `whatsapp_*` collections (Firestore mirror).

## Consolidation plan (minimal, non-breaking)

1) Treat `whatsapp-connector/` as canonical for all new work.
2) Keep legacy backends (`whatsapp-backend/`, `functions/whatsappV4`, `whatsapp-server.js`) only as historical reference / temporary compatibility, but do not deploy them as production truth.
3) Migrate any remaining consumers to connector HTTP API + `whatsapp_*` schema (see `MIGRATION.md`).

