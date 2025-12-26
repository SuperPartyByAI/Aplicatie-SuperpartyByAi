# 🚂 Deploy Backend pe Railway - Ghid Rapid

## ⚡ Deploy în 5 Minute

### **Pasul 1: Accesează Railway**
1. Mergi pe [railway.app](https://railway.app)
2. Click **"Login with GitHub"**
3. Autorizează Railway

### **Pasul 2: Creează Proiect**
1. Click **"New Project"**
2. Selectează **"Deploy from GitHub repo"**
3. Caută și selectează **`Aplicatie-SuperpartyByAi`**
4. Click pe repository

### **Pasul 3: Configurează Root Directory**
1. După ce proiectul este creat, click pe **Settings** (iconița roată dințată)
2. Scroll la **"Root Directory"**
3. Setează: **`backend`**
4. Click **"Save"**

### **Pasul 4: Așteaptă Deploy**
Railway va:
- ✅ Detecta `nixpacks.toml`
- ✅ Instala Chromium și dependențe
- ✅ Rula `npm install`
- ✅ Porni serverul cu `npm start`

**Timp estimat**: 3-5 minute

### **Pasul 5: Obține URL**
1. După deploy success, click pe **Settings**
2. Scroll la **"Domains"**
3. Click **"Generate Domain"**
4. Copiază URL-ul (ex: `https://aplicatie-superpartybyai-production.up.railway.app`)

---

## 🔧 **Actualizează Frontend**

### **Pasul 1: Actualizează URL Backend**

În fișierele:
- `kyc-app/kyc-app/src/screens/ChatClientiScreen.jsx`
- `kyc-app/kyc-app/src/components/ChatClienti.jsx`
- `kyc-app/kyc-app/src/components/WhatsAppAccountManager.jsx`

Verifică că URL-ul este corect:
```javascript
const BACKEND_URL = 'https://[your-railway-url].up.railway.app';
```

### **Pasul 2: Dezactivează Mock Data**

În aceleași fișiere, setează:
```javascript
const USE_MOCK_DATA = false; // Era true
```

### **Pasul 3: Rebuild și Redeploy**

```bash
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

SAU commit și push (GitHub Actions va face deploy automat):
```bash
git add .
git commit -m "Switch to real backend data"
git push origin main
```

---

## ✅ **Verificare Deploy**

### **Test Backend**
Accesează în browser:
```
https://[your-railway-url].up.railway.app
```

Ar trebui să vezi:
```json
{
  "status": "online",
  "service": "SuperParty WhatsApp Backend",
  "accounts": 0,
  "maxAccounts": 20
}
```

### **Test Frontend**
1. Accesează [https://superparty-frontend.web.app](https://superparty-frontend.web.app)
2. Activează GM Mode
3. GM Overview → Gestionare Conturi WhatsApp
4. Click "➕ Adaugă Cont"
5. Completează numele
6. **Ar trebui să vezi QR code real!**
7. Scanează cu WhatsApp pe telefon
8. Contul devine activ

---

## 🐛 **Troubleshooting**

### **Deploy Failed**
**Cauză**: Erori în cod sau dependențe

**Soluție**:
1. Verifică logs în Railway Dashboard
2. Click pe deployment → View Logs
3. Caută erori roșii

### **QR Code Nu Apare**
**Cauză**: Chromium nu s-a instalat corect

**Soluție**:
1. Verifică logs pentru erori Puppeteer
2. Redeploy: Settings → Redeploy

### **Backend Timeout**
**Cauză**: Puppeteer durează mult să pornească

**Soluție**:
- Normal la primul start (30-60 secunde)
- Următoarele porniri sunt mai rapide

### **WebSocket Errors**
**Cauză**: CORS sau conexiune

**Soluție**:
- Verifică că backend-ul rulează
- Verifică URL-ul în frontend
- Verifică că Railway nu blochează WebSocket

---

## 📊 **Monitorizare**

### **Railway Dashboard**
- **Metrics**: CPU, RAM, Network
- **Logs**: Real-time logs
- **Deployments**: Istoric deploy-uri

### **Verificări Periodice**
- Verifică că backend-ul rulează
- Verifică că conturile WhatsApp sunt conectate
- Verifică logs pentru erori

---

## 💰 **Costuri Railway**

### **Free Tier**
- $5 credit gratuit/lună
- Suficient pentru testare
- ~500 ore/lună

### **Upgrade (Dacă Necesare)**
- **Hobby**: $5/lună
- **Pro**: $20/lună
- Pentru producție cu trafic mare

---

## 🔐 **Securitate**

### **Variabile de Mediu**
Railway setează automat:
- `PORT` - Port server
- `NODE_ENV` - production

### **Secrets (Dacă Necesare)**
1. Settings → Variables
2. Adaugă variabile sensibile
3. Nu le pune în cod

---

## 📝 **Checklist Deploy**

- [ ] Login pe Railway
- [ ] Creează proiect din GitHub
- [ ] Setează Root Directory: `backend`
- [ ] Așteaptă deploy success
- [ ] Generează domain
- [ ] Copiază URL
- [ ] Actualizează URL în frontend
- [ ] Setează `USE_MOCK_DATA = false`
- [ ] Rebuild frontend
- [ ] Deploy frontend
- [ ] Testează adăugare cont WhatsApp
- [ ] Scanează QR code
- [ ] Verifică că mesajele funcționează

---

## 🎯 **Status Actual**

✅ **Backend Code**: Gata în `backend/`  
✅ **Chromium Config**: `nixpacks.toml` creat  
✅ **Puppeteer Config**: Actualizat pentru Railway  
⏳ **Deploy**: Așteaptă deploy manual pe Railway  

---

## 🚀 **Next Steps**

1. ⏳ Deploy backend pe Railway (5 minute)
2. ⏳ Obține URL backend
3. ⏳ Actualizează frontend cu URL real
4. ⏳ Setează `USE_MOCK_DATA = false`
5. ⏳ Redeploy frontend
6. ⏳ Testează cu date reale

---

**Versiune**: 1.0.0  
**Data**: 26 Decembrie 2024  
**Status**: ✅ Gata de deploy pe Railway
