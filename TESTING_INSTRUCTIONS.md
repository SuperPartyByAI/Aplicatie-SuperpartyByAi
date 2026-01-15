# Testing Instructions - WhatsApp Functions

## Prerequisites

1. **Node.js v20**: Ensure Node.js v20 is installed and in PATH
   ```powershell
   node --version  # Should show v20.x.x
   ```

2. **Firebase CLI**: Install if not present
   ```powershell
   npm install -g firebase-tools
   ```

3. **Java 21+**: Required for Firestore emulator
   ```powershell
   java -version  # Should show 21 or higher
   ```

## Running Tests

### Step 1: Install Dependencies

```powershell
cd functions
npm install
```

### Step 2: Run Tests

```powershell
npm test
```

**Expected Output**: All tests should pass (0 failed)

## Known Test Issues and Fixes Applied

### 1. whatsappProxy.test.js - `/send` Suite

**Issues Fixed**:
- Tests now use `addAccountHandler` instead of Firebase wrapper `addAccount`
- Transaction mocks return proper snapshot objects with `.exists` and `.data()`
- `mockFirestoreRunTransaction` is async and properly invokes callback
- Mock setup ensures `req.user` is set by middleware before handler uses it

**If tests still fail with 500 errors**:
- Check that `mockTransaction.get` returns objects with both `.exists` and `.data()` methods
- Verify that `mockFirestoreRunTransaction` is called and callback is invoked
- Ensure `mockVerifyIdToken` returns a decoded token object with `uid` and `email`
- Verify `mockStaffCollection.doc().get` returns a document with `.exists: true` and `.data()` method

### 2. roleDetector.test.js

**Issues Fixed**:
- `loadOverrides()` safely handles `null` db (returns `{}`)
- `parseDuration()` handles Romanian duration formats correctly

**If tests still fail**:
- Check that `parseDuration` test cases match the implementation
- Verify `loadOverrides` returns `{}` when `this.db` is null

### 3. shortCodeGenerator.test.js

**Issues Fixed**:
- Constructor avoids calling `admin.firestore()` when admin not initialized
- `getDefaultGenerator()` uses lazy initialization

**If tests still fail**:
- Verify that module import doesn't throw "The default Firebase app does not exist"
- Check that tests inject a mock `db` into constructor

## PowerShell Scripts

### 1. get-auth-emulator-token.ps1

**Usage**:
```powershell
# Get token (captures only token on stdout)
$token = .\scripts\get-auth-emulator-token.ps1

# With custom credentials
$token = .\scripts\get-auth-emulator-token.ps1 -Email "user@example.com" -Password "password123"
```

**Output**: Token string only (no other output on stdout)

### 2. test-protected-endpoint.ps1

**Usage**:
```powershell
# Test default endpoint
.\scripts\test-protected-endpoint.ps1

# Test custom endpoint
.\scripts\test-protected-endpoint.ps1 -EndpointPath "/superparty-frontend/us-central1/whatsappProxySend"
```

**What it does**:
1. Gets token from Auth Emulator
2. Trims whitespace from token
3. Calls protected endpoint with `Authorization: Bearer <token>`
4. Displays status code and response body

### 3. kill-emulators.ps1

**Usage**:
```powershell
# Interactive (prompts before killing)
.\scripts\kill-emulators.ps1

# Force (kills without prompt)
.\scripts\kill-emulators.ps1 --Force
```

**What it does**: Finds and kills processes using emulator ports (4001, 4401, 9098, 8082, 5002)

## Smoke Test Workflow

### Step 1: Cleanup Ports (if needed)

```powershell
.\scripts\kill-emulators.ps1 --Force
```

### Step 2: Start Emulators

```powershell
# Set environment variable
$env:WHATSAPP_RAILWAY_BASE_URL = "https://whats-upp-production.up.railway.app"

# Start emulators
firebase.cmd emulators:start --config .\firebase.json --only firestore,functions,auth --project superparty-frontend
```

**Wait for**: "All emulators ready!" message (usually 30-60 seconds)

### Step 3: Test Protected Endpoint

In a **new terminal** (keep emulators running):

```powershell
# Get token
$token = .\scripts\get-auth-emulator-token.ps1

# Test endpoint
.\scripts\test-protected-endpoint.ps1
```

**Expected Result**:
- Status code: 200, 403, or 500 (depending on role/config)
- **NOT** 401 with "missing_auth_token" error
- If 401, check:
  - Token was obtained successfully
  - Token is trimmed (no whitespace)
  - `FIREBASE_AUTH_EMULATOR_HOST` is set (Firebase CLI sets this automatically)

### Step 4: Manual Test (Alternative)

```powershell
# Get token
$token = .\scripts\get-auth-emulator-token.ps1

# Trim token (script should do this, but manual check)
$token = $token.Trim()

# Test endpoint manually
curl.exe -i http://127.0.0.1:5002/superparty-frontend/us-central1/whatsappProxyGetAccounts `
  -H "Authorization: Bearer $token"
```

## Troubleshooting

### Tests Fail with 500 Errors

1. **Check transaction mocks**: Ensure `mockTransaction.get` returns objects with `.exists` and `.data()`
2. **Check auth mocks**: Verify `mockVerifyIdToken` returns decoded token
3. **Check staff mocks**: Verify `mockStaffCollection.doc().get` returns document with `.exists: true`

### "Cannot read properties of undefined (reading 'exists')"

- Transaction mock `get()` must return snapshot-like object: `{ exists: boolean, data: () => ({...}) }`
- Ensure both `transaction.get(threadRef)` and `transaction.get(outboxRef)` are mocked

### "req.user.uid is undefined"

- Middleware `requireAuth` sets `req.user = decoded`
- Verify `mockVerifyIdToken` returns object with `uid` property
- Handler uses `req.user.uid` after middleware runs, so middleware must succeed

### PowerShell Script Syntax Errors

- Scripts use standard PowerShell syntax
- If errors occur, check PowerShell version: `$PSVersionTable.PSVersion`
- Minimum: PowerShell 5.1 or higher

### Emulator Port Conflicts

- Run `.\scripts\kill-emulators.ps1 --Force` to free ports
- Or update `firebase.json` to use different ports

## Files Modified

1. `functions/test/whatsappProxy.test.js` - Fixed to use handler functions, improved transaction mocks
2. `functions/shortCodeGenerator.js` - Fixed to avoid admin.firestore() when admin not initialized
3. `scripts/get-auth-emulator-token.ps1` - Simplified, outputs only token on stdout
4. `scripts/test-protected-endpoint.ps1` - Added token trimming, improved error handling
5. `scripts/kill-emulators.ps1` - Port cleanup script (already correct)

## Next Steps

1. Run `cd functions && npm test` and verify all tests pass
2. If tests fail, check the specific error messages and verify mocks match production behavior
3. Run smoke test workflow to verify emulator + token + endpoint integration
4. Report any remaining issues with specific test names and error messages
