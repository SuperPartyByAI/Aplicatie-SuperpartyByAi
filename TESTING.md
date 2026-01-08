# Testing Guide: AI Event Creation

## Overview
This guide covers testing the AI-powered event creation feature with validation, idempotency, and strict formatting.

## Features to Test

### 1. Natural Language Detection
The app should detect event creation intent from natural language messages.

**Test patterns (with/without diacritics):**
- ✅ "noteaza eveniment pentru Maria pe 2026-02-15"
- ✅ "notează eveniment pentru Maria pe 2026-02-15"
- ✅ "adauga petrecere la Strada Florilor 10"
- ✅ "adaugă petrecere la Strada Florilor 10"
- ✅ "creeaza eveniment maine" (should be refused)
- ✅ "programeaza botez pentru Ion"

### 2. Two-Step Flow (Preview + Confirm)

**Expected behavior:**
1. User sends message → App shows preview with "Confirmă" button
2. User taps "Confirmă" → Event is created in Firestore
3. Same clientRequestId → Idempotent (no duplicate)

**Test:**
```
Message: "Vreau eveniment pentru Ana, 5 ani, pe 2026-03-20 la Strada Mihai 15, București. Avem nevoie de animator și vată de zahăr."

Expected preview:
- Sarbatorit: Ana
- Varsta: 5
- Data: 2026-03-20
- Adresa: Strada Mihai 15, București
- Roluri: animator, vata
- Button: "Confirmă"

After confirm:
- Event created in Firestore
- Success message shown
```

### 3. Date Validation

**Valid formats:**
- ✅ "2026-02-15" (YYYY-MM-DD)
- ✅ "2026-12-31"

**Invalid formats (should be refused):**
- ❌ "mâine" → Error: "Te rog să specifici data exactă în format YYYY-MM-DD"
- ❌ "săptămâna viitoare" → Error: "Te rog să specifici data exactă în format YYYY-MM-DD"
- ❌ "15 februarie 2026" → Error: "Data trebuie să fie în format YYYY-MM-DD"
- ❌ "02/15/2026" → Error: "Data trebuie să fie în format YYYY-MM-DD"

### 4. Address Validation

**Valid:**
- ✅ "Strada Florilor 10, București"
- ✅ "Bulevardul Unirii 25"
- ✅ "Parcul Central"

**Invalid (should be refused):**
- ❌ Missing address → Error: "Te rog să specifici adresa/locația evenimentului"
- ❌ Empty string → Error: "Te rog să specifici adresa/locația evenimentului"

### 5. Idempotency

**Test:**
1. Send message: "Eveniment pentru Laura pe 2026-04-10 la Strada Libertății 5"
2. Confirm → Event created with ID `event-123`
3. Send SAME message again
4. Confirm → Should return SAME event ID `event-123` (no duplicate)

**Implementation:**
- `clientRequestId` is generated from message hash
- Backend checks if event with same `clientRequestId` exists
- If exists, returns existing event instead of creating duplicate

### 6. Role Updates

**Available roles (11 services):**
1. animator
2. ursitoare
3. vata (vată de zahăr)
4. popcorn
5. vata_popcorn (vată + popcorn)
6. decoratiuni
7. baloane
8. baloane_heliu
9. aranjamente_masa
10. mos_craciun
11. gheata_carbonica

**Removed roles (not offered):**
- ❌ fotograf
- ❌ dj
- ❌ candy_bar
- ❌ barman
- ❌ ospatar
- ❌ bucatar

### 7. Staff Assignment

**Test:**
1. Create event with role "animator"
2. Check Firestore: `evenimente/{eventId}/staffProfiles`
3. Should have entry: `{ animator: null }` (unassigned)
4. Admin assigns staff → `{ animator: "staff-user-id" }`

## Manual Testing Checklist

### Prerequisites
- [ ] App version 1.3.0 (Build 30) or later installed
- [ ] Firebase Functions deployed with latest code
- [ ] Test user account logged in

### Test Cases

#### TC1: Valid Event Creation
- [ ] Send: "Notează eveniment pentru Maria, 5 ani, pe 2026-05-20 la Strada Florilor 10. Avem nevoie de animator."
- [ ] Verify preview shows all fields correctly
- [ ] Tap "Confirmă"
- [ ] Verify success message
- [ ] Check Firestore: event exists with correct data

#### TC2: Missing Date
- [ ] Send: "Eveniment pentru Ana la Strada Mihai 5"
- [ ] Verify error: "Te rog să specifici data exactă în format YYYY-MM-DD"

#### TC3: Relative Date (Refused)
- [ ] Send: "Eveniment mâine la Strada Unirii 3 pentru Ion"
- [ ] Verify error: "Te rog să specifici data exactă în format YYYY-MM-DD"

#### TC4: Missing Address
- [ ] Send: "Eveniment pentru Laura pe 2026-06-15"
- [ ] Verify error: "Te rog să specifici adresa/locația evenimentului"

#### TC5: Diacritics Tolerance
- [ ] Send: "noteaza eveniment" (no diacritics)
- [ ] Send: "notează eveniment" (with diacritics)
- [ ] Both should trigger event creation flow

#### TC6: Idempotency
- [ ] Send: "Eveniment pentru Andrei pe 2026-07-10 la Bulevardul Libertății 25"
- [ ] Confirm → Note event ID
- [ ] Send SAME message again
- [ ] Confirm → Verify SAME event ID returned

#### TC7: Role Assignment
- [ ] Create event with "animator și vată de zahăr"
- [ ] Check Firestore: `staffProfiles` should have `{ animator: null, vata: null }`

## Automated Tests

Run smoke tests:
```bash
cd functions
node test-event-creation.js
```

Expected output:
```
🧪 Starting smoke tests for event creation...

📋 Test: Valid event with all fields
  ✅ PASS

📋 Test: Missing date (should fail validation)
  ✅ PASS

📋 Test: Missing address (should fail validation)
  ✅ PASS

📋 Test: Relative date (should be refused)
  ✅ PASS

📋 Test: Idempotency test (duplicate clientRequestId)
  ✅ PASS

═══════════════════════════════════════
📊 Results: 5 passed, 0 failed
═══════════════════════════════════════
```

## Debugging

### Check Firebase Functions Logs
```bash
firebase functions:log --only chatEventOps
firebase functions:log --only chatWithAI
```

### Check Firestore Data
1. Open Firebase Console
2. Navigate to Firestore Database
3. Check `evenimente` collection
4. Verify event fields:
   - `date` (YYYY-MM-DD format)
   - `address` (non-empty)
   - `clientRequestId` (for idempotency)
   - `staffProfiles` (role assignments)

### Common Issues

**Issue: Events not being created**
- Check app version (must be 1.3.0+30 or later)
- Check Firebase Functions deployment status
- Check function logs for errors

**Issue: Duplicate events created**
- Verify `clientRequestId` is being sent
- Check backend idempotency logic
- Check Firestore for existing events with same `clientRequestId`

**Issue: AI returns markdown-wrapped JSON**
- Check system prompt in `chatEventOps.js` (lines 125-165)
- Verify "IMPORTANT - OUTPUT FORMAT" section
- Check Groq API response in logs

**Issue: Relative dates accepted**
- Check system prompt "IMPORTANT - DATE FORMAT" section
- Verify validation logic in backend
- Check error messages returned to user

## Success Criteria

All tests pass when:
- ✅ Natural language detection works with/without diacritics
- ✅ Preview shows correct data before creation
- ✅ Date validation enforces YYYY-MM-DD format
- ✅ Relative dates are refused with helpful error
- ✅ Address validation prevents empty addresses
- ✅ Idempotency prevents duplicate events
- ✅ Role assignments use correct 11 services
- ✅ Staff profiles are created correctly
- ✅ No markdown in AI responses (pure JSON)
