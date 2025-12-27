# 🔧 Fix Firebase Permissions - Manual Steps

## Problema

**Eroare:** "Missing or insufficient permissions" când încarcă userii în GM Mode

**Cauză:** Firestore security rules nu permit citirea collection-urilor `accounts`, `chats`, `messages`

---

## ✅ Soluție: Deploy Firestore Rules

### Opțiunea 1: Firebase Console (Recomandat - 2 minute)

1. **Deschide Firebase Console:**
   ```
   https://console.firebase.google.com/project/superparty-frontend/firestore/rules
   ```

2. **Copiază rules noi:**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       
       // Helper functions
       function isAuthenticated() {
         return request.auth != null;
       }
       
       function isAdmin() {
         return isAuthenticated() && 
                get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
       }
       
       function isOwner(userId) {
         return isAuthenticated() && request.auth.uid == userId;
       }
       
       function isApproved() {
         return isAuthenticated() && 
                get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'approved';
       }
       
       // Users collection
       match /users/{userId} {
         allow read: if isAuthenticated();
         allow create: if isAuthenticated() && isOwner(userId);
         allow update: if isOwner(userId) || isAdmin();
         allow delete: if isAdmin();
       }
       
       // KYC Submissions
       match /kycSubmissions/{submissionId} {
         allow read: if isAuthenticated() && (isOwner(resource.data.uid) || isAdmin());
         allow create: if isAuthenticated() && isOwner(request.resource.data.uid);
         allow update: if isAdmin();
         allow delete: if isAdmin();
       }
       
       // Staff Profiles
       match /staffProfiles/{profileId} {
         allow read: if isAuthenticated();
         allow create: if isAuthenticated() && isOwner(profileId);
         allow update: if isOwner(profileId) || isAdmin();
         allow delete: if isAdmin();
       }
       
       // Evenimente
       match /evenimente/{eventId} {
         allow read: if isAuthenticated();
         allow create: if isAdmin();
         allow update: if isAdmin();
         allow delete: if isAdmin();
       }
       
       // Disponibilitate
       match /disponibilitate/{availId} {
         allow read: if isAuthenticated();
         allow create: if isAuthenticated() && isOwner(request.resource.data.uid);
         allow update: if isOwner(resource.data.uid) || isAdmin();
         allow delete: if isOwner(resource.data.uid) || isAdmin();
       }
       
       // AI Conversations (oricine autentificat poate citi pentru GM Mode)
       match /aiConversations/{convId} {
         allow read: if isAuthenticated();
         allow create: if false;
         allow update: if false;
         allow delete: if isAdmin();
       }
       
       // AI Corrections
       match /aiCorrections/{correctionId} {
         allow read: if isAuthenticated();
         allow create: if isAuthenticated();
         allow update: if isAuthenticated();
         allow delete: if isAdmin();
       }
       
       // Settings
       match /settings/{settingId} {
         allow read: if isAuthenticated();
         allow write: if isAdmin();
       }
       
       // Image Validations
       match /imageValidations/{validationId} {
         allow read: if isAuthenticated() && (isOwner(resource.data.userId) || isAdmin());
         allow create: if false;
         allow update: if isAdmin();
         allow delete: if isAdmin();
       }
       
       // Performance Metrics
       match /performanceMetrics/{metricId} {
         allow read: if isAuthenticated() && (metricId.matches('^' + request.auth.uid + '_.*') || isAdmin());
         allow create: if false;
         allow update: if false;
         allow delete: if isAdmin();
       }
       
       // Performance Alerts
       match /performanceAlerts/{alertId} {
         allow read: if isAuthenticated() && (isOwner(resource.data.userId) || isAdmin());
         allow create: if false;
         allow update: if isOwner(resource.data.userId) || isAdmin();
         allow delete: if isAdmin();
       }
       
       // AI Manager Logs
       match /aiManagerLogs/{logId} {
         allow read: if isAdmin();
         allow create: if false;
         allow update: if false;
         allow delete: if isAdmin();
       }
       
       // Evenimente Alocate
       match /evenimenteAlocate/{allocationId} {
         allow read: if isAuthenticated() && (isOwner(resource.data.staffId) || isAdmin());
         allow create: if isAdmin();
         allow update: if isOwner(resource.data.staffId) || isAdmin();
         allow delete: if isAdmin();
       }
       
       // Daily Reports
       match /dailyReports/{reportId} {
         allow read: if isAdmin();
         allow create: if false;
         allow update: if false;
         allow delete: if isAdmin();
       }
       
       // ⭐ WhatsApp Accounts (ADĂUGAT NOU)
       match /accounts/{accountId} {
         allow read, write: if true;
       }
       
       // ⭐ WhatsApp Chats (ADĂUGAT NOU)
       match /accounts/{accountId}/chats/{chatId} {
         allow read, write: if true;
       }
       
       // ⭐ WhatsApp Messages (ADĂUGAT NOU)
       match /accounts/{accountId}/chats/{chatId}/messages/{messageId} {
         allow read, write: if true;
       }
       
       // Default deny
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

3. **Click "Publish"**

4. **Verifică:** Rules sunt active instant

---

### Opțiunea 2: Firebase CLI (Dacă ai login)

```bash
cd kyc-app/kyc-app
firebase login
firebase deploy --only firestore:rules
```

---

## 🔧 Fix WhatsApp Deconectare

**Modificări făcute:**

1. **Keep-alive mechanism** - Trimite presence update la 30 secunde
2. **Salvare phone number** - Pentru reconnect automat
3. **Better logging** - Disconnect reason în logs

**Deploy automat:** Railway va redeploy când push-ui pe main (deja făcut)

---

## ✅ Verificare

### 1. Verifică Firestore Rules

```bash
# Firebase Console
https://console.firebase.google.com/project/superparty-frontend/firestore/rules

# Trebuie să vezi rules noi cu "accounts", "chats", "messages"
```

### 2. Verifică Backend Deploy

```bash
railway logs --tail 50

# Caută:
# ✅ "Keep-alive" messages la 30 secunde
# ✅ "Auto-reconnecting..." dacă se deconectează
```

### 3. Test Frontend

1. Login în app: https://superparty-frontend.web.app
2. GM Mode → GM Conversations
3. **NU** mai trebuie să apară "Missing or insufficient permissions"
4. Vezi lista de useri

### 4. Test WhatsApp Connection

1. GM Mode → WhatsApp Accounts
2. Verifică status: "connected"
3. Așteaptă 2-3 minute
4. Status trebuie să rămână "connected" (nu se deconectează)

---

## 🐛 Troubleshooting

### Eroare persistă după deploy rules

**Check:**
```bash
# Browser console (F12)
# Verifică eroarea exactă
```

**Fix:**
```bash
# Hard refresh
Ctrl+Shift+R (Windows)
Cmd+Shift+R (Mac)

# Clear cache
# Settings → Clear browsing data → Cached images and files
```

### WhatsApp se deconectează în continuare

**Check Railway logs:**
```bash
railway logs --tail 100 | grep -i disconnect
```

**Posibile cauze:**
- WhatsApp Web limit (max 4 devices)
- Internet connection instabil
- Railway restart (normal, reconnect automat)

**Fix:**
```bash
# Dacă vezi "loggedOut" în logs:
# Re-add account cu pairing code nou
```

---

## 📊 Status Actual

**Backend:**
- ✅ Keep-alive implementat
- ✅ Auto-reconnect cu phone number
- ✅ Better disconnect logging
- ⏳ Deploy în curs pe Railway

**Frontend:**
- ✅ Firestore rules actualizate (local)
- ⏳ Trebuie deploy manual în Firebase Console

**Database:**
- ⏳ Firestore rules trebuie publicate

---

## 🚀 Next Steps

1. **Deploy Firestore Rules** (2 minute)
   - Firebase Console → Publish rules

2. **Verifică Backend** (1 minut)
   - Railway logs → Keep-alive messages

3. **Test App** (2 minute)
   - GM Mode → Conversations → Trebuie să meargă
   - WhatsApp → Status connected → Trebuie să rămână

4. **Monitor** (5 minute)
   - Verifică dacă WhatsApp rămâne conectat
   - Verifică dacă GM Mode încarcă userii

---

**Created:** 2024-12-27  
**Ona AI** ✅
