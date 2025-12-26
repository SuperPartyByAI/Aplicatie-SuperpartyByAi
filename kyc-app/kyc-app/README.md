# KYC Application - Staff Management System

Aplicație web pentru managementul personalului de evenimente cu sistem KYC, alocare automată AI, și tracking în timp real.

## 🚀 Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Firebase (Auth, Firestore, Storage, Functions)
- **AI**: OpenAI GPT-4 pentru alocare automată
- **Styling**: CSS custom
- **Deployment**: Firebase Hosting

## 📋 Features

### Autentificare & KYC
- Autentificare cu email/parolă
- Verificare email obligatorie
- Proces KYC cu upload documente (CI, permis, cazier)
- Aprobare admin pentru acces complet

### Management Evenimente
- Dashboard cu evenimente alocate
- Acceptare/refuzare evenimente
- Tracking status în timp real
- Notificări pentru evenimente noi

### Disponibilitate
- Setare disponibilitate pe zile
- Interval orar personalizabil
- Sincronizare automată cu alocare

### Salarizare
- Tracking ore lucrate
- Calcul automat salariu
- Istoric plăți
- Export rapoarte

### Admin Panel
- Aprobare/respingere KYC
- Management șoferi
- Alocare automată AI
- Conversații cu staff
- Statistici în timp real

## 🎯 Performance Optimizations

### N+1 Query Fixes
Toate screen-urile au fost optimizate pentru a elimina N+1 queries:

**SalarizareScreen**
- Batch fetch pentru toate datele utilizatorilor
- Reducere ~90% în numărul de citiri Firestore
- Cache local pentru date frecvent accesate

**EvenimenteScreen**
- Batch fetch pentru date utilizatori
- Reducere ~90% în numărul de citiri Firestore
- Real-time updates pentru evenimente noi

**AdminScreen**
- Batch fetch pentru toate datele utilizatorilor
- Paginare conversații (10 per pagină)
- Reducere ~90% în numărul de citiri Firestore
- Real-time updates pentru KYC submissions

### Real-time Updates
- Evenimente: Live updates pentru status și evenimente noi
- Admin KYC: Live updates pentru submissions noi
- Conversații: Sincronizare automată mesaje

### Pagination
- AdminScreen: 10 conversații per pagină
- Evenimente: 20 evenimente per pagină
- Load on demand pentru performanță optimă

## 📁 Project Structure

```
kyc-app/
├── src/
│   ├── screens/          # Toate paginile aplicației
│   │   ├── AuthScreen.jsx
│   │   ├── VerifyEmailScreen.jsx
│   │   ├── KycScreen.jsx
│   │   ├── WaitingScreen.jsx
│   │   ├── StaffSetupScreen.jsx
│   │   ├── HomeScreen.jsx
│   │   ├── EvenimenteScreen.jsx
│   │   ├── DisponibilitateScreen.jsx
│   │   ├── SalarizareScreen.jsx
│   │   ├── SoferiScreen.jsx
│   │   └── AdminScreen.jsx
│   ├── utils/            # Funcții utilitare
│   │   └── formatters.js
│   ├── firebase.js       # Firebase config
│   ├── App.jsx           # Router & FlowGuard
│   └── main.jsx          # Entry point
├── functions/            # Firebase Cloud Functions
│   ├── index.js          # AI allocation logic
│   └── package.json
├── public/               # Static assets
├── LOGICA_APLICATIE.md   # Documentație detaliată logică
├── ARCHITECTURE.md       # Documentație arhitectură (nou)
└── README.md             # Acest fișier
```

## 🛠️ Setup & Development

### Prerequisites
- Node.js 18+
- npm sau yarn
- Firebase CLI (`npm install -g firebase-tools`)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd kyc-app

# Install dependencies
npm install

# Install functions dependencies
cd functions
npm install
cd ..

# Login to Firebase
firebase login

# Select project
firebase use superparty-frontend
```

### Development

```bash
# Start dev server
npm run dev

# Run linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Deployment

```bash
# Deploy everything (hosting + functions)
firebase deploy

# Deploy only hosting
firebase deploy --only hosting

# Deploy only functions
firebase deploy --only functions
```

## 📚 Documentation

- **LOGICA_APLICATIE.md**: Documentație ultra-detaliată a fiecărei linii de cod
- **ARCHITECTURE.md**: Arhitectură aplicație și flow-uri principale
- **DEPLOY_INSTRUCTIONS.md**: Instrucțiuni deployment
- **SETUP_ADMIN_ROLE.md**: Setup rol admin în Firestore

## 🔒 Security

- Firebase Security Rules pentru Firestore și Storage
- Verificare email obligatorie
- Aprobare admin pentru acces complet
- Validare documente KYC
- Rate limiting pe Cloud Functions

## 📊 Database Schema

### Collections
- `users`: Date utilizatori și status KYC
- `kycSubmissions`: Submissions KYC cu documente
- `evenimente`: Evenimente disponibile
- `evenimenteAlocate`: Alocări staff-evenimente
- `disponibilitate`: Disponibilitate staff
- `salarizare`: Tracking ore și plăți
- `soferi`: Date șoferi
- `conversatii`: Mesaje admin-staff

Vezi **LOGICA_APLICATIE.md** pentru schema completă.

## 🐛 Debugging

### ESLint Warnings
Există 3 ESLint disable comments justificate în cod:
- `AdminScreen.jsx:49` - Stable function dependencies
- `DisponibilitateScreen.jsx:23` - Stable function dependencies  
- `HomeScreen.jsx:67` - Stable function dependencies

Aceste disable sunt necesare pentru funcții stabile care nu trebuie să trigger re-renders.

### Common Issues

**Build fails**: Verifică că toate dependencies sunt instalate
```bash
rm -rf node_modules package-lock.json
npm install
```

**Firebase errors**: Verifică că ești autentificat și ai selectat proiectul corect
```bash
firebase login
firebase use superparty-frontend
```

## 📈 Performance Metrics

- **Initial Load**: ~2s (cu cache)
- **Time to Interactive**: ~3s
- **Lighthouse Score**: 90+ (Performance)
- **Bundle Size**: ~730KB (gzipped: ~220KB)
- **Database Reads**: Reducere 90% față de versiunea inițială

## 🤝 Contributing

1. Citește **LOGICA_APLICATIE.md** pentru a înțelege codul
2. Creează branch nou pentru feature
3. Rulează `npm run lint` înainte de commit
4. Testează local cu `npm run build`
5. Creează PR cu descriere detaliată

## 📝 License

Proprietary - All rights reserved
