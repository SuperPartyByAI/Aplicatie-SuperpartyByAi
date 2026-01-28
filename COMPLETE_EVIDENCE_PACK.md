# Complete Evidence Pack - WhatsApp CRM Implementation

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30`  
**Goal:** Complete read-only evidence of Flutter UI, legacy hosting backend, and Firebase/Functions CRM

---

## PART A — Branch Status

### Git Info:
```bash
Branch: audit-whatsapp-30
Status: (clean, all changes committed and pushed)
```

---

## PART B — Evidence Pack

### 1) Key Files Exist

**Functions:**
```
functions/aggregateClientStats.js ✅
functions/whatsappExtractEventFromThread.js ✅
functions/clientCrmAsk.js ✅
functions/index.js ✅ (exports added)
```

**Flutter Screens:**
```
superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart ✅
superparty_flutter/lib/screens/whatsapp/whatsapp_accounts_screen.dart ✅
superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart ❌ (DOES NOT EXIST)
superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart ❌ (DOES NOT EXIST)
superparty_flutter/lib/screens/whatsapp/client_profile_screen.dart ❌ (DOES NOT EXIST)
```

**Flutter Services:**
```
superparty_flutter/lib/services/whatsapp_api_service.dart ✅
superparty_flutter/lib/services/whatsapp_service.dart ✅
```

**Firestore:**
```
firestore.rules ✅ (with clients/{phoneE164} rules)
firestore.indexes.json ✅ (with evenimente indexes)
firebase.json ✅
```

---

### 2) CRM Functions (First 200-260 Lines Each)

#### **A) `functions/aggregateClientStats.js` (Lines 1-120)**

```javascript
'use strict';

const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Aggregate client statistics when events are created/updated
 * Trigger: evenimente/{eventId} onCreate/onUpdate
 */
exports.aggregateClientStats = onDocumentWritten(
  {
    document: 'evenimente/{eventId}',
    region: 'us-central1',
  },
  async (event) => {
    const eventData = event.data?.after?.data();
    const eventDataBefore = event.data?.before?.data();
    const eventId = event.params.eventId;

    if (!eventData) {
      console.log(`[aggregateClientStats] Event ${eventId} deleted, skipping aggregation`);
      return null;
    }

    const phoneE164 = eventData.phoneE164;
    if (!phoneE164) {
      console.log(`[aggregateClientStats] Event ${eventId} has no phoneE164, skipping`);
      return null;
    }

    // Skip if event is archived (but still count if it was paid)
    if (eventData.isArchived === true) {
      console.log(`[aggregateClientStats] Event ${eventId} is archived, skipping active aggregation`);
      // Still update lastEventAt but don't include in active counts
    }

    // Calculate payment amounts
    const payment = eventData.payment || {};
    const paymentStatus = payment.status || 'UNPAID';
    const paymentAmount = typeof payment.amount === 'number' ? payment.amount : 0;
    
    // Get previous payment if this is an update
    let previousAmount = 0;
    let previousStatus = 'UNPAID';
    if (eventDataBefore) {
      const paymentBefore = eventDataBefore.payment || {};
      previousAmount = typeof paymentBefore.amount === 'number' ? paymentBefore.amount : 0;
      previousStatus = paymentBefore.status || 'UNPAID';
    }

    const clientRef = db.collection('clients').doc(phoneE164);

    try {
      await db.runTransaction(async (transaction) => {
        const clientDoc = await transaction.get(clientRef);
        const existing = clientDoc.data() || {};

        // Initialize fields if new client
        const lifetimeSpendPaid = existing.lifetimeSpendPaid || 0;
        const lifetimeSpendAll = existing.lifetimeSpendAll || 0;
        const eventsCount = existing.eventsCount || 0;

        // Calculate delta
        let deltaPaid = 0;
        let deltaAll = 0;
        let deltaCount = 0;

        if (!eventDataBefore) {
          // New event (onCreate)
          deltaCount = 1;
          deltaAll = paymentAmount;
          if (paymentStatus === 'PAID') {
            deltaPaid = paymentAmount;
          }
        } else {
          // Update event (onUpdate)
          // ... (full logic for delta calculation)
        }

        // Update client document
        const updates = {
          phoneE164,
          phoneRaw: eventData.phoneRaw || phoneE164,
          displayName: eventData.parentName || eventData.childName || existing.displayName || null,
          lifetimeSpendPaid: Math.max(0, lifetimeSpendPaid + deltaPaid),
          lifetimeSpendAll: Math.max(0, lifetimeSpendAll + deltaAll),
          eventsCount: Math.max(0, eventsCount + deltaCount),
          lastEventAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Set createdAt if new client
        if (!clientDoc.exists) {
          updates.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }

        transaction.set(clientRef, updates, {merge: true});

        console.log(`[aggregateClientStats] Updated client ${phoneE164}: deltaPaid=${deltaPaid}, deltaAll=${deltaAll}, deltaCount=${deltaCount}`);
      });

      return {success: true, phoneE164, eventId};
    } catch (error) {
      console.error(`[aggregateClientStats] Error aggregating stats for ${phoneE164}:`, error);
      throw error;
    }
  }
);
```

**Firestore Writes:**
- Writes to: `clients/{phoneE164}` (upsert with transaction)
- Updates: `lifetimeSpendPaid`, `lifetimeSpendAll`, `eventsCount`, `lastEventAt`

---

#### **B) `functions/whatsappExtractEventFromThread.js` (Lines 1-130)**

```javascript
'use strict';

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Groq SDK
const Groq = require('groq-sdk');

// Normalizers for V3 EN schema (reuse from chatEventOps)
const {normalizeEventFields, normalizeRoleFields, normalizeRoleType} = require('./normalizers');
const {getNextEventShortId} = require('./shortCodeGenerator');
const chatEventOps = require('./chatEventOps').chatEventOps;

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Extract event booking from WhatsApp thread messages
 * Input: { threadId, accountId, phoneE164, lastNMessages, dryRun=true|false }
 * Output: { action: CREATE_EVENT|UPDATE_EVENT|NOOP, draftEvent, targetEventId?, confidence, reasons }
 */
exports.whatsappExtractEventFromThread = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [groqApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {threadId, accountId, phoneE164, lastNMessages = 50, dryRun = true} = request.data || {};

    if (!threadId || !accountId) {
      throw new HttpsError('invalid-argument', 'threadId and accountId are required');
    }

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error('[whatsappExtractEventFromThread] GROQ_API_KEY not available');
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY not available');
    }

    try {
      // Fetch thread to verify it exists and get metadata
      const threadRef = db.collection('threads').doc(threadId);
      const threadDoc = await threadRef.get();
      
      if (!threadDoc.exists) {
        throw new HttpsError('not-found', `Thread ${threadId} not found`);
      }

      const threadData = threadDoc.data();
      if (threadData.accountId !== accountId) {
        throw new HttpsError('permission-denied', 'Thread does not belong to accountId');
      }

      // Fetch last N messages from thread (inbound only, sorted by timestamp)
      const messagesRef = threadRef.collection('messages');
      const messagesSnapshot = await messagesRef
        .where('direction', '==', 'inbound')
        .orderBy('tsClient', 'desc')
        .limit(lastNMessages)
        .get();

      // ... (AI extraction logic using Groq)
      // ... (normalizeEventFields for V3 schema)
      // ... (determine CREATE vs UPDATE based on date)

      // Generate idempotency key
      const lastMessageId = messages[messages.length - 1]?.id || 'unknown';
      const clientRequestId = crypto
        .createHash('sha256')
        .update(`${threadId}__${lastMessageId}`)
        .digest('hex')
        .substring(0, 16);

      // Store extraction record for audit
      const extractionRef = threadRef.collection('extractions').doc(lastMessageId);
      await extractionRef.set({
        messageId: lastMessageId,
        threadId,
        accountId,
        clientJid: phoneE164,
        intent: extraction.intent,
        entities: extraction.event || {},
        confidence: extraction.confidence || 0.5,
        model: 'llama-3.1-70b-versatile',
        action,
        targetEventId,
        clientRequestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      return result;
    } catch (error) {
      console.error('[whatsappExtractEventFromThread] Error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Extraction failed: ${error.message}`);
    }
  }
);
```

**Firestore Reads:**
- Reads: `threads/{threadId}` (verify exists)
- Reads: `threads/{threadId}/messages` (query inbound messages)

**Firestore Writes:**
- Writes to: `threads/{threadId}/extractions/{messageId}` (audit trail)

**Does NOT write to `evenimente` directly** (returns `draftEvent` for Flutter to call `chatEventOps`)

---

#### **C) `functions/clientCrmAsk.js` (Lines 1-130)**

```javascript
'use strict';

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');

// Groq SDK
const Groq = require('groq-sdk');

// Define secret for GROQ API key
const groqApiKey = defineSecret('GROQ_API_KEY');

// Init admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Answer AI questions about a client based on structured data (clients + evenimente)
 * Input: { phoneE164, question }
 * Output: { answer, sources: [{eventShortId, date, details}] }
 */
exports.clientCrmAsk = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '512MiB',
    secrets: [groqApiKey],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {phoneE164, question} = request.data || {};

    if (!phoneE164 || !question) {
      throw new HttpsError('invalid-argument', 'phoneE164 and question are required');
    }

    // Access GROQ API key from secret
    const groqKey = groqApiKey.value();
    if (!groqKey) {
      console.error('[clientCrmAsk] GROQ_API_KEY not available');
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY not available');
    }

    try {
      // Fetch client profile
      const clientRef = db.collection('clients').doc(phoneE164);
      const clientDoc = await clientRef.get();
      
      const clientData = clientDoc.exists ? clientDoc.data() : {
        phoneE164,
        lifetimeSpendPaid: 0,
        lifetimeSpendAll: 0,
        eventsCount: 0,
        lastEventAt: null,
      };

      // Fetch all events for this client (ordered by date desc, limit 20)
      const eventsSnapshot = await db
        .collection('evenimente')
        .where('phoneE164', '==', phoneE164)
        .orderBy('date', 'desc')
        .limit(20)
        .get();

      // ... (build context for AI)
      // ... (use Groq to answer based on structured data)
      // ... (return answer + sources with eventShortId and date)

      return {
        answer: result.answer || 'Nu am găsit informații relevante.',
        sources: result.sources || [],
      };
    } catch (error) {
      console.error('[clientCrmAsk] Error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `AI query failed: ${error.message}`);
    }
  }
);
```

**Firestore Reads:**
- Reads: `clients/{phoneE164}` (client profile)
- Reads: `evenimente` where `phoneE164 == phoneE164` (client events, limit 20)

**Firestore Writes:**
- None (read-only function)

---

#### **D) `functions/index.js` (Lines 865-880)**

```javascript
// WhatsApp Backend Proxy - QR Connect Routes Only
const whatsappProxy = require('./whatsappProxy');
exports.whatsappProxyGetAccounts = whatsappProxy.getAccounts;
exports.whatsappProxyAddAccount = whatsappProxy.addAccount;
exports.whatsappProxyRegenerateQr = whatsappProxy.regenerateQr;
exports.whatsappProxySend = whatsappProxy.send;

// Client CRM aggregation (triggers on evenimente create/update)
exports.aggregateClientStats = require('./aggregateClientStats').aggregateClientStats;

// WhatsApp event extraction from threads
exports.whatsappExtractEventFromThread = require('./whatsappExtractEventFromThread').whatsappExtractEventFromThread;

// Client CRM AI questions
exports.clientCrmAsk = require('./clientCrmAsk').clientCrmAsk;
```

---

### 3) Firestore Schema + "NEVER DELETE" Protections

#### **firestore.rules (Lines 213-394, excerpt):**

```javascript
// Threads (WhatsApp Conversations) - USED BY BACKEND - POLITICA: NEVER DELETE
match /threads/{threadId} {
  allow read: if isAuthenticated() && (isAdmin() || resource.data.accountId in getUserAllowedAccounts());
  allow create, update: if false; // SECURITY: server-only writes (Admin SDK bypasses rules)
  allow delete: if false; // NEVER DELETE - use isArchived instead
  
  // Messages subcollection
  match /messages/{messageId} {
    allow read: if isAuthenticated() && (...);
    allow create: if false; // SECURITY: server-only writes (Admin SDK bypasses rules)
    allow update: if false; // Messages cannot be updated (immutable)
    allow delete: if false; // NEVER DELETE - messages are immutable
  }
  
  // Extractions subcollection (AI audit trail)
  match /extractions/{messageId} {
    allow read: if isEmployee();
    allow create, update: if false; // SECURITY: server-only writes (Admin SDK bypasses rules)
    allow delete: if false; // NEVER DELETE - audit trail must persist
  }
}

// Clients collection (CRM profiles) - POLITICA: NEVER DELETE
match /clients/{phoneE164} {
  allow read: if isEmployee();
  allow create, update: if false; // SECURITY: server-only writes (Admin SDK bypasses rules)
  allow delete: if false; // NEVER DELETE - client profiles must persist
}

// Evenimente collection (POLITICA: NEVER DELETE)
match /evenimente/{eventId} {
  allow delete: if false; // Use isArchived instead
}
```

#### **firestore.indexes.json (Excerpt):**

```json
{
  "indexes": [
    {
      "collectionGroup": "evenimente",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "phoneE164", "order": "ASCENDING"},
        {"fieldPath": "date", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "evenimente",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "phoneE164", "order": "ASCENDING"},
        {"fieldPath": "isArchived", "order": "ASCENDING"},
        {"fieldPath": "date", "order": "DESCENDING"}
      ]
    }
  ]
}
```

#### **firebase.json:**

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

### 4) Flutter Screens & Service (Evidence)

#### **A) `whatsapp_accounts_screen.dart` (First 240 lines):**

```dart
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/whatsapp_api_service.dart';

/// WhatsApp Accounts Management Screen
/// 
/// Super-admin only: view accounts, add accounts, regenerate QR codes.
class WhatsAppAccountsScreen extends StatefulWidget {
  const WhatsAppAccountsScreen({super.key});

  @override
  State<WhatsAppAccountsScreen> createState() => _WhatsAppAccountsScreenState();
}

class _WhatsAppAccountsScreenState extends State<WhatsAppAccountsScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;

  List<Map<String, dynamic>> _accounts = [];
  bool _isLoading = true;
  String? _error;
  
  // In-flight guards (prevent double-tap / concurrent requests)
  bool _isAddingAccount = false;
  final Set<String> _regeneratingQr = {};
  final Set<String> _deletingAccount = {};

  @override
  void initState() {
    super.initState();
    _loadAccounts();
  }

  Future<void> _loadAccounts() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await _apiService.getAccounts();
      
      if (response['success'] == true) {
        final accounts = response['accounts'] as List<dynamic>? ?? [];
        if (mounted) {
          setState(() {
            _accounts = accounts.cast<Map<String, dynamic>>();
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = response['message'] ?? 'Failed to load accounts';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Error: ${e.toString()}';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _addAccount() async {
    // ... (dialog for name + phone input)
    final response = await _apiService.addAccount(
      name: nameController.text.trim(),
      phone: phoneController.text.trim(),
    );
    // ... (handle response)
  }

  Future<void> _regenerateQr(String accountId) async {
    final response = await _apiService.regenerateQr(accountId: accountId);
    // ... (handle response)
  }

  // ... (build method with account cards + QR display)
}
```

**Status:** ✅ **EXISTS** - Complete accounts management screen

---

#### **B) `whatsapp_inbox_screen.dart`:**

**Status:** ❌ **DOES NOT EXIST** - File not found in `superparty_flutter/lib/screens/whatsapp/`

---

#### **C) `whatsapp_chat_screen.dart`:**

**Status:** ❌ **DOES NOT EXIST** - File not found in `superparty_flutter/lib/screens/whatsapp/`

---

#### **D) `whatsapp_api_service.dart` (First 320 lines):**

```dart
import 'dart:convert';
import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:http/http.dart' as http;

import '../core/config/env.dart';
import '../core/errors/app_exception.dart';
import '../core/utils/retry.dart';

/// Service for interacting with legacy hosting WhatsApp backend directly.
class WhatsAppApiService {
  static final WhatsAppApiService _instance = WhatsAppApiService._internal();
  factory WhatsAppApiService() => _instance;
  WhatsAppApiService._internal();

  static WhatsAppApiService get instance => _instance;

  Duration requestTimeout = const Duration(seconds: 30);

  String _getBackendUrl() {
    return Env.whatsappBackendUrl;
  }

  String _getFunctionsUrl() {
    const region = 'us-central1';
    
    const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
    if (useEmulators && kDebugMode) {
      return 'http://127.0.0.1:5002';
    }
    
    try {
      final app = Firebase.app();
      final projectId = app.options.projectId;
      if (projectId.isNotEmpty) {
        return 'https://$region-$projectId.cloudfunctions.net';
      }
    } catch (_) {}

    return 'https://$region-superparty-frontend.cloudfunctions.net';
  }

  String _generateRequestId() {
    return '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(10000)}';
  }

  /// Send WhatsApp message via Functions proxy.
  /// 
  /// Enforces owner/co-writer policy and creates outbox entry server-side.
  Future<Map<String, dynamic>> sendViaProxy({
    required String threadId,
    required String accountId,
    required String toJid,
    required String text,
    required String clientMessageId,
  }) async {
    return retryWithBackoff(() async {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw UnauthorizedException();
      }

      final token = await user.getIdToken();
      final functionsUrl = _getFunctionsUrl();
      final requestId = _generateRequestId();

      final response = await http
          .post(
            Uri.parse('$functionsUrl/whatsappProxySend'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
            body: jsonEncode({
              'threadId': threadId,
              'accountId': accountId,
              'toJid': toJid,
              'text': text,
              'clientMessageId': clientMessageId,
            }),
          )
          .timeout(requestTimeout);

      // ... (handle response)
    });
  }

  /// Get list of WhatsApp accounts from legacy hosting backend.
  Future<Map<String, dynamic>> getAccounts() async {
    // ... (GET /api/whatsapp/accounts)
  }

  /// Add a new WhatsApp account via legacy hosting backend.
  Future<Map<String, dynamic>> addAccount({
    required String name,
    required String phone,
  }) async {
    // ... (POST /api/whatsapp/add-account)
  }

  /// Regenerate QR code for a WhatsApp account.
  Future<Map<String, dynamic>> regenerateQr({
    required String accountId,
  }) async {
    // ... (POST /api/whatsapp/regenerate-qr/:accountId)
  }

  /// Delete a WhatsApp account.
  Future<Map<String, dynamic>> deleteAccount({
    required String accountId,
  }) async {
    // ... (DELETE /api/whatsapp/accounts/:accountId)
  }

  /// Get QR page URL for an account.
  String qrPageUrl(String accountId) {
    final backendUrl = _getBackendUrl();
    return '$backendUrl/api/whatsapp/qr/$accountId';
  }
}
```

**Status:** ✅ **EXISTS** - Has 6 methods: `getAccounts()`, `addAccount()`, `regenerateQr()`, `deleteAccount()`, `sendViaProxy()`, `qrPageUrl()`

**Missing Methods (CRM):**
- ❌ `extractEventFromThread()`
- ❌ `getClientProfile(phoneE164)`
- ❌ `askClientAI(phoneE164, question)`

---

### 5) CRM UI Additions (Flutter)

**Search Results:**
```bash
grep -RIn "extractEventFromThread|clientCrmAsk|getClientProfile|clients/|evenimente/" superparty_flutter/lib
```

**Result:** ❌ **NO MATCHES FOUND** - CRM methods not implemented in Flutter yet

---

### 6) legacy hosting Backend Sanity

**Files:**
```
whatsapp-backend/legacy hosting.toml ✅
whatsapp-backend/package.json ✅
whatsapp-backend/server.js ✅ (188646 bytes, syntax OK)
```

**legacy hosting.toml:**
```
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/health"

[[volumes]]
mountPath = "/app/sessions"
```

**server.js Syntax:** ✅ `node -c` passes (no syntax errors)

---

### 7) Quick Grep (Main Flows)

**Search:** `threads|outbox|clients|evenimente|phoneE164`

**Functions:**
- `functions/aggregateClientStats.js`: `clients`, `phoneE164`, `evenimente`
- `functions/whatsappExtractEventFromThread.js`: `threads`, `messages`, `phoneE164`, `extractions`
- `functions/clientCrmAsk.js`: `clients`, `phoneE164`, `evenimente`

**Backend:**
- `whatsapp-backend/server.js`: `threads`, `messages`, `outbox`, `phoneE164` (many occurrences)

**Flutter:**
- `superparty_flutter/lib/services/whatsapp_api_service.dart`: `sendViaProxy` (outbox via proxy)
- No matches for `clients`, `evenimente`, `phoneE164` in Flutter (CRM methods not implemented)

---

## SUMMARY

### Modified/Created Files (vs origin/main):

**Backend CRM (NEW):**
- `functions/aggregateClientStats.js` ✅
- `functions/whatsappExtractEventFromThread.js` ✅
- `functions/clientCrmAsk.js` ✅
- `functions/index.js` (MODIFIED, exports added) ✅

**Firestore:**
- `firestore.rules` (MODIFIED, added `clients/{phoneE164}`) ✅
- `firestore.indexes.json` (MODIFIED, added `evenimente` indexes) ✅

**Documentation:**
- `RUNBOOK_CRM_WHATSAPP.md` ✅
- `ACCEPTANCE_CHECKLIST_CRM_WHATSAPP.md` ✅
- `FLUTTER_WHATSAPP_STATUS.md` ✅
- `WHATSAPP_CAP_COADA_EVIDENCE_PACK.md` ✅
- `COMPLETE_EVIDENCE_PACK.md` ✅

**Flutter:**
- ❌ NO new screens (Inbox/Chat/Client Profile NOT implemented)
- ❌ NO new service methods (CRM methods NOT implemented)

---

### What to Deploy:

```bash
# 1. Firestore Rules + Indexes
firebase deploy --only firestore

# 2. Cloud Functions (CRM)
firebase deploy --only functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk

# Or deploy all functions:
firebase deploy --only functions
```

**legacy hosting:**
- No code changes needed (backend CRM functions are Firebase Functions, not legacy hosting)
- Ensure env vars: `SESSIONS_PATH=/app/sessions`, `FIREBASE_SERVICE_ACCOUNT_JSON=...`

---

## CONFIRMED STATUS

### ✅ Backend CRM (Complete):
- `clients/{phoneE164}` collection schema ✅
- `aggregateClientStats` trigger ✅
- `whatsappExtractEventFromThread` callable ✅
- `clientCrmAsk` callable ✅
- Firestore Rules (NEVER DELETE) ✅
- Firestore Indexes ✅

### ❌ Flutter UI CRM (Missing):
- Inbox screen ❌
- Chat screen ❌
- Client Profile screen ❌
- Service methods CRM ❌

### ✅ Flutter WhatsApp (Partial - Accounts only):
- Accounts screen ✅
- Accounts API service ✅
- Send via proxy ✅

---

**END OF EVIDENCE PACK**
