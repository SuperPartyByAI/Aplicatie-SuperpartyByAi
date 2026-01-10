# Migration Script Setup - Windows

## Problema

Scriptul `scripts/migrate_evenimente_schema_v2.js` necesită Firebase service account key pentru a accesa Firestore.

**Eroare fără key:**

```
Error: Cannot find module 'firebase-adminsdk.json'
```

---

## Soluție: Service Account Key în Root

### 1. Descarcă Service Account Key

1. Deschide [Firebase Console](https://console.firebase.google.com/)
2. Selectează proiectul **superparty-frontend**
3. Click pe **Settings** (rotiță) → **Project settings**
4. Tab **Service accounts**
5. Click **Generate new private key**
6. Descarcă fișierul JSON

### 2. Mută Fișierul în Root

**Windows:**

```bash
# Mută fișierul descărcat în root-ul repo-ului
# Redenumește-l exact: firebase-adminsdk.json

# Exemplu path:
C:\Users\ursac\Aplicatie-SuperpartyByAi\firebase-adminsdk.json
```

**Git Bash:**

```bash
cd ~/Aplicatie-SuperpartyByAi

# Verifică că fișierul există
ls -la firebase-adminsdk.json

# Verifică că NU e tracked de git (trebuie să fie în .gitignore)
git ls-files | grep -Ei "firebase-adminsdk\.json" || echo "✅ OK: not tracked"
```

### 3. Verifică .gitignore

Fișierul `.gitignore` trebuie să conțină:

```gitignore
# Firebase service account (NEVER commit this!)
firebase-adminsdk*.json
```

**Verificare:**

```bash
cd ~/Aplicatie-SuperpartyByAi
grep "firebase-adminsdk" .gitignore
```

**Output așteptat:**

```
firebase-adminsdk*.json
```

---

## Rulare Migration Script

### Dry Run (Recommended First)

```bash
cd ~/Aplicatie-SuperpartyByAi

# Install dependencies (dacă nu ai făcut deja)
npm ci

# Dry run - afișează ce s-ar schimba fără a modifica Firestore
DRY_RUN=1 node scripts/migrate_evenimente_schema_v2.js
```

**Output așteptat:**

```
🔄 Migrare evenimente: RO → EN schema v2
   Mode: DRY RUN (no changes will be written)

📋 Found 5 evenimente documents

📊 Summary:
   - Migrated: 0
   - Skipped (already v2): 5
   - Total: 5

✅ Migration complete!
```

### Actual Migration

```bash
# Rulează migrarea (scrie în Firestore)
node scripts/migrate_evenimente_schema_v2.js

# SAU cu npm script
npm run migrate:evenimente:v2
```

---

## Troubleshooting

### Error: Cannot find module 'firebase-adminsdk.json'

**Cauză:** Fișierul lipsește sau e în locație greșită.

**Fix:**

```bash
cd ~/Aplicatie-SuperpartyByAi
ls -la firebase-adminsdk.json
# Dacă nu există, descarcă-l din Firebase Console (vezi pasul 1)
```

### Error: Permission denied

**Cauză:** Service account nu are permisiuni pe Firestore.

**Fix:**

1. Firebase Console → Firestore Database
2. Rules → Verifică că service account are acces
3. SAU regenerează service account key cu permisiuni corecte

### Error: ENOENT: no such file or directory

**Cauză:** Path-ul către `firebase-adminsdk.json` e greșit.

**Fix:**
Scriptul caută în:

```javascript
path.join(__dirname, '..', 'firebase-adminsdk.json');
// = Aplicatie-SuperpartyByAi/firebase-adminsdk.json
```

Verifică că fișierul e exact în root, NU în `scripts/`.

---

## Structură Fișiere

```
Aplicatie-SuperpartyByAi/
├── firebase-adminsdk.json          ← Service account key (local only, NOT in git)
├── .gitignore                      ← Conține firebase-adminsdk*.json
├── package.json                    ← Conține firebase-admin dependency
├── scripts/
│   └── migrate_evenimente_schema_v2.js  ← Migration script
└── ...
```

---

## Security Notes

⚠️ **IMPORTANT:**

1. **NEVER commit** `firebase-adminsdk.json` to git
2. Verifică că e în `.gitignore`
3. Nu partaja fișierul public (conține credențiale admin)
4. Regenerează key-ul dacă a fost expus accidental

**Verificare finală:**

```bash
cd ~/Aplicatie-SuperpartyByAi
git status | grep firebase-adminsdk
# Trebuie să fie gol (nu trebuie să apară în git status)
```

---

## Alternative: Environment Variable (Advanced)

Dacă nu vrei să pui fișierul în root, poți modifica scriptul să accepte env variable:

**Modificare în `scripts/migrate_evenimente_schema_v2.js`:**

```javascript
// Înainte (linia 27):
const serviceAccount = require(path.join(__dirname, '..', 'firebase-adminsdk.json'));

// După:
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-adminsdk.json');
const serviceAccount = require(serviceAccountPath);
```

**Rulare cu env variable:**

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/key.json node scripts/migrate_evenimente_schema_v2.js
```

---

## Quick Reference

```bash
# Setup complet (Windows Git Bash)
cd ~/Aplicatie-SuperpartyByAi
git pull origin main
npm ci

# Verifică service account key
ls -la firebase-adminsdk.json

# Dry run
DRY_RUN=1 node scripts/migrate_evenimente_schema_v2.js

# Actual migration
node scripts/migrate_evenimente_schema_v2.js
```

---

**Last Updated:** 2026-01-10  
**Script:** `scripts/migrate_evenimente_schema_v2.js`  
**Dependency:** `firebase-admin: ^13.6.0`
