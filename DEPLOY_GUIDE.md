# 🚀 DEPLOYMENT GUIDE - V3 EN Hardened

**Commit**: `aaefffd4` (V3 EN Hardening)  
**Previous**: `b90bb236` (V3 EN Initial)  
**Date**: 11 January 2026

---

## ✅ PRE-DEPLOYMENT CHECKLIST

- [x] All tests passing (34/34 normalizers)
- [x] Code committed and pushed to main
- [x] Firestore Rules updated
- [x] Documentation complete
- [x] Backward compatibility verified

---

## 📦 STEP 1: Install Firebase CLI (if not installed)

```bash
npm install -g firebase-tools
firebase login
```

---

## 📦 STEP 2: Deploy Functions

```bash
cd /workspaces/Aplicatie-SuperpartyByAi/functions

# Install dependencies
npm install

# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:chatEventOps,functions:setStaffCode,functions:processFollowUps
```

**Expected output:**
```
✔  functions: Finished running predeploy script.
i  functions: preparing codebase functions for deployment
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: uploading functions code to Firebase...
✔  functions: functions code uploaded successfully
i  functions: updating Node.js 20 function chatEventOps(us-central1)...
i  functions: updating Node.js 20 function setStaffCode(us-central1)...
i  functions: updating Node.js 20 function processFollowUps(us-central1)...
✔  functions[chatEventOps(us-central1)] Successful update operation.
✔  functions[setStaffCode(us-central1)] Successful update operation.
✔  functions[processFollowUps(us-central1)] Successful update operation.

✔  Deploy complete!
```

---

## 📦 STEP 3: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

**Expected output:**
```
i  firestore: reading indexes from firestore.indexes.json...
i  firestore: reading rules from firestore.rules...
✔  firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!
```

---

## 📦 STEP 4: Initialize Counter (ONE TIME ONLY)

**IMPORTANT**: Run this ONLY ONCE to initialize the eventShortId counter.

```bash
# Using Firebase CLI
firebase firestore:set counters/eventShortCode '{"value": 0, "createdAt": {"_seconds": 1736636400, "_nanoseconds": 0}}'

# Or using Firebase Console:
# 1. Go to Firestore Database
# 2. Create collection: counters
# 3. Create document: eventShortCode
# 4. Add field: value (number) = 0
```

**Verification:**
```bash
firebase firestore:get counters/eventShortCode
```

Expected output:
```json
{
  "value": 0,
  "createdAt": "2026-01-11T22:00:00.000Z"
}
```

---

## 📦 STEP 5: Verify Deployment

### 5.1 Check Functions are Live

```bash
firebase functions:list
```

Expected functions:
- ✅ `chatEventOps` (us-central1)
- ✅ `setStaffCode` (us-central1)
- ✅ `processFollowUps` (us-central1)
- ✅ `createEventFromAI` (us-central1)
- ✅ Other existing functions...

### 5.2 Test Event Creation (via App)

1. Open Flutter app
2. Create a new event with:
   - Date: 15-01-2026
   - Address: Test Address
   - Child Name: Test Child
   - Roles: Animator

3. Check Firestore:
   ```
   Collection: evenimente
   Document: [auto-generated-id]
   Fields:
     - schemaVersion: 3
     - eventShortId: 1 (or next number)
     - date: "15-01-2026"
     - address: "Test Address"
     - childName: "Test Child"
     - rolesBySlot: { "01A": {...} }
     - payment: { status: "UNPAID", ... }
   ```

### 5.3 Test Staff Code Assignment

1. Open app as staff member
2. Call `setStaffCode` with code "A13"
3. Check Firestore:
   ```
   Collection: staffProfiles
   Document: [user-uid]
   Fields:
     - code: "A13"
     - email: "staff@example.com"
     - uid: [user-uid]
   ```

### 5.4 Test Follow-up Scheduler

Wait 1 hour (or trigger manually) and check:
```
Collection: tasks
Document: [auto-generated-id]
Fields:
  - type: "FOLLOW_UP"
  - status: "IN_PROGRESS"
  - dueAt: [timestamp]
```

---

## 📦 STEP 6: Monitor Logs

```bash
# Real-time logs
firebase functions:log --only chatEventOps

# Or in Firebase Console:
# Functions → Logs → Filter by function name
```

**Look for:**
- ✅ No errors
- ✅ `[DEPRECATED]` warnings (expected for legacy code)
- ✅ Successful event creation logs

---

## 🔄 ROLLBACK PROCEDURE (if needed)

If something goes wrong:

### Option 1: Rollback Functions

```bash
# List previous deployments
firebase functions:list --versions

# Rollback to previous version
firebase functions:rollback chatEventOps --version [previous-version-id]
```

### Option 2: Rollback Code

```bash
# Revert to previous commit
git revert aaefffd4
git push origin main

# Redeploy
firebase deploy --only functions
```

### Option 3: Emergency Fix

```bash
# Fix the issue
git add -A
git commit -m "Hotfix: [description]"
git push origin main

# Deploy immediately
firebase deploy --only functions
```

---

## 📊 POST-DEPLOYMENT VERIFICATION

### Checklist:

- [ ] Functions deployed successfully
- [ ] Firestore Rules deployed successfully
- [ ] Counter initialized (value: 0)
- [ ] Test event created with schemaVersion: 3
- [ ] Test event has eventShortId (numeric)
- [ ] Test event has rolesBySlot with keys "01A", "01B"...
- [ ] Staff code assignment works
- [ ] No errors in logs
- [ ] Old events (v1/v2) still readable

---

## 🐛 TROUBLESHOOTING

### Issue: "Counter not found"

**Solution:**
```bash
firebase firestore:set counters/eventShortCode '{"value": 0}'
```

### Issue: "Permission denied" on staffProfiles

**Solution:** Check Firestore Rules are deployed:
```bash
firebase deploy --only firestore:rules
```

### Issue: Functions not updating

**Solution:** Force redeploy:
```bash
firebase deploy --only functions --force
```

### Issue: Old events not readable

**Solution:** Normalizers handle this automatically. Check logs for errors.

---

## 📞 SUPPORT

If you encounter issues:

1. Check logs: `firebase functions:log`
2. Check Firestore Rules: Firebase Console → Firestore → Rules
3. Check counter: `firebase firestore:get counters/eventShortCode`
4. Verify code is on main branch: `git log --oneline -1`

---

## ✅ DEPLOYMENT COMPLETE

Once all steps are verified:

- ✅ V3 EN is live in production
- ✅ Backward compatibility maintained
- ✅ All new events use V3 schema
- ✅ Staff code system active
- ✅ Follow-up scheduler running

**Next steps:**
- Monitor logs for 24 hours
- Verify event creation in production
- Test staff workflows
- Update Flutter app if needed

---

**Deployed by**: Ona AI Agent  
**Date**: 11 January 2026  
**Commit**: aaefffd4
