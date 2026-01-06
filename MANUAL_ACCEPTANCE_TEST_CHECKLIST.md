# AI Chat Manual Acceptance Test Checklist

## Test Environment Setup
- [ ] App built and deployed to test device
- [ ] Firebase Functions deployed to us-central1
- [ ] GROQ_API_KEY secret configured (version 3)

## Test Scenario 1: Unauthenticated User
**Expected Behavior:** User cannot access AI Chat without logging in

### Steps:
1. [ ] Open app without logging in
2. [ ] Navigate to AI Chat screen
3. [ ] Attempt to send a message

### Expected Results:
- [ ] Error message displayed in Romanian: "Trebuie să fii logat pentru a folosi chat-ul AI"
- [ ] No function call made (check Flutter logs)
- [ ] User redirected or prompted to log in

### Verification:
```bash
# Check Flutter logs for auth check
adb logcat | grep "AIChatScreen"
```

---

## Test Scenario 2: Missing GROQ_API_KEY
**Expected Behavior:** Admin-friendly error when API key not configured

### Steps:
1. [ ] Temporarily remove GROQ_API_KEY secret
   ```bash
   firebase functions:secrets:destroy GROQ_API_KEY
   ```
2. [ ] Log in to app
3. [ ] Navigate to AI Chat
4. [ ] Send a test message

### Expected Results:
- [ ] Error message in Romanian: "Chat-ul AI nu este configurat corect. Contactează administratorul."
- [ ] Function logs show `failed-precondition` error
- [ ] Function logs include setup command for admin

### Verification:
```bash
# Check function logs
firebase functions:log --only chatWithAI --limit 10
```

### Cleanup:
```bash
# Restore GROQ_API_KEY
echo "your-groq-api-key" | firebase functions:secrets:set GROQ_API_KEY
firebase deploy --only functions:chatWithAI
```

---

## Test Scenario 3: Normal Operation
**Expected Behavior:** AI responds successfully to user messages

### Steps:
1. [ ] Ensure GROQ_API_KEY is configured
2. [ ] Log in to app
3. [ ] Navigate to AI Chat
4. [ ] Send message: "Salut! Cum te cheamă?"
5. [ ] Wait for response

### Expected Results:
- [ ] Loading indicator shown while waiting
- [ ] AI response received within 30 seconds
- [ ] Response displayed in chat interface
- [ ] No error messages shown

### Verification:
```bash
# Check function logs for successful request
firebase functions:log --only chatWithAI --limit 5

# Look for:
# - [requestId] Request received
# - [requestId] Groq API call successful
# - [requestId] Response sent
```

### Additional Tests:
- [ ] Send follow-up message to test conversation continuity
- [ ] Test with longer message (200+ characters)
- [ ] Test with special characters: "Ce înseamnă 'AI'?"

---

## Test Scenario 4: Timeout Handling
**Expected Behavior:** User-friendly timeout message after 30 seconds

### Steps:
1. [ ] Log in to app
2. [ ] Navigate to AI Chat
3. [ ] Send a very complex message that might timeout:
   ```
   Scrie-mi o poveste foarte lungă despre un dragon care locuiește într-un castel magic, cu multe detalii despre personaje, locații și evenimente. Include dialoguri și descrieri detaliate pentru fiecare scenă.
   ```
4. [ ] Wait for response or timeout

### Expected Results:
- [ ] If timeout occurs: Error message "Timeout: AI-ul nu a răspuns la timp. Încearcă din nou."
- [ ] If successful: Response received within 30 seconds
- [ ] No app crash or frozen UI

### Verification:
```bash
# Check function logs for timeout
firebase functions:log --only chatWithAI --limit 5

# Look for:
# - [requestId] Request received
# - Timeout or deadline-exceeded error
```

---

## Test Scenario 5: Rate Limiting
**Expected Behavior:** Graceful handling of rate limit errors

### Steps:
1. [ ] Log in to app
2. [ ] Send multiple messages rapidly (5+ messages in quick succession)
3. [ ] Observe behavior

### Expected Results:
- [ ] First few messages succeed
- [ ] If rate limited: Error message "Prea multe cereri. Așteaptă câteva secunde și încearcă din nou."
- [ ] App remains responsive
- [ ] User can retry after waiting

### Verification:
```bash
# Check function logs for rate limit errors
firebase functions:log --only chatWithAI --limit 10
```

---

## Test Scenario 6: Network Interruption
**Expected Behavior:** Graceful handling of network errors

### Steps:
1. [ ] Log in to app
2. [ ] Navigate to AI Chat
3. [ ] Enable airplane mode or disable WiFi
4. [ ] Send a message
5. [ ] Re-enable network

### Expected Results:
- [ ] Error message displayed (network-related)
- [ ] User can retry after network restored
- [ ] No app crash

---

## Diagnostic Commands Reference

### Check Function Deployment
```bash
firebase functions:list | grep chatWithAI
```

### Check Secret Configuration
```bash
firebase functions:secrets:access GROQ_API_KEY --data-file=-
```

### View Recent Logs
```bash
firebase functions:log --only chatWithAI --limit 20
```

### Check Function Region
```bash
gcloud functions describe chatWithAI --region=us-central1 --gen2
```

### Test Function Directly (requires auth token)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{"data":{"message":"Test","conversationHistory":[]}}' \
  https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/chatWithAI
```

---

## Success Criteria

All scenarios must pass:
- ✅ Scenario 1: Auth check prevents unauthenticated access
- ✅ Scenario 2: Missing key shows admin-friendly error
- ✅ Scenario 3: Normal operation works smoothly
- ✅ Scenario 4: Timeout handled gracefully
- ✅ Scenario 5: Rate limiting handled gracefully
- ✅ Scenario 6: Network errors handled gracefully

## Notes
- All error messages must be in Romanian
- No technical jargon exposed to end users
- All errors logged with requestId for troubleshooting
- Function logs must be actionable for administrators

## Test Completion
- **Tester Name:** _______________
- **Date:** _______________
- **App Version:** _______________
- **Function Version:** _______________
- **Result:** PASS / FAIL
- **Issues Found:** _______________
