# Firebase Login pentru Gitpod

## 🔐 Problema

Firebase CLI nu poate face login interactiv în Gitpod. Trebuie să folosim un token.

---

## 📋 Soluție: Generează Token

### Opțiunea 1: Pe computerul tău local

1. **Deschide terminal local** (pe computerul tău, nu în Gitpod)

2. **Instalează Firebase CLI** (dacă nu e deja):
```bash
npm install -g firebase-tools
```

3. **Generează token**:
```bash
firebase login:ci
```

4. **Copiază token-ul** care apare (începe cu `1//...`)

5. **Setează în Gitpod**:
```bash
# În Gitpod terminal:
export FIREBASE_TOKEN="1//your-token-here"
firebase projects:list
```

---

### Opțiunea 2: Folosește Firebase Console direct

Dacă nu vrei să instalezi Firebase CLI local, poți face deploy direct din Firebase Console:

1. **Mergi la Firebase Console**: https://console.firebase.google.com
2. **Selectează proiectul**: superparty-kyc
3. **Functions** → **Dashboard**
4. **Upload ZIP** cu codul

Dar e mai complicat - recomand Opțiunea 1.

---

## 🚀 După ce ai token-ul

### 1. Setează token în Gitpod:
```bash
export FIREBASE_TOKEN="1//your-token-here"
```

### 2. Verifică că merge:
```bash
cd /workspaces/Aplicatie-SuperpartyByAi/kyc-app/kyc-app
firebase projects:list
```

Ar trebui să vezi:
```
┌──────────────────┬────────────────┬────────────────┬──────────────────────┐
│ Project Display  │ Project ID     │ Project Number │ Resource Location ID │
│ Name             │                │                │                      │
├──────────────────┼────────────────┼────────────────┼──────────────────────┤
│ SuperParty KYC   │ superparty-kyc │ ...            │ ...                  │
└──────────────────┴────────────────┴────────────────┴──────────────────────┘
```

### 3. Setează secrets:
```bash
firebase functions:secrets:set OPENAI_API_KEY
# Paste: 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

firebase functions:secrets:set TWILIO_ACCOUNT_SID
# Paste: AC8e0f5e8e0f5e8e0f5e8e0f5e8e0f5e8e

firebase functions:secrets:set TWILIO_AUTH_TOKEN
# Paste: your_auth_token

firebase functions:secrets:set TWILIO_PHONE_NUMBER
# Paste: +12182204425

firebase functions:secrets:set TWILIO_API_KEY
# Paste: SKxxxxx

firebase functions:secrets:set TWILIO_API_SECRET
# Paste: xxxxx

firebase functions:secrets:set TWILIO_TWIML_APP_SID
# Paste: APxxxxx
```

### 4. Deploy:
```bash
firebase deploy --only functions
```

---

## 🎯 Alternativă: Deploy din computerul tău local

Dacă Gitpod e complicat, poți face deploy de pe computerul tău:

### 1. Clone repository:
```bash
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi/kyc-app/kyc-app
```

### 2. Instalează dependențe:
```bash
cd functions
npm install
cd ..
```

### 3. Login Firebase:
```bash
firebase login
```

### 4. Setează secrets (vezi mai sus)

### 5. Deploy:
```bash
firebase deploy --only functions
```

---

## ✅ După Deploy

Verifică că merge:
```bash
curl https://us-central1-superparty-kyc.cloudfunctions.net/api/
```

Ar trebui să vezi:
```json
{
  "status": "online",
  "whatsappEnabled": true
}
```

---

## 💡 Recomandare

**Cea mai simplă metodă:**
1. Generează token pe computerul tău local: `firebase login:ci`
2. Setează în Gitpod: `export FIREBASE_TOKEN="..."`
3. Deploy din Gitpod

Sau:
1. Clone repo pe computerul tău
2. Deploy de acolo (mai simplu, fără token)

**Ce preferi?**
