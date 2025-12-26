# 🚀 SuperParty WhatsApp Backend

Backend Node.js pentru gestionarea a 20 conturi WhatsApp simultan.

## 📋 Features

- ✅ 20 conturi WhatsApp simultan
- ✅ API REST pentru toate operațiunile
- ✅ WebSocket pentru real-time updates
- ✅ Sesiuni persistente (QR code o singură dată)
- ✅ Notificări real-time
- ✅ Gestionare conversații

---

## 🚂 Deploy pe Railway (3 minute)

### Pasul 1: Login
1. Mergi pe [railway.app](https://railway.app)
2. Click **"Login with GitHub"**
3. Autorizează Railway

### Pasul 2: New Project
1. Click **"New Project"**
2. Selectează **"Deploy from GitHub repo"**
3. Caută și selectează **`Aplicatie-SuperpartyByAi`**
4. Selectează folderul **`/backend`** (important!)

### Pasul 3: Configure
Railway va detecta automat:
- ✅ `package.json`
- ✅ `railway.json`
- ✅ Node.js environment

Click **"Deploy"** și gata! ✅

### Pasul 4: Get URL
După deploy (2-3 minute):
1. Click pe proiect
2. Settings → **Generate Domain**
3. Copiază URL-ul (ex: `https://your-app.railway.app`)

---

## 📡 API Endpoints

### Base URL
```
https://your-app.railway.app
```

### Health Check
```http
GET /
```

Response:
```json
{
  "status": "online",
  "service": "SuperParty WhatsApp Backend",
  "accounts": 2,
  "maxAccounts": 20
}
```

### Get All Accounts
```http
GET /api/accounts
```

### Add Account
```http
POST /api/accounts/add
Content-Type: application/json

{
  "name": "WhatsApp 1"
}
```

### Remove Account
```http
DELETE /api/accounts/:accountId
```

### Get Chats
```http
GET /api/accounts/:accountId/chats
```

### Get Messages
```http
GET /api/accounts/:accountId/chats/:chatId/messages?limit=50
```

### Send Message
```http
POST /api/accounts/:accountId/send
Content-Type: application/json

{
  "chatId": "40712345678@c.us",
  "message": "Hello!"
}
```

---

## 🔌 WebSocket Events

### Connect
```javascript
const socket = io('https://your-app.railway.app');
```

### Events (Server → Client)

**QR Code:**
```javascript
socket.on('whatsapp:qr', (data) => {
  // data: { accountId, qrCode }
  // Display QR code for scanning
});
```

**Account Ready:**
```javascript
socket.on('whatsapp:ready', (data) => {
  // data: { accountId, phone, info }
  // Account connected successfully
});
```

**New Message:**
```javascript
socket.on('whatsapp:message', (data) => {
  // data: { accountId, message }
  // New message received
});
```

**Account Disconnected:**
```javascript
socket.on('whatsapp:disconnected', (data) => {
  // data: { accountId, reason }
});
```

---

## 🔧 Local Development

### Install Dependencies
```bash
cd backend
npm install
```

### Run Server
```bash
npm start
```

Server runs on `http://localhost:5000`

### Dev Mode (auto-restart)
```bash
npm run dev
```

---

## 📊 Flow Complet

### 1. Adaugă Cont WhatsApp
```
Frontend → POST /api/accounts/add
         ↓
Backend creează client WhatsApp
         ↓
Backend emit 'whatsapp:qr' cu QR code
         ↓
Frontend afișează QR code
         ↓
User scanează cu telefon
         ↓
Backend emit 'whatsapp:ready'
         ↓
Cont conectat! ✅
```

### 2. Trimite Mesaj
```
Frontend → POST /api/accounts/:id/send
         ↓
Backend trimite mesaj prin WhatsApp
         ↓
Success! ✅
```

### 3. Primește Mesaj
```
WhatsApp → Backend primește mesaj
         ↓
Backend emit 'whatsapp:message'
         ↓
Frontend primește notificare real-time
         ↓
Afișează mesaj! ✅
```

---

## 🛡️ Security

- ✅ CORS configurat
- ✅ Sesiuni salvate local (nu în cloud)
- ✅ Graceful shutdown
- ✅ Error handling

---

## 📝 Environment Variables

Railway setează automat:
- `PORT` - Port-ul serverului

Opțional (pentru viitor):
- `OPENAI_API_KEY` - Pentru AI
- `TWILIO_*` - Pentru telefonie

---

## 🐛 Troubleshooting

### QR Code nu apare
- Verifică că backend-ul rulează
- Așteaptă 30-60 secunde (prima dată durează)
- Check logs în Railway

### Account nu se conectează
- Verifică că ai < 5 dispozitive conectate pe WhatsApp
- Șterge contul și adaugă din nou
- Check Railway logs

### Railway logs
```bash
# În Railway dashboard
Click pe proiect → View Logs
```

---

## 📚 Next Steps

După deploy:
1. ✅ Testează API cu Postman/curl
2. ✅ Integrează în frontend (Firebase)
3. ✅ Adaugă primul cont WhatsApp
4. ✅ Testează trimitere/primire mesaje

---

**🎉 Backend gata de folosit!**

URL-ul tău Railway: `https://your-app.railway.app`

Integrează-l în frontend și gata! ✅
