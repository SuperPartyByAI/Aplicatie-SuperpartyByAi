# WhatsApp E2E Testing Guide - "Cap-coadă" Flow

## Overview
This guide provides step-by-step instructions for running the complete end-to-end test suite for the WhatsApp integration system.

## Prerequisites
- Firebase CLI installed and authenticated
- Access to Firebase Console (superparty-frontend project)
- Access to Railway dashboard
- Flutter app installed and configured
- Test WhatsApp account (WA-01)

## Quick Start

### Option 1: Run Automated Tests (Recommended)
```bash
bash test-whatsapp-e2e-complete.sh
```

This will:
- Check for old 1st gen WhatsApp function
- Verify Railway backend health
- Verify Firebase Functions availability
- Check Firestore rules protection
- Generate a test report with manual test instructions

### Option 2: Manual Step-by-Step

## Step 1: Cleanup Old Functions (If Needed)

**Check for old function:**
```bash
firebase functions:list | grep -i "whatsapp.*v1"
```

**If found:**
1. Go to Firebase Console → Project `superparty-frontend` → Functions
2. Filter by "1st gen"
3. Find function named `whatsapp`
4. Click Delete
5. Redeploy functions:
   ```bash
   firebase deploy --only functions
   ```

## Step 2: Verify Platform Configuration

### Railway Backend
```bash
curl -sS https://whats-upp-production.up.railway.app/health
```

**Expected output:**
```json
{
  "status": "healthy",
  "firestore": {
    "status": "connected"
  },
  "accounts": {
    "total": 0,
    "connected": 0,
    "max": 30
  }
}
```

**Verify Railway Variables (in Railway dashboard):**
- `SESSIONS_PATH=/app/sessions` ✅
- `FIREBASE_SERVICE_ACCOUNT_JSON=...` ✅ (must be set)
- `ADMIN_TOKEN=...` (optional, if exists)
- **Single instance** (no scale-out) ✅

### Firebase Configuration
```bash
# List functions
firebase functions:list | grep -i whatsapp

# Expected functions:
# - whatsappProxyGetAccounts
# - whatsappProxyAddAccount
# - whatsappProxyRegenerateQr
# - whatsappProxyDeleteAccount
# - whatsappProxySend
# - whatsappExtractEventFromThread
```

**Verify secrets:**
```bash
firebase functions:secrets:access RAILWAY_WHATSAPP_URL
firebase functions:secrets:access GROQ_API_KEY
```

**Verify Firestore rules:**
- Rules file exists: `firestore.rules`
- Contains "NEVER DELETE" for threads/messages/clients ✅

## Step 3: Manual Tests in Flutter App

### Test 1: Pair WhatsApp Account (QR)

**Steps:**
1. Open Flutter app
2. Navigate to: **WhatsApp → Accounts**
3. Tap **Add account**
4. Enter account ID: `WA-01`
5. QR code should display
6. On your phone: **WhatsApp → Settings → Linked devices → Link a device**
7. Scan the QR code from the app
8. Wait 5-10 seconds

**Expected Result:**
- Account status changes to `connected`
- QR code disappears
- Account appears in accounts list with green status

**Screenshot locations:**
- WhatsApp → Accounts screen (after pairing)
- Account status indicator

---

### Test 2: Inbox/Threads Visibility

**Steps:**
1. In Flutter app: **WhatsApp → Inbox**
2. Select account: `WA-01` (from dropdown/filter)
3. Wait for threads to load

**Expected Result:**
- Threads list appears (if messages exist)
- Each thread shows:
  - Client phone number
  - Last message preview
  - Timestamp
  - Unread count (if any)

**If no threads appear:**
- This is normal if no messages exist yet
- Proceed to Test 3 to create a thread

**Screenshot:**
- Inbox screen with threads list

---

### Test 3: Receive Message (Client → WA-01)

**Prerequisites:**
- WA-01 account is paired and connected
- You have access to a test phone number

**Steps:**
1. From a test phone, send a WhatsApp message to the WA-01 number
2. In Flutter app: **WhatsApp → Inbox**
3. Select account: `WA-01`
4. Find the thread for the test phone number
5. Open the thread (Chat screen)
6. Verify the message appears

**Expected Result:**
- Message appears in chat within 5-10 seconds
- Message shows as received (inbound)
- Message persists after app restart

**Verify in Firestore:**
```bash
# Check thread exists
firebase firestore:get threads --limit 1

# Check message exists
firebase firestore:get threads/{threadId}/messages --limit 1
```

**Screenshot:**
- Chat screen showing received message

---

### Test 4: Send Message (WA-01 → Client)

**Steps:**
1. In Flutter app: Open Chat for a thread
2. Type a test message: "Test message from SuperParty app"
3. Tap Send
4. Wait 5-10 seconds
5. Verify on test phone: Message received

**Expected Result:**
- Message appears in chat immediately (optimistic update)
- Message status shows "sent" → "delivered" → "read" (if client reads)
- Client receives message on WhatsApp
- Message persists in Firestore

**Verify in Firestore:**
```bash
# Check outbox entry
firebase firestore:get outbox --limit 1

# Check message in thread
firebase firestore:get threads/{threadId}/messages --order-by timestamp --limit 1
```

**Screenshot:**
- Chat screen showing sent message with status

---

### Test 5: Restart Safety

**Prerequisites:**
- WA-01 is paired
- At least 2-3 messages sent/received

**Steps:**
1. Note current message count in app
2. Trigger Railway restart (via Railway dashboard: Redeploy)
3. Wait 2-3 minutes for restart
4. In Flutter app: Refresh accounts list
5. Verify:
   - Account still shows as `connected` (no QR required)
   - All previous messages still visible
   - Send a test message to verify it still works

**Expected Result:**
- ✅ Account remains connected
- ✅ All messages persist
- ✅ No data loss
- ✅ Can send/receive after restart

**If messages received during restart:**
- They should appear after restart completes (pending messages)

**Screenshot:**
- Accounts screen showing connected status after restart
- Chat screen showing all messages intact

---

### Test 6: CRM Extract/Save/Ask AI

**Prerequisites:**
- Thread with conversation about an event/booking
- At least 2-3 messages in thread

**Steps:**

**6a. Extract Event:**
1. In Chat screen: Open thread with event conversation
2. Tap **CRM Panel** (or Extract Event button)
3. Tap **Extract Event**
4. Wait for AI extraction (10-30 seconds)

**Expected Result:**
- Draft event form appears with:
  - Data/ora (date/time)
  - Adresă (address)
  - Personaje (guests/people)
  - Sumă (amount)
- Fields pre-filled from conversation

**6b. Save Event:**
1. Review extracted data
2. Make corrections if needed
3. Tap **Save Event**
4. Wait for confirmation

**Expected Result:**
- Event document created in `evenimente` collection
- Success message appears

**Verify in Firestore:**
```bash
firebase firestore:get evenimente --order-by createdAt --limit 1
```

**6c. Verify Client Stats:**
1. Wait 10-30 seconds (for aggregateClientStats to run)
2. Check `clients/{phoneE164}` document

**Expected Result:**
- `eventsCount` incremented
- `lifetimeSpend` updated (if amount extracted)

**Verify in Firestore:**
```bash
firebase firestore:get clients/{phoneE164}
```

**6d. Ask AI:**
1. Navigate to **Client Profile** (for the phone number)
2. Tap **Ask AI**
3. Type: "câți bani a cheltuit clientul cu telefonul X"
4. Submit

**Expected Result:**
- AI returns correct total from `lifetimeSpend`
- Response includes event count

**Screenshot:**
- Extract Event draft form
- Saved event confirmation
- Client Profile with Ask AI response

---

## Test Report Template

After completing all tests, update the generated report with results:

```markdown
## Test Results

### Test 1: Pair WhatsApp Account (QR)
- Status: ✅ PASS / ❌ FAIL
- Screenshot: [attach]
- Notes: [any issues]

### Test 2: Inbox/Threads Visibility
- Status: ✅ PASS / ❌ FAIL
- Screenshot: [attach]
- Notes: [any issues]

### Test 3: Receive Message
- Status: ✅ PASS / ❌ FAIL
- Firestore verification: ✅ / ❌
- Notes: [any issues]

### Test 4: Send Message
- Status: ✅ PASS / ❌ FAIL
- Firestore verification: ✅ / ❌
- Notes: [any issues]

### Test 5: Restart Safety
- Status: ✅ PASS / ❌ FAIL
- Messages persisted: ✅ / ❌
- Account reconnected: ✅ / ❌
- Notes: [any issues]

### Test 6: CRM Extract/Save/Ask AI
- Extract: ✅ PASS / ❌ FAIL
- Save: ✅ PASS / ❌ FAIL
- Stats updated: ✅ PASS / ❌ FAIL
- Ask AI: ✅ PASS / ❌ FAIL
- Notes: [any issues]
```

## Troubleshooting

### Railway Health Check Fails
- Check Railway dashboard for service status
- Verify environment variables are set
- Check Railway logs for errors

### QR Code Not Appearing
- Verify Railway backend is healthy
- Check Firebase Functions logs
- Verify `whatsappProxyRegenerateQr` function is deployed

### Messages Not Appearing
- Check Firestore rules allow read access
- Verify Railway backend is processing messages
- Check Firebase Functions logs for errors

### Account Disconnects After Restart
- Verify `SESSIONS_PATH` is set correctly in Railway
- Check Railway volume is mounted
- Verify session files persist in Railway

### CRM Extraction Fails
- Verify `GROQ_API_KEY` secret is set
- Check Firebase Functions logs
- Verify thread has enough messages for extraction

## Next Steps After All Tests Pass

1. **Onboard 30 Accounts:**
   - Pair WA-01 through WA-30
   - Checkpoint every 5 accounts:
     - Health check
     - Send/receive test
     - Verify connected status

2. **Monitor Production:**
   - Set up alerts for Railway health
   - Monitor Firestore write operations
   - Track message delivery rates

3. **Documentation:**
   - Update user guide with pairing instructions
   - Document CRM extraction workflow
   - Create troubleshooting guide

## Support

If tests fail:
1. Check the generated test report
2. Review Railway logs
3. Review Firebase Functions logs
4. Check Firestore rules and indexes
5. Verify all secrets are set correctly
