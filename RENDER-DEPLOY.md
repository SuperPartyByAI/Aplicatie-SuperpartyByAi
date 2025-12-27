# Deploy pe Render.com - WhatsApp Manager + Voice AI

## 🎯 De ce Render în loc de Railway?

**Railway:**
- ❌ Nu poate instala puppeteer/baileys (timeout)
- ❌ Build eșuează cu dependențe grele
- ✅ Voice AI funcționează

**Render:**
- ✅ Suportă dependențe grele (puppeteer, baileys)
- ✅ Build mai lung permis (15+ minute)
- ✅ WhatsApp Manager + Voice AI împreună
- ✅ FREE tier disponibil (750 ore/lună)

---

## 📋 Pași pentru Deploy pe Render

### 1. Creează cont Render

1. Accesează: https://render.com
2. Sign up cu GitHub
3. Autorizează accesul la repository

### 2. Creează Web Service

1. Dashboard → **New +** → **Web Service**
2. Conectează repository: `SuperPartyByAI/Aplicatie-SuperpartyByAi`
3. Configurare:
   - **Name:** `superparty-backend`
   - **Region:** Frankfurt (EU Central)
   - **Branch:** `main`
   - **Root Directory:** (leave empty)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Instance Type:** Free (sau Starter $7/month pentru mai multă memorie)

### 3. Environment Variables

Adaugă în Render Dashboard → Environment:

```bash
# Firebase
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# Twilio Voice
TWILIO_ACCOUNT_SID=AC8e0f5e8e0f5e8e0f5e8e0f5e8e0f5e8e
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+12182204425
TWILIO_API_KEY=SKxxxxx
TWILIO_API_SECRET=xxxxx
TWILIO_TWIML_APP_SID=APxxxxx

# OpenAI
OPENAI_API_KEY=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

# Backend URL (după deploy, actualizează cu URL-ul Render)
BACKEND_URL=https://superparty-backend.onrender.com

# Twilio WhatsApp (opțional)
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Port (Render setează automat)
PORT=10000
```

### 4. Deploy

1. Click **Create Web Service**
2. Așteaptă build (~10-15 minute pentru prima dată)
3. Verifică logs pentru erori

---

## ✅ Verificare după Deploy

### 1. Backend Status
```bash
curl https://superparty-backend.onrender.com/
```

Răspuns așteptat:
```json
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice",
  "accounts": 0,
  "maxAccounts": 20,
  "activeCalls": 0,
  "whatsappEnabled": true  ← TREBUIE SĂ FIE TRUE!
}
```

### 2. WhatsApp Accounts
```bash
curl https://superparty-backend.onrender.com/api/accounts
```

Răspuns așteptat:
```json
{
  "success": true,
  "accounts": []
}
```

### 3. Voice AI
```bash
curl https://superparty-backend.onrender.com/api/voice/calls/stats
```

---

## 🔧 Configurare Frontend

După deploy, actualizează frontend-ul să folosească noul URL:

### Fișier: `kyc-app/kyc-app/.env.production`
```bash
VITE_API_URL=https://superparty-backend.onrender.com
VITE_SOCKET_URL=https://superparty-backend.onrender.com
```

### Rebuild și redeploy frontend:
```bash
cd kyc-app/kyc-app
npm run build
firebase deploy --only hosting
```

---

## 📞 Actualizare Twilio Webhooks

Twilio Console → Phone Numbers → +1 218 220 4425:

**Voice Configuration:**
- A CALL COMES IN: `https://superparty-backend.onrender.com/api/voice/incoming`
- METHOD: POST

**Status Callback:**
- URL: `https://superparty-backend.onrender.com/api/voice/status`
- METHOD: POST

---

## 🎯 Test Complet

### 1. Test WhatsApp Manager
1. Deschide: https://superparty-kyc.web.app
2. Mergi la WhatsApp Manager
3. Click "Add Account"
4. Scanează QR code
5. Verifică că se conectează

### 2. Test Voice AI
1. Sună la: +1 218 220 4425
2. Apasă 1 pentru Voice AI
3. Răspunde la întrebări
4. Verifică rezervarea în Firestore

---

## 💰 Costuri Render

### Free Tier:
- **Cost:** $0/lună
- **Limitări:**
  - 750 ore/lună (suficient pentru 24/7)
  - Se oprește după 15 min inactivitate
  - Pornește automat la request (delay 30-60s)
  - 512MB RAM

### Starter Tier ($7/lună):
- **Cost:** $7/lună
- **Avantaje:**
  - Rulează 24/7 fără oprire
  - 512MB RAM
  - Fără delay la pornire
  - **RECOMANDAT pentru producție**

### Standard Tier ($25/lună):
- 2GB RAM
- Pentru trafic mare

---

## 🐛 Troubleshooting

### Build eșuează
**Cauză:** Memorie insuficientă
**Soluție:** Upgrade la Starter tier ($7/month)

### WhatsApp Manager nu pornește
**Cauză:** Chromium lipsește
**Soluție:** Render instalează automat - verifică logs

### Service se oprește
**Cauză:** Free tier - inactivitate 15 min
**Soluție:** Upgrade la Starter tier sau folosește cron job pentru ping

---

## 🔄 Migrare de la Railway

### Opțiunea A: Păstrează ambele
- **Railway:** Voice AI (funcționează deja)
- **Render:** WhatsApp Manager
- Două servere separate

### Opțiunea B: Totul pe Render (RECOMANDAT)
- Mutăm tot pe Render
- Un singur server
- Mai simplu de gestionat

---

## ✅ Checklist Deploy

- [ ] Cont Render creat
- [ ] Web Service creat
- [ ] Environment variables adăugate
- [ ] Build reușit (verifică logs)
- [ ] Backend online (curl test)
- [ ] whatsappEnabled: true
- [ ] Frontend actualizat cu noul URL
- [ ] Twilio webhooks actualizate
- [ ] Test WhatsApp Manager (scanare QR)
- [ ] Test Voice AI (apel telefonic)

---

## 📞 Suport

Dacă întâmpini probleme:
- **Render Docs:** https://render.com/docs
- **Render Support:** https://render.com/support
- **Community:** https://community.render.com

---

## 🎊 După Deploy

Când totul funcționează:
1. ✅ WhatsApp Manager 24/7
2. ✅ Voice AI 24/7
3. ✅ Scanare QR codes
4. ✅ 20 conturi WhatsApp
5. ✅ Rezervări automate
6. ✅ Notificări WhatsApp

**Sistemul va fi COMPLET FUNCȚIONAL 24/7!** 🚀
