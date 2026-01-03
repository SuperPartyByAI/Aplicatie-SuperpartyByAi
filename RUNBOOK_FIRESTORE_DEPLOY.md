# 🔥 Runbook: Firestore Rules Deploy

## 📋 Prerequisite

Trebuie să ai Firebase CLI instalat și autentificat:

```bash
firebase login
```

---

## 1️⃣ Identifică Proiectul Firebase

### Listează toate proiectele disponibile:

```bash
firebase projects:list
```

**Output așteptat:**

```
┌──────────────────────┬────────────────────┬────────────────┬──────────────────────┐
│ Project Display Name │ Project ID         │ Project Number │ Resource Location ID │
├──────────────────────┼────────────────────┼────────────────┼──────────────────────┤
│ SuperParty           │ superparty-xxxxx   │ 123456789012   │ europe-west1         │
└──────────────────────┴────────────────────┴────────────────┴──────────────────────┘
```

### Selectează proiectul corect:

```bash
firebase use superparty-xxxxx
```

_(Înlocuiește `superparty-xxxxx` cu Project ID-ul real)_

**Verificare:**

```bash
firebase use
```

**Output așteptat:** `Active Project: superparty-xxxxx (SuperParty)`

---

## 2️⃣ Deploy Firestore Rules

### Comandă:

```bash
firebase deploy --only firestore:rules
```

**Output așteptat (SUCCESS):**

```
=== Deploying to 'superparty-xxxxx'...

i  deploying firestore
i  firestore: checking firestore.rules for compilation errors...
✔  firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!
```

**Output așteptat (ERROR - dacă există erori de sintaxă):**

```
Error: Compilation error in firestore.rules:
Line 42: Unexpected token '}'
```

_(Fixează eroarea în `firestore.rules` și re-run)_

---

## 3️⃣ Verificare Post-Deploy

### A) Verificare în Firebase Console

1. Deschide [Firebase Console](https://console.firebase.google.com/)
2. Selectează proiectul `SuperParty`
3. Navighează la **Firestore Database** → **Rules**
4. Verifică că rules-urile afișate conțin:
   - `staffProfiles` cu `allow write: if isAuthenticated() && (request.auth.uid == profileId || isAdmin())`
   - `kycSubmissions` cu reguli pentru read/create/update

### B) Verificare în Aplicație (CRITICAL)

1. **Pornește aplicația:**

   ```bash
   cd kyc-app/kyc-app
   npm run dev
   ```

2. **Login ca admin:**
   - Email: `ursache.andrei1995@gmail.com`
   - Password: [parola ta]

3. **Deschide Browser Console (F12)**

4. **Navighează prin aplicație:**
   - `/home` - Dashboard
   - `/staff-setup` - Staff Setup (dacă e cazul)
   - Chat AI → scrie "admin" → verifică Admin mode
   - Chat AI → scrie "gm" → verifică GM mode

5. **Verifică Console:**
   - ✅ **PASS**: Zero erori "Missing or insufficient permissions"
   - ✅ **PASS**: Zero erori "FirebaseError: permission-denied"
   - ❌ **FAIL**: Dacă apar erori de permissions → rules nu sunt deploy-uite corect

### C) Test Specific pentru staffProfiles

1. **Navighează la `/staff-setup`**
2. **Completează câmpurile**
3. **Click "Salvează"**
4. **Verifică Console:**
   - ✅ **PASS**: "✅ Profil salvat cu succes!"
   - ❌ **FAIL**: "Missing or insufficient permissions" → rules nu permit write pentru owner

### D) Test Specific pentru kycSubmissions

1. **În HomeScreen, intră în Admin mode** (scrie "admin" în chat)
2. **Click pe "Aprobări KYC"** (din sidebar sau wheel)
3. **Verifică Console:**
   - ✅ **PASS**: Lista de KYC submissions se încarcă
   - ❌ **FAIL**: "Missing or insufficient permissions" → rules nu permit read pentru admin

---

## 4️⃣ Troubleshooting

### Eroare: "Failed to authenticate"

```bash
firebase login --reauth
```

### Eroare: "Permission denied" după deploy

- Verifică că ai selectat proiectul corect: `firebase use`
- Verifică că ai permisiuni de deploy în Firebase Console (Owner/Editor role)

### Eroare: "Rules compilation failed"

- Verifică sintaxa în `firestore.rules`
- Rulează: `firebase firestore:rules:validate`

### Aplicația încă aruncă "Missing permissions" după deploy

1. **Hard refresh în browser:** Ctrl+Shift+R (sau Cmd+Shift+R pe Mac)
2. **Clear cache:** Șterge cache-ul browser-ului
3. **Logout + Login:** Logout din aplicație și login din nou
4. **Verifică în Firebase Console:** Rules-urile sunt efectiv deploy-uite?

---

## ✅ Criteriu de Success

**Deploy este SUCCESS dacă:**

1. ✅ Comanda `firebase deploy --only firestore:rules` returnează "Deploy complete!"
2. ✅ Firebase Console arată rules-urile noi
3. ✅ Aplicația funcționează fără erori "Missing or insufficient permissions" în console
4. ✅ Staff Setup salvează profil fără erori
5. ✅ Admin mode încarcă KYC submissions fără erori

---

## 📝 Notes

- **Rules modificate în PR #9:**
  - `staffProfiles`: write pentru owner (nu doar admin)
  - `kycSubmissions`: read/create pentru owner, update/delete pentru admin
- **Fișier:** `firestore.rules` (commit `441fa082`)

- **Backup:** Rules vechi sunt în Firebase Console → Rules → History

---

**Dacă toate verificările sunt PASS → PR #9 poate fi merged!** ✅
