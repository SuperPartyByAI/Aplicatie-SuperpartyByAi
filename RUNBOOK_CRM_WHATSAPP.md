# Runbook: CRM Profiles + AI Extraction din WhatsApp

**Date:** 2026-01-17  
**Scope:** Client profiles (phone-based) + AI extraction de petreceri din WhatsApp threads → evenimente V3

---

## ✅ **1. Ce Am Implementat**

### **A) Data Model: Client Profiles**

**Collection:** `clients/{phoneE164}`

**Fields:**
- `phoneE164`: string (E.164 format, e.g., "+40712345678")
- `phoneRaw`: string (raw phone from input)
- `displayName`: string | null (best-effort from events)
- `lifetimeSpendPaid`: number (suma plătită, din evenimente cu status=PAID)
- `lifetimeSpendAll`: number (total inclusiv neplătit/cancelled)
- `eventsCount`: number (număr total evenimente)
- `lastEventAt`: timestamp
- `createdAt`: timestamp
- `updatedAt`: timestamp

**Firestore Rules:**
- `allow read: if isEmployee()`
- `allow write: if false` (server-only, Admin SDK bypasses rules)
- `allow delete: if false` (NEVER DELETE)

**Location:** `firestore.rules` (linia ~385-394)

---

### **B) Automatic Aggregation Trigger**

**Cloud Function:** `aggregateClientStats`

**Trigger:** `evenimente/{eventId}` onCreate/onUpdate

**Logic:**
- Calculează delta pentru `lifetimeSpendPaid`, `lifetimeSpendAll`, `eventsCount`
- Update client doc bazat pe `payment.amount` și `payment.status`
- Idempotent (transaction-based)

**Location:** `functions/aggregateClientStats.js`  
**Export:** `functions/index.js` (linia ~872)

**Deploy:**
```bash
firebase deploy --only functions:aggregateClientStats
```

---

### **C) WhatsApp → Event Extraction (AI)**

**Cloud Function:** `whatsappExtractEventFromThread` (callable)

**Input:**
```typescript
{
  threadId: string;
  accountId: string;
  phoneE164?: string;
  lastNMessages?: number; // default: 50
  dryRun?: boolean; // default: true
}
```

**Output:**
```typescript
{
  action: "CREATE_EVENT" | "UPDATE_EVENT" | "NOOP";
  draftEvent: { date, address, phoneE164, payment, rolesBySlot, ... };
  targetEventId?: string; // pentru UPDATE
  confidence: number; // 0-1
  reasons: string[];
  clientRequestId: string; // pentru idempotency
}
```

**Logic:**
- Citește ultimele N mesaje inbound din `threads/{threadId}/messages`
- Quick check (booking keywords, amount, date)
- AI extraction cu Groq (`llama-3.1-70b-versatile`)
- Normalizează folosind `normalizers.js` (V3 EN schema)
- Determină CREATE vs UPDATE (compare date cu latest open event)
- Salvează audit în `threads/{threadId}/extractions/{messageId}`

**Idempotency:**
- `clientRequestId = sha256(threadId + lastMessageId)`
- Poate fi folosit în `chatEventOps` pentru CREATE (V3 suportă `clientRequestId`)

**Location:** `functions/whatsappExtractEventFromThread.js`  
**Export:** `functions/index.js` (linia ~874)

**Deploy:**
```bash
firebase deploy --only functions:whatsappExtractEventFromThread
```

---

### **D) Client CRM AI Questions**

**Cloud Function:** `clientCrmAsk` (callable)

**Input:**
```typescript
{
  phoneE164: string;
  question: string; // e.g., "Cât a cheltuit clientul în total?"
}
```

**Output:**
```typescript
{
  answer: string; // răspuns AI în română
  sources: Array<{
    eventShortId: number | null;
    date: string; // DD-MM-YYYY
    details: string;
  }>;
}
```

**Logic:**
- Citește `clients/{phoneE164}` (agregat)
- Citește ultimele 20 evenimente pentru `phoneE164`
- Folosește Groq pentru a răspunde bazat pe date structurate
- Citează `eventShortId` și `date` în răspuns

**Location:** `functions/clientCrmAsk.js`  
**Export:** `functions/index.js` (linia ~876)

**Deploy:**
```bash
firebase deploy --only functions:clientCrmAsk
```

---

### **E) Firestore Indexes**

**Added indexes for `evenimente`:**
- `phoneE164 ASC, date DESC` (pentru client events list)
- `phoneE164 ASC, isArchived ASC, date DESC` (pentru active events)

**Location:** `firestore.indexes.json` (liniile ~300-325)

**Deploy:**
```bash
firebase deploy --only firestore:indexes
```

---

## 📋 **2. Flutter UI (TODO - de implementat)**

### **A) WhatsApp Chat Screen - CRM Panel**

**Locație:** `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart` (de creat sau extins)

**UI Elements:**
1. **Button:** "AI: Detectează petrecere (Draft)"
   - Calls `whatsappExtractEventFromThread(dryRun=true)`
   - Shows preview: `draftEvent`, `confidence`, `reasons`
2. **Button:** "Confirm & Save"
   - Calls `chatEventOps` cu `draftEvent` (CREATE/UPDATE)
   - Sau `whatsappExtractEventFromThread(dryRun=false)` dacă backend suportă
3. **Button:** "Open Client Profile"
   - Navigate la `ClientProfileScreen(phoneE164)`

### **B) Client Profile Screen**

**Locație:** `superparty_flutter/lib/screens/whatsapp/client_profile_screen.dart` (de creat)

**UI Elements:**
1. **Header:**
   - `phoneE164`, `displayName` (din `clients/{phoneE164}`)
2. **KPI Cards:**
   - Total cheltuit: `lifetimeSpendPaid` RON
   - Nr petreceri: `eventsCount`
   - Ultima petrecere: `lastEventAt` (formatted)
3. **Events List:**
   - Query `evenimente` where `phoneE164 == phoneE164`, order by `date DESC`
   - Show: `eventShortId`, `date`, `address`, `payment.amount`, `payment.status`
4. **Button:** "Ask AI about client"
   - Calls `clientCrmAsk(phoneE164, question)`
   - Shows answer + sources

---

## 🔍 **3. Verificare (Firebase Console)**

### **Firestore Collections:**

1. **`clients/{phoneE164}`:**
   - Verifică agregări: `lifetimeSpendPaid`, `eventsCount`, `lastEventAt`
   - Verifică auto-update la create/update `evenimente`

2. **`evenimente`:**
   - Verifică `phoneE164` pe evenimente
   - Verifică `payment.amount` și `payment.status`

3. **`threads/{threadId}/extractions/{messageId}`:**
   - Verifică audit AI (dupa ce rulezi `whatsappExtractEventFromThread`)

### **Cloud Functions:**

```bash
# List functions
firebase functions:list

# Verify exports
firebase functions:config:get

# Check logs
firebase functions:log --only aggregateClientStats
firebase functions:log --only whatsappExtractEventFromThread
firebase functions:log --only clientCrmAsk
```

---

## 🚀 **4. Deploy Checklist**

### **Firestore Rules:**
```bash
firebase deploy --only firestore:rules
```

### **Firestore Indexes:**
```bash
firebase deploy --only firestore:indexes
```

### **Cloud Functions:**
```bash
firebase deploy --only functions:aggregateClientStats,functions:whatsappExtractEventFromThread,functions:clientCrmAsk
```

**Sau deploy tot:**
```bash
firebase deploy --only functions
```

---

## ⚠️ **5. Note Importante**

### **Idempotency:**
- `aggregateClientStats` folosește transactions (safe)
- `whatsappExtractEventFromThread` folosește `clientRequestId` (pentru chatEventOps)

### **NEVER DELETE Policy:**
- `clients/{phoneE164}` → `allow delete: if false`
- Agregările se actualizează incremental (nu se resetează)

### **Exact Spend Calculation:**
- **NU** din text (AI extraction poate greși)
- **DA** din `evenimente.payment.amount` (structurat, determinist)
- Agregat automat via `aggregateClientStats` trigger

### **Rate Limiting:**
- `whatsappExtractEventFromThread` poate fi rate-limited (folosește Groq API)
- Recomandat: `dryRun=true` pentru preview, apoi `dryRun=false` pentru save

---

## 📊 **6. Testing**

### **Test 1: Create Event → Client Aggregation**
1. Create eveniment manual în Firestore:
   ```json
   {
     "phoneE164": "+40712345678",
     "payment": { "amount": 500, "status": "PAID" },
     "date": "15-01-2026",
     ...
   }
   ```
2. Verifică `clients/+40712345678`:
   - `lifetimeSpendPaid` = 500
   - `eventsCount` = 1

### **Test 2: Update Event Payment → Client Aggregation**
1. Update eveniment: `payment.status` = "PAID", `payment.amount` = 600
2. Verifică `clients/+40712345678`:
   - `lifetimeSpendPaid` = 600 (updated)

### **Test 3: WhatsApp Extraction (Dry Run)**
```bash
# Call whatsappExtractEventFromThread
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsappExtractEventFromThread \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "threadId": "WA-01__+40712345678",
      "accountId": "WA-01",
      "phoneE164": "+40712345678",
      "dryRun": true
    }
  }'
```

### **Test 4: Client CRM Ask**
```bash
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/clientCrmAsk \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "phoneE164": "+40712345678",
      "question": "Cât a cheltuit clientul în total?"
    }
  }'
```

---

## 📝 **7. Files Modified/Created**

### **Backend:**
- ✅ `functions/aggregateClientStats.js` (new)
- ✅ `functions/whatsappExtractEventFromThread.js` (new)
- ✅ `functions/clientCrmAsk.js` (new)
- ✅ `functions/index.js` (modified, exports added)

### **Firestore:**
- ✅ `firestore.rules` (modified, added `clients/{phoneE164}`)
- ✅ `firestore.indexes.json` (modified, added `evenimente` indexes)

### **Docs:**
- ✅ `RUNBOOK_CRM_WHATSAPP.md` (new, this file)

---

**END OF RUNBOOK**
