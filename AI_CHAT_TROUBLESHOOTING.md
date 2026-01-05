# AI Chat Troubleshooting Guide

## Quick Diagnosis (2 minutes)

### Step 1: Check User Authentication

```dart
// In Flutter app, check if user is logged in
final user = FirebaseAuth.instance.currentUser;
print('User: ${user?.uid}, Email: ${user?.email}');
```

**Expected**: User should have uid and email.  
**If null**: User needs to login first. AI Chat will show auth error.

### Step 2: Check Function Deployment

```bash
firebase functions:list | grep chatWithAI
```

**Expected**: `chatWithAI (us-central1)`  
**If missing**: Deploy function: `firebase deploy --only functions:chatWithAI`

### Step 3: Check GROQ_API_KEY Secret

```bash
firebase functions:secrets:access GROQ_API_KEY
```

**Expected**: Shows your Groq API key (starts with `gsk_`)  
**If error**: Set secret: `firebase functions:secrets:set GROQ_API_KEY`

### Step 4: Check Function Logs

```bash
firebase functions:log --only chatWithAI --limit 10
```

**Look for**:
- `[req_xxx] chatWithAI called` - function is being invoked
- `[req_xxx] GROQ_API_KEY loaded from secrets` - key is accessible
- `[req_xxx] AI response in XXXms` - successful response
- Any error messages with codes

---

## Known Failure Modes

### 1. "Trebuie să fii logat ca să folosești AI"

**Cause**: User is not authenticated (FirebaseAuth.currentUser == null)

**Fix**:
- User needs to login first
- AI Chat now blocks unauthenticated calls automatically
- No function call is made if user is null

**Verification**:
```dart
print('User: ${FirebaseAuth.instance.currentUser?.uid}');
// Should print a uid, not null
```

---

### 2. "AI nu este configurat pe server (cheie API lipsă)"

**Cause**: GROQ_API_KEY secret is not set in Firebase

**Fix**:
```bash
# Set the secret
firebase functions:secrets:set GROQ_API_KEY
# Paste your Groq API key when prompted (get from https://console.groq.com/keys)

# Redeploy function
firebase deploy --only functions:chatWithAI
```

**Verification**:
```bash
# Check if secret exists
firebase functions:secrets:access GROQ_API_KEY

# Check function logs
firebase functions:log --only chatWithAI --limit 5
# Should see: "[req_xxx] GROQ_API_KEY loaded from secrets"
```

---

### 3. "Timeout - încearcă din nou"

**Cause**: Function took longer than 30 seconds to respond

**Possible reasons**:
- Groq API is slow
- Network issues
- Cold start (first invocation after idle)

**Fix**:
- Retry the request (usually works on second try)
- Check Groq API status: https://status.groq.com
- Check function logs for actual error

**Verification**:
```bash
firebase functions:log --only chatWithAI --limit 5
# Look for timeout errors or slow response times
```

---

### 4. "Conexiune eșuată"

**Cause**: Generic network or unknown error

**Debug steps**:
1. Check Flutter logs:
   ```
   flutter logs | grep AIChatScreen
   ```
   Look for:
   - `[AIChatScreen] User auth state: uid=xxx`
   - `[AIChatScreen] FirebaseFunctionsException code: xxx`

2. Check function logs:
   ```bash
   firebase functions:log --only chatWithAI --limit 10
   ```

3. Check if function is deployed:
   ```bash
   firebase functions:list | grep chatWithAI
   ```

---

### 5. "Prea multe cereri"

**Cause**: Rate limit exceeded (too many requests in short time)

**Fix**:
- Wait 30-60 seconds
- Retry request
- Check if there's a loop making repeated calls

**Verification**:
```bash
firebase functions:log --only chatWithAI --limit 20
# Look for many rapid requests from same user
```

---

## Error Code Reference

| Error Code | User Message | Cause | Fix |
|------------|--------------|-------|-----|
| `unauthenticated` | "Trebuie să fii logat..." | User not logged in | Login first |
| `failed-precondition` | "AI nu este configurat..." | GROQ_API_KEY missing | Set secret |
| `invalid-argument` | "Cerere invalidă..." | Bad request data | Check message format |
| `deadline-exceeded` | "Timeout..." | Function timeout | Retry |
| `resource-exhausted` | "Prea multe cereri..." | Rate limit | Wait and retry |
| `internal` | "Eroare internă..." | Server error | Check logs |
| `unavailable` | "Serviciul AI..." | Service down | Retry later |

---

## How to Verify in 2 Minutes

### Quick Test Script

```bash
#!/bin/bash

echo "=== AI Chat Health Check ==="

echo "1. Checking user auth..."
# Run app and check logs for user uid

echo "2. Checking function deployment..."
firebase functions:list | grep chatWithAI

echo "3. Checking GROQ_API_KEY secret..."
firebase functions:secrets:access GROQ_API_KEY | head -c 10
echo "..."

echo "4. Checking recent function logs..."
firebase functions:log --only chatWithAI --limit 5

echo "=== Health Check Complete ==="
```

### Expected Output

```
=== AI Chat Health Check ===
1. Checking user auth...
[AIChatScreen] User auth state: uid=abc123, email=user@example.com

2. Checking function deployment...
chatWithAI (us-central1)

3. Checking GROQ_API_KEY secret...
gsk_abc123...

4. Checking recent function logs...
[req_xxx] chatWithAI called { userId: 'abc123', messageCount: 1 }
[req_xxx] GROQ_API_KEY loaded from secrets
[req_xxx] AI response in 1234ms

=== Health Check Complete ===
```

---

## Setup Checklist

Before using AI Chat, verify:

- [ ] User is logged in (FirebaseAuth.currentUser != null)
- [ ] Function is deployed (`firebase functions:list | grep chatWithAI`)
- [ ] GROQ_API_KEY secret is set (`firebase functions:secrets:access GROQ_API_KEY`)
- [ ] Function region matches Flutter code (us-central1)
- [ ] Firebase project is correct
- [ ] Internet connection is working

---

## Common Mistakes

### ❌ Using OPENAI_API_KEY instead of GROQ_API_KEY

**Wrong**:
```bash
firebase functions:secrets:set OPENAI_API_KEY
```

**Correct**:
```bash
firebase functions:secrets:set GROQ_API_KEY
```

### ❌ Calling function before user login

**Wrong**:
```dart
// No auth check
final result = await callable.call({...});
```

**Correct**:
```dart
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  // Show error, don't call function
  return;
}
final result = await callable.call({...});
```

### ❌ Not handling specific error codes

**Wrong**:
```dart
catch (e) {
  print('Error: $e'); // Generic error
}
```

**Correct**:
```dart
catch (e) {
  if (e is FirebaseFunctionsException) {
    switch (e.code) {
      case 'unauthenticated':
        // Show login prompt
      case 'failed-precondition':
        // Show config error
      // ... handle each code
    }
  }
}
```

---

## Getting Help

If AI Chat still doesn't work after following this guide:

1. **Collect diagnostic info**:
   ```bash
   # Flutter logs
   flutter logs | grep AIChatScreen > flutter_logs.txt
   
   # Function logs
   firebase functions:log --only chatWithAI --limit 50 > function_logs.txt
   
   # Deployment status
   firebase functions:list > functions_list.txt
   ```

2. **Check for**:
   - User uid in Flutter logs
   - FirebaseFunctionsException code
   - Function invocation in backend logs
   - GROQ_API_KEY loading message
   - Any error messages with requestId

3. **Common solutions**:
   - Redeploy function: `firebase deploy --only functions:chatWithAI`
   - Restart app (clear cache)
   - Check Firebase Console for function errors
   - Verify Groq API key is valid: https://console.groq.com/keys

---

## Performance Tips

- **First call is slow** (cold start): ~3-5 seconds
- **Subsequent calls are fast**: ~1-2 seconds (connection pooling)
- **Cache is used** for common questions (instant response)
- **Timeout is 30 seconds** (should never be reached normally)

---

## Related Documentation

- [test-ai-functions.md](./test-ai-functions.md) - Detailed testing guide
- [functions/index.js](./functions/index.js) - Backend implementation
- [lib/screens/ai_chat/ai_chat_screen.dart](./superparty_flutter/lib/screens/ai_chat/ai_chat_screen.dart) - Frontend implementation
