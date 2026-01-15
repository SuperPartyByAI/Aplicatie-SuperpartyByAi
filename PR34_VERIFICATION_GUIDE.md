# PR #34 — Manual Verification Guide

**This guide walks you through completing the Go/No-Go checklist step by step.**

---

## Step 1: CI Status Verification

### Action Required

1. **Open PR #34**: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/pull/34
2. **Click "Checks" tab** (next to "Conversation", "Files changed", etc.)
3. **Find the workflow runs**:
   - Look for `test-functions` (from `whatsapp-ci.yml`)
   - Look for `test-flutter` (from `flutter-ci.yml`)

### Record Results

For each check:

**test-functions**:
- Status: [PASS / FAIL]
- Link: Click on the check name → copy URL from browser
- If FAIL: Click "View more details" → copy first 30-50 lines of error

**test-flutter**:
- Status: [PASS / FAIL]
- Link: Click on the check name → copy URL from browser
- If FAIL: Click "View more details" → copy first 30-50 lines of error

### Update Checklist

Open `PR34_GO_NO_GO_CHECKLIST.md` and fill section **B.1. CI Checks**:
- Check the boxes
- Paste links
- Paste error summary (if FAIL)

---

## Step 2: Branch Protection Verification

### Action Required

1. **Go to repo**: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi
2. **Settings** → **Branches** (left sidebar)
3. **Find "Branch protection rules"** section
4. **Click on `main` branch rule** (or "Add rule" if none exists)

### Verify Settings

Check each box matches:

- [ ] **Require a pull request before merging** (enabled)
- [ ] **Require approvals**: 1 (enabled)
- [ ] **Dismiss stale pull request approvals when new commits are pushed** (enabled)
- [ ] **Require status checks to pass before merging** (enabled)
  - [ ] `test-functions` appears in required checks list
  - [ ] `test-flutter` appears in required checks list
- [ ] **Require branches to be up to date before merging** (enabled)
- [ ] **Do not allow bypassing the above settings** (enabled)

### Take Screenshot

- Press `Win+Shift+S` (Windows) or `Cmd+Shift+4` (Mac)
- Capture the branch protection settings page
- Save locally (e.g., `branch-protection-main.png`)

### If Not Configured

Follow `BRANCH_PROTECTION_SETUP.md` to configure, then repeat verification.

### Update Checklist

Open `PR34_GO_NO_GO_CHECKLIST.md` and fill section **B.2. Branch Protection**:
- Check all boxes
- Fill "Verified by": [Your name]
- Fill "Screenshot saved": YES
- Fill date/time

---

## Step 3: Move PR Out of Draft

### Action Required

1. **Open PR #34**
2. **If "Draft" badge is visible**:
   - Click "Ready for review" button (top right)
   - Confirm the action

### Update Checklist

Note in `PR34_GO_NO_GO_CHECKLIST.md` that PR is no longer Draft.

---

## Step 4: Run Smoke Test

### Action Required

1. **Follow `SMOKE_TEST_CHECKLIST.md` exactly**
2. **Record all results** in the checklist
3. **Fill the Results Template** from `SMOKE_TEST_CHECKLIST.md` section F
4. **Paste results** into:
   - PR #34 → Add a comment with the template
   - OR update PR description

### Update Checklist

Open `PR34_GO_NO_GO_CHECKLIST.md` and fill section **D. Smoke Test**:
- Environment: [Staging / Production]
- Start time: [timestamp]
- End time: [timestamp]
- Result: [PASS / FAIL]
- Summary: [brief summary or "See PR comment #X"]

---

## Step 5: Final Decision

### Action Required

Open `PR34_GO_NO_GO_CHECKLIST.md` and fill section **Final Decision**:

**Decision**: [GO / NO-GO]

**GO only if ALL are true:**
- ✅ CI checks: `test-functions` PASS + `test-flutter` PASS
- ✅ Branch protection: VERIFIED and enabled
- ✅ Smoke test: PASS (all critical paths)

**NO-GO if ANY fails:**
- Fix the issue
- Re-verify
- Update checklist

**Fill remaining fields:**
- Approved by: [Name]
- Final deploy SHA: [Current HEAD after all fixes]
- Date/Time: [Timestamp]

---

## Step 6: Final Report

### Template

```
## PR #34 Go/No-Go Final Report

**Current HEAD SHA**: [SHA]
**Date/Time**: [Timestamp]

### CI Status
- test-functions: [PASS/FAIL] - [Link to run]
- test-flutter: [PASS/FAIL] - [Link to run]

### Branch Protection
- Status: [VERIFIED / NOT VERIFIED]
- Screenshot saved: [YES / NO]

### Smoke Test
- Status: [PASS / FAIL]
- Environment: [Staging / Production]
- Timestamp: [Start] - [End]

### PR Status
- Draft removed: [YES / NO]

### Final Decision
- Decision: [GO / NO-GO]
- Approved by: [Name]

### Issues Fixed (if any)
- [Issue description] → Fixed in commit [SHA]
```

---

**Last updated**: 2026-01-15
