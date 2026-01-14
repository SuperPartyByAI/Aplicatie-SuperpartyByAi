## Migration notes (WhatsApp)

### Canonical system (current)
- **Runtime**: `whatsapp-connector/` (Railway/VM long-running Baileys)
- **Firestore schema**: `whatsapp_*` collections (see `docs/WHATSAPP_SCHEMA.md`)
- **Flutter**: reads Firestore (`whatsapp_threads`, `whatsapp_messages`) and sends via HTTP to connector (`/api/send`), with Firebase ID token auth (`superparty_flutter/lib/services/whatsapp_api_service.dart`).

### Legacy systems kept in repo (NOT canonical)
These exist for historical reference and must not be used for new deployments:
- `whatsapp-backend/`:
  - Uses legacy collections like `accounts/*` (example: QR endpoint reads `db.collection('accounts')`).
  - Contains Socket.IO / dashboard concepts that violate current requirement (“no Socket.IO”).
- Root `whatsapp-server.js`:
  - Standalone server with Socket.IO and multiple “tier” modules (legacy).

### Historical regression: “Account Not Found”
Cause: mixed collection names:
- Some paths queried `accounts/*` while newer code wrote/expected `whatsapp_accounts/*`.

Mitigation policy:
- **All new code** must read/write **only** `whatsapp_*` collections.
- Connector has unit tests (schema guard) to prevent legacy collection usage.

### If you must keep legacy endpoints temporarily
Keep them strictly as a compatibility layer, but:
- Do not allow them to write to canonical data plane collections directly from clients.
- Prefer migrating clients to `whatsapp-connector/` endpoints + schema.

