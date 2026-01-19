#!/bin/bash
# WhatsApp End-to-End Test Suite - "Cap-coadă" Acceptance Flow
# Run with: bash test-whatsapp-e2e-complete.sh

set -e

REPORT_FILE="WHATSAPP_E2E_TEST_REPORT_$(date +%Y%m%d_%H%M%S).md"
RAILWAY_URL="https://whats-upp-production.up.railway.app"
FIREBASE_PROJECT="superparty-frontend"

echo "# WhatsApp E2E Test Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Helper function to log test results
log_test() {
    local test_name=$1
    local status=$2
    local details=$3
    echo "## Test: $test_name" >> "$REPORT_FILE"
    echo "**Status:** $status" >> "$REPORT_FILE"
    echo "**Timestamp:** $(date)" >> "$REPORT_FILE"
    if [ -n "$details" ]; then
        echo "**Details:**" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "$details" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
    echo "[$status] $test_name"
}

# Test 0: Check for old WhatsApp 1st gen function
echo "=== Checking for old WhatsApp 1st gen function ==="
OLD_FUNCTION=$(firebase functions:list 2>&1 | grep -i "whatsapp.*v1.*https" || true)
if [ -n "$OLD_FUNCTION" ]; then
    log_test "0. Old WhatsApp 1st gen function cleanup" "⚠️  MANUAL ACTION REQUIRED" \
        "Found old function. Delete via Firebase Console:\nFirebase Console → Project $FIREBASE_PROJECT → Functions → Filter '1st gen' → Find 'whatsapp' → Delete\nThen run: firebase deploy --only functions"
else
    log_test "0. Old WhatsApp 1st gen function cleanup" "✅ PASS" "No old 1st gen function found"
fi

# Test 1: Railway Health Check
echo "=== Testing Railway Backend Health ==="
HEALTH_RESPONSE=$(curl -sS "$RAILWAY_URL/health" || echo "ERROR")
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    if echo "$HEALTH_RESPONSE" | grep -q '"firestore".*"status".*"connected"'; then
        log_test "1. Railway Health Check" "✅ PASS" "$HEALTH_RESPONSE"
    else
        log_test "1. Railway Health Check" "❌ FAIL" "Firestore not connected: $HEALTH_RESPONSE"
    fi
else
    log_test "1. Railway Health Check" "❌ FAIL" "Health check failed: $HEALTH_RESPONSE"
fi

# Test 2: Firebase Functions List
echo "=== Checking Firebase Functions ==="
FUNCTIONS_LIST=$(firebase functions:list 2>&1 | grep -i whatsapp || echo "NONE")
if echo "$FUNCTIONS_LIST" | grep -q "whatsappProxyGetAccounts"; then
    log_test "2. Firebase Functions Available" "✅ PASS" "$FUNCTIONS_LIST"
else
    log_test "2. Firebase Functions Available" "❌ FAIL" "WhatsApp functions not found"
fi

# Test 3: Firestore Rules Check (read-only check)
echo "=== Checking Firestore Rules ==="
if [ -f "firestore.rules" ]; then
    if grep -q "NEVER DELETE" firestore.rules && grep -q "threads" firestore.rules; then
        log_test "3. Firestore Rules Protection" "✅ PASS" "Rules file exists with threads/messages protection"
    else
        log_test "3. Firestore Rules Protection" "⚠️  WARNING" "Rules file exists but may be missing protections"
    fi
else
    log_test "3. Firestore Rules Protection" "❌ FAIL" "firestore.rules file not found"
fi

# Test 4: Railway Variables Check (manual verification needed)
echo "=== Railway Variables Check ==="
log_test "4. Railway Variables" "⚠️  MANUAL CHECK REQUIRED" \
    "Verify in Railway dashboard:\n- SESSIONS_PATH=/app/sessions\n- FIREBASE_SERVICE_ACCOUNT_JSON=... (set)\n- ADMIN_TOKEN=... (if exists)\n- Single instance (no scale-out)"

# Test 5-9: Manual Tests (instructions)
echo "=== Manual Test Instructions ==="
log_test "5. Pair WhatsApp Account (QR)" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. Open Flutter app → WhatsApp → Accounts\n2. Add account (WA-01)\n3. Display QR code\n4. On phone: WhatsApp → Linked devices → Link a device → Scan QR\n5. Verify status becomes 'connected' in app\n\nExpected: Account shows as connected after QR scan"

log_test "6. Inbox/Threads Visibility" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. Open Flutter app → WhatsApp → Inbox\n2. Select accountId = WA-01\n3. Verify threads appear (if messages exist)\n\nExpected: Threads list visible for selected account"

log_test "7. Receive Message (Client → WA-01)" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. From client phone, send message to WA-01 number\n2. In app: Open Chat for that thread\n3. Verify message appears in app\n4. Check Firestore: threads/{threadId}/messages/{messageId} exists\n\nExpected: Message appears in app and persists in Firestore"

log_test "8. Send Message (WA-01 → Client)" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. In app Chat: Type and send message\n2. Verify client receives on WhatsApp\n3. Check Firestore: outbox entry created, message status updates (sent/delivered/read)\n\nExpected: Message sent successfully, status tracked in Firestore"

log_test "9. Restart Safety" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. Pair WA-01 and send/receive a few messages\n2. Restart/redeploy Railway backend\n3. Verify:\n   - Account remains connected (no QR required)\n   - Messages remain visible in app\n   - If messages received during restart, they appear after restart\n\nExpected: Conversations persist, no data loss"

log_test "10. CRM Extract/Save/Ask AI" "⏳ MANUAL TEST REQUIRED" \
    "Steps:\n1. In Chat → CRM Panel → Extract Event\n2. Verify draft: data/ora/adresă/personaje/sumă\n3. Save Event → creates document in evenimente collection\n4. Verify aggregateClientStats updates clients/{phoneE164} (eventsCount, lifetimeSpend)\n5. In Client Profile → Ask AI: 'câți bani a cheltuit clientul cu telefonul X'\n\nExpected: Event extraction works, client stats aggregate correctly, AI returns correct totals"

# Summary
echo "" >> "$REPORT_FILE"
echo "## Test Summary" >> "$REPORT_FILE"
echo "**Total Tests:** 11" >> "$REPORT_FILE"
echo "**Completed:** $(grep -c "✅ PASS\|❌ FAIL" "$REPORT_FILE" || echo "0")" >> "$REPORT_FILE"
echo "**Manual Tests Pending:** $(grep -c "⏳ MANUAL" "$REPORT_FILE" || echo "0")" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Next Steps" >> "$REPORT_FILE"
echo "1. If old 1st gen function exists, delete it via Firebase Console" >> "$REPORT_FILE"
echo "2. Run manual tests 5-10 in Flutter app" >> "$REPORT_FILE"
echo "3. Update this report with manual test results" >> "$REPORT_FILE"
echo "4. After all tests pass, proceed with onboarding 30 accounts (WA-01 to WA-30)" >> "$REPORT_FILE"

echo ""
echo "✅ Test report generated: $REPORT_FILE"
echo ""
echo "Next steps:"
echo "1. Review the report: cat $REPORT_FILE"
echo "2. Complete manual tests 5-10"
echo "3. Update report with results"
