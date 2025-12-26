# Chat Clienți - Documentație

## Prezentare Generală

Sistem de chat multi-cont WhatsApp pentru gestionarea conversațiilor cu clienții. Permite conectarea a până la 20 conturi WhatsApp și organizarea clienților în 3 categorii.

## Arhitectură

### Backend (Railway)
- **Tehnologie**: Node.js + Express + Socket.IO + whatsapp-web.js
- **URL**: `https://aplicatie-superpartybyai-production.up.railway.app`
- **Port**: 5000
- **Max conturi**: 20 WhatsApp accounts

### Frontend (Firebase Hosting)
- **Tehnologie**: React + Vite
- **Componente principale**:
  - `ChatClientiScreen.jsx` - Ecran principal pentru Admin
  - `ChatClienti.jsx` - Componentă pentru Animator
  - `WhatsAppAccountManager.jsx` - Gestionare conturi pentru GM

## Funcționalități

### 1. Modul Admin (ChatClientiScreen)
Acces: Doar pentru `ursache.andrei1995@gmail.com`

**Caracteristici**:
- 3 tabs pentru organizarea clienților:
  - ✅ **Disponibili** - Clienți activi, disponibili pentru rezervări
  - ⏳ **În Rezervare** - Clienți în proces de rezervare
  - ❌ **Pierduți** - Clienți care nu mai sunt interesați

- **Funcții**:
  - Vizualizare listă clienți cu search
  - Chat în timp real cu clienți
  - Mutare clienți între categorii
  - Notificări pentru mesaje noi

**Acces**: `/chat-clienti`

### 2. Modul Animator (ChatClienti)
Acces: Toți utilizatorii autentificați

**Caracteristici**:
- Vizualizare listă clienți
- Chat simplu cu clienți
- Notificări pentru mesaje noi

**Acces**: Buton "💬 Chat Clienți" în Dashboard

### 3. Modul GM (WhatsAppAccountManager)
Acces: Game Master mode

**Caracteristici**:
- Adăugare conturi WhatsApp (max 20)
- Scanare QR code pentru autentificare
- Monitorizare status conturi:
  - ✅ Conectat
  - 📱 Scanează QR
  - ⏳ Se conectează
  - 🔌 Deconectat
  - ❌ Autentificare eșuată
- Ștergere conturi

**Acces**: GM Overview → "📱 Gestionare Conturi WhatsApp"

## API Endpoints

### Conturi WhatsApp
```
GET    /                              - Health check
GET    /api/accounts                  - Lista conturi
POST   /api/accounts/add              - Adaugă cont
DELETE /api/accounts/:accountId       - Șterge cont
GET    /api/accounts/:accountId/chats - Lista chat-uri
POST   /api/accounts/:accountId/send  - Trimite mesaj
```

### Clienți
```
GET    /api/clients                      - Lista clienți
GET    /api/clients/:clientId/messages   - Mesaje client
POST   /api/clients/:clientId/messages   - Trimite mesaj
PATCH  /api/clients/:clientId/status     - Actualizează status
```

## WebSocket Events

### Emise de server
```javascript
'whatsapp:qr'              - QR code generat
'whatsapp:ready'           - Cont conectat
'whatsapp:authenticated'   - Autentificare reușită
'whatsapp:auth_failure'    - Autentificare eșuată
'whatsapp:disconnected'    - Cont deconectat
'whatsapp:message'         - Mesaj nou primit
'whatsapp:account_removed' - Cont șters
'client:status_updated'    - Status client actualizat
```

## Deployment

### Backend (Railway)
1. Push cod în repository
2. Railway detectează automat `railway.json`
3. Build și deploy automat
4. Variabile de mediu:
   - `PORT` - Port server (default: 5000)

### Frontend (Firebase)
1. Build: `npm run build`
2. Deploy: `firebase deploy --only hosting`

## Testare Locală

### Backend
```bash
cd backend
npm install
npm start
# Server pornește pe http://localhost:5000
```

### Frontend
```bash
cd kyc-app/kyc-app
npm install
npm run dev
# App pornește pe http://localhost:5173
```

## Flux de Lucru

### Adăugare Cont WhatsApp (GM)
1. GM accesează "GM Overview"
2. Click "➕ Adaugă Cont"
3. Introduce nume cont
4. Scanează QR code cu WhatsApp
5. Cont devine activ

### Chat cu Client (Animator)
1. Animator click "💬 Chat Clienți"
2. Selectează client din listă
3. Scrie și trimite mesaje
4. Mesajele apar în timp real

### Gestionare Clienți (Admin)
1. Admin accesează `/chat-clienti`
2. Selectează tab (Disponibili/În Rezervare/Pierduți)
3. Selectează client
4. Chat și mutare între categorii

## Limitări

- Maximum 20 conturi WhatsApp
- Fiecare cont necesită scanare QR
- Sesiunile WhatsApp expiră după 14 zile de inactivitate
- Backend trebuie să ruleze continuu pentru menținerea conexiunilor

## Troubleshooting

### QR Code nu apare
- Verifică că backend-ul rulează
- Verifică conexiunea WebSocket
- Reîncearcă adăugarea contului

### Mesaje nu se trimit
- Verifică că contul este conectat (status: ✅ Conectat)
- Verifică conexiunea la internet
- Reautentifică contul

### Cont deconectat
- Scanează din nou QR code
- Verifică că WhatsApp nu este deschis pe alt device
- Verifică că numărul nu este blocat

## Securitate

- Acces Admin: Doar `ursache.andrei1995@gmail.com`
- Autentificare Firebase pentru toți utilizatorii
- Sesiuni WhatsApp stocate local pe server
- WebSocket cu CORS configurat

## Mentenanță

### Backup Sesiuni
Sesiunile WhatsApp sunt stocate în `backend/.wwebjs_auth/`
Backup periodic recomandat.

### Monitorizare
- Verifică logs Railway pentru erori
- Monitorizează status conturi în GM Overview
- Verifică metrici de performanță

## Suport

Pentru probleme sau întrebări:
- Email: ursache.andrei1995@gmail.com
- GitHub Issues: [Repository Link]
