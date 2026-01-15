# WhatsApp Baseline Audit

## Current Outbox Writers

1. **kyc-app/kyc-app/src/components/ChatClientiRealtime.jsx:274**
   - Client writes directly: `setDoc(doc(db, 'outbox', requestId), outboxData)`
   - **Action**: Replace with Functions proxy call

2. **whatsapp-backend/server.js:2370** (Legacy endpoint)
   - `/api/whatsapp/send-message` endpoint writes to outbox
   - **Action**: Deprecate or route to Functions proxy

3. **whatsapp-backend/server.js:4017-4268** (Worker loop)
   - Reads and updates outbox (correct - server-only)
   - **Action**: Add distributed leasing

4. **whatsapp-backend/server.js:837-887, 3306-3343** (Flush on connect)
   - Sends outbox directly on connection.open
   - **Action**: REMOVE (duplicate send path)

## Current Send Paths

1. **Client → Direct Firestore write** (kyc-app)
   - ❌ Bypasses server-side validation
   - ❌ Violates server-only rule

2. **Client → Functions proxy → Outbox** (Flutter sendViaProxy)
   - ✅ Correct path (if used)
   - ⚠️ Need to verify kyc-app uses it

3. **Legacy API → Outbox** (whatsapp-backend /api/whatsapp/send-message)
   - ⚠️ Should route through Functions proxy

4. **Worker loop → Send** (whatsapp-backend)
   - ✅ Correct (server-only)
   - ⚠️ Needs leasing for multi-instance

5. **Flush on connect → Send** (whatsapp-backend)
   - ❌ Duplicate path, causes duplicates
   - **Action**: REMOVE

## Firestore Rules Status

- **Current**: `allow create: if isAuthenticated() && (isAdmin() || request.resource.data.accountId in getUserAllowedAccounts())`
- **Required**: `allow create, update, delete: if false` (server-only)

## Issues Found

1. ❌ Client writes to outbox (kyc-app)
2. ❌ Duplicate send path (flush on connect)
3. ❌ No distributed leasing (multi-instance unsafe)
4. ❌ No inbound dedupe
5. ❌ No observability endpoints
6. ⚠️ Worker loop doesn't use transactions for lease claims
