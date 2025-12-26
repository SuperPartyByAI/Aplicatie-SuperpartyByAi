# 🚀 Instrucțiuni Deploy - Chat Clienți

## Deploy Frontend pe Firebase

### Opțiunea 1: Deploy Automat (Recomandat)

```bash
cd /workspaces/Aplicatie-SuperpartyByAi/kyc-app/kyc-app

# Build
npm run build

# Deploy
firebase deploy --only hosting
```

### Opțiunea 2: Deploy Manual (Dacă nu ai Firebase CLI)

1. **Build local**:
```bash
cd kyc-app/kyc-app
npm run build
```

2. **Accesează Firebase Console**:
   - Mergi pe [console.firebase.google.com](https://console.firebase.google.com)
   - Selectează proiectul `superparty-frontend`

3. **Deploy manual**:
   - Click pe **Hosting** în sidebar
   - Click pe **Add another site** (dacă vrei un site nou) SAU
   - Click pe site-ul existent
   - Click pe **Deploy**
   - Drag & drop folder-ul `dist/` din `kyc-app/kyc-app/dist/`

### Opțiunea 3: GitHub Actions (Automat la Push)

Creează `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [ main ]
    paths:
      - 'kyc-app/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd kyc-app/kyc-app
          npm ci
          
      - name: Build
        run: |
          cd kyc-app/kyc-app
          npm run build
          
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: superparty-frontend
          entryPoint: ./kyc-app/kyc-app
```

---

## Deploy Backend pe Railway

### Pasul 1: Creează Proiect Railway

1. Mergi pe [railway.app](https://railway.app)
2. Click **"Login with GitHub"**
3. Click **"New Project"**
4. Selectează **"Deploy from GitHub repo"**
5. Caută și selectează **`Aplicatie-SuperpartyByAi`**

### Pasul 2: Configurează Root Directory

1. După ce proiectul este creat, click pe **Settings**
2. Scroll la **"Root Directory"**
3. Setează: `backend`
4. Click **"Save"**

### Pasul 3: Deploy

Railway va detecta automat:
- ✅ `package.json`
- ✅ `railway.json`
- ✅ Node.js environment

Click **"Deploy"** și gata! ✅

### Pasul 4: Obține URL

1. După deploy, click pe **"Settings"**
2. Scroll la **"Domains"**
3. Click **"Generate Domain"**
4. Copiază URL-ul (ex: `https://aplicatie-superpartybyai-production.up.railway.app`)

### Pasul 5: Actualizează Frontend

Actualizează URL-ul backend-ului în:
- `kyc-app/kyc-app/src/screens/ChatClientiScreen.jsx`
- `kyc-app/kyc-app/src/components/ChatClienti.jsx`
- `kyc-app/kyc-app/src/components/WhatsAppAccountManager.jsx`

Caută:
```javascript
const BACKEND_URL = 'https://aplicatie-superpartybyai-production.up.railway.app';
```

Înlocuiește cu URL-ul tău Railway.

---

## Activare Date Reale (După Deploy Backend)

### Pasul 1: Dezactivează Mock Data

În fiecare fișier, setează:
```javascript
const USE_MOCK_DATA = false; // Era true
```

Fișiere de modificat:
- `src/screens/ChatClientiScreen.jsx`
- `src/components/ChatClienti.jsx`
- `src/components/WhatsAppAccountManager.jsx`

### Pasul 2: Rebuild și Redeploy

```bash
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

---

## Verificare Deploy

### Frontend
1. Accesează: [https://superparty-frontend.web.app](https://superparty-frontend.web.app)
2. Login cu contul tău
3. Verifică că toate modulele funcționează

### Backend
1. Accesează: `https://[your-railway-url].up.railway.app`
2. Ar trebui să vezi:
```json
{
  "status": "online",
  "service": "SuperParty WhatsApp Backend",
  "accounts": 0,
  "maxAccounts": 20
}
```

---

## Troubleshooting

### Build Errors
```bash
# Șterge node_modules și reinstalează
cd kyc-app/kyc-app
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Firebase Deploy Errors
```bash
# Re-login
firebase logout
firebase login
firebase deploy --only hosting
```

### Railway Deploy Errors
- Verifică că Root Directory este setat la `backend`
- Verifică logs în Railway Dashboard
- Verifică că toate dependențele sunt în `package.json`

---

## Status Actual

✅ **Frontend**: Build gata în `kyc-app/kyc-app/dist/`  
✅ **Backend**: Cod gata în `backend/`  
✅ **Mock Data**: Activată pentru testare  
⏳ **Deploy**: Așteaptă deploy manual  

---

## Next Steps

1. ✅ Build frontend (DONE)
2. ⏳ Deploy frontend pe Firebase
3. ⏳ Deploy backend pe Railway
4. ⏳ Actualizează URL backend în frontend
5. ⏳ Dezactivează mock data
6. ⏳ Rebuild și redeploy frontend
7. ⏳ Testează cu date reale

---

## Comenzi Rapide

```bash
# Build frontend
cd kyc-app/kyc-app && npm run build

# Deploy frontend
firebase deploy --only hosting

# Test local backend
cd backend && npm start

# Verifică build
ls -la kyc-app/kyc-app/dist/
```

---

**Versiune**: 1.0.0  
**Data**: 26 Decembrie 2024  
**Status**: ✅ Gata de deploy
