# GitHub Secrets Setup pentru Deploy Automat

## 🎯 Ce trebuie să faci

Adaugă secrets în GitHub Repository pentru ca GitHub Actions să poată face deploy automat.

---

## 📋 Pași

### 1. Mergi la GitHub Repository Settings

1. Deschide: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi
2. Click pe **Settings** (tab-ul din dreapta sus)
3. În sidebar stânga, click pe **Secrets and variables** → **Actions**
4. Click pe **New repository secret**

---

### 2. Adaugă Secrets (unul câte unul)

#### Secret 1: OPENAI_API_KEY
- **Name:** `OPENAI_API_KEY`
- **Value:** 
```
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
```
- Click **Add secret**

#### Secret 2: TWILIO_ACCOUNT_SID
- **Name:** `TWILIO_ACCOUNT_SID`
- **Value:** `AC8e0f5e8e0f5e8e0f5e8e0f5e8e0f5e8e` (din Twilio Console)
- Click **Add secret**

#### Secret 3: TWILIO_AUTH_TOKEN
- **Name:** `TWILIO_AUTH_TOKEN`
- **Value:** (găsești în Twilio Console → Account → API Keys & Tokens)
- Click **Add secret**

#### Secret 4: TWILIO_PHONE_NUMBER
- **Name:** `TWILIO_PHONE_NUMBER`
- **Value:** `+12182204425`
- Click **Add secret**

#### Secret 5: TWILIO_API_KEY
- **Name:** `TWILIO_API_KEY`
- **Value:** `SKxxxxx` (din Twilio Console)
- Click **Add secret**

#### Secret 6: TWILIO_API_SECRET
- **Name:** `TWILIO_API_SECRET`
- **Value:** (secret-ul pentru API Key)
- Click **Add secret**

#### Secret 7: TWILIO_TWIML_APP_SID
- **Name:** `TWILIO_TWIML_APP_SID`
- **Value:** `APxxxxx` (din Twilio Console)
- Click **Add secret**

#### Secret 8: TWILIO_WHATSAPP_NUMBER (opțional)
- **Name:** `TWILIO_WHATSAPP_NUMBER`
- **Value:** `whatsapp:+14155238886`
- Click **Add secret**

---

### 3. Verifică că toate secrets sunt adăugate

După ce adaugi toate, ar trebui să vezi în listă:
- ✅ FIREBASE_SERVICE_ACCOUNT_SUPERPARTY_FRONTEND (deja există)
- ✅ OPENAI_API_KEY
- ✅ TWILIO_ACCOUNT_SID
- ✅ TWILIO_AUTH_TOKEN
- ✅ TWILIO_PHONE_NUMBER
- ✅ TWILIO_API_KEY
- ✅ TWILIO_API_SECRET
- ✅ TWILIO_TWIML_APP_SID
- ✅ TWILIO_WHATSAPP_NUMBER

---

### 4. Trigger Deploy

După ce adaugi toate secrets, GitHub Actions va face deploy automat la următorul push.

Sau poți forța deploy acum:

```bash
cd /workspaces/Aplicatie-SuperpartyByAi
git commit --allow-empty -m "Trigger deploy with all secrets configured"
git push origin main
```

---

### 5. Monitorizează Deploy

1. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions
2. Vei vedea workflow-ul "Deploy Frontend to Firebase" rulând
3. Click pe el pentru a vedea logs
4. Așteaptă ~10-15 minute (prima dată durează mai mult - instalează puppeteer, baileys)

---

### 6. Verifică că merge

După ce deploy-ul e SUCCESS:

```bash
curl https://us-central1-superparty-frontend.cloudfunctions.net/api/
```

Ar trebui să vezi:
```json
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice (Firebase Functions)",
  "whatsappEnabled": true
}
```

---

## 🎯 După Deploy

### 1. Actualizează Frontend

Creează `.env.production` în `kyc-app/kyc-app/`:
```bash
VITE_API_URL=https://us-central1-superparty-frontend.cloudfunctions.net/api
VITE_SOCKET_URL=https://us-central1-superparty-frontend.cloudfunctions.net/api
```

Apoi push (GitHub Actions va face rebuild automat):
```bash
git add kyc-app/kyc-app/.env.production
git commit -m "Update frontend to use Firebase Functions backend"
git push origin main
```

### 2. Actualizează Twilio Webhooks

Mergi la: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming

Găsește numărul: **+1 218 220 4425**

**Voice Configuration:**
- A CALL COMES IN: `https://us-central1-superparty-frontend.cloudfunctions.net/api/api/voice/incoming`
- METHOD: POST

**Status Callback:**
- URL: `https://us-central1-superparty-frontend.cloudfunctions.net/api/api/voice/status`
- METHOD: POST

Click **Save**

---

## ✅ Test Final

### 1. Test Backend
```bash
curl https://us-central1-superparty-frontend.cloudfunctions.net/api/
```

### 2. Test WhatsApp Manager
1. Deschide: https://superparty-frontend.web.app
2. Mergi la WhatsApp Manager
3. Click "Add Account"
4. Scanează QR code
5. ✅ Ar trebui să funcționeze!

### 3. Test Voice AI
1. Sună la: +1 218 220 4425
2. Apasă 1 pentru Voice AI
3. Răspunde la întrebări
4. ✅ Ar trebui să funcționeze!

---

## 🎊 Gata!

După ce adaugi secrets și GitHub Actions face deploy:
- ✅ WhatsApp Manager 24/7
- ✅ Voice AI 24/7
- ✅ Deploy automat la fiecare push
- ✅ Cost: $2-5/lună

**Sistemul va fi COMPLET FUNCȚIONAL 24/7!** 🚀
