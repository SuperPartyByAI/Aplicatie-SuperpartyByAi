# Region Optimization Analysis - Firestore EUR3 vs Functions US-CENTRAL1

**Date:** 2026-01-18  
**Branch:** `audit-whatsapp-30`  
**Issue:** Cross-region latency and egress costs

---

## 🔍 Current State

### Firestore Location
- **Region:** `eur3` (Europe multi-region)
- **Trigger Region:** `eur3` (confirmed in Cloud Audit Log)
- **Evidence:** `triggerRegion: "eur3"` in aggregateClientStats deployment log

### Functions Location
- **Region:** `us-central1` (United States)
- **Set in:** `functions/index.js:35` (`setGlobalOptions({ region: 'us-central1' })`)
- **All functions:** Deployed to US by default

---

## ⚠️ Impact of Cross-Region Configuration

### Current Setup: US Functions → EU Firestore

**Latency:**
- ~100-150ms additional round-trip time per Firestore operation
- Compounded for functions with multiple reads/writes

**Egress Costs:**
- Data transfer from US (Cloud Functions) → EU (Firestore) is billable
- Estimated: $0.08-0.12 per GB (inter-region GCP egress)

**Performance:**
- Firestore triggers (Eventarc) run in `eur3` but invoke functions in `us-central1`
- Additional hop introduces latency for event-driven functions

---

## 📊 Firestore-Heavy Functions Identified

### **Critical** (High Firestore I/O)

1. **`aggregateClientStats`** (Firestore trigger)
   - Trigger: `evenimente/{eventId}` writes
   - Reads: `evenimente` docs
   - Writes: `clients/{phoneE164}` aggregates
   - **Current region:** `us-central1`
   - **Impact:** Every event write triggers cross-region call

2. **`whatsappExtractEventFromThread`** (AI CRM extraction)
   - Reads: `threads/{threadId}/messages/*` (paginated, 20-50 docs)
   - Writes: `threads/{threadId}/extractions/{messageId}`
   - Writes: `evenimente/{eventId}` (new events)
   - Writes: `clients/{phoneE164}` (via aggregateClientStats trigger)
   - **Current region:** `us-central1`
   - **Impact:** Every extraction reads/writes multiple Firestore docs

3. **`clientCrmAsk`** (AI queries about clients)
   - Reads: `clients/{phoneE164}`
   - Reads: `evenimente` (filtered by phoneE164)
   - Reads: `threads/{threadId}/messages/*` (context)
   - **Current region:** `us-central1`
   - **Impact:** Every AI query reads multiple collections

### **Moderate** (Some Firestore I/O)

4. **`whatsappProxyGetAccounts`**
   - Reads: `accounts` collection (caching helps)
   - **Current region:** `us-central1`

5. **`whatsappProxyAddAccount`**, **`whatsappProxyRegenerateQr`**
   - Writes: `accounts` docs
   - **Current region:** `us-central1`

6. **`whatsappProxySend`**
   - Writes: `outbox` docs
   - **Current region:** `us-central1`

### **Low** (Minimal Firestore I/O)

7. Old AI functions (`archiveEventAI`, `getEventeAI`, etc.)
   - Read/write `evenimente` but rarely used
   - **Current region:** `us-central1`

8. **`chatWithAI`**
   - Moderate Firestore usage (depends on context)
   - **Current region:** `us-central1`

9. **`whatsappV4`** (Express app)
   - Lazy-loads WhatsApp manager (in-memory heavy)
   - Firestore usage depends on manager operations
   - **Current region:** `us-central1`

---

## 🌍 Recommended Region: `europe-west1`

**Why `europe-west1`?**
- **Closest to `eur3`** (Firestore multi-region: Belgium, Netherlands, Frankfurt)
- **Low latency:** ~1-5ms to Firestore (vs ~100-150ms from US)
- **No egress costs** within same region family (EU)
- **Stable:** Mature GCP region with good SLA
- **Alternative:** `europe-west3` (Frankfurt) also works

---

## 💡 Proposed Changes

### Option A: Move ONLY Critical Functions to EU (Recommended)

**Change region for Firestore-heavy functions:**
- `aggregateClientStats` → `europe-west1`
- `whatsappExtractEventFromThread` → `europe-west1`
- `clientCrmAsk` → `europe-west1`

**Keep US for others:**
- `whatsappV4` (HTTPS app, latency less critical)
- `whatsappProxy*` (HTTPS, lightweight Firestore ops)
- Old AI functions (rarely used)

**Pros:**
- Optimizes latency for CRM features (AI extraction, aggregation)
- Reduces egress costs for heavy operations
- Keeps US endpoint for user-facing HTTPS (whatsappV4)

**Cons:**
- Mixed regions (some functions in US, some in EU)
- Slightly more complex deployment

**Code changes:** 3 files
**Deployment:** No breaking changes

---

### Option B: Move ALL Functions to EU

**Change global region:**
- `setGlobalOptions({ region: 'europe-west1' })`

**Pros:**
- All functions co-located with Firestore
- Zero egress costs
- Consistent configuration

**Cons:**
- HTTPS endpoints (whatsappV4, whatsappProxy*) URL changes:
  - Before: `us-central1-superparty-frontend.cloudfunctions.net`
  - After: `europe-west1-superparty-frontend.cloudfunctions.net`
- Requires updating `RAILWAY_WHATSAPP_URL` secret
- Requires updating Flutter app base URLs (if hardcoded)

**Code changes:** 1 file (index.js)
**Deployment:** Requires URL updates in multiple places

---

### Option C: Keep US (Current State)

**Pros:**
- No code changes needed
- Already deployed and working

**Cons:**
- Cross-region latency (~100-150ms per Firestore op)
- Egress costs (estimated $0.08-0.12 per GB)
- Slower CRM features (AI extraction, aggregation)

**Recommendation:** Only if acceptance tests are urgent and you'll migrate later

---

## 🎯 Recommended Action: **Option A**

Move only critical Firestore-heavy functions to `europe-west1`:

### Files to Change

1. **`functions/aggregateClientStats.js`** (line 20)
   ```javascript
   // Before
   region: 'us-central1',
   
   // After
   region: 'europe-west1',
   ```

2. **`functions/whatsappExtractEventFromThread.js`** (line 33)
   ```javascript
   // Before
   region: 'us-central1',
   
   // After
   region: 'europe-west1',
   ```

3. **`functions/clientCrmAsk.js`** (line 27)
   ```javascript
   // Before
   region: 'us-central1',
   
   // After
   region: 'europe-west1',
   ```

### Deployment

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

# After manual deletion of old whatsapp function
firebase deploy --only functions
```

**Expected behavior:**
- These 3 functions will redeploy to `europe-west1`
- Other functions remain in `us-central1`
- No URL changes for HTTPS endpoints
- No Flutter app updates needed

---

## 📊 Performance Comparison

| Scenario | Firestore Read Latency | Firestore Write Latency | Egress Cost |
|----------|------------------------|-------------------------|-------------|
| **Current (US)** | ~120ms | ~130ms | $0.10/GB |
| **Option A (EU for critical)** | ~2-5ms | ~3-7ms | $0 (same region) |
| **Option B (All EU)** | ~2-5ms | ~3-7ms | $0 (same region) |

**Real-world impact example:**
- `whatsappExtractEventFromThread` reads 30 messages + writes 2 docs
- **US region:** 30 × 120ms + 2 × 130ms = **3,860ms** (~4 seconds)
- **EU region:** 30 × 3ms + 2 × 5ms = **100ms** (~0.1 seconds)

**40x faster** for heavy operations

---

## ✅ My Recommendation

**For Acceptance Tests:**
- **If urgent:** Proceed with current US setup (Option C), test functionality
- **If 10 min available:** Apply Option A changes, redeploy to EU (optimized)

**For Production:**
- **Strongly recommend Option A** (move critical functions to EU)
- **Consider Option B** if you plan to move entire app to EU later

---

**Next Step:** Let me know:
1. Do you want me to apply Option A changes now (3 files)?
2. Or proceed with current setup and migrate later?
