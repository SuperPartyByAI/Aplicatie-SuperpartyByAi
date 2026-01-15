# Firebase Functions - WhatsApp Backend

## Development Setup

### Prerequisites

- Node.js v20.x (use `nvm use 20` if using nvm-windows)
- Firebase CLI installed globally: `npm install -g firebase-tools`
- Java 21+ (required for Firestore emulator)

### Environment Variables

For local development with Firebase emulators, set the following environment variable:

```powershell
# PowerShell
$env:WHATSAPP_RAILWAY_BASE_URL = "https://whats-upp-production.up.railway.app"
```

Or use `functions/.runtimeconfig.json` (already configured with the correct value).

### Starting Firebase Emulators

From the **repo root** (not `functions/` directory):

```powershell
# Set environment variable
$env:WHATSAPP_RAILWAY_BASE_URL = "https://whats-upp-production.up.railway.app"

# Start emulators
firebase.cmd emulators:start --config .\firebase.json --only firestore,functions,auth --project superparty-frontend
```

**Important**: The emulator will start successfully even if `WHATSAPP_RAILWAY_BASE_URL` is not set. WhatsApp endpoints will return `500` JSON errors with `{"error":"configuration_missing"}` when called without the URL, but the emulator itself will not crash.

### Running Tests

From the `functions/` directory:

```powershell
cd functions
npm test
```

Tests verify:
- ✅ `require('./index')` does NOT throw when `WHATSAPP_RAILWAY_BASE_URL` is missing
- ✅ `require('./index')` does NOT throw when `FIREBASE_CONFIG` is set (emulator scenario)
- ✅ WhatsApp handlers return `500` JSON error when URL is missing (instead of crashing)
- ✅ WhatsApp handlers work correctly when URL is set

### Smoke Test

A PowerShell smoke test script is available at `scripts/smoke.ps1`:

```powershell
# From repo root
.\scripts\smoke.ps1
```

This script:
1. Checks Node.js and Java versions
2. Sets `WHATSAPP_RAILWAY_BASE_URL` environment variable
3. Installs dependencies if needed
4. Starts Firebase emulators
5. Waits for ports to be ready
6. Tests `/health` and WhatsApp endpoints
7. Verifies no "Failed to load function definition" errors

## Architecture Notes

### Lazy Loading

To prevent Firebase emulator from crashing during code analysis:

1. **Railway Base URL**: Computed lazily in handlers, not at module import time
   - `getRailwayBaseUrl()` returns `null` if missing (does not throw)
   - Handlers check for `null` and return `500` JSON error at runtime

2. **Baileys (ESM)**: Loaded via dynamic `import()` only when needed
   - `functions/whatsapp/manager.js` uses `async function loadBaileys()`
   - No top-level `require('@whiskeysockets/baileys')`

3. **WhatsApp Manager**: Lazy-loaded in `functions/index.js`
   - `getWhatsAppManager()` function loads manager only on first request
   - Prevents ESM/CJS analysis during emulator startup

### Error Handling

When `WHATSAPP_RAILWAY_BASE_URL` is missing:
- ✅ Module import succeeds (no crash)
- ✅ Emulator starts successfully
- ✅ Endpoints return `500` JSON: `{"success":false,"error":"configuration_missing","message":"WHATSAPP_RAILWAY_BASE_URL must be set..."}`

## Ports

Default emulator ports (configured in `firebase.json`):
- Firestore: `8082`
- Functions: `5002`
- Auth: `9098`
- UI: `4001`
- Hub: `4401`

If ports are in use, update `firebase.json` or stop conflicting processes.
