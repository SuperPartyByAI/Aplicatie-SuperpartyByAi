# 🔧 Setup GitHub Actions pentru Deploy Automat

## Pasul 1: Generează Firebase Service Account

### 1.1 Accesează Firebase Console
1. Mergi pe [console.firebase.google.com](https://console.firebase.google.com)
2. Selectează proiectul **superparty-frontend**

### 1.2 Creează Service Account
1. Click pe **⚙️ Settings** (iconița roată dințată lângă "Project Overview")
2. Click pe **Project settings**
3. Click pe tab-ul **Service accounts**
4. Click pe **Generate new private key**
5. Click **Generate key** în dialog
6. Se va descărca un fișier JSON (ex: `superparty-frontend-xxxxx.json`)

**⚠️ IMPORTANT**: Păstrează acest fișier în siguranță! Nu-l posta nicăieri public!

---

## Pasul 2: Adaugă Secret în GitHub

### 2.1 Accesează Repository Settings
1. Mergi pe [github.com/SuperPartyByAI/SuperParty](https://github.com/SuperPartyByAI/SuperParty)
2. Click pe **Settings** (tab-ul din dreapta sus)
3. În sidebar stânga, click pe **Secrets and variables** → **Actions**

### 2.2 Adaugă Secret
1. Click pe **New repository secret**
2. **Name**: `FIREBASE_SERVICE_ACCOUNT_SUPERPARTY_FRONTEND`
3. **Secret**: Deschide fișierul JSON descărcat și copiază TOT conținutul
4. Click **Add secret**

---

## Pasul 3: Push și Testează

### 3.1 Push Workflow
```bash
cd /workspaces/Aplicatie-SuperpartyByAi
git push origin main
```

### 3.2 Verifică Deploy
1. Mergi pe GitHub repository
2. Click pe tab-ul **Actions**
3. Ar trebui să vezi workflow-ul "Deploy Frontend to Firebase" rulând
4. Click pe el pentru a vedea progresul

### 3.3 Verifică Rezultatul
După ce workflow-ul se termină cu succes (✅):
1. Accesează [https://superparty-frontend.web.app](https://superparty-frontend.web.app)
2. Login cu contul tău
3. Testează modulele Chat Clienți

---

## Cum Funcționează

### Trigger
Workflow-ul se declanșează automat când:
- Faci push pe branch-ul `main`
- Modifici fișiere în folder-ul `kyc-app/`

### Pași Workflow
1. ✅ Checkout code
2. ✅ Setup Node.js 18
3. ✅ Install dependencies (`npm ci`)
4. ✅ Build (`npm run build`)
5. ✅ Deploy to Firebase Hosting

### Timp Estimat
- Build: ~2-3 minute
- Deploy: ~30 secunde
- **Total**: ~3-4 minute

---

## Troubleshooting

### Error: "firebaseServiceAccount not found"
**Cauză**: Secret-ul nu este configurat corect în GitHub

**Soluție**:
1. Verifică că secret-ul se numește exact: `FIREBASE_SERVICE_ACCOUNT_SUPERPARTY_FRONTEND`
2. Verifică că ai copiat TOT conținutul fișierului JSON (inclusiv `{` și `}`)
3. Încearcă să ștergi și re-creezi secret-ul

### Error: "Permission denied"
**Cauză**: Service Account nu are permisiuni

**Soluție**:
1. În Firebase Console → Project Settings → Service accounts
2. Verifică că service account-ul are rol de **Editor** sau **Owner**

### Error: "Build failed"
**Cauză**: Erori în cod sau dependențe lipsă

**Soluție**:
1. Verifică logs în GitHub Actions
2. Testează build local: `cd kyc-app/kyc-app && npm run build`
3. Verifică că toate dependențele sunt în `package.json`

### Workflow nu se declanșează
**Cauză**: Push-ul nu a modificat fișiere din `kyc-app/`

**Soluție**:
- Workflow-ul se declanșează doar când modifici fișiere în `kyc-app/`
- Pentru a forța deploy, modifică orice fișier din `kyc-app/` și push

---

## Deploy Manual (Fallback)

Dacă GitHub Actions nu funcționează, poți face deploy manual:

```bash
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

---

## Status Actual

✅ **Workflow creat**: `.github/workflows/deploy-frontend.yml`  
⏳ **Secret configurat**: Trebuie adăugat în GitHub  
⏳ **Deploy activ**: După configurare secret  

---

## Next Steps

1. ⏳ Generează Firebase Service Account
2. ⏳ Adaugă secret în GitHub
3. ⏳ Push pe main (deja făcut)
4. ⏳ Verifică deploy în GitHub Actions
5. ⏳ Testează aplicația

---

## Comenzi Utile

```bash
# Verifică status workflow
gh run list --workflow=deploy-frontend.yml

# Vezi logs ultimul run
gh run view --log

# Re-run ultimul workflow
gh run rerun

# Trigger manual workflow
gh workflow run deploy-frontend.yml
```

---

**Versiune**: 1.0.0  
**Data**: 26 Decembrie 2024  
**Status**: ⏳ Așteaptă configurare Firebase Service Account
