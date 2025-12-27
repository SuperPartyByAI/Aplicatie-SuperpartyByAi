# 📞 Voice Call System - Setup Guide

## ✅ Status: Implementat (Fără Voice AI)

**Data:** 2024-12-27  
**Versiune:** 1.0 - Basic Call Reception

---

## 🎯 Ce Am Implementat

### Features Disponibile:

✅ **Primire apeluri în aplicație**
- Webhook Twilio pentru apeluri inbound
- Notificări real-time via Socket.io
- UI modal pentru apeluri incoming
- Panel apeluri active
- Call logs în Firestore

❌ **NU am implementat (deocamdată):**
- Voice AI (OpenAI Realtime)
- Transcription (Deepgram)
- Call masking
- Outbound calls
- IVR menu

---

## 📁 Structură Cod

```
backend/src/
├── voice/
│   ├── twilio-handler.js      # Webhook handler + call management
│   └── call-storage.js         # Firestore persistence
└── index.js                    # API routes + Socket.io events

src/components/
└── incoming-call-modal.html    # UI component pentru apeluri

backend/
└── test-call.js                # Script de testare
```

---

## 🔧 Setup Twilio

### 1. Creează Cont Twilio

1. Mergi la [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Înregistrează-te (primești **$15 credit gratis**)
3. Verifică email + telefon

### 2. Cumpără Număr Telefon

1. Du-te la **Phone Numbers** → **Buy a number**
2. Selectează **Romania (+40)**
3. Filtrează: **Voice** capabilities
4. Alege un număr (cost: **$2/lună**)
5. Cumpără numărul

### 3. Configurează Webhook

1. Du-te la **Phone Numbers** → **Manage** → **Active numbers**
2. Click pe numărul tău
3. Scroll la **Voice Configuration**
4. Setează:
   - **A CALL COMES IN**: Webhook
   - **URL**: `https://your-backend.railway.app/api/voice/incoming`
   - **HTTP**: POST
5. Setează:
   - **CALL STATUS CHANGES**: Webhook
   - **URL**: `https://your-backend.railway.app/api/voice/status`
   - **HTTP**: POST
6. Save

### 4. Obține Credentials

1. Du-te la **Account** → **API keys & tokens**
2. Copiază:
   - **Account SID**: `ACxxxxxxxxxxxxx`
   - **Auth Token**: `xxxxxxxxxxxxx`

---

## 🔐 Environment Variables

### Backend (.env)

Adaugă în `backend/.env`:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+40xxxxxxxxx

# Existing variables
PORT=5000
FIREBASE_PROJECT_ID=superparty-frontend
# ... rest of Firebase config
```

### Railway Deployment

1. Du-te la Railway dashboard
2. Selectează backend service
3. **Variables** tab
4. Adaugă:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
5. Redeploy

---

## 🚀 Deployment

### 1. Deploy Backend

```bash
# Commit changes
git add .
git commit -m "Add voice call system - inbound only"
git push origin main

# Railway auto-deploy
```

### 2. Verifică Deployment

```bash
# Check health
curl https://your-backend.railway.app/

# Should return:
{
  "status": "online",
  "service": "SuperParty Backend - WhatsApp + Voice",
  "accounts": 0,
  "maxAccounts": 20,
  "activeCalls": 0
}
```

### 3. Update Twilio Webhook

Asigură-te că webhook URL-ul din Twilio folosește URL-ul Railway:
```
https://aplicatie-superpartybyai-production.up.railway.app/api/voice/incoming
```

---

## 🧪 Testare

### Test 1: Simulare Webhook (Local)

```bash
# Start backend local
cd backend
npm start

# În alt terminal, rulează test
node test-call.js
```

**Output așteptat:**
```
🧪 Testing incoming call flow...

📞 Simulating incoming call:
{
  "CallSid": "CAxxxxxxxxxx",
  "From": "+40737571397",
  "To": "+40123456789",
  "CallStatus": "ringing"
}

✅ Webhook response received:
Status: 200
Content-Type: text/xml

TwiML Response:
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Cristiano" language="ro-RO">
    Vă rugăm așteptați, vă conectăm cu un operator.
  </Say>
  <Pause length="30"/>
  <Say voice="Polly.Cristiano" language="ro-RO">
    Ne pare rău, toți operatorii sunt ocupați...
  </Say>
  <Hangup/>
</Response>

📊 Active calls: 1
✅ Test completed successfully!
```

### Test 2: Apel Real

1. **Sună numărul Twilio** din telefonul tău
2. **Verifică dashboard** - ar trebui să apară modal cu apel incoming
3. **Răspunde sau respinge** apelul din UI
4. **Verifică Firestore** - collection `calls` ar trebui să conțină record-ul

### Test 3: Socket.io Events

Deschide browser console în dashboard:

```javascript
// Should see:
📞 Incoming call: { callId: "CAxxxx", from: "+40...", ... }
```

---

## 📊 API Endpoints

### Voice Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/voice/incoming` | Twilio webhook - incoming call |
| POST | `/api/voice/status` | Twilio webhook - call status |
| GET | `/api/voice/calls` | Get active calls |
| GET | `/api/voice/calls/recent` | Get recent calls (last 100) |
| GET | `/api/voice/calls/stats` | Get call statistics |
| POST | `/api/voice/calls/:callId/answer` | Answer call |
| POST | `/api/voice/calls/:callId/reject` | Reject call |

### Examples

**Get active calls:**
```bash
curl https://your-backend.railway.app/api/voice/calls
```

**Get recent calls:**
```bash
curl https://your-backend.railway.app/api/voice/calls/recent?limit=50
```

**Get call stats (last 7 days):**
```bash
curl https://your-backend.railway.app/api/voice/calls/stats
```

**Answer call:**
```bash
curl -X POST https://your-backend.railway.app/api/voice/calls/CAxxxx/answer \
  -H "Content-Type: application/json" \
  -d '{"operatorId": "operator-1"}'
```

---

## 🔥 Firestore Collections

### Collection: `calls`

**Document ID:** `{CallSid}`

**Schema:**
```javascript
{
  callId: "CAxxxxxxxxxx",           // Twilio Call SID
  from: "+40737571397",             // Caller number
  to: "+40123456789",               // Your Twilio number
  direction: "inbound",             // inbound | outbound
  status: "ringing",                // ringing | in-progress | completed | failed | rejected
  duration: 0,                      // Call duration in seconds
  answeredBy: "operator-1",         // Operator ID (if answered)
  answeredAt: "2024-12-27T...",     // Timestamp
  rejectedReason: "busy",           // Reason (if rejected)
  createdAt: Timestamp,             // Firestore timestamp
  updatedAt: Timestamp              // Firestore timestamp
}
```

### Firestore Rules

Adaugă în `firestore.rules`:

```javascript
match /calls/{callId} {
  // Allow read for authenticated users
  allow read: if request.auth != null;
  
  // Allow write only from backend (service account)
  allow write: if false;
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## 🎨 Frontend Integration

### 1. Include Component

Adaugă în `dashboard.html` (înainte de `</body>`):

```html
<!-- Include incoming call modal -->
<script>
  fetch('/src/components/incoming-call-modal.html')
    .then(response => response.text())
    .then(html => {
      document.body.insertAdjacentHTML('beforeend', html);
    });
</script>
```

### 2. Initialize Socket.io

Asigură-te că ai Socket.io client:

```html
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
<script>
  // Connect to backend
  const socket = io('https://your-backend.railway.app');
  window.socket = socket; // Make available globally
  
  socket.on('connect', () => {
    console.log('✅ Connected to backend');
  });
</script>
```

### 3. Add Call Button (Optional)

Adaugă buton în sidebar pentru a vedea apeluri active:

```html
<button onclick="toggleActiveCallsPanel()" style="position: relative;">
  📞 Apeluri
  <span class="call-notification-badge" id="callBadge" style="display: none;">0</span>
</button>
```

---

## 📱 User Flow

### Apel Incoming:

1. **Client sună** numărul Twilio
2. **Twilio trimite webhook** la backend
3. **Backend salvează** call în Firestore
4. **Backend emite** Socket.io event `call:incoming`
5. **Frontend primește** event și afișează modal
6. **Operator răspunde/respinge** din UI
7. **Backend actualizează** status în Firestore
8. **Twilio primește** TwiML response

### TwiML Response:

Când primești apel, Twilio execută:
1. **Say** - "Vă rugăm așteptați..."
2. **Pause** - 30 secunde (timp pentru operator să răspundă)
3. **Say** - "Ne pare rău, toți operatorii sunt ocupați..."
4. **Hangup** - Închide apelul

---

## 💰 Cost Estimat

### Twilio Pricing (România):

| Item | Cost |
|------|------|
| Număr telefon | $2/lună |
| Inbound call | $0.01/minut |
| Outbound call | $0.02/minut (nu e implementat) |

### Exemplu (100 apeluri/lună):

- Număr: $2
- 100 apeluri × 3 min × $0.01 = $3
- **Total: $5/lună**

### Free Trial:

- $15 credit gratis
- Suficient pentru ~500 minute de apeluri
- Perfect pentru testing

---

## 🔍 Troubleshooting

### Problema 1: Webhook nu funcționează

**Simptome:**
- Apeluri nu apar în dashboard
- Twilio returnează eroare

**Soluții:**
1. Verifică URL webhook în Twilio console
2. Verifică că backend e deployed și rulează
3. Check logs Railway: `railway logs`
4. Test webhook manual cu `curl`

### Problema 2: Socket.io nu conectează

**Simptome:**
- Console error: "WebSocket connection failed"
- Apeluri nu apar în real-time

**Soluții:**
1. Verifică că Socket.io client e inclus
2. Verifică URL backend în `io()` call
3. Check CORS settings în backend
4. Verifică firewall/network

### Problema 3: Firestore permission denied

**Simptome:**
- Error: "Missing or insufficient permissions"

**Soluții:**
1. Verifică Firestore rules
2. Verifică că Firebase Admin SDK e inițializat
3. Check service account credentials

### Problema 4: TwiML invalid

**Simptome:**
- Twilio error: "Invalid TwiML"

**Soluții:**
1. Verifică că response e `text/xml`
2. Verifică sintaxa TwiML
3. Test cu Twilio TwiML validator

---

## 🚀 Next Steps (Viitor)

### Phase 2: Voice AI (Opțional)

Când vrei să adaugi Voice AI:

1. **OpenAI Realtime API**
   - Conversații naturale
   - Suport română
   - Cost: ~$0.30/minut

2. **Deepgram Transcription**
   - Real-time transcription
   - Cost: ~$0.004/minut

3. **Call Masking**
   - Privacy complet
   - Proxy numbers

**Estimat timp:** 2-3 săptămâni  
**Cost adițional:** ~$100/lună pentru 100 apeluri

---

## 📚 Resurse

**Twilio:**
- [Voice Quickstart](https://www.twilio.com/docs/voice/quickstart)
- [TwiML Reference](https://www.twilio.com/docs/voice/twiml)
- [Webhooks Guide](https://www.twilio.com/docs/usage/webhooks)

**Firebase:**
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

**Socket.io:**
- [Client API](https://socket.io/docs/v4/client-api/)
- [Emit cheatsheet](https://socket.io/docs/v4/emit-cheatsheet/)

---

## ✅ Checklist Setup

- [ ] Cont Twilio creat
- [ ] Număr telefon cumpărat
- [ ] Webhook configurat în Twilio
- [ ] Environment variables setate
- [ ] Backend deployed pe Railway
- [ ] Firestore rules actualizate
- [ ] Frontend component inclus
- [ ] Socket.io conectat
- [ ] Test apel efectuat
- [ ] Call logs verificate în Firestore

---

## 🎉 Concluzie

**Status:** ✅ Sistem funcțional pentru primire apeluri

**Ce poți face acum:**
- Primești apeluri în aplicație
- Notificări real-time
- Răspunzi/respingi din UI
- Vezi istoric apeluri
- Statistici apeluri

**Ce NU poți face (încă):**
- Voice AI automat
- Transcription
- Call masking
- Apeluri outbound

**Când vrei Voice AI → Ping me și continuăm cu Phase 2! 🚀**

---

**Created:** 2024-12-27  
**Author:** Ona AI  
**Version:** 1.0
