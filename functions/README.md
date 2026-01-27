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
$env:WHATSAPP_BACKEND_URL = "http://37.27.34.179:8080"
```

Or use `functions/.runtimeconfig.json` with `whatsapp.backend_base_url` (Hetzner).

### Starting Firebase Emulators

From the **repo root** (not `functions/` directory):

```powershell
# Optional: Kill processes on emulator ports if they're already running
.\scripts\kill-emulators.ps1 --Force

# Set environment variable (Hetzner backend)
$env:WHATSAPP_BACKEND_URL = "http://37.27.34.179:8080"

# Start emulators
firebase.cmd emulators:start --config .\firebase.json --only firestore,functions,auth --project superparty-frontend
```

**Note**: If you get port conflicts, run `.\scripts\kill-emulators.ps1` to free up ports 4001, 4401, 9098, 8082, and 5002.

**Important**: The emulator will start successfully even if `WHATSAPP_BACKEND_URL` is not set. WhatsApp endpoints will return `500` JSON errors with `{"error":"configuration_missing"}` when called without the URL, but the emulator itself will not crash.

### Building TypeScript

The TypeScript source in `src/` is compiled to `dist/`:

```powershell
cd functions
npm run build
```

**Note**: `functions/dist/` is generated output and is ignored in git. CI generates it during build. For local development, run `npm run build` before testing.

### Running Tests

From the `functions/` directory:

```powershell
cd functions
npm run build  # Generate dist/ first
npm test
```

Tests verify:
- ✅ `require('./index')` does NOT throw when `WHATSAPP_BACKEND_URL` is missing
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
2. Sets `WHATSAPP_BACKEND_URL` environment variable (Hetzner)
3. Installs dependencies if needed
4. Starts Firebase emulators
5. Waits for ports to be ready
6. Tests `/health` and WhatsApp endpoints
7. Verifies no "Failed to load function definition" errors

## Testing Protected Endpoints

### Getting an Auth Token from Emulator

Use the provided PowerShell script to get a valid ID token:

```powershell
# From repo root
.\scripts\get-auth-emulator-token.ps1

# Or with custom email/password
.\scripts\get-auth-emulator-token.ps1 -Email "admin@example.com" -Password "password123"
```

The script will:
1. Check if Auth Emulator is running
2. Sign up or sign in the user
3. Return the ID token

### Using the Token

```powershell
# Get token
$token = .\scripts\get-auth-emulator-token.ps1

# Test endpoint
curl.exe -i http://127.0.0.1:5002/superparty-frontend/us-central1/whatsappProxyGetAccounts `
  -H "Authorization: Bearer $token"
```

**Note**: Firebase Admin SDK automatically detects `FIREBASE_AUTH_EMULATOR_HOST` when emulators are running, so tokens from the Auth Emulator will be validated correctly.

## AI Prompts (Firestore)

AI prompts for `whatsappExtractEventFromThread` and `clientCrmAsk` are stored in Firestore and **editable from the app** (no code deploy needed).

### Where to edit

- **Flutter**: Admin → **AI Prompts** (`/admin/ai-prompts`). Only visible for admins. Uses real-time stream of `app_config/ai_prompts`.
- **Firestore Console**: `app_config` → document `ai_prompts` (create it if missing).

### Expected fields

| Field | Description |
|-------|-------------|
| `whatsappExtractEvent_system` | System prompt for WhatsApp thread → event extraction |
| `whatsappExtractEvent_userTemplate` | User template. Placeholders: `{{conversation_text}}`, `{{phone_e164}}` |
| `clientCrmAsk_system` | System prompt for CRM Q&A |
| `clientCrmAsk_userTemplate` | User template. Placeholders: `{{client_json}}`, `{{events_json}}`, `{{question}}` |
| `updatedAt` | `serverTimestamp` (set on save) |
| `version` | Integer, bumped on each save |

### Functions usage

- `functions/prompt_config.js`: `getPromptConfig()` loads `app_config/ai_prompts` with **60s in-memory cache**.
- If the doc is missing or invalid, safe defaults (current hardcoded prompts) are used.
- Logs `version` only (never the full prompt).

## Architecture Notes

### Lazy Loading

To prevent Firebase emulator from crashing during code analysis:

1. **Backend Base URL**: Computed lazily in handlers, not at module import time
   - `getBackendBaseUrl()` returns `null` if missing (does not throw)
   - Handlers check for `null` and return `500` JSON error at runtime

2. **Baileys (ESM)**: Loaded via dynamic `import()` only when needed
   - `functions/whatsapp/manager.js` uses `async function loadBaileys()`
   - No top-level `require('@whiskeysockets/baileys')`

3. **WhatsApp Manager**: Lazy-loaded in `functions/index.js`
   - `getWhatsAppManager()` function loads manager only on first request
   - Prevents ESM/CJS analysis during emulator startup

### Error Handling

When `WHATSAPP_BACKEND_URL` is missing:
- ✅ Module import succeeds (no crash)
- ✅ Emulator starts successfully
- ✅ Endpoints return `500` JSON: `{"success":false,"error":"configuration_missing","message":"WHATSAPP_BACKEND_URL must be set..."}`

## Ports

Default emulator ports (configured in `firebase.json`):
- Firestore: `8082`
- Functions: `5002`
- Auth: `9098`
- UI: `4001`
- Hub: `4401`

If ports are in use, update `firebase.json` or stop conflicting processes.
