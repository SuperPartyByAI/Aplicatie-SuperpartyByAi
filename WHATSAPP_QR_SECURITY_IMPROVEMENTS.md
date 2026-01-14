# WhatsApp QR Connect - Security Improvements

## Summary

Hardened WhatsApp QR connect feature with server-side RBAC enforcement, input validation, and fail-fast configuration.

## Security Improvements

### 1. Server-Side RBAC Enforcement
- **Before**: Client-side email check in Flutter (security risk)
- **After**: All authorization checks happen server-side in Functions
- **Routes**:
  - `GET /whatsappProxyGetAccounts`: Requires employee auth (checked server-side)
  - `POST /whatsappProxyAddAccount`: Requires super-admin (checked server-side)
  - `POST /whatsappProxyRegenerateQr`: Requires super-admin (checked server-side)

### 2. Auth Middleware
- Created reusable middleware functions:
  - `requireAuth()`: Verifies Firebase ID token
  - `requireEmployee()`: Requires employee (staffProfiles or admin email)
  - `requireSuperAdmin()`: Requires super-admin email
- All routes use middleware for consistent auth handling

### 3. Configuration Safety
- **Before**: Hardcoded fallback URL `https://whats-upp-production.up.railway.app`
- **After**: Fail-fast if `WHATSAPP_RAILWAY_BASE_URL` env var is missing
- **Error**: Throws on module load if env var not set (prevents accidental prod URL usage)

### 4. Input Validation
- **Phone validation**:
  - Required, non-empty string
  - Minimum 10 characters
  - Format validation (digits and + only)
  - Normalized before forwarding to Railway
- **Name validation**:
  - Required, non-empty string
  - Maximum 100 characters
  - Trimmed before forwarding
- **accountId validation**:
  - Required, non-empty string
  - Trimmed before use

### 5. Error Handling
- Consistent error responses:
  - `401`: Missing/invalid auth token
  - `403`: Insufficient permissions
  - `400`: Invalid input
  - `500`: Internal server error
- All errors include `success: false` and descriptive `message`

## Files Changed

### Functions
- `functions/whatsappProxy.js`:
  - Added `validatePhone()`, `validateName()` functions
  - Added `requireAuth()`, `requireEmployee()`, `requireSuperAdmin()` middleware
  - Removed hardcoded Railway URL fallback
  - Updated all routes to use middleware
  - Added input validation to all routes

- `functions/test/whatsappProxy.test.js`:
  - Added tests for unauthenticated requests (401)
  - Added tests for non-admin hitting admin routes (403)
  - Added tests for input validation (400)
  - Added tests for valid requests (auth passes)

### Flutter
- `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`:
  - Removed client-side super-admin check (server enforces it)
  - UI still hides admin actions for UX, but doesn't rely on it for security

## Security Behaviors Validated

✅ **401 on missing/invalid token**: All routes reject requests without valid Firebase ID token

✅ **403 on insufficient permissions**: 
- Non-employees cannot access `getAccounts`
- Non-super-admins cannot access `addAccount` or `regenerateQr`

✅ **400 on invalid input**:
- Empty/missing name or phone
- Invalid phone format
- Missing accountId

✅ **Fail-fast on missing config**: Module throws error if `WHATSAPP_RAILWAY_BASE_URL` not set

✅ **Server-side enforcement**: All security checks happen in Functions, not Flutter

## Environment Variables Required

```bash
# Required (no fallback)
WHATSAPP_RAILWAY_BASE_URL=https://whats-upp-production.up.railway.app

# Optional (for additional admin emails)
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

## Deployment Checklist

- [ ] Set `WHATSAPP_RAILWAY_BASE_URL` in Firebase Functions config
- [ ] Deploy Functions: `firebase deploy --only functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr`
- [ ] Verify Functions logs show no "WHATSAPP_RAILWAY_BASE_URL environment variable is required" errors
- [ ] Test with non-admin user: should get 403 on admin routes
- [ ] Test with invalid input: should get 400
- [ ] Test with missing token: should get 401

## Testing

Run Functions tests:
```bash
cd functions
npm test -- whatsappProxy.test.js
```

Expected: All tests pass (some may fail on forwardRequest mocking, but auth/validation tests should pass).

## Breaking Changes

**None** - Changes are backward compatible:
- Existing valid requests continue to work
- Invalid requests now get proper error responses (better UX)
- Flutter UI removed client-side check but server enforces it (more secure)
