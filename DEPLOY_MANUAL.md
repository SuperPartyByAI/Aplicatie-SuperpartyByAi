# 🚀 MANUAL DEPLOY GUIDE - V3 Complete Implementation

**Status**: ✅ Code ready, ⏳ Deploy pending (requires manual authentication)

---

## ⚠️ DE CE MANUAL?

Firebase deploy necesită autentificare interactivă (`firebase login`) care nu funcționează în Gitpod/headless environments.

**Soluții**:
1. ✅ **Deploy local** (recomandat) - clonează repo și deploy de pe laptop
2. ✅ **Deploy din GitHub Actions** - setup CI/CD cu service account
3. ✅ **Deploy din Firebase Console** - upload manual (nu recomandat)

---

## 📋 DEPLOY LOCAL (RECOMANDAT)

### Prerequisite:
- Node.js 20+
- Git
- Firebase CLI

### Pași:

```bash
# 1. Clone repo
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi

# 2. Pull latest changes
git pull origin main

# 3. Install Firebase CLI (dacă nu e instalat)
npm install -g firebase-tools

# 4. Login Firebase
firebase login

# 5. Set project
firebase use superparty-frontend

# 6. Install dependencies
cd functions
npm install

# 7. Deploy Firestore Rules
cd ..
firebase deploy --only firestore:rules

# 8. Deploy Functions
firebase deploy --only functions

# 9. Set GROQ API Key (dacă nu e setat)
firebase functions:secrets:set GROQ_API_KEY
# Paste your Groq API key when prompted

# 10. Verify
firebase functions:list
```

---

## 🔍 VERIFICARE DUPĂ DEPLOY

### 1. Check Functions Deployed

```bash
firebase functions:list
```

**Expected output:**
```
✔ functions: 
┌────────────────────┬────────────┬─────────────┐
│ Function           │ Region     │ Status      │
├────────────────────┼────────────┼─────────────┤
│ aiEventHandler     │ us-central1│ DEPLOYED    │
│ setStaffCode       │ us-central1│ DEPLOYED    │
│ processFollowUps   │ us-central1│ DEPLOYED    │
│ chatEventOps       │ us-central1│ DEPLOYED    │
└────────────────────┴────────────┴─────────────┘
```

### 2. Check Firestore Rules

```bash
firebase firestore:rules:list
```

**Expected**: Latest rules with ai_global_rules, tasks, history

### 3. Test Function

```bash
# Test aiEventHandler
curl -X POST \
  https://us-central1-superparty-frontend.cloudfunctions.net/aiEventHandler \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{"text": "Vreau să notez un eveniment"}'
```

### 4. Check Logs

```bash
firebase functions:log --only aiEventHandler
```

---

## 🔐 SET GROQ API KEY

**Dacă nu e setat deja:**

```bash
firebase functions:secrets:set GROQ_API_KEY
```

**Paste key când e cerut:**
```
? Enter a value for GROQ_API_KEY: [paste your key]
```

**Verify:**
```bash
firebase functions:secrets:access GROQ_API_KEY
```

---

## 🐛 TROUBLESHOOTING

### Issue: "Authentication required"

**Solution:**
```bash
firebase login --reauth
firebase use superparty-frontend
```

### Issue: "Functions deploy failed"

**Check:**
1. Node version: `node --version` (should be 20+)
2. Dependencies: `cd functions && npm install`
3. Syntax errors: `npm run lint`

**Retry:**
```bash
firebase deploy --only functions --force
```

### Issue: "Firestore rules invalid"

**Validate:**
```bash
firebase firestore:rules:validate
```

**Fix and redeploy:**
```bash
firebase deploy --only firestore:rules
```

### Issue: "GROQ_API_KEY not found"

**Set secret:**
```bash
firebase functions:secrets:set GROQ_API_KEY
```

**Redeploy functions:**
```bash
firebase deploy --only functions
```

---

## 📊 POST-DEPLOY VERIFICATION

### Checklist:

- [ ] Functions deployed (aiEventHandler, setStaffCode, processFollowUps)
- [ ] Firestore Rules deployed
- [ ] GROQ_API_KEY secret set
- [ ] Test create event via app
- [ ] Check Firestore: schemaVersion=3, eventShortId numeric
- [ ] Check history subcollection exists
- [ ] Check tasks collection accessible
- [ ] No errors in logs

### Test Commands:

```bash
# 1. List functions
firebase functions:list

# 2. Check logs
firebase functions:log --limit 50

# 3. Test Firestore access
cd functions
node verify_firestore.js

# 4. Check counter
# Should show value=5 (after migration)
```

---

## 🔄 ROLLBACK (if needed)

```bash
# List previous deployments
firebase functions:list --versions

# Rollback specific function
firebase functions:rollback aiEventHandler --version [previous-version]

# Rollback all functions
firebase deploy --only functions --version [previous-version]
```

---

## 📝 DEPLOYMENT SUMMARY

### What's being deployed:

**Functions:**
- `aiEventHandler` - V3 AI handler with confirmation flow
- `setStaffCode` - Staff code management
- `processFollowUps` - Scheduler (runs every hour)
- `chatEventOps` - Existing chat operations (kept for compatibility)

**Firestore Rules:**
- `ai_global_rules` - read: employee, write: super admin
- `tasks` - read: assigned/open, write: backend
- `history` - read: employee, write: backend
- `staffProfiles` - read: own, write: backend
- `staffHours` - read: own/admin, write: backend

**Secrets:**
- `GROQ_API_KEY` - Required for AI handler

---

## ✅ DEPLOYMENT COMPLETE WHEN:

1. ✅ All functions show "DEPLOYED" status
2. ✅ Firestore rules updated
3. ✅ GROQ_API_KEY secret set
4. ✅ Test event creation works
5. ✅ No errors in logs
6. ✅ Migration completed (5/5 events)

---

## 🆘 NEED HELP?

**If deploy fails:**

1. Check Firebase Console: https://console.firebase.google.com/project/superparty-frontend
2. Check logs: `firebase functions:log`
3. Verify service account permissions
4. Contact: ursache.andrei1995@gmail.com

---

**Created by**: Ona AI Agent  
**Date**: 11 January 2026  
**Status**: ⏳ Awaiting manual deploy
