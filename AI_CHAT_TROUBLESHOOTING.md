# AI Chat Troubleshooting Guide

## Quick Diagnosis (< 2 minutes)

### Step 1: Check User Authentication (30 seconds)

```bash
# In Flutter app logs, look for:
[AIChatScreen] ERROR: User not authenticated
```

**If found:**
- **Cause:** User not logged in
- **Fix:** User must log in before using AI Chat
- **Expected UI:** System message "⚠️ Trebuie să fii logat pentru a folosi AI Chat"

### Step 2: Check Function Deployment (30 seconds)

```bash
firebase functions:list --project superparty-frontend | grep chatWithAI
```

**Expected:** `│ chatWithAI │ v2 │ callable │ us-central1 │`

**If missing:** `firebase deploy --only functions:chatWithAI`

### Step 3: Check GROQ_API_KEY Secret (30 seconds)

```bash
firebase functions:secrets:get GROQ_API_KEY --project superparty-frontend
```

**If missing:**
```bash
echo "gsk_YOUR_KEY" | firebase functions:secrets:set GROQ_API_KEY --project superparty-frontend
firebase deploy --only functions:chatWithAI
```

### Step 4: Check Function Logs (30 seconds)

```bash
firebase functions:log --only chatWithAI --project superparty-frontend --limit 20
```

## Error Code Reference

| Code | Message | Cause | Fix |
|------|---------|-------|-----|
| `unauthenticated` | "Trebuie să fii logat..." | Not logged in | Log in |
| `failed-precondition` | "AI Chat nu este configurat..." | Key missing | Set GROQ_API_KEY |
| `invalid-argument` | "Mesaj invalid..." | Bad input | Check format |
| `deadline-exceeded` | "Timeout..." | > 30s | Retry |
| `resource-exhausted` | "Prea multe cereri..." | Rate limit | Wait |
| `internal` | "Eroare server..." | Crash | Check logs |
| `unavailable` | "Serviciu indisponibil..." | Network | Check deployment |

## Common Issues

### "User not authenticated"
- **Cause:** Not logged in
- **Fix:** Log in before using AI Chat
- **Verify:** `FirebaseAuth.instance.currentUser != null`

### "AI Chat nu este configurat"
- **Cause:** GROQ_API_KEY not set
- **Fix:** Set secret (see Step 3)
- **Verify:** `firebase functions:secrets:get GROQ_API_KEY`

### "Timeout"
- **Cause:** Slow response or network
- **Fix:** Retry, check network
- **Verify:** Check function logs

### No response, no error
- **Cause:** Region mismatch or silent failure
- **Fix:** Verify region `us-central1` in Flutter code
- **Verify:** Check Firebase logs for invocation

## Health Check Script

```bash
#!/bin/bash
echo "=== AI Chat Health Check ==="
firebase functions:list --project superparty-frontend | grep chatWithAI && echo "✅ Function deployed" || echo "❌ NOT deployed"
firebase functions:secrets:get GROQ_API_KEY --project superparty-frontend > /dev/null 2>&1 && echo "✅ Secret exists" || echo "❌ Secret missing"
firebase functions:log --only chatWithAI --limit 5
```

## Manual Tests

### Test 1: Not Logged In
- Log out → Send message
- **Expected:** "⚠️ Trebuie să fii logat...", no function call

### Test 2: Key Missing
- Delete secret → Send message
- **Expected:** "AI Chat nu este configurat..."

### Test 3: Normal
- Logged in + key set → Send "Hello"
- **Expected:** AI response

## Diagnostic Commands

```bash
# Recent logs
firebase functions:log --only chatWithAI --limit 50

# Search errors
firebase functions:log --only chatWithAI --limit 100 | grep -i error

# List secrets
firebase functions:secrets:list
```

## Configuration

**Flutter:** Region `us-central1`, Timeout 30s, Auth required
**Functions:** Region `us-central1`, Node.js 20, 512MB, GROQ_API_KEY required
