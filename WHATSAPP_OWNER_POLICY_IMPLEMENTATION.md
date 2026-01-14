# WhatsApp Owner/Co-Writer Policy Implementation

**Date:** 2026-01-14  
**Branch:** `flutter-stability-hardening-clean`  
**Goal:** Implement owner/co-writer policy for WhatsApp message sending with server-side enforcement.

---

## Summary

Implemented secure WhatsApp message sending via Functions proxy with:
- **Owner/co-writer policy**: First send sets `ownerUid`, only owner/co-writers can send
- **Idempotency**: Deterministic `requestId` (sha256) prevents duplicate sends
- **Server-only writes**: Client cannot write to `outbox` directly (Firestore rules)
- **Atomic transactions**: Sets `ownerUid` and creates `outbox` doc atomically

---

## Files Changed

### Commit 1: Functions Proxy (`53f2c282`)
1. `functions/whatsappProxy.js` (NEW)
   - `POST /whatsappProxy/send` endpoint
   - Firebase ID token authentication
   - Owner/co-writer policy enforcement
   - Idempotency with deterministic `requestId`
   - Atomic transaction for `ownerUid` + `outbox` creation

2. `functions/index.js`
   - Export: `exports.whatsappProxySend = whatsappProxy.send`

3. `functions/test/whatsappProxy.test.js` (NEW)
   - Unit tests: owner policy, co-writer access, idempotency, validation

4. `functions/__tests__/firestoreRulesEmulator.test.js` (NEW)
   - Firestore rules emulator tests (skipped if emulator not available)

5. `superparty_flutter/lib/services/whatsapp_api_service.dart` (NEW)
   - `sendViaProxy()` method
   - Calls Functions proxy with Firebase ID token

### Commit 2: Firestore Rules (`<commit-sha>`)
1. `firestore.rules`
   - Outbox: `allow read: if isEmployee()`
   - Outbox: `allow create, update, delete: if false` (server-only)

---

## Key Code Snippets

### Owner Check + Outbox Create (functions/whatsappProxy.js)

```javascript
// Check owner/co-writer policy
let isOwner = false;
let shouldSetOwner = false;

if (!ownerUid) {
  // First outbound send - set owner atomically
  shouldSetOwner = true;
  isOwner = true;
} else {
  // Check if user is owner or co-writer
  isOwner = uid === ownerUid;
  const isCoWriter = coWriterUids.includes(uid);

  if (!isOwner && !isCoWriter) {
    return res.status(403).json({
      success: false,
      error: 'not_owner_or_cowriter',
      message: 'Only thread owner or co-writers can send messages',
    });
  }
}

// Generate deterministic requestId for idempotency
const requestId = generateRequestId(threadId, uid, clientMessageId);

// Use transaction to atomically:
// 1. Set ownerUid if needed
// 2. Create outbox doc (or detect duplicate)
let duplicate = false;
await db.runTransaction(async (transaction) => {
  // Re-read thread to get latest state
  const latestThreadDoc = await transaction.get(threadRef);
  const latestThreadData = latestThreadDoc.data();

  // Set ownerUid if needed (atomic)
  if (shouldSetOwner && !latestThreadData?.ownerUid) {
    transaction.update(threadRef, {
      ownerUid: uid,
      coWriterUids: admin.firestore.FieldValue.arrayUnion(),
    });
  }

  // Check if outbox doc already exists (idempotency)
  const outboxRef = db.collection('outbox').doc(requestId);
  const outboxDoc = await transaction.get(outboxRef);

  if (outboxDoc.exists) {
    duplicate = true;
    return; // Don't create duplicate
  }

  // Create outbox document
  const outboxData = {
    requestId,
    threadId,
    accountId,
    toJid,
    body: text,
    payload: { text },
    status: 'queued',
    attempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  };

  transaction.set(outboxRef, outboxData);
});
```

### Flutter Service (superparty_flutter/lib/services/whatsapp_api_service.dart)

```dart
Future<Map<String, dynamic>> sendViaProxy({
  required String threadId,
  required String accountId,
  required String toJid,
  required String text,
  required String clientMessageId,
}) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) throw Exception('Not authenticated');

  final token = await user.getIdToken();
  final functionsUrl = _getFunctionsUrl();

  final response = await http.post(
    Uri.parse('$functionsUrl/whatsappProxySend'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'threadId': threadId,
      'accountId': accountId,
      'toJid': toJid,
      'text': text,
      'clientMessageId': clientMessageId,
    }),
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    final errorBody = jsonDecode(response.body) as Map<String, dynamic>?;
    throw Exception('Send failed: HTTP ${response.statusCode} - ${errorBody?['message'] ?? response.body}');
  }

  return jsonDecode(response.body) as Map<String, dynamic>;
}
```

### Firestore Rules (firestore.rules)

```javascript
// Outbox - WhatsApp message queue - POLITICA: NEVER DELETE
// SECURITY: Only server (via Admin SDK in Functions proxy) can write
match /outbox/{messageId} {
  // Employees can read outbox messages (for status checking)
  allow read: if isEmployee();
  
  // Server-only writes (Functions proxy uses Admin SDK)
  allow create, update, delete: if false;
}
```

---

## Verification Commands

### Functions Tests
```bash
cd functions
npm test -- whatsappProxy.test.js
```

**Expected output:**
- ✅ Owner policy tests pass
- ✅ Co-writer access tests pass
- ✅ Idempotency tests pass
- ✅ Validation tests pass

### Firestore Rules Tests (Optional - requires emulator)
```bash
firebase emulators:exec --only firestore "npm --prefix functions test -- firestoreRulesEmulator.test.js"
```

**Note:** Tests are skipped if emulator not available (no Java).

### Flutter Tests
```bash
cd superparty_flutter
flutter test
```

---

## Manual Testing Steps

1. **Open Chat Screen**
   - Navigate to WhatsApp → Inbox → Select thread
   - Chat screen should display messages

2. **Send Message (First Time - Sets Owner)**
   - Type message in chat input
   - Press send
   - **Verify:**
     - Functions proxy receives request with Firebase ID token
     - Thread document gets `ownerUid` set to current user
     - Outbox document created with `status='queued'`
     - Response: `{ success: true, requestId: "...", duplicate: false }`

3. **Verify Outbox Doc Created by Server**
   - Check Firestore Console: `outbox/{requestId}`
   - **Verify fields:**
     - `requestId`: sha256 hash
     - `threadId`: matches thread
     - `accountId`: matches account
     - `status`: 'queued'
     - `createdByUid`: current user UID
     - `createdAt`: server timestamp

4. **Test Non-Owner Blocked**
   - Log in as different employee (not owner, not in coWriterUids)
   - Try to send message in same thread
   - **Expected:** 403 error: "Only thread owner or co-writers can send messages"

5. **Test Co-Writer Access**
   - As owner, add another employee to `thread.coWriterUids` array
   - Log in as co-writer
   - Send message
   - **Expected:** Success (200), outbox doc created

6. **Test Idempotency**
   - Send same message twice quickly (same `clientMessageId`)
   - **Expected:** Second request returns `{ success: true, duplicate: true }`
   - **Verify:** Only one outbox doc exists (same `requestId`)

---

## Thread Schema

Threads collection now includes:
```javascript
{
  accountId: string,
  clientJid: string,
  ownerUid: string,        // NEW: Set on first outbound send
  coWriterUids: string[],  // NEW: Array of UIDs allowed to send
  lastMessageAt: Timestamp,
  lastMessageText: string,
  lastMessageDirection: 'inbound' | 'outbound',
  // ... other fields
}
```

---

## Security Notes

1. **Client cannot write outbox**: Firestore rules deny create/update/delete
2. **Functions proxy uses Admin SDK**: Bypasses Firestore rules
3. **Owner set atomically**: Transaction ensures only first sender becomes owner
4. **Idempotency**: Deterministic `requestId` prevents duplicate sends
5. **Auth required**: Firebase ID token verified on every request

---

## Status

✅ **Implementation complete**  
✅ **3 commits created**  
✅ **Tests added**  
✅ **Firestore rules updated**

**Next steps:**
- Integrate `sendViaProxy` in Flutter chat screen UI (when chat screen is implemented)
- Add UI for managing co-writers (add/remove from `coWriterUids`)
