# TEST: AI Functions

## Prerequisites

1. **Deploy functions:**

   ```bash
   cd functions
   firebase deploy --only functions:chatWithAI,functions:aiManager
   ```

2. **Configure GROQ API key:**

   **IMPORTANT**: This project uses **GROQ (Llama)**, not OpenAI.

   **Option A: Via Firebase Secrets (recommended for production):**

   ```bash
   cd functions
   firebase functions:secrets:set GROQ_API_KEY
   # Paste your Groq API key when prompted
   firebase deploy --only functions:chatWithAI
   ```

   **Option B: Via .env file (local development only):**

   ```bash
   cd functions
   echo "GROQ_API_KEY=gsk_your-key-here" > .env
   firebase deploy --only functions
   ```

   **Get Groq API Key:**
   - Go to https://console.groq.com/keys
   - Create new API key
   - Copy the key (starts with `gsk_`)

## Test 1: Request AI Success

**Expected:** 200 + JSON with message

```javascript
// In browser console on deployed app
const result = await firebase.functions().httpsCallable('chatWithAI')({
  messages: [{ role: 'user', content: 'Hello, how are you?' }],
});

console.log('Result:', result.data);
// Expected: { success: true, message: "..." }
```

**PASS Criteria:**

- `result.data.success === true`
- `result.data.message` is a string
- No error thrown

## Test 2: Timeout Handling

**Expected:** Timeout error with clear message

```javascript
// Simulate by setting very low timeout in function code temporarily
// Or test with slow network

try {
  const result = await firebase.functions().httpsCallable('chatWithAI')({
    messages: [{ role: 'user', content: 'Test' }],
  });
} catch (error) {
  console.log('Error code:', error.code);
  console.log('Error message:', error.message);
}
```

**PASS Criteria:**

- `error.code === 'deadline-exceeded'`
- Error message mentions timeout
- UI shows clear timeout message

## Test 3: 401 Unauthorized (Invalid API Key)

**Expected:** Clear error, no retry

```javascript
// Test with invalid API key configured

try {
  const result = await firebase.functions().httpsCallable('chatWithAI')({
    messages: [{ role: 'user', content: 'Test' }],
  });
} catch (error) {
  console.log('Error code:', error.code);
  console.log('Error message:', error.message);
}
```

**PASS Criteria:**

- `error.code === 'unauthenticated'`
- UI shows "Invalid API key" or similar
- No automatic retry

## Test 4: 429 Rate Limit

**Expected:** Rate limit error with retry suggestion

```javascript
// Test by making many rapid requests

for (let i = 0; i < 10; i++) {
  try {
    await firebase.functions().httpsCallable('chatWithAI')({
      messages: [{ role: 'user', content: `Test ${i}` }],
    });
  } catch (error) {
    console.log(`Request ${i} error:`, error.code, error.message);
  }
}
```

**PASS Criteria:**

- `error.code === 'resource-exhausted'`
- Error message mentions rate limit
- UI shows "Try again later" message

## Test 5: Missing API Key

**Expected:** Configuration error

```javascript
// Test with no API key configured

try {
  const result = await firebase.functions().httpsCallable('chatWithAI')({
    messages: [{ role: 'user', content: 'Test' }],
  });
} catch (error) {
  console.log('Error code:', error.code);
  console.log('Error message:', error.message);
}
```

**PASS Criteria:**

- `error.code === 'failed-precondition'`
- Error message mentions configuration
- UI shows "Contact administrator" message

## Verification Checklist

- [ ] Functions deployed successfully
- [ ] OpenAI API key configured
- [ ] Test 1: Success case works
- [ ] Test 2: Timeout handled correctly
- [ ] Test 3: 401 handled without retry
- [ ] Test 4: 429 handled with clear message
- [ ] Test 5: Missing config handled clearly
- [ ] Logs show requestId and duration
- [ ] No infinite retry loops
- [ ] UI shows appropriate error messages

## Expected Logs

Backend logs should show:

```
[req_1234567890_abc123] chatWithAI called { hasAuth: true, messageCount: 1 }
[req_1234567890_abc123] Success { duration: '1234ms', responseLength: 56 }
```

Or on error:

```
[req_1234567890_abc123] chatWithAI called { hasAuth: true, messageCount: 1 }
[req_1234567890_abc123] Error { duration: '234ms', code: 'unauthenticated', message: 'Invalid API key' }
```
