# 🎉 SuperParty WhatsApp Backend

Multi-account WhatsApp manager cu Firebase persistence și real-time messaging.

## 🚀 Features

- ✅ **Multi-account WhatsApp** - Gestionează multiple conturi simultan
- ✅ **Baileys Integration** - Conexiune directă WhatsApp (fără Chromium)
- ✅ **Pairing Code Auth** - Autentificare prin cod de 8 cifre (alternativă la QR)
- ✅ **Firebase Firestore** - Persistență mesaje și chat-uri
- ✅ **Real-time Updates** - Socket.io pentru mesaje instant
- ✅ **Message Cache** - Cache în memorie pentru performance
- ✅ **Auto-reconnect** - Reconectare automată la disconnect
- ✅ **GM Mode** - Admin panel pentru gestionare conturi

## 📋 Tech Stack

**Backend:**
- Node.js 20
- Express 4.18.2
- Socket.io 4.6.1
- @whiskeysockets/baileys 6.7.8
- Firebase Admin 12.0.0

**Frontend:**
- React 18
- Vite 5
- Socket.io Client
- Firebase Hosting

**Deployment:**
- Backend: Railway
- Frontend: Firebase Hosting
- Database: Firebase Firestore

## 🔧 Setup Local

### Prerequisites

- Node.js 20+
- npm sau yarn
- Firebase project
- Railway account (pentru deploy)

### 1. Clone Repository

```bash
git clone https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi.git
cd Aplicatie-SuperpartyByAi
```

### 2. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd kyc-app/kyc-app
npm install
cd ../..
```

### 3. Configure Firebase

1. Creează Firebase project: https://console.firebase.google.com
2. Activează Firestore Database
3. Generează Service Account Key:
   - Project Settings → Service Accounts
   - Generate New Private Key
4. Salvează JSON în `.secrets/firebase-service-account.json`

### 4. Environment Variables

Creează `.env` în root:

```bash
PORT=5000
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### 5. Run Development

**Backend:**
```bash
npm run dev
# Server: http://localhost:5000
```

**Frontend:**
```bash
cd kyc-app/kyc-app
npm run dev
# App: http://localhost:5173
```

## 🚀 Deploy Production

### Backend (Railway)

1. **Create Railway Project:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Link project
   railway link
   ```

2. **Set Environment Variables:**
   ```bash
   railway variables set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
   ```

3. **Deploy:**
   ```bash
   git push origin main
   # Railway auto-deploys from main branch
   ```

### Frontend (Firebase Hosting)

1. **Install Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Deploy:**
   ```bash
   cd kyc-app/kyc-app
   npm run build
   firebase deploy --only hosting
   ```

## 📱 Usage

### 1. Add WhatsApp Account

**Option A: Pairing Code (Recomandat)**
1. Deschide app → GM Mode (doar admin)
2. Click "Adaugă Cont WhatsApp"
3. Introdu număr telefon (ex: 40737571397)
4. Copiază codul de 8 cifre
5. WhatsApp pe telefon → Linked Devices → Link with phone number
6. Introdu codul → Conectat!

**Option B: QR Code**
1. Deschide app → GM Mode
2. Click "Adaugă Cont WhatsApp"
3. Lasă câmpul telefon gol
4. Scanează QR code cu WhatsApp
5. Conectat!

### 2. Chat Clienți

1. Selectează cont WhatsApp din dropdown
2. Vezi lista clienți (auto-refresh)
3. Click pe client pentru a vedea conversația
4. Trimite mesaje direct din interfață
5. Mesajele apar instant (fără refresh manual)

### 3. GM Mode (Admin Only)

**Access:** Doar pentru `ursache.andrei1995@gmail.com`

**Features:**
- Gestionare conturi WhatsApp
- Adăugare/ștergere conturi
- Monitorizare status conexiuni
- Pairing code generation

## 🏗️ Architecture

### Backend Structure

```
src/
├── index.js                 # Express server + Socket.io
├── whatsapp/
│   ├── manager.js          # WhatsApp manager (Baileys)
│   └── manager-old.js      # Backup (whatsapp-web.js)
├── firebase/
│   └── firestore.js        # Firebase service
└── routes/
    └── whatsapp.js         # API endpoints
```

### Data Flow

```
WhatsApp → Baileys → Manager → Cache → Firestore
                              ↓
                         Socket.io → Frontend
```

### Message Cache

```javascript
// In-memory cache
chatsCache: Map<accountId, Map<chatId, chatData>>
messagesCache: Map<accountId, Map<chatId, Message[]>>

// Firestore backup
accounts/{accountId}/chats/{chatId}/messages/{messageId}
```

## 🔐 Security

**Secrets Management:**
- Firebase credentials în environment variables
- `.secrets/` folder gitignored
- `.baileys_auth/` sessions gitignored

**Firebase Security Rules:**
```javascript
// TODO: Add Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /accounts/{accountId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 📊 API Endpoints

### WhatsApp Management

**Add Account:**
```http
POST /api/whatsapp/add-account
Content-Type: application/json

{
  "accountId": "account1",
  "phoneNumber": "40737571397"  // Optional, pentru pairing code
}
```

**Get Accounts:**
```http
GET /api/whatsapp/accounts
```

**Get Clients:**
```http
GET /api/whatsapp/clients/:accountId
```

**Get Messages:**
```http
GET /api/whatsapp/messages/:accountId/:clientId
```

**Send Message:**
```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
  "accountId": "account1",
  "to": "40123456789@s.whatsapp.net",
  "message": "Hello!"
}
```

### Socket.io Events

**Client → Server:**
- `connect` - Conectare client
- `disconnect` - Deconectare client

**Server → Client:**
- `whatsapp:qr` - QR code generat
- `whatsapp:pairing_code` - Pairing code generat
- `whatsapp:ready` - Cont conectat
- `whatsapp:message` - Mesaj nou primit
- `whatsapp:disconnected` - Cont deconectat

## 🐛 Troubleshooting

### Backend nu pornește

**Error:** `Cannot find module '@whiskeysockets/baileys'`

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Mesaje nu apar

**Check:**
1. Socket.io connection: `socket.connected` în console
2. Firebase credentials: Verifică `FIREBASE_SERVICE_ACCOUNT`
3. Cache: Verifică `chatsCache` și `messagesCache` în logs

**Fix:**
```bash
# Restart backend
railway restart

# Clear cache
rm -rf .baileys_auth/
```

### Pairing code nu funcționează

**Check:**
1. Număr telefon format corect: `40737571397` (fără +)
2. WhatsApp versiune latest
3. Internet connection stabil

**Fix:**
```bash
# Regenerate pairing code
# Delete account și adaugă din nou
```

### Railway deployment fails

**Error:** `Node version mismatch`

**Fix:**
```dockerfile
# Dockerfile
FROM node:20-slim  # NOT node:18
```

**Error:** `Firebase credentials invalid`

**Fix:**
```bash
# Railway dashboard → Variables
# Set FIREBASE_SERVICE_ACCOUNT cu JSON complet
```

## 📚 Documentation

- [Session Report 2024-12-27](SESSION-REPORT-2024-12-27.md) - Implementare Baileys + Firebase
- [Session Report 2024-12-26](SESSION-REPORT-2024-12-26.md) - Setup inițial
- [Deploy Backend Railway](DEPLOY_BACKEND_RAILWAY.md) - Ghid deploy Railway
- [Chat Clienți Guide](CHAT-CLIENTI-GUIDE.md) - Utilizare Chat Clienți

## 🎯 Roadmap

### ✅ Completed
- [x] Baileys integration (fără Chromium)
- [x] Pairing code authentication
- [x] Firebase Firestore persistence
- [x] Real-time messaging (Socket.io)
- [x] Message cache
- [x] Auto-reconnect
- [x] GM Mode (admin panel)

### 🚧 In Progress
- [ ] Load mesaje vechi din Firestore
- [ ] Pagination pentru mesaje (100+)
- [ ] Search în conversații

### 📋 Planned
- [ ] Voice AI integration (Twilio + OpenAI)
- [ ] Call masking (proxy numbers)
- [ ] Transcription + AI Analysis
- [ ] Analytics dashboard
- [ ] Export conversații (PDF, CSV)
- [ ] Tags pentru clienți
- [ ] Automated responses

## 🤝 Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 📞 Support

**Developer:** Ona AI  
**Contact:** ursache.andrei1995@gmail.com  
**Repository:** https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi

---

**Made with ❤️ by SuperParty Team**