# PR #34 — CI Fix Prompt for Cursor

**Copy this prompt into Cursor after you have the error logs from GitHub Actions.**

---

## Prompt to Copy

```
You are Cursor working on:
Repo: SuperPartyByAI/Aplicatie-SuperpartyByAi
Branch: whatsapp-production-stable
PR: #34
Current HEAD: [CURRENT_SHA]

We have failing GitHub Actions checks in PR #34:
- Flutter CI / Flutter Analyze & Test
- WhatsApp CI / Test Functions
- WhatsApp CI / Test WhatsApp Backend

They fail quickly (~23s), likely setup/lockfile/version issues.

ERROR LOGS (paste below):

## Flutter CI Error
[PASTE 30-80 LINES FROM FAILING STEP HERE]

## Test Functions Error
[PASTE 30-80 LINES FROM FAILING STEP HERE]

## Test WhatsApp Backend Error
[PASTE 30-80 LINES FROM FAILING STEP HERE]

TASK:
1) Analyze each error to identify root cause (version not found, lockfile mismatch, missing script, missing env var, etc.)
2) Apply minimal fix for each:
   - If Flutter setup fails due to pinned flutter-version not found:
     - Change .github/workflows/flutter-ci.yml to a valid stable version mentioned in logs
     - OR remove flutter-version and keep channel: stable
   - If npm ci fails due to lockfile mismatch:
     - Run npm install in the respective folder (functions/ or whatsapp-backend/)
     - Commit updated package-lock.json
   - If npm test fails due to missing script:
     - Add/repair scripts in package.json
   - If env var missing:
     - Add required env vars in workflow with safe dummy values
3) Commit with focused messages:
   - fix(ci): update Flutter version in workflow
   - fix(functions): update package-lock.json
   - fix(backend): update package-lock.json
   - fix(ci): add missing env vars to workflow
4) Push and report:
   - Final HEAD SHA
   - Summary of fixes applied
   - Which checks should now PASS

RULES:
- Do not change unrelated code
- Keep fixes minimal and focused
- Do not introduce secrets
- Ensure all fixes are backward compatible
```

---

## How to Use

1. **Get error logs** from GitHub Actions (see `PR34_CI_FIX_GUIDE.md`)
2. **Copy the prompt above** into a new Cursor conversation
3. **Replace `[CURRENT_SHA]`** with actual HEAD SHA: `git rev-parse --short HEAD`
4. **Paste error logs** in the sections marked `[PASTE ... HERE]`
5. **Send to Cursor** and it will fix and push

---

**Last updated**: 2026-01-15
