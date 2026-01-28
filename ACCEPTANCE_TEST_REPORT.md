# WhatsApp Integration Acceptance Test Report

**Test Run ID**: T20260118_030620  
**Date**: 2026-01-18  
**Branch**: audit-whatsapp-30  
**Commit**: e34cab54 (fix(flutter): update callable region to europe-west1)

---

## PHASE 0: PRE-FLIGHT CHECKS ✅

### 0.1 Repository & Branch
- **Working Directory**: `/Users/universparty/Aplicatie-SuperpartyByAi`
- **Branch**: `audit-whatsapp-30` ✅
- **Status**: Clean working tree (1 untracked: EU_REGION_MIGRATION_COMPLETE.md)
- **Recent commits**:
  ```
  e34cab54 fix(flutter): update callable region to europe-west1
  6c28a6f5 docs: add EU region deployment guide with commands
  585d6aa4 feat: migrate Firestore-heavy functions to europe-west1 (Option A)
  ```

### 0.2 Tooling Versions
- **Node.js**: v25.3.0 ✅
- **npm**: 11.7.0 ✅
- **Firebase CLI**: 15.3.1 ✅
- **Flutter**: 3.38.7 (stable) ✅
- **Dart**: 3.10.7 ✅

### 0.3 Firebase Setup
- **Authenticated as**: superpartybyai@gmail.com ✅
- **Active Project**: superparty-frontend ✅
- **Project Number**: 168752018174

### 0.4 Cloud Functions Status ✅
All critical functions deployed successfully:

| Function | Version | Trigger | Location | Memory | Runtime |
|----------|---------|---------|----------|--------|---------|
| aggregateClientStats | v2 | firestore.written | us-central1 | 256MB | nodejs20 |
| clientCrmAsk | v2 | callable | us-central1 | 512MB | nodejs20 |
| whatsappExtractEventFromThread | v2 | callable | us-central1 | 512MB | nodejs20 |
| whatsappProxyAddAccount | v2 | https | us-central1 | 256MB | nodejs20 |
| whatsappProxyBackfillAccount | v2 | https | us-central1 | 256MB | nodejs20 |
| whatsappProxyDeleteAccount | v2 | https | us-central1 | 256MB | nodejs20 |
| whatsappProxyGetAccounts | v2 | https | us-central1 | 256MB | nodejs20 |
| whatsappProxyRegenerateQr | v2 | https | us-central1 | 256MB | nodejs20 |
| whatsappProxySend | v2 | https | us-central1 | 256MB | nodejs20 |

### 0.5 Hetzner Backend Health ✅
**URL**: https://whats-app-ompro.ro

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "commit": "892419e6",
  "bootTimestamp": "2026-01-17T18:17:09.199Z",
  "deploymentId": "9c8dabc4-090f-4180-9529-20ab303d4128",
  "mode": "single",
  "uptime": 24536,
  "accounts": {
    "total": 0,
    "connected": 0,
    "connecting": 0,
    "disconnected": 0,
    "needs_qr": 0,
    "max": 30
  },
  "firestore": {
    "status": "connected",
    "policy": {
      "collections": [
        "accounts - account metadata and status",
        "wa_sessions - encrypted session files",
        "threads - conversation threads",
        "threads/{threadId}/messages - messages per thread",
        "outbox - queued outbound messages",
        "wa_outbox - WhatsApp-specific outbox"
      ]
    }
  }
}
```

**Hetzner Direct API**: `GET /api/whatsapp/accounts` returns:
```json
{"success":true,"accounts":[],"cached":false}
```

---

## PHASE 1: BLOCKER CHECK ✅

### 1.1 Old 1st Gen Function "whatsapp"
**Status**: ✅ **NOT FOUND** - No blocker exists

The old v1 "whatsapp" function has been removed or never existed. No manual cleanup needed in Firebase Console.

---

## PHASE 2: SMOKE TESTS ✅

### 2.1 Flutter Build Sanity
**Command**: `flutter pub get && flutter analyze`

**Result**: ✅ **PASS** (1 deprecation warning, non-blocking)
- Dependencies resolved: 93 packages
- Analysis: 1 info issue (deprecated `value` in whatsapp_inbox_screen.dart:100)
  - Issue: Use `initialValue` instead of deprecated `value`
  - Impact: Non-blocking for functional testing

### 2.2 Available Devices
**Command**: `flutter devices && flutter emulators`

**Available**:
- macOS (desktop)
- Chrome (web)
- iOS Simulator (available to launch)
- Android Medium_Phone_API_36.1 (available to launch)

---

## PHASE 3: FLUTTER APP - MANUAL ACCEPTANCE TESTS

### Test Setup
**Target Device**: iOS Simulator (recommended for WhatsApp testing)
**Test Account Name**: `WA-TEST-T20260118_030620`

---

### TEST 3.1: Pair WhatsApp Account (QR Code) 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **Launch App**:
   ```bash
   cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
   flutter emulators --launch apple_ios_simulator
   # Wait for simulator to boot (~30 seconds)
   flutter run -d apple_ios_simulator
   ```

2. **In Flutter App (iOS Simulator)**:
   - Navigate to: **WhatsApp → Accounts**
   - Tap: **Add Account** button
   - Enter:
     - **Account Name**: `WA-TEST-T20260118_030620`
     - **Phone Number**: (your test WhatsApp number)
   - Confirm: QR code displays on screen

3. **On Physical WhatsApp Phone**:
   - Open WhatsApp app
   - Go to: **Settings → Linked Devices**
   - Tap: **Link a Device**
   - Scan the QR code displayed in the Flutter app

4. **Expected Result**:
   - Status in app changes: `needs_qr` → `connecting` → `connected` ✅
   - Account appears in accounts list with status "Connected"

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: QR code displayed
- [ ] Screenshot: Account status after pairing
- [ ] accountId value: `_________________`
- [ ] Final status: `_________________`

**PASS/FAIL**: ⬜ PENDING

---

### TEST 3.2: Inbox Shows Threads 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **In Flutter App**:
   - Navigate to: **WhatsApp → Inbox**
   - Select account: `WA-TEST-T20260118_030620`

2. **Expected Result**:
   - Threads list renders (may be empty if no messages yet)
   - No errors or crashes

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: Inbox screen
- [ ] Thread count: `_________________`

**PASS/FAIL**: ⬜ PENDING

---

### TEST 4.1: Receive Message (Client → WA Account) 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **From a Separate Client Phone**:
   - Open WhatsApp
   - Send message to the test account number:
     ```
     TEST INBOUND T20260118_030620 1
     ```

2. **In Flutter App → Inbox**:
   - Verify: New thread appears for client phone number
   - Tap thread to open Chat

3. **Expected Result**:
   - Message appears in Chat screen ✅
   - Firestore persisted:
     - `threads/{accountId}__{remoteJid}` document exists
     - `threads/{threadId}/messages/{messageId}` document exists
     - direction: "inbound"

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: Message in Chat
- [ ] threadId: `_________________`
- [ ] messageId: `_________________`
- [ ] Client phone (E.164): `_________________`

**Firestore Verification** (via Firebase Console):
```
Path: threads/{accountId}__{remoteJid}
Expected fields: accountId, remoteJid, lastMessageTimestamp, unreadCount
```

**PASS/FAIL**: ⬜ PENDING

---

### TEST 4.2: Send Message (App → Client) 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **In Flutter App → Chat**:
   - Type message:
     ```
     TEST OUTBOUND T20260118_030620 1
     ```
   - Send

2. **On Client Phone**:
   - Verify: Message received in WhatsApp ✅

3. **Expected Result**:
   - Message persisted in Firestore:
     - direction: "outbound"
     - status: queued → sent → delivered (possibly read)
   - Hetzner logs show send success

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: Message sent in app
- [ ] Screenshot: Message received on client phone
- [ ] messageId: `_________________`
- [ ] Final status in Firestore: `_________________`

**Firestore Verification** (via Firebase Console):
```
Path: threads/{threadId}/messages/{messageId}
Expected fields: direction="outbound", status="sent"/"delivered"/"read"
```

**PASS/FAIL**: ⬜ PENDING

---

### TEST 4.3: Restart Safety (No Lost Conversations) 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **Trigger Hetzner Restart**:
   - Go to: Hetzner dashboard
   - Select: whats-upp-production service
   - Click: **Restart** or **Redeploy**
   - Wait: ~30-60 seconds for restart to complete

2. **Verify Hetzner Health**:
   ```bash
   curl -sS https://whats-app-ompro.ro/health | jq
   ```
   - Expected: `status: "healthy"`, `firestore: "connected"`

3. **In Flutter App**:
   - Verify: Account still shows status "connected" (no new QR needed)
   - Verify: Previous conversation messages still visible
   - Send another message:
     ```
     TEST OUTBOUND T20260118_030620 2 AFTER RESTART
     ```
   - Verify: Message sends successfully

4. **From Client Phone**:
   - Send another message:
     ```
     TEST INBOUND T20260118_030620 2 AFTER RESTART
     ```
   - Verify: Appears in app

**Expected Result**:
- ✅ Account reconnects automatically (no QR scan)
- ✅ Old messages remain visible (Firestore is source of truth)
- ✅ New messages send/receive successfully

**EVIDENCE TO COLLECT**:
- [ ] Hetzner health after restart: PASS/FAIL
- [ ] Account reconnection: PASS/FAIL
- [ ] Old messages preserved: PASS/FAIL
- [ ] New messages work: PASS/FAIL

**PASS/FAIL**: ⬜ PENDING

---

## PHASE 5: CRM FLOW - MANUAL ACCEPTANCE TESTS

### TEST 5.1: Extract Event from Thread 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **In Flutter App → Chat**:
   - Open the conversation thread from Test 4
   - Navigate to: **CRM Panel** (if accessible in UI)
   - Tap: **Extract Event**

2. **Expected Result**:
   - Draft event rendered with fields:
     - date, time
     - address (dacă există în mesaje)
     - personaje (număr de persoane)
     - suma (preț)

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: Draft event JSON/UI
- [ ] draftEvent fields populated: YES/NO
- [ ] Audit write exists in Firestore:
   - Path: `threads/{threadId}/extractions/{extractionId}`

**PASS/FAIL**: ⬜ PENDING

---

### TEST 5.2: Save Event 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **In Flutter App → CRM Panel**:
   - Review draft event from Test 5.1
   - Tap: **Save Event**

2. **Expected Result**:
   - ✅ New document created in `evenimente` collection
   - ✅ Fields populated:
     - phoneE164 (client number)
     - accountId
     - threadId
     - createdBy
     - schemaVersion
     - isArchived: false
   - ✅ **IMPORTANT**: Each Save creates a NEW event (no overwrites)

**EVIDENCE TO COLLECT**:
- [ ] eventId: `_________________`
- [ ] Firestore path: `evenimente/{eventId}`
- [ ] Screenshot: Event saved confirmation

**Firestore Verification** (via Firebase Console):
```
Collection: evenimente
Doc ID: {eventId}
Expected: phoneE164, accountId, threadId, isArchived=false
```

**PASS/FAIL**: ⬜ PENDING

---

### TEST 5.3: Aggregate Client Stats Trigger 🔲 PENDING

**EXPECTED AUTOMATED BEHAVIOR**:
- Cloud Function `aggregateClientStats` triggers on `evenimente` write
- Updates `clients/{phoneE164}` document:
  - `eventsCount` incremented
  - `lifetimeSpend` updated (if suma exists)

**EVIDENCE TO COLLECT**:
- [ ] Firestore path: `clients/{phoneE164}`
- [ ] Screenshot: Client document fields
- [ ] eventsCount: `_________________`
- [ ] lifetimeSpend: `_________________`

**Firestore Verification** (via Firebase Console):
```
Collection: clients
Doc ID: {phoneE164} (e.g., +40712345678)
Expected fields: eventsCount >= 1, lifetimeSpend updated
```

**Logs to Check** (if failure):
```bash
firebase functions:log --only aggregateClientStats --lines 200
```

**PASS/FAIL**: ⬜ PENDING

---

### TEST 5.4: Ask AI (Client Lifetime Spend) 🔲 PENDING

**MANUAL STEPS REQUIRED**:

1. **In Flutter App**:
   - Navigate to: **Client Profile** screen (for the test client phone)
   - Tap: **Ask AI** button
   - Type question:
     ```
     Câți bani a cheltuit clientul cu numărul {phoneE164}?
     ```

2. **Expected Result**:
   - AI response matches `clients.lifetimeSpend` value
   - Answer references the saved event(s)

**EVIDENCE TO COLLECT**:
- [ ] Screenshot: AI response
- [ ] Answer text: `_________________`
- [ ] Matches Firestore lifetimeSpend: YES/NO

**Logs to Check** (if failure):
```bash
firebase functions:log --only clientCrmAsk --lines 200
```

**PASS/FAIL**: ⬜ PENDING

---

## PHASE 6: SAFE CLEANUP (NO DELETES)

### Cleanup Rules
- ✅ **DO NOT DELETE**: threads, messages, clients documents
- ✅ **DO NOT DELETE**: wa_sessions (required for reconnection)
- ✅ **OPTIONAL**: Archive test events by setting `isArchived: true`

### Manual Cleanup (if needed):
```javascript
// Firebase Console → Firestore → evenimente/{eventId}
// Update field: isArchived = true
```

**Cleanup Status**: ⬜ PENDING

---

## FINAL ACCEPTANCE REPORT

### Summary of Results

| Test Phase | Test | Status | Evidence |
|------------|------|--------|----------|
| **Phase 0** | Pre-flight checks | ✅ PASS | All tools/versions OK |
| **Phase 1** | Blocker check (old v1 function) | ✅ PASS | No blocker found |
| **Phase 2** | Smoke tests (build/analyze) | ✅ PASS | 1 deprecation warning (non-blocking) |
| **Phase 3.1** | Pair QR → connected | ⬜ PENDING | Manual step required |
| **Phase 3.2** | Inbox shows threads | ⬜ PENDING | Manual step required |
| **Phase 4.1** | Receive message persisted | ⬜ PENDING | Manual step required |
| **Phase 4.2** | Send message delivered | ⬜ PENDING | Manual step required |
| **Phase 4.3** | Restart safety | ⬜ PENDING | Manual step required |
| **Phase 5.1** | CRM Extract Event | ⬜ PENDING | Manual step required |
| **Phase 5.2** | CRM Save Event | ⬜ PENDING | Manual step required |
| **Phase 5.3** | Aggregate stats | ⬜ PENDING | Auto trigger verification required |
| **Phase 5.4** | Ask AI | ⬜ PENDING | Manual step required |

---

### Test Execution Summary

**RUN_ID**: T20260118_030620  
**accountId**: (to be filled after Test 3.1)  
**phoneE164 client**: (to be filled after Test 4.1)  
**Hetzner health**: ✅ PASS  
**Functions list**: ✅ PASS  
**Flutter analyze**: ✅ PASS (1 deprecation warning)

---

### BLOCKERS

**Current Status**: ✅ **NO AUTOMATED BLOCKERS DETECTED**

**Next Action Required**: **MANUAL TESTING**

The operator must now proceed with **Phase 3: Manual Flutter App Testing**.

---

### Recommendations

1. **Immediate Next Step**: Launch Flutter app and execute Test 3.1 (Pair QR)
2. **Test Device**: Use iOS Simulator for best experience
3. **Test Account**: Use a real WhatsApp number for accurate testing
4. **Evidence**: Take screenshots at each step for audit trail

---

### Launch Command

```bash
# Terminal 1: Launch iOS Simulator
flutter emulators --launch apple_ios_simulator

# Terminal 2: Run Flutter app (wait for simulator to boot first)
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run -d apple_ios_simulator
```

---

**Report Generated**: 2026-01-18 03:06:20 UTC  
**Generated By**: Cursor Agent (automated pre-flight checks)
