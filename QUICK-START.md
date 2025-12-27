# 🚀 Quick Start Guide - SuperParty WhatsApp Backend

Ghid rapid pentru setup și deployment în 15 minute.

---

## ⚡ Setup Rapid (5 minute)

### 1. Clone & Install

```bash
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi
npm install
```

### 2. Firebase Setup

**A. Creează Firebase Project:**
1. https://console.firebase.google.com
2. Click "Add project"
3. Nume: `superparty-backend` (sau alt nume)
4. Disable Google Analytics (optional)
5. Create project

**B. Activează Firestore:**
1. Build → Firestore Database
2. Create database
3. Start in **production mode**
4. Location: `europe-west` (cel mai aproape)

**C. Generează Service Account:**
1. Project Settings (⚙️) → Service Accounts
2. Click "Generate new private key"
3. Download JSON
4. Salvează în `.secrets/firebase-service-account.json`

### 3. Environment Variables

```bash
# Creează .env în root
cat > .env << 'EOF'
PORT=5000
FIREBASE_SERVICE_ACCOUNT=$(cat .secrets/firebase-service-account.json)
EOF
```

### 4. Run Local

```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd kyc-app/kyc-app
npm install
npm run dev
```

**✅ Done!** Backend: http://localhost:5000 | Frontend: http://localhost:5173

---

## 🚀 Deploy Production (10 minute)

### Railway (Backend)

**1. Install Railway CLI:**
```bash
npm install -g @railway/cli
railway login
```

**2. Create Project:**
```bash
railway init
# Nume: superparty-backend
# Region: us-west1 (sau europe-west1)
```

**3. Link Repository:**
```bash
railway link
# Select: Create new project
```

**4. Set Environment Variables:**
```bash
# Copy Firebase JSON
cat .secrets/firebase-service-account.json | pbcopy  # macOS
cat .secrets/firebase-service-account.json | xclip   # Linux

# Railway Dashboard
railway open
# Variables → New Variable
# Key: FIREBASE_SERVICE_ACCOUNT
# Value: Paste JSON (Ctrl+V)
```

**5. Deploy:**
```bash
git push origin main
# Railway auto-deploys
```

**6. Get URL:**
```bash
railway domain
# Example: https://aplicatie-superpartybyai-production.up.railway.app
```

### Firebase Hosting (Frontend)

**1. Install Firebase CLI:**
```bash
npm install -g firebase-tools
firebase login
```

**2. Initialize Project:**
```bash
cd kyc-app/kyc-app
firebase init hosting

# Select:
# - Use existing project: superparty-frontend
# - Public directory: dist
# - Single-page app: Yes
# - GitHub Actions: No (deocamdată)
```

**3. Update Backend URL:**
```bash
# Edit kyc-app/kyc-app/src/config.js
export const API_URL = 'https://your-railway-url.up.railway.app';
```

**4. Build & Deploy:**
```bash
npm run build
firebase deploy --only hosting
```

**5. Get URL:**
```bash
firebase hosting:channel:list
# Example: https://superparty-frontend.web.app
```

**✅ Done!** App live în production!

---

## 📱 First WhatsApp Account (2 minute)

### Method 1: Pairing Code (Recomandat)

**1. Open App:**
```
https://your-firebase-url.web.app
```

**2. Login cu Admin:**
```
Email: ursache.andrei1995@gmail.com
Password: (your password)
```

**3. GM Mode:**
- Click "GM Mode" în meniu
- Click "Adaugă Cont WhatsApp"

**4. Add Account:**
```
Account ID: account1
Phone Number: 40737571397  (fără +)
```

**5. Get Pairing Code:**
- Așteaptă 5 secunde
- Cod apare: ex. `KT93AM4F`

**6. Link WhatsApp:**
- WhatsApp pe telefon
- Settings → Linked Devices
- Link a Device
- Link with phone number
- Introdu codul: `KT93AM4F`

**✅ Connected!** Status devine "ready" în 10 secunde.

### Method 2: QR Code

**1-3. Same as above**

**4. Add Account:**
```
Account ID: account1
Phone Number: (leave empty)
```

**5. Scan QR:**
- QR code apare instant
- WhatsApp → Linked Devices → Link a Device
- Scanează QR code

**✅ Connected!**

---

## 🧪 Test Setup

### 1. Test Backend

```bash
# Health check
curl https://your-railway-url.up.railway.app/health

# Expected: {"status":"ok"}
```

### 2. Test WhatsApp Connection

```bash
# Get accounts
curl https://your-railway-url.up.railway.app/api/whatsapp/accounts

# Expected: [{"id":"account1","status":"ready",...}]
```

### 3. Test Frontend

1. Open app: https://your-firebase-url.web.app
2. Login cu admin
3. GM Mode → Vezi cont "account1" cu status "ready"
4. Chat Clienți → Selectează account1
5. Vezi lista clienți (dacă ai conversații)

### 4. Test Real-time Messaging

1. Trimite mesaj din WhatsApp pe telefon
2. Mesajul apare INSTANT în Chat Clienți (fără refresh)
3. Răspunde din Chat Clienți
4. Mesajul apare în WhatsApp pe telefon

**✅ All working!**

---

## 🔧 Common Issues

### Issue 1: Backend nu pornește

**Error:** `Cannot find module '@whiskeysockets/baileys'`

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Firebase credentials invalid

**Error:** `Error initializing Firebase`

**Fix:**
```bash
# Verifică JSON valid
cat .secrets/firebase-service-account.json | jq .

# Railway: Re-set environment variable
railway variables set FIREBASE_SERVICE_ACCOUNT="$(cat .secrets/firebase-service-account.json)"
```

### Issue 3: Pairing code nu apare

**Error:** Timeout după 30 secunde

**Fix:**
```bash
# Verifică număr telefon format corect
# ✅ Corect: 40737571397
# ❌ Greșit: +40737571397, 0737571397

# Restart backend
railway restart
```

### Issue 4: Mesaje nu apar

**Check:**
```javascript
// Browser console
socket.connected  // Should be true
```

**Fix:**
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

# Restart backend
railway restart
```

### Issue 5: Railway deployment fails

**Error:** `Node version mismatch`

**Fix:**
```bash
# Verifică Dockerfile
cat Dockerfile | grep FROM
# Should be: FROM node:20-slim

# Update dacă e diferit
sed -i 's/node:18/node:20/g' Dockerfile
git commit -am "Update Node.js to v20"
git push
```

---

## 📊 Monitoring

### Railway Logs

```bash
# View logs
railway logs

# Follow logs (real-time)
railway logs --follow
```

### Firebase Logs

```bash
# View hosting logs
firebase hosting:channel:list

# View Firestore usage
# Firebase Console → Firestore → Usage tab
```

### Backend Health

```bash
# Create monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
while true; do
  STATUS=$(curl -s https://your-railway-url.up.railway.app/health | jq -r .status)
  echo "[$(date)] Backend status: $STATUS"
  sleep 60
done
EOF

chmod +x monitor.sh
./monitor.sh
```

---

## 🔐 Security Checklist

### Before Production

- [ ] Firebase service account în environment variable (nu în git)
- [ ] `.secrets/` folder în .gitignore
- [ ] `.baileys_auth/` folder în .gitignore
- [ ] Firebase Security Rules configurate
- [ ] HTTPS enforced (Railway + Firebase auto)
- [ ] Admin email verificat (ursache.andrei1995@gmail.com)
- [ ] Strong password pentru admin
- [ ] Railway environment variables setate corect

### Firebase Security Rules

```javascript
// Firestore Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users
    match /accounts/{accountId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Apply:**
```bash
firebase deploy --only firestore:rules
```

---

## 📈 Scaling

### Add More WhatsApp Accounts

**Limit:** 5 accounts per backend instance (Railway free tier)

**For 10+ accounts:**
```bash
# Option 1: Upgrade Railway plan
# Pro: $20/month = 20 accounts

# Option 2: Multiple Railway instances
railway init superparty-backend-2
# Deploy same code, different accounts
```

### Increase Message Throughput

**Current:** ~100 messages/minute per account

**For 1000+ messages/minute:**
```javascript
// src/whatsapp/manager.js
// Increase queue size
this.messageQueue = [];
this.maxQueueSize = 1000;  // Default: 100
```

### Database Optimization

**Firestore limits:**
- Free: 50K reads/day, 20K writes/day
- Paid: $0.06 per 100K reads

**For high traffic:**
```javascript
// Reduce Firestore writes
// Save only important messages
if (message.fromMe || message.body.length > 10) {
  await this.firestoreService.saveMessage(...);
}
```

---

## 🎓 Next Steps

### 1. Customize Frontend

```bash
cd kyc-app/kyc-app/src

# Edit colors
# components/WhatsAppAccountManager.jsx
# Change: backgroundColor, colors

# Edit logo
# public/logo.png
```

### 2. Add More Admins

```javascript
// kyc-app/kyc-app/src/screens/HomeScreen.jsx
const isAdmin = (email) => {
  return [
    'ursache.andrei1995@gmail.com',
    'admin2@example.com',  // Add here
    'admin3@example.com'
  ].includes(email);
};
```

### 3. Enable Voice AI (Future)

**See:** [SESSION-REPORT-2024-12-27.md](SESSION-REPORT-2024-12-27.md) - Voice AI Planning

**Timeline:** 2-3 săptămâni implementare

**Cost:** ~$50-100/lună pentru 100-200 apeluri

---

## 📚 Resources

**Documentation:**
- [README.md](README.md) - Complete documentation
- [SESSION-REPORT-2024-12-27.md](SESSION-REPORT-2024-12-27.md) - Implementation details
- [CHAT-CLIENTI-GUIDE.md](CHAT-CLIENTI-GUIDE.md) - Chat usage guide

**External:**
- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Socket.io Documentation](https://socket.io/docs)

**Support:**
- Email: ursache.andrei1995@gmail.com
- GitHub Issues: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/issues

---

## ✅ Checklist Final

### Setup Complete
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] Firebase project created
- [ ] Firestore activated
- [ ] Service account generated
- [ ] Environment variables set
- [ ] Local backend running
- [ ] Local frontend running

### Production Deploy
- [ ] Railway CLI installed
- [ ] Railway project created
- [ ] Environment variables set on Railway
- [ ] Backend deployed to Railway
- [ ] Backend URL obtained
- [ ] Firebase CLI installed
- [ ] Frontend built
- [ ] Frontend deployed to Firebase
- [ ] Frontend URL obtained

### WhatsApp Setup
- [ ] Admin login working
- [ ] GM Mode accessible
- [ ] First account added
- [ ] Pairing code/QR working
- [ ] WhatsApp connected
- [ ] Status shows "ready"
- [ ] Messages appearing in Chat Clienți
- [ ] Real-time updates working

### Testing
- [ ] Backend health check passes
- [ ] WhatsApp API responds
- [ ] Frontend loads correctly
- [ ] Socket.io connected
- [ ] Messages sync instantly
- [ ] Send message works
- [ ] Firestore saving messages

### Security
- [ ] Secrets not in git
- [ ] Environment variables secure
- [ ] Firebase rules configured
- [ ] HTTPS enabled
- [ ] Admin access restricted

**🎉 All done! Production ready!**

---

**Created:** 2024-12-27  
**Version:** 1.0  
**Ona AI** ✅
