# Smoke Test Checklist — PR #34

**Run after CI green, before merge/deploy.**

**Estimated time**: 15-20 minutes  
**Environment**: Staging or Production (after deploy)

---

## A. Preconditions

**Verify before starting:**

- [ ] CI checks green (`test-functions` PASS, `test-flutter` PASS)
- [ ] Branch protection verified (or explicitly note if not yet enabled): _______________
- [ ] Correct environment selected: [Staging / Production]
- [ ] No secrets printed in logs (verify console/logs are clean)

---

## B. Mobile App Smoke Test (10-15 min)

### Checklist

- [ ] **Cold start successful**: App launches without crash
- [ ] **Navigation to key screens works**:
  - [ ] Home (or main screen after login)
  - [ ] Events (`/evenimente`)
  - [ ] Staff Settings (`/staff-settings`) — if staff
  - [ ] Admin (`/admin`) — if admin
- [ ] **Read operation succeeds** (no permission errors):
  - [ ] Events list loads
  - [ ] Event details load
  - [ ] Staff profile loads (if staff)
- [ ] **One write operation succeeds and is visible in DB/UI**:
  - [ ] Update user profile (ex: `displayName`)
  - [ ] Verify in Firestore Console that `users/{uid}` updated
- [ ] **App recovers from airplane mode / reconnect** (optional):
  - [ ] Enable airplane mode, wait 5s, disable
  - [ ] App reconnects and continues working

### Record Fields

- **Device / OS**: _______________
- **App build type**: [debug / release]
- **Any errors seen** (copy exact message): _______________

---

## C. Backend Functions Smoke Test (5 min)

### Checklist

- [ ] **Protected endpoint reachable with valid token**:
  - Returns `200` (success) if permissions OK
  - Returns `403` (forbidden) if no permissions (normal for non-admin)
  - Returns `500` (server error) if config issue (not blocking if known)
  - **NOT** `401` "missing token" or "Unauthorized" when token is valid
- [ ] **Logs show no repeated error spam**:
  - No Logtail "Unauthorized" loops
  - No "Cannot find module" errors
  - No "Missing dependencies" errors
- [ ] **Write path results visible in DB**:
  - If endpoint performs write, verify in Firestore Console

### Record Fields

- **Endpoint tested**: _______________
- **HTTP status**: _______________
- **Time**: _______________

**Example command**:
```powershell
curl.exe -i https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccounts `
  -H "Authorization: Bearer <TOKEN>"
```

---

## D. Observability Quick Check

### Checklist

- [ ] **No repeating Unauthorized/permission errors**:
  - Check logs for repeated error patterns
  - Verify no spam loops
- [ ] **No crash loops or restart storms**:
  - App/backend stays stable
  - No repeated crashes
- [ ] **Error rate normal**:
  - Only expected errors (if any)
  - No unexpected spikes

**Logs checked**: [legacy hosting / Firebase Functions / App logs]  
**Issues found**: _______________

---

## E. WhatsApp Backend (if deployed)

- [ ] **Health check**:
  ```powershell
  curl.exe https://whats-app-ompro.ro/health
  ```
  Expected: `200 OK`

- [ ] **Logs check**:
  - [ ] No spam "Logtail Unauthorized"
  - [ ] No connection errors repeated
  - [ ] Heartbeats normal (if configured)

---

## F. Results Template (Copy-Paste for PR Comments)

```
## Smoke Test Results — PR #34

**Environment**: [Staging / Production]
**Date/Time**: _______________
**Tester**: _______________

### Flutter App
- Cold start: ✅ PASS / ❌ FAIL
- Navigation: ✅ PASS / ❌ FAIL
- Read Firestore: ✅ PASS / ❌ FAIL
- Write Firestore: ✅ PASS / ❌ FAIL

### Backend Functions
- Protected endpoint: ✅ PASS / ❌ FAIL
- Logs check: ✅ PASS / ❌ FAIL

### Observability
- No error spam: ✅ PASS / ❌ FAIL
- No crash loops: ✅ PASS / ❌ FAIL
- Error rate normal: ✅ PASS / ❌ FAIL

### WhatsApp Backend (if applicable)
- Health check: ✅ PASS / ❌ FAIL
- Logs check: ✅ PASS / ❌ FAIL

**Overall Result**: ✅ PASS / ❌ FAIL

**Notes** (if FAIL):
- Test that failed: _______________
- Exact error: _______________
- Debug steps: _______________
```

---

## 🚦 Decision

- ✅ **PASS** — All tests pass → **GO** for merge
- ❌ **FAIL** — At least one test fails → **NO-GO**, debug required

---

**Last updated**: 2026-01-15
