# Rollout Pre-Flight Check (Read-Only Audit)

**Date:** 2026-01-17  
**Branch:** `audit-whatsapp-30`  
**MODE:** READ-ONLY FINAL CHECK (no code changes)

---

## 1) Verify GitHub readiness

```bash
# Check working directory status
git status

# Review last 15 commits
git log -15 --oneline --decorate

# Compare with main (may fail if origin/main doesn't exist locally)
git diff --name-only origin/main...HEAD || echo "origin/main not found locally"

# If origin/main missing: fetch and check remote branches
git fetch origin --prune
git branch -r
git ls-remote --heads origin
```

**Expected:**
- Clean working directory (no uncommitted changes)
- Recent commits include: UI screens, hardening, docs
- `origin/main` exists (or remote has `main` branch)

---

## 2) Verify Firebase deploy inputs exist

```bash
# Check Firebase config files exist
ls -la firebase.json firestore.rules firestore.indexes.json functions/index.js functions/whatsappProxy.js

# Verify secret names referenced in code
grep -RIn "RAILWAY_WHATSAPP_URL|WHATSAPP_RAILWAY_BASE_URL|GROQ_API_KEY" functions || echo "No matches (may be in environment/config)"
```

**Expected:**
- All files exist and are readable
- Secret names match deployment requirements

---

## 3) Verify Railway requirements

```bash
# Check Railway config (if exists)
cat whatsapp-backend/railway.toml 2>/dev/null || echo "railway.toml not found (may be configured via Railway UI)"

# Verify SESSIONS_PATH references
grep -RIn "SESSIONS_PATH|/app/sessions" whatsapp-backend || echo "No matches"
```

**Expected:**
- Volume mount path `/app/sessions` referenced in code/config
- `SESSIONS_PATH` env var expected

---

## 4) Verify Flutter "cap-coadă" navigation and screens

```bash
# Check routes exist
grep -RIn "/whatsapp/inbox|/whatsapp/chat|/whatsapp/client" superparty_flutter/lib/router/app_router.dart

# Check screen files exist
ls -la \
  superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart \
  superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart \
  superparty_flutter/lib/screens/whatsapp/client_profile_screen.dart

# Run Flutter analyzer
cd superparty_flutter && flutter analyze 2>&1 | head -50
```

**Expected:**
- All 3 routes found in `app_router.dart`
- All 3 screen files exist
- `flutter analyze` shows no errors

---

## 5) Verify Functions exports

```bash
# Check main index.js exports
grep -E "^exports\." functions/index.js | head -30

# Check proxy functions exist
grep -E "whatsappProxy(DeleteAccount|BackfillAccount)" functions/index.js
```

**Expected:**
- `whatsappProxyDeleteAccount` exported
- `whatsappProxyBackfillAccount` exported
- CRM callables exported (`whatsappExtractEventFromThread`, `clientCrmAsk`)

---

## 6) Verify Firestore indexes

```bash
# Check for required composite indexes
grep -A 10 '"collectionGroup": "threads"' firestore.indexes.json | grep -E "accountId|lastMessageAt"

grep -A 10 '"collectionGroup": "evenimente"' firestore.indexes.json | grep -E "phoneE164|date"
```

**Expected:**
- Index exists: `threads` with `accountId` + `lastMessageAt` DESC
- Index exists: `evenimente` with `phoneE164` + `date` DESC

---

## OUTPUT

After running all checks above, output:

**BLOCKERS: <list any missing items>**  
or  
**BLOCKERS: none**

Plus exact file paths for anything missing.

---

**END OF PRE-FLIGHT CHECK**
