# WhatsApp CRM Flow - End-to-End

**Date:** 2026-01-17  
**Scope:** Cap-coadă flow pentru WhatsApp → Firebase → CRM profiles

---

## 📋 **Flow "Cap-Coadă" (End-to-End)**

### **1. Pair Account (QR)**

**UI:** WhatsApp → Accounts → Add Account

**Backend:**
- Backend creates account in Firestore `accounts/{accountId}`
- QR code generated (Baileys)
- Client scans QR → status becomes `connected`

**Firestore:**
- `accounts/{accountId}` → `status: "connected"`

---

### **2. Sync Conversations (Backend)**

**Automatic (backend):**
- On pairing → `messaging-history.set` event → Backend ingests history
- Messages saved to `threads/{threadId}/messages/{messageId}`
- Best-effort (WhatsApp Multi-Device doesn't guarantee full history)

**Firestore:**
- `threads/{threadId}` → Created with `accountId`, `clientJid`, `lastMessageAt`
- `threads/{threadId}/messages/{messageId}` → Messages with `direction`, `body`, `tsClient`

---

### **3. Inbox (View Threads)**

**UI:** WhatsApp → Inbox

**Flow:**
1. Select accountId (dropdown)
2. Stream Firestore: `collection('threads').where('accountId', isEqualTo: selectedAccountId)`
3. List threads with preview (lastMessageText, lastMessageAt)
4. Tap thread → Navigate to Chat

**Firestore Read:**
- `threads` where `accountId` (realtime)

---

### **4. Chat (Send/Receive Messages)**

**UI:** WhatsApp → Inbox → Tap Thread → Chat Screen

**Receive (Automatic - Backend):**
- Client sends message → Backend `messages.upsert` handler → Firestore
- Chat screen streams `threads/{threadId}/messages` (realtime)
- Message appears automatically

**Send (UI Action):**
1. User types message → Tap Send
2. Calls `WhatsAppApiService.sendViaProxy()` (NOT direct Firestore write)
3. Proxy creates `outbox/{requestId}` (server-side)
4. Backend processes outbox → Sends via WhatsApp → Updates message status
5. Firestore updates `threads/{threadId}/messages/{messageId}` with status (sent/delivered/read)

**Firestore:**
- Read: `threads/{threadId}/messages` (realtime stream)
- Write: None from client (server-only via proxy)

---

### **5. CRM Panel (Extract Event from Thread)**

**UI:** Chat Screen → CRM Panel → "Extract Event"

**Flow:**
1. Tap "Extract Event" button
2. Calls `WhatsAppApiService.extractEventFromThread(threadId, accountId, dryRun=true)`
3. Firebase callable `whatsappExtractEventFromThread`:
   - Reads last N inbound messages from `threads/{threadId}/messages`
   - Runs AI extraction (Groq)
   - Returns `{ action, draftEvent, confidence, reasons }`
4. UI shows draft event (date, address, payment, etc.)
5. User reviews/edits → Tap "Save Event"
6. Creates new doc in `evenimente/{eventId}`:
   - `phoneE164` from thread
   - `createdBy` = Firebase Auth uid
   - `schemaVersion = 3`
   - `isArchived = false`
   - Event data (date, address, payment, rolesBySlot)

**Firestore Writes:**
- Client writes to: `evenimente/{eventId}` (must pass rules: `createdBy == uid`, `isArchived == false`)
- Backend writes to: `threads/{threadId}/extractions/{messageId}` (audit trail)

**Trigger:**
- `aggregateClientStats` trigger fires on `evenimente/{eventId}` create
- Updates `clients/{phoneE164}` (lifetimeSpendPaid, eventsCount, lastEventAt)

---

### **6. Client Profile (View KPI + Ask AI)**

**UI:** Chat → CRM Panel → "Client Profile" (or direct navigate to `/whatsapp/client?phoneE164=...`)

**Flow:**
1. Load `clients/{phoneE164}` (CRM aggregates)
2. Stream `evenimente` where `phoneE164 == phoneE164` (events list)
3. Display:
   - KPI Cards: Total Spent, Events Count, Last Event
   - Events List: All events for this phone (reverse chronological)
4. "Ask AI" input:
   - User types question (e.g., "Cât a cheltuit clientul X?")
   - Calls `WhatsAppApiService.askClientAI(phoneE164, question)`
   - Firebase callable `clientCrmAsk`:
     - Reads `clients/{phoneE164}` (aggregates)
     - Reads `evenimente` where `phoneE164` (events)
     - Runs AI (Groq) with structured data context
     - Returns `{ answer, sources: [...] }`
   - UI displays answer + sources (eventShortId, date, details)

**Firestore Reads:**
- `clients/{phoneE164}` (one-time)
- `evenimente` where `phoneE164` (realtime stream)

**Firestore Writes:**
- None (read-only screen)

---

## 🔄 **Flow Diagram**

```
1. Pair Account (QR)
   └─> accounts/{accountId} (status: connected)

2. Backend Sync (automatic)
   └─> threads/{threadId}/messages/{messageId} (history ingested)

3. Inbox Screen
   └─> Stream threads where accountId → List threads
   └─> Tap thread → Chat Screen

4. Chat Screen
   ├─> Stream messages from threads/{threadId}/messages
   ├─> Send: sendViaProxy() → outbox (server-side) → Backend sends → Status updates
   └─> CRM Panel:
       ├─> Extract Event → whatsappExtractEventFromThread → draftEvent
       ├─> Save Event → evenimente/{eventId} (new doc)
       │   └─> Trigger: aggregateClientStats → clients/{phoneE164} (auto-update)
       └─> Client Profile → /whatsapp/client?phoneE164=...

5. Client Profile Screen
   ├─> Read clients/{phoneE164} (KPI)
   ├─> Stream evenimente where phoneE164 (events list)
   └─> Ask AI → clientCrmAsk → answer from structured data
```

---

## 🛡️ **Security & Rules**

### **Client-Side Rules (Firestore):**

**threads/{threadId}:**
- ✅ Read: `isAuthenticated()` + `isAdmin()` or `accountId in getUserAllowedAccounts()`
- ❌ Write: `allow create, update: if false` (server-only)
- ❌ Delete: `allow delete: if false` (NEVER DELETE)

**threads/{threadId}/messages/{messageId}:**
- ✅ Read: `isAuthenticated()` + allowed account
- ❌ Write: `allow create: if false` (server-only)
- ❌ Update: `allow update: if false` (immutable)
- ❌ Delete: `allow delete: if false` (NEVER DELETE)

**outbox/{messageId}:**
- ✅ Read: `isEmployee()` (for status checking)
- ❌ Write: `allow create, update, delete: if false` (server-only)

**evenimente/{eventId}:**
- ✅ Create: `isAuthenticated()` + `createdBy == uid` + `isArchived == false` + `schemaVersion in [2, 3]`
- ✅ Read: `isAuthenticated()`
- ✅ Update: `isEmployee()` or `createdBy == uid`
- ❌ Delete: `allow delete: if false` (NEVER DELETE - use archive)

**clients/{phoneE164}:**
- ✅ Read: `isEmployee()`
- ❌ Write: `allow create, update: if false` (server-only)
- ❌ Delete: `allow delete: if false` (NEVER DELETE)

---

## ✅ **Verification Checklist**

### **Backend:**
- [ ] Pair account → QR scanned → `accounts/{accountId}.status = "connected"`
- [ ] After pairing → history sync → messages appear in `threads/{threadId}/messages`
- [ ] Send message → `sendViaProxy()` → outbox created (server-side) → message sent → status updates

### **Flutter UI:**
- [ ] Inbox → Select account → threads list appears
- [ ] Inbox → Tap thread → Chat screen opens
- [ ] Chat → Send message → Message appears + status updates
- [ ] Chat → CRM Panel → Extract Event → Draft shown → Save → `evenimente/{eventId}` created
- [ ] Chat → CRM Panel → Client Profile → KPI + events list displayed
- [ ] Client Profile → Ask AI → Answer displayed with sources

### **CRM Aggregation:**
- [ ] Save event → `clients/{phoneE164}` auto-updated (lifetimeSpendPaid, eventsCount)
- [ ] Second event for same client → `clients/{phoneE164}.eventsCount` increments
- [ ] Ask AI "cât a cheltuit?" → Answer includes exact sum from `clients/{phoneE164}.lifetimeSpendPaid`

---

## 🔍 **Firestore Queries Used**

### **Inbox Screen:**
```dart
FirebaseFirestore.instance
  .collection('threads')
  .where('accountId', isEqualTo: selectedAccountId)
  .orderBy('lastMessageAt', descending: true)
  .limit(100)
```

### **Chat Screen:**
```dart
FirebaseFirestore.instance
  .collection('threads')
  .doc(threadId)
  .collection('messages')
  .orderBy('tsClient', descending: false)
  .limit(200)
```

### **Client Profile Screen:**
```dart
// Client aggregates
FirebaseFirestore.instance
  .collection('clients')
  .doc(phoneE164)

// Events list
FirebaseFirestore.instance
  .collection('evenimente')
  .where('phoneE164', isEqualTo: phoneE164)
  .orderBy('date', descending: true)
  .limit(50)
```

---

**END OF FLOW DOCUMENTATION**
