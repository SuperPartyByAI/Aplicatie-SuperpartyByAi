# WhatsApp In-App Module - Flutter Implementation

**Date:** 2026-01-14  
**Goal:** Port exact web flow (kyc-app) to Flutter with in-app inbox, chat, and accounts management.

---

## Summary

Implemented WhatsApp in-app module in Flutter that mirrors the web flow:
- **Inbox**: Lists threads from `threads` collection filtered by `accountId`
- **Chat**: Shows messages from `threads/{threadId}/messages` subcollection
- **Send**: Writes to `outbox` collection (compatible with backend)
- **Accounts**: Super-admin only tab for managing WhatsApp accounts via Functions proxy

---

## Files Changed

### Flutter (Commit 1)
1. `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`
   - Changed from `whatsapp_threads` → `threads` collection
   - Added `accountId` filter (loads connected account via proxy)
   - Client-side sort by `lastMessageAt` (same as web)
   - Extract phone from `clientJid` for display

2. `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`
   - Changed from `whatsapp_messages` → `threads/{threadId}/messages` subcollection
   - Order by `createdAt` (Timestamp) instead of `tsClient` (string)
   - Use `body` field instead of `text`
   - Use `direction: 'outbound'` instead of `'out'`
   - Use `status` field for delivery icons (queued|sent|delivered|read|failed)
   - Removed owner/co-writer checks (simplified like web)

3. `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart` (send method)
   - Write directly to `outbox` collection with `requestId` as doc ID
   - Compatible payload with web: `{accountId, toJid, threadId, payload: {text}, body, status: 'queued', ...}`
   - Optimistic UI: message appears via real-time listener

4. `superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart`
   - Changed from Firestore stream → Functions proxy call
   - Load accounts via `whatsappProxyGetAccounts`
   - Display QR code and pairing code from backend response
   - Refresh list after add/regenerate/delete

5. `superparty_flutter/lib/services/whatsapp_api_service.dart`
   - Added `getAccounts()` method (uses Functions proxy)
   - Updated `addAccount()` and `regenerateQr()` to use Functions proxy
   - `deleteAccount()` still uses direct legacy hosting call (not in proxy yet)

6. `superparty_flutter/test/whatsapp/accounts_screen_test.dart`
   - Test for super-admin guard logic

### Functions (Commit 2)
1. `functions/whatsappProxy.js` (NEW)
   - `getAccounts`: Employees allowed (for inbox)
   - `addAccount`: Super-admin only
   - `regenerateQr`: Super-admin only
   - Forwards to legacy hosting backend with auth checks
   - Uses secret `LEGACY_WHATSAPP_URL` (fallback to hardcoded URL)

2. `functions/index.js`
   - Exports: `whatsappProxyGetAccounts`, `whatsappProxyAddAccount`, `whatsappProxyRegenerateQr`

3. `functions/test/whatsappProxy.test.js` (NEW)
   - Basic test structure for guard logic

### Firestore Rules (Commit 3)
1. `firestore.rules`
   - `threads`: Allow employees to read (for inbox/chat)
   - `threads/{threadId}/messages`: Allow employees to read
   - `outbox`: Allow employees to create (for sending messages)
   - Backend still controls updates via Admin SDK

---

## Collections Used

**Confirmed from web code (`ChatClientiRealtime.jsx`):**
- `threads` - Main collection for conversations
  - Fields: `accountId`, `clientJid`, `lastMessageAt`, `lastMessageText`, `lastMessageDirection`
- `threads/{threadId}/messages` - Subcollection for messages
  - Fields: `accountId`, `clientJid`, `direction` ('inbound'|'outbound'), `body`, `status`, `tsClient`, `waMessageId`, `createdAt`
- `outbox` - Queue for outgoing messages
  - Fields: `accountId`, `toJid`, `threadId`, `payload`, `body`, `status` ('queued'|'sent'|'failed'), `attempts`, `createdAt`, `nextAttemptAt`, `requestId`

**Note:** Web uses `threads` and `outbox` (not `whatsapp_threads`/`whatsapp_messages`). Flutter now matches this.

---

## legacy hosting Backend Auth

**Confirmed:** legacy hosting `/api/whatsapp/accounts` does NOT require token (line 1968 in `whatsapp-backend/server.js`).

**Security:** Functions proxy enforces auth anyway:
- Employees can read accounts (for inbox)
- Super-admin only for control-plane (add/regenerate)

---

## Verification Commands

### Flutter Tests
```bash
cd superparty_flutter
flutter test test/whatsapp/accounts_screen_test.dart
```

### Functions Tests
```bash
cd functions
npm test -- whatsappProxy.test.js
```

### Manual Testing Steps

1. **Connect Account (Super-admin only)**
   - Open Flutter app
   - Navigate to WhatsApp → Accounts tab
   - Click "Add" → Enter name/phone
   - Scan QR code or enter pairing code
   - Wait for status → "connected"

2. **View Inbox**
   - Navigate to WhatsApp → Inbox tab
   - Should show threads from `threads` collection filtered by connected `accountId`
   - Sort by `lastMessageAt` descending (client-side)

3. **Open Chat**
   - Tap on a thread
   - Should show messages from `threads/{threadId}/messages`
   - Messages ordered by `createdAt` descending (displayed oldest→newest)

4. **Send Message**
   - Type message in chat input
   - Press send
   - Message should appear immediately (optimistic)
   - Check Firestore: `outbox/{requestId}` should exist with `status='queued'`
   - Backend processes and updates: `outbox.status='sent'`, `message.status='sent'`

5. **Verify No Duplicates**
   - Send same message twice quickly
   - Should only create one outbox entry (requestId is deterministic)

6. **Test Multi-Worker (if applicable)**
   - Run 2 backend instances
   - Send message
   - Check logs: only one worker should process (claim/lease mechanism)

---

## Environment Setup

**Functions Secret Required:**
```bash
firebase functions:secrets:set LEGACY_WHATSAPP_URL
# Value: https://whats-app-ompro.ro
```

**Or use fallback:** Code falls back to hardcoded URL if secret not set.

---

## Commit History

1. **Commit 1:** Flutter screens + WhatsAppApiService updates
2. **Commit 2:** Functions proxy + tests
3. **Commit 3:** Firestore rules update

---

## Next Steps (Optional)

1. Add `deleteAccount` to Functions proxy (currently direct legacy hosting call)
2. Add error handling UI for proxy failures
3. Add loading states for accounts screen
4. Add retry logic for failed outbox writes
5. Add unread count tracking (if needed)

---

**Status:** ✅ Implementation complete  
**Collections:** `threads`, `threads/{threadId}/messages`, `outbox`  
**legacy hosting Auth:** No token required (proxy enforces auth anyway)
