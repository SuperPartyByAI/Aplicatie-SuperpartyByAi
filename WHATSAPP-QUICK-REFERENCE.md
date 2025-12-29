# ⚡ WhatsApp Integration - Quick Reference

## 🚀 Cum Rulezi (Copy-Paste)

### 1. Verifică Status
```bash
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/
```

### 2. Creează Cont WhatsApp
```bash
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"name":"SuperParty"}'
```

### 3. Așteaptă QR Code (20 secunde)
```bash
sleep 20
```

### 4. Obține QR Code
```bash
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts | jq -r '.accounts[0].qrCode'
```

### 5. Deschide QR Code în Browser
- Copiază output-ul (începe cu `data:image/png;base64,`)
- Lipește în Chrome/Edge address bar
- Apasă Enter

### 6. Scanează cu WhatsApp
- WhatsApp → Settings → Linked Devices
- "Link a Device"
- Scanează QR code-ul

### 7. Verifică Conexiunea
```bash
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts
```

Caută: `"status": "connected"`

### 8. Trimite Mesaj Test
```bash
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "PUNE_ID_AICI",
    "to": "40373805828",
    "message": "Test SuperParty!"
  }'
```

---

## 📡 API Endpoints

### Base URL
```
https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp
```

### Health Check
```bash
GET /
```

### List Accounts
```bash
GET /api/whatsapp/accounts
```

### Add Account (QR Code)
```bash
POST /api/whatsapp/add-account
Content-Type: application/json

{"name": "Account Name"}
```

### Delete Account
```bash
DELETE /api/whatsapp/accounts/:accountId
```

### Send Message
```bash
POST /api/whatsapp/send
Content-Type: application/json

{
  "accountId": "account_xxx",
  "to": "40373805828",
  "message": "Text"
}
```

---

## ⚠️ Important

### ✅ FOLOSEȘTE:
- QR codes (funcționează 100%)
- Număr fără `@s.whatsapp.net` (se adaugă automat)

### ❌ NU FOLOSI:
- Pairing codes (nu funcționează în Cloud Functions)
- Parametrul `phone` la add-account (generează pairing code invalid)

---

## 🔧 Troubleshooting

### QR Code nu apare?
```bash
# Așteaptă mai mult
sleep 30
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts
```

### "Account not connected"?
```bash
# Verifică status
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts

# Dacă status != "connected", șterge și recreează
curl -X DELETE https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts/ACCOUNT_ID

curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"name":"SuperParty"}'
```

### Sesiunea se pierde?
- Sesiunile sunt salvate în Firestore
- Auto-reconnect după restart
- Dacă nu funcționează, recreează contul

---

## 📊 Status Codes

| Status | Înțeles | Acțiune |
|--------|---------|---------|
| `connecting` | Se conectează | Așteaptă QR code |
| `qr_ready` | QR code gata | Scanează cu WhatsApp |
| `connected` | Conectat | Poți trimite mesaje |
| `reconnecting` | Reconectare | Așteaptă |
| `disconnected` | Deconectat | Recreează cont |
| `logged_out` | Delogat | Recreează cont |

---

## 🎯 Use Cases

### Trimitere Mesaj Simplu
```javascript
const response = await fetch(
  'https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/send',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'account_xxx',
      to: '40373805828',
      message: 'Salut de la SuperParty!'
    })
  }
);
```

### Trimitere Mesaje Multiple
```javascript
const messages = [
  { to: '40373805828', message: 'Mesaj 1' },
  { to: '40373805829', message: 'Mesaj 2' },
  { to: '40373805830', message: 'Mesaj 3' }
];

for (const msg of messages) {
  await fetch(
    'https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'account_xxx',
        ...msg
      })
    }
  );
  
  // Delay 2 secunde între mesaje (rate limiting)
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

### Verificare Status Înainte de Trimitere
```javascript
// 1. Verifică dacă contul e conectat
const accounts = await fetch(
  'https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts'
).then(r => r.json());

const account = accounts.accounts.find(a => a.id === 'account_xxx');

if (account?.status !== 'connected') {
  console.error('Account not connected!');
  return;
}

// 2. Trimite mesaj
await fetch(
  'https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/send',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'account_xxx',
      to: '40373805828',
      message: 'Mesaj'
    })
  }
);
```

---

## 📁 Fișiere Importante

```
functions/
├── index.js                    # Express routes
├── package.json                # Dependencies
└── whatsapp/
    ├── manager.js              # WhatsApp logic (Baileys)
    └── session-store.js        # Firestore persistence

firebase.json                   # Firebase config
.firebaserc                     # Project ID
```

---

## 🔗 Links Utile

- **Firebase Console:** https://console.firebase.google.com/project/superparty-frontend/functions
- **Baileys Docs:** https://github.com/WhiskeySockets/Baileys
- **Twilio WhatsApp:** https://www.twilio.com/whatsapp

---

## 💡 Pro Tips

1. **Salvează Account ID** după creare - îl vei folosi pentru toate operațiunile
2. **Verifică status** înainte de fiecare trimitere mesaj
3. **Respectă rate limits** - 2 secunde între mesaje
4. **Monitorizează logs** - `firebase functions:log`
5. **Backup sessions** - sunt salvate automat în Firestore

---

## ⚡ One-Liner Complete

### Setup Complet (Copy-Paste)
```bash
# Creează cont
ACCOUNT_ID=$(curl -s -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"name":"SuperParty"}' | jq -r '.account.id') && \
echo "Account ID: $ACCOUNT_ID" && \
sleep 20 && \
echo "QR Code:" && \
curl -s https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/accounts | jq -r '.accounts[0].qrCode'
```

### Trimite Mesaj (După Conectare)
```bash
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"to\":\"40373805828\",\"message\":\"Test SuperParty!\"}"
```

---

**Ultima actualizare:** 2025-12-28  
**Versiune:** 5.0.0  
**Status:** ✅ PRODUCTION READY
