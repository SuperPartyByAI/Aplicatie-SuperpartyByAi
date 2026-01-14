# WhatsApp QR Connect Implementation

## Summary

Implemented WhatsApp QR connect functionality from Flutter by adding:
1. Proxy routes in Firebase Functions (`getAccounts`, `addAccount`, `regenerateQr`)
2. Flutter API service methods
3. Flutter Accounts UI screen
4. Tests for proxy routes

## Files Changed

### Functions
- `functions/whatsappProxy.js`: Added 3 new proxy routes
- `functions/index.js`: Exported new proxy functions
- `functions/test/whatsappProxy.test.js`: Added tests for new routes

### Flutter
- `superparty_flutter/lib/services/whatsapp_api_service.dart`: Added `getAccounts()`, `addAccount()`, `regenerateQr()`
- `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`: New screen for managing accounts
- `superparty_flutter/pubspec.yaml`: Added `qr_flutter: ^4.1.0` dependency

## Implementation Details

### Proxy Routes

All routes require Firebase ID token authentication:

1. **GET /whatsappProxyGetAccounts**
   - Auth: Employee required
   - Forwards to: `GET https://whats-upp-production.up.railway.app/api/whatsapp/accounts`
   - Returns: Railway response unchanged

2. **POST /whatsappProxyAddAccount**
   - Auth: Super-admin only (`ursache.andrei1995@gmail.com`)
   - Body: `{ name: string, phone: string }`
   - Forwards to: `POST /api/whatsapp/add-account`
   - Returns: Railway response unchanged

3. **POST /whatsappProxyRegenerateQr**
   - Auth: Super-admin only
   - Query param: `accountId`
   - Forwards to: `POST /api/whatsapp/regenerate-qr/:accountId`
   - Returns: Railway response unchanged

### Flutter Service

`WhatsAppApiService` now has:
- `getAccounts()`: Returns `{ success: bool, accounts: List<Account> }`
- `addAccount(name, phone)`: Returns `{ success: bool, accountId?: string }`
- `regenerateQr(accountId)`: Returns `{ success: bool, message?: string }`

All methods attach Firebase ID token in `Authorization: Bearer <token>` header.

### Flutter UI

`WhatsAppAccountsScreen`:
- Super-admin only (checks email `ursache.andrei1995@gmail.com`)
- Lists all accounts with status badges
- Shows QR code when `status == 'qr_ready'` and `qrCode` is present
- "Add Account" button opens dialog to add new account
- "Regenerate QR" button per account
- Pull-to-refresh support

## Manual Verification Steps

### Prerequisites
1. Deploy Functions:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr
   ```

2. Install Flutter dependencies:
   ```bash
   cd superparty_flutter
   flutter pub get
   ```

3. Ensure Railway backend is running and accessible at `https://whats-upp-production.up.railway.app`

### Test Flow: Add Account → QR Ready → Scan → Connected

#### Step 1: Add Account
1. Open Flutter app
2. Login as super-admin (`ursache.andrei1995@gmail.com`)
3. Navigate to WhatsApp Accounts screen (if integrated in navigation)
4. Tap "Add Account" button
5. Enter:
   - Name: "Test Account"
   - Phone: "+407123456789"
6. Tap "Add"
7. **Expected**: Snackbar "Account added successfully"
8. **Verify**: Account appears in list with status "qr_ready" or "connecting"

#### Step 2: View QR Code
1. Find the account in the list
2. **Expected**: If status is "qr_ready", QR code is displayed
3. **Verify**: QR code is scannable (test with WhatsApp mobile app)

#### Step 3: Scan QR Code
1. Open WhatsApp on mobile device
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code displayed in Flutter app
5. **Expected**: WhatsApp shows "Connecting..." then "Connected"

#### Step 4: Verify Connected Status
1. In Flutter app, pull to refresh accounts list
2. **Expected**: Account status changes to "connected"
3. **Verify**: QR code no longer displayed (only shown when `qr_ready`)

#### Step 5: Regenerate QR (Optional)
1. If account is disconnected, tap "Regenerate QR" button
2. **Expected**: Snackbar "QR regeneration started"
3. Wait 2-3 seconds, pull to refresh
4. **Expected**: New QR code appears (if status is `qr_ready`)

### Alternative: Direct API Testing

#### Test getAccounts
```bash
# Get Firebase ID token (from Flutter app logs or Firebase Console)
TOKEN="your-firebase-id-token"

curl -X GET \
  "https://us-central1-<project-id>.cloudfunctions.net/whatsappProxyGetAccounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: `{ "success": true, "accounts": [...] }`

#### Test addAccount (Super-admin only)
```bash
TOKEN="super-admin-firebase-id-token"

curl -X POST \
  "https://us-central1-<project-id>.cloudfunctions.net/whatsappProxyAddAccount" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Account","phone":"+407123456789"}'
```

**Expected**: `{ "success": true, "accountId": "..." }`

#### Test regenerateQr (Super-admin only)
```bash
TOKEN="super-admin-firebase-id-token"
ACCOUNT_ID="account-id-from-previous-step"

curl -X POST \
  "https://us-central1-<project-id>.cloudfunctions.net/whatsappProxyRegenerateQr?accountId=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Expected**: `{ "success": true, "message": "QR regeneration started" }`

## Troubleshooting

### "Access denied. Super-admin only."
- **Cause**: User email is not `ursache.andrei1995@gmail.com`
- **Fix**: Login with super-admin account

### "Missing or invalid Firebase ID token"
- **Cause**: Token expired or not attached
- **Fix**: Re-login in Flutter app to get fresh token

### "Only employees can view accounts"
- **Cause**: User doesn't have `staffProfiles/{uid}` document
- **Fix**: Create staff profile in Firestore or use super-admin account

### QR code not showing
- **Cause**: Account status is not `qr_ready` or `qrCode` field is missing
- **Fix**: Check Railway backend logs, ensure account is in correct state

### Functions timeout
- **Cause**: Railway backend not responding or slow
- **Fix**: Check Railway backend status, increase timeout in `whatsappProxy.js` if needed

## Environment Variables

Set in Firebase Functions config:
```bash
firebase functions:config:set whatsapp.railway_base_url="https://whats-upp-production.up.railway.app"
```

Or use `.env` file (for local development):
```
WHATSAPP_RAILWAY_BASE_URL=https://whats-upp-production.up.railway.app
```

## Next Steps

1. Integrate `WhatsAppAccountsScreen` into app navigation (if not already done)
2. Add super-admin check in navigation drawer/menu to show/hide Accounts tab
3. Test with multiple accounts (target: 30 accounts)
4. Monitor Functions logs for errors
5. Add error handling for network failures

## Commits

This implementation should be split into 2 commits:

1. **Commit 1**: Proxy routes + tests
   - `functions/whatsappProxy.js`
   - `functions/index.js`
   - `functions/test/whatsappProxy.test.js`

2. **Commit 2**: Flutter service + UI
   - `superparty_flutter/lib/services/whatsapp_api_service.dart`
   - `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`
   - `superparty_flutter/pubspec.yaml`
