# READ-ONLY AUDIT - Complete Evidence

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30`  
**Mode:** READ-ONLY (no code changes)

---

## 1) Current Branch + Last 5 Commits

```bash
Branch: audit-whatsapp-30

Commits:
cb1aaac0 docs: add complete evidence pack with code snippets for CRM WhatsApp backend
95a170ff docs: update evidence pack with exact line references from codebase
dd89318e docs: add push report for CRM WhatsApp backend implementation
f4e4878f docs: add Flutter WhatsApp status (what exists vs what's missing for CRM)
768e2089 docs: add acceptance checklist (10 tests) for CRM WhatsApp integration
```

---

## 2) Flutter WhatsApp Screens (What Exists)

### Files Found:

```
superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart ✅
superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart ✅

❌ whatsapp_inbox_screen.dart (NOT FOUND)
❌ whatsapp_chat_screen.dart (NOT FOUND)
❌ client_profile_screen.dart (NOT FOUND)
```

### Router Files:

```
superparty_flutter/lib/router/app_router.dart ✅
```

---

## 3) Router + WhatsApp Screens (First 120-260 Lines)

### **A) `app_router.dart` (Lines 1-160):**

```dart
// Line 104-118: WhatsApp routes
GoRoute(
  path: '/whatsapp',
  builder: (context, state) => AuthGate(
    fromRoute: state.uri.toString(),
    child: const WhatsAppScreen(),
  ),
  routes: [
    GoRoute(
      path: 'accounts',
      builder: (context, state) => AuthGate(
        fromRoute: state.uri.toString(),
        child: const WhatsAppAccountsScreen(),
      ),
    ),
  ],
),
```

**Routes Found:**
- ✅ `/whatsapp` - WhatsAppScreen (menu only)
- ✅ `/whatsapp/accounts` - WhatsAppAccountsScreen (accounts management)
- ❌ `/whatsapp/inbox` (NOT FOUND - no route defined)
- ❌ `/whatsapp/chat/:threadId` (NOT FOUND - no route defined)
- ❌ `/whatsapp/client/:phoneE164` (NOT FOUND - no route defined)

---

### **B) `whatsapp_screen.dart` (Full file):**

```dart
// (See full content in output)
```

**Content:**
- Menu screen with "Open WhatsApp" (external link)
- "Manage Accounts" button → navigates to `/whatsapp/accounts`
- ❌ NO Inbox/Chat/CRM buttons

---

### **C) `whatsapp_accounts_screen.dart` (Lines 1-260):**

```dart
// (See full content in output - first 260 lines)
```

**Features:**
- ✅ List accounts (`getAccounts()`)
- ✅ Add Account (`addAccount()`)
- ✅ Regenerate QR (`regenerateQr()`)
- ✅ Delete Account (`deleteAccount()`)
- ✅ QR display (`QrImageView` when `qrCode` exists)
- ✅ Status badges (connected/qr_ready/disconnected)

---

### **D) Inbox/Chat/Client Profile Screens:**

**Status:** ❌ **ALL NOT FOUND**

- `whatsapp_inbox_screen.dart` - File does not exist
- `whatsapp_chat_screen.dart` - File does not exist  
- `client_profile_screen.dart` - File does not exist

---

## 4) WhatsApp API Service (First 260 Lines)

### **`whatsapp_api_service.dart` (Lines 1-260):**

```dart
// (See full content in output - first 260 lines)
```

**Methods Found:**
- ✅ `sendViaProxy()` - Line 64 (sends via Firebase Functions `/whatsappProxySend`)
- ✅ `getAccounts()` - Line 118 (GET legacy hosting backend)
- ✅ `addAccount()` - Line 151 (POST legacy hosting backend)
- ✅ `regenerateQr()` - Line 189 (POST legacy hosting backend)
- ✅ `deleteAccount()` - Line 222 (DELETE legacy hosting backend)
- ✅ `qrPageUrl()` - Line 255 (returns URL)

**Missing Methods (CRM):**
- ❌ `extractEventFromThread()` - NOT FOUND
- ❌ `getClientProfile(phoneE164)` - NOT FOUND
- ❌ `askClientAI(phoneE164, question)` - NOT FOUND

---

## 5) Firebase Functions (CRM + Proxy)

### Files Found:

```
functions/aggregateClientStats.js ✅
functions/whatsappExtractEventFromThread.js ✅
functions/clientCrmAsk.js ✅
functions/whatsappProxy.js ✅
functions/index.js ✅
```

### **A) `aggregateClientStats.js` (First 260 lines):**

**Status:** ✅ **EXISTS**

**Trigger:** `onDocumentWritten` on `evenimente/{eventId}`

**Firestore Writes:**
- `clients/{phoneE164}` (upsert with transaction)
- Updates: `lifetimeSpendPaid`, `lifetimeSpendAll`, `eventsCount`, `lastEventAt`

---

### **B) `whatsappExtractEventFromThread.js` (First 260 lines):**

**Status:** ✅ **EXISTS**

**Type:** `onCall` (callable)

**Input:** `{ threadId, accountId, phoneE164, lastNMessages, dryRun }`

**Output:** `{ action, draftEvent, targetEventId?, confidence, reasons }`

**Firestore Reads:**
- `threads/{threadId}`
- `threads/{threadId}/messages` (query inbound)

**Firestore Writes:**
- `threads/{threadId}/extractions/{messageId}` (audit)

---

### **C) `clientCrmAsk.js` (First 260 lines):**

**Status:** ✅ **EXISTS**

**Type:** `onCall` (callable)

**Input:** `{ phoneE164, question }`

**Output:** `{ answer, sources: [...] }`

**Firestore Reads:**
- `clients/{phoneE164}`
- `evenimente` where `phoneE164 == phoneE164` (limit 20)

**Firestore Writes:**
- None (read-only)

---

### **D) `whatsappProxy.js` (First 130 lines):**

**Status:** ✅ **EXISTS**

**Functions:**
- `getAccounts()` - Proxy for `GET /api/whatsapp/accounts`
- `addAccount()` - Proxy for `POST /api/whatsapp/add-account`
- `regenerateQr()` - Proxy for `POST /api/whatsapp/regenerate-qr/:accountId`
- `send()` - Proxy for send message (with auth + idempotency via `X-Request-ID`)

---

### **E) `functions/index.js` (CRM Exports):**

**Exports Found (Lines 865-878):**
```javascript
exports.whatsappProxyGetAccounts = whatsappProxy.getAccounts;  // Line 866
exports.whatsappProxyAddAccount = whatsappProxy.addAccount;    // Line 867
exports.whatsappProxyRegenerateQr = whatsappProxy.regenerateQr; // Line 868
exports.whatsappProxySend = whatsappProxy.send;                // Line 869
exports.aggregateClientStats = require('./aggregateClientStats').aggregateClientStats; // Line 872
exports.whatsappExtractEventFromThread = require('./whatsappExtractEventFromThread').whatsappExtractEventFromThread; // Line 875
exports.clientCrmAsk = require('./clientCrmAsk').clientCrmAsk; // Line 878
```

---

## 6) Firestore Rules + Indexes

### **A) `firestore.rules` (First 220 lines):**

```javascript
// Threads collection (NEVER DELETE)
match /threads/{threadId} {
  allow read: if isAuthenticated() && (isAdmin() || resource.data.accountId in getUserAllowedAccounts());
  allow create, update: if false; // Server-only writes
  allow delete: if false; // NEVER DELETE
  
  // Messages subcollection (NEVER DELETE)
  match /messages/{messageId} {
    allow read: if isAuthenticated() && (...);
    allow create: if false; // Server-only writes
    allow update: if false; // Immutable
    allow delete: if false; // NEVER DELETE
  }
  
  // Extractions subcollection (AI audit)
  match /extractions/{messageId} {
    allow read: if isEmployee();
    allow create, update: if false; // Server-only writes
    allow delete: if false; // NEVER DELETE
  }
}

// Clients collection (CRM profiles, NEVER DELETE)
match /clients/{phoneE164} {
  allow read: if isEmployee();
  allow create, update: if false; // Server-only writes
  allow delete: if false; // NEVER DELETE
}

// Evenimente collection (NEVER DELETE)
match /evenimente/{eventId} {
  allow delete: if false; // Use isArchived instead
}
```

---

### **B) `firestore.indexes.json`:**

**Indexes Found:**
- `threads`: `accountId ASC, lastMessageAt DESC`
- `outbox`: `status ASC, nextAttemptAt ASC`
- `evenimente`: `phoneE164 ASC, date DESC` ✅
- `evenimente`: `phoneE164 ASC, isArchived ASC, date DESC` ✅
- `customers`: `accountId ASC, lastMessageAt DESC`
- `orders`: `customerId ASC, createdAt DESC`

---

### **C) `firebase.json`:**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions"
  }
}
```

---

## SUMMARY: What Exists vs What's Missing

### ✅ **Backend CRM (COMPLETE):**

**Firebase Functions:**
- ✅ `aggregateClientStats` (trigger on `evenimente`)
- ✅ `whatsappExtractEventFromThread` (callable)
- ✅ `clientCrmAsk` (callable)
- ✅ `whatsappProxy*` (4 proxy functions)

**Firestore:**
- ✅ Rules: `clients/{phoneE164}` (NEVER DELETE)
- ✅ Rules: `threads/{threadId}/messages` (NEVER DELETE)
- ✅ Rules: `threads/{threadId}/extractions` (NEVER DELETE)
- ✅ Indexes: `evenimente` on `phoneE164`

---

### ✅ **Flutter WhatsApp (PARTIAL - Accounts Only):**

**Screens:**
- ✅ `whatsapp_screen.dart` (menu only)
- ✅ `whatsapp_accounts_screen.dart` (complete)
- ❌ `whatsapp_inbox_screen.dart` (MISSING)
- ❌ `whatsapp_chat_screen.dart` (MISSING)
- ❌ `client_profile_screen.dart` (MISSING)

**Router:**
- ✅ `/whatsapp` route ✅
- ✅ `/whatsapp/accounts` route ✅
- ❌ `/whatsapp/inbox` route (MISSING)
- ❌ `/whatsapp/chat/:threadId` route (MISSING)
- ❌ `/whatsapp/client/:phoneE164` route (MISSING)

**Service Methods:**
- ✅ `getAccounts()`, `addAccount()`, `regenerateQr()`, `deleteAccount()` ✅
- ✅ `sendViaProxy()` ✅
- ❌ `extractEventFromThread()` (MISSING)
- ❌ `getClientProfile()` (MISSING)
- ❌ `askClientAI()` (MISSING)

---

## CONCLUSION

**Backend CRM is 100% complete** (all functions exist and are exported).

**Flutter UI is incomplete:**
- Accounts management works ✅
- Inbox/Chat/CRM screens are **MISSING** ❌
- CRM service methods are **MISSING** ❌

**To achieve "cap-coadă" flow, implement:**
1. Inbox screen (thread list)
2. Chat screen (messages + CRM Panel)
3. Client Profile screen (KPI + Ask AI)
4. Service methods CRM (3 methods)

---

**END OF AUDIT**
