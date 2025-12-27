# Deploy Backend pe Firebase Functions

## 🎯 De ce Firebase Functions?

✅ **Deja configurat** - ai Firebase Hosting + Firestore  
✅ **Scalare automată** - plătești doar ce folosești  
✅ **Integrare nativă** cu Firestore  
✅ **GRATUIT** până la 2M invocări/lună  
✅ **Suportă dependențe grele** (puppeteer, baileys)  
✅ **Un singur proiect** - frontend + backend împreună  

---

## 📋 Pași pentru Deploy

### 1. Instalează dependențele

```bash
cd kyc-app/kyc-app/functions
npm install
```

### 2. Configurează Environment Variables

Firebase Console → Project Settings → Service accounts → Generate new private key

Apoi adaugă secrets în Firebase:

```bash
# OpenAI API Key
firebase functions:secrets:set OPENAI_API_KEY
# Paste: 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

# Twilio credentials
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_PHONE_NUMBER
firebase functions:secrets:set TWILIO_API_KEY
firebase functions:secrets:set TWILIO_API_SECRET
firebase functions:secrets:set TWILIO_TWIML_APP_SID

# Backend URL (după deploy)
firebase functions:config:set backend.url="https://us-central1-superparty-kyc.cloudfunctions.net/api"

# WhatsApp (opțional)
firebase functions:secrets:set TWILIO_WHATSAPP_NUMBER
```

### 3. Deploy Functions

```bash
cd kyc-app/kyc-app
firebase deploy --only functions
```

Așteaptă 5-10 minute pentru prima dată (instalează puppeteer, baileys, etc.)

### 4. Verificare

Backend URL: `https://us-central1-superparty-kyc.cloudfunctions.net/api`

```bash
curl https://us-central1-superparty-kyc.cloudfunctions.net/api/
```

Răspuns așteptat:
```json
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice (Firebase Functions)",
  "accounts": 0,
  "maxAccounts": 20,
  "activeCalls": 0,
  "whatsappEnabled": true
}
```

---

## 🔧 Actualizare Frontend

### Fișier: `kyc-app/kyc-app/.env.production`

```bash
VITE_API_URL=https://us-central1-superparty-kyc.cloudfunctions.net/api
VITE_SOCKET_URL=https://us-central1-superparty-kyc.cloudfunctions.net/api
```

### Rebuild și redeploy:

```bash
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

---

## 📞 Actualizare Twilio Webhooks

Twilio Console → Phone Numbers → +1 218 220 4425:

**Voice Configuration:**
- A CALL COMES IN: `https://us-central1-superparty-kyc.cloudfunctions.net/api/api/voice/incoming`
- METHOD: POST

**Status Callback:**
- URL: `https://us-central1-superparty-kyc.cloudfunctions.net/api/api/voice/status`
- METHOD: POST

---

## 🎯 Test Complet

### 1. Test Backend
```bash
curl https://us-central1-superparty-kyc.cloudfunctions.net/api/
```

### 2. Test WhatsApp Manager
1. Deschide: https://superparty-kyc.web.app
2. Mergi la WhatsApp Manager
3. Click "Add Account"
4. Scanează QR code
5. Verifică că se conectează

### 3. Test Voice AI
1. Sună la: +1 218 220 4425
2. Apasă 1 pentru Voice AI
3. Răspunde la întrebări
4. Verifică rezervarea în Firestore

---

## 💰 Costuri Firebase Functions

### Free Tier (Spark Plan):
- **Cost:** $0/lună
- **Limitări:**
  - 2M invocări/lună
  - 400,000 GB-seconds
  - 200,000 CPU-seconds
  - 5GB outbound networking

### Blaze Plan (Pay as you go):
- **Cost:** După free tier
  - $0.40 per million invocări
  - $0.0000025 per GB-second
  - $0.0000100 per GHz-second
  - $0.12 per GB outbound

**Estimare pentru tine:**
- ~1000 apeluri/lună Voice AI = $0.40
- ~5000 mesaje WhatsApp/lună = $2.00
- **Total: ~$2-5/lună** (mult mai ieftin decât Railway/Render)

---

## 🔥 Avantaje Firebase Functions

### vs Railway:
✅ Mai ieftin ($2-5 vs $5-10/lună)  
✅ Scalare automată (nu plătești când nu folosești)  
✅ Integrare nativă cu Firestore  
✅ Suportă dependențe grele  

### vs Render:
✅ Mai ieftin  
✅ Deja configurat (același proiect)  
✅ Nu trebuie să migrezi  
✅ Logs integrate în Firebase Console  

---

## 🐛 Troubleshooting

### Build eșuează
**Cauză:** Memorie insuficientă
**Soluție:** Crește memory în index.js:
```javascript
exports.api = onRequest({
  memory: '2GiB', // Crește la 2GB
  timeoutSeconds: 540 // Max 9 minute
}, backendApp);
```

### WhatsApp Manager nu pornește
**Cauză:** Puppeteer nu se instalează
**Soluție:** Verifică logs:
```bash
firebase functions:log
```

### Timeout la apeluri
**Cauză:** Timeout prea mic
**Soluție:** Crește timeoutSeconds la 540 (max)

---

## 📊 Monitorizare

### Firebase Console:
- Functions → Dashboard → Invocări, erori, latență
- Firestore → Database → Vezi date în timp real
- Hosting → Usage → Trafic frontend

### Logs:
```bash
firebase functions:log --only api
```

---

## ✅ Checklist Deploy

- [ ] Dependențe instalate (`npm install` în functions/)
- [ ] Secrets configurate (OpenAI, Twilio)
- [ ] Functions deployed (`firebase deploy --only functions`)
- [ ] Backend online (curl test)
- [ ] whatsappEnabled: true
- [ ] Frontend actualizat cu noul URL
- [ ] Frontend deployed (`firebase deploy --only hosting`)
- [ ] Twilio webhooks actualizate
- [ ] Test WhatsApp Manager (scanare QR)
- [ ] Test Voice AI (apel telefonic)

---

## 🎊 După Deploy

Când totul funcționează:
1. ✅ WhatsApp Manager 24/7
2. ✅ Voice AI 24/7
3. ✅ Scanare QR codes
4. ✅ 20 conturi WhatsApp
5. ✅ Rezervări automate
6. ✅ Notificări WhatsApp
7. ✅ Tot într-un singur proiect Firebase!

**Cost total: ~$2-5/lună** (vs $10-20 pe alte platforme)

---

## 🚀 Deploy Acum!

```bash
cd kyc-app/kyc-app/functions
npm install
cd ..
firebase deploy --only functions
```

Așteaptă 5-10 minute și sistemul va fi LIVE 24/7! 🎉
