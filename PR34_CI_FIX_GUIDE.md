# PR #34 — CI Fix Guide

**How to get exact errors from GitHub Actions and fix them.**

---

## Step 1: Get Error Logs from GitHub

### For Flutter CI

1. Open PR #34: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/pull/34
2. Click **"Checks"** tab
3. Find **"Flutter CI / Flutter Analyze & Test"** (should show ❌ if failed)
4. Click on it → **"Details"**
5. In workflow page, click job **"Flutter Analyze & Test"**
6. Open each step until you find the first ❌:
   - "Setup Flutter"
   - "Get dependencies"
   - "Analyze code (strict)"
   - "Run tests"
   - "Build debug (PR only)"
7. **Copy first 30-80 lines** starting from the error message

### For Test Functions

1. In PR #34 → **"Checks"** tab
2. Find **"WhatsApp CI / Test Functions"** (should show ❌ if failed)
3. Click → **"Details"**
4. Job: **"Test Functions"**
5. Find first ❌ step (usually one of):
   - "Install dependencies" (npm ci)
   - "Build TypeScript" (npm run build)
   - "Run tests" (npm test)
6. **Copy first 30-80 lines** starting from the error message

### For Test WhatsApp Backend

1. In PR #34 → **"Checks"** tab
2. Find **"WhatsApp CI / Test WhatsApp Backend"** (should show ❌ if failed)
3. Click → **"Details"**
4. Job: **"Test WhatsApp Backend"**
5. Find first ❌ step (usually):
   - "Install dependencies" (npm ci)
   - "Run tests" (npm test)
6. **Copy first 30-80 lines** starting from the error message

---

## Step 2: Common Fixes (Based on Error Type)

### A. Flutter Setup Fails (Version Not Found)

**Error pattern:**
```
Unable to find Flutter version 3.24.5
Version not found
No release found for version 3.24.5
```

**Fix:**
- Option 1: Change to valid version (check log for available versions)
- Option 2: Remove `flutter-version` and keep only `channel: stable`
- Option 3: Use `flutter-version-file` if using FVM

**File to edit:** `.github/workflows/flutter-ci.yml`

---

### B. npm ci Fails (Lockfile Mismatch)

**Error pattern:**
```
package-lock.json is not up to date with package.json
npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path .../package-lock.json
```

**Fix:**
1. Run locally:
   ```powershell
   cd functions  # or whatsapp-backend
   npm install
   ```
2. Commit updated `package-lock.json`
3. Push

---

### C. npm test Fails (Missing Script or Env Var)

**Error pattern:**
```
npm ERR! missing script: test
Missing required environment variable: XXX
```

**Fix:**
- If script missing: Add `"test": "jest"` (or appropriate) to `package.json`
- If env var missing: Add to workflow `.env` section with safe dummy value

---

## Step 3: Send Errors to Cursor

**Paste the error blocks here:**

```
## Flutter CI Error
[Paste 30-80 lines from failing step]

## Test Functions Error
[Paste 30-80 lines from failing step]

## Test WhatsApp Backend Error
[Paste 30-80 lines from failing step]
```

---

## Step 4: Cursor Will Fix

After receiving errors, Cursor will:
1. Identify root cause
2. Apply minimal fix
3. Commit with focused message
4. Push
5. Report final HEAD SHA

---

**Last updated**: 2026-01-15
