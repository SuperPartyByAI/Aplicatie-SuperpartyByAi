# Stability Improvements - Summary

## Changes Made

### A. Tooling / Dev Ergonomics (Windows-friendly)

**Files:**
- `package.json` - Added npm scripts: `emulators`, `emu`, `seed:emu`, `functions:build`, `functions:deploy`, `rules:deploy`
- `functions/package.json` - Updated scripts to use `.cmd` extensions for Windows
- `LOCAL_DEV_WINDOWS.md` - Complete Windows development guide

**Commands:**
```powershell
npm run emu              # Start emulators
npm run seed:emu         # Seed Firestore
npm run functions:build  # Build TypeScript
npm run functions:deploy # Deploy functions
npm run rules:deploy     # Deploy rules
```

### B. Flutter Architecture Hardening

**Files:**
- `superparty_flutter/lib/core/errors/app_exception.dart` - Typed error hierarchy (AppException, UnauthorizedException, ForbiddenException, TimeoutException, etc.)
- `superparty_flutter/lib/core/utils/retry.dart` - Retry with exponential backoff (doesn't retry 401/403)
- `superparty_flutter/lib/services/staff_settings_service.dart` - Added retry + error mapping
- `superparty_flutter/lib/services/whatsapp_api_service.dart` - Added timeout, retry, request-id header, error mapping
- `superparty_flutter/lib/screens/staff_settings_screen.dart` - Updated to handle AppException

**Features:**
- ✅ Retry with backoff (max 3 attempts, exponential delay with jitter)
- ✅ Never retries 401/403 errors
- ✅ Typed error mapping from Firebase Functions and HTTP exceptions
- ✅ Request-ID header for idempotency (WhatsApp API)
- ✅ Configurable timeout (30s default for WhatsApp API)

### C. WhatsApp Stability Hardening

**Improvements:**
- ✅ Timeout configurabil (30s default)
- ✅ Retry cu backoff pentru toate apelurile
- ✅ Request-ID header (UUID) pentru idempotency
- ✅ Error mapping robust (HTTP status → AppException)
- ✅ Protecție împotriva double-taps (UI level cu `_busy` flag)

### D. CI Gates

**Status:** Already implemented in `.github/workflows/`:
- ✅ `whatsapp-ci.yml` - Node 20, build step, tests
- ✅ `flutter-ci.yml` - Flutter analyze + test

## How to Run Locally

### 1. Start Emulators
```powershell
npm run emu
```

### 2. Seed Firestore
```powershell
npm run seed:emu
```

### 3. Build Functions
```powershell
npm run functions:build
```

### 4. Run Flutter (with emulators)
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true
```

## Tests

### Existing Tests
- `superparty_flutter/test/staff_settings_test.dart` - Staff settings tests
- `functions/test/whatsappProxy.test.js` - WhatsApp proxy tests

### New Test Coverage Needed
- Router redirects (401 → /login, 403 → /forbidden)
- Error mapping (401/403/timeout)
- Retry logic (doesn't retry 401/403)

## Remaining Risks (Max 5)

1. **MEDIUM**: Functions callables don't verify `requestToken` for idempotency (allocateStaffCode has token but doesn't check it server-side)
2. **LOW**: Flutter features/ structure not fully implemented (only error handling + retry added, not full domain/data/presentation split)
3. **LOW**: WhatsApp UI screens may still have double-tap issues (need state machine protection)
4. **LOW**: Husky pre-commit hook fails on Windows (npx not in PATH) - needs fix or bypass
5. **LOW**: Functions project ID hardcoded in WhatsAppApiService._getFunctionsUrl() - should use Firebase.app().options.projectId

## Next Actions

1. ✅ Add requestToken verification in Functions callables (allocateStaffCode, finalizeStaffSetup)
2. ✅ Add state machine protection in WhatsApp UI screens
3. ✅ Fix husky hook for Windows (or document bypass)
4. ✅ Extract project ID from Firebase options dynamically
5. ✅ Add tests for router redirects and error mapping
