# 🧠 CONTEXT - Pentru Conversații Viitoare

**Citește acest fișier la ÎNCEPUTUL fiecărei conversații noi!**

---

## 📍 Quick Start - Ce Să Faci Când Începi O Conversație Nouă

### 1. Clonează/Pull Repository
```bash
cd /workspaces/SuperParty
git clone https://github.com/SuperPartyByAI/kyc-app.git
# SAU dacă există deja:
cd kyc-app/kyc-app
git pull origin feature/ai-manager
```

### 2. Citește Documentația (în ordine)
1. **CONTEXT.md** (acest fișier) - Context general
2. **TODO.md** - Ce e de făcut
3. **CHANGELOG.md** - Ce s-a făcut
4. **SESSION_SUMMARY.md** - Ultima sesiune

### 3. Verifică Branch-ul
```bash
git branch --show-current
# Ar trebui să fie: feature/ai-manager
```

### 4. Instalează Dependențe (dacă e nevoie)
```bash
npm install
```

### 5. Începe Lucrul
- Alege task-uri din TODO.md
- Implementează
- Testează
- Commit + Push
- Actualizează documentația

---

## 🏗️ Arhitectură Aplicație

### Stack Tehnic
- **Frontend**: React 19 + Vite
- **Backend**: Firebase (Auth, Firestore, Storage, Functions)
- **AI**: OpenAI GPT-4o-mini (chat) + GPT-4o Vision (validare imagini)
- **Deployment**: Firebase Hosting
- **Secrets**: Firebase Secret Manager

### Structura Proiect
```
kyc-app/
├── src/
│   ├── screens/          # Toate paginile
│   │   ├── HomeScreen.jsx       # Dashboard + Admin + GM mode
│   │   ├── AuthScreen.jsx       # Login/Register
│   │   ├── KycScreen.jsx        # KYC submission
│   │   └── ...
│   ├── firebase.js       # Firebase config
│   ├── config.js         # Configurație centralizată
│   └── utils/            # Funcții helper
├── functions/
│   ├── index.js          # 4 Cloud Functions
│   ├── objectGatekeeperPrompt.js
│   └── appRules.js
├── firestore.rules       # Security rules
├── storage.rules         # Storage rules
└── deploy.sh             # Script deploy automat
```

### Cloud Functions (4 funcții)
1. **chatWithAI** - Chat normal cu GPT-4o-mini
2. **extractKYCData** - Extragere date din documente KYC
3. **aiManager** - Validare imagini + performanță
4. **monitorPerformance** - Background job (every 5 min)

---

## 🔐 Secrete & Deployment

### Secrete în Firebase Secret Manager
```bash
# OpenAI API Key
firebase functions:secrets:access OPENAI_API_KEY

# Deploy Token
firebase functions:secrets:access DEPLOY_TOKEN
```

### Deploy Aplicație
```bash
./deploy.sh
# SAU manual:
npm run build
firebase deploy --only hosting --token "$(firebase functions:secrets:access DEPLOY_TOKEN)"
```

### URLs
- **Live App**: https://superparty-frontend.web.app
- **Firebase Console**: https://console.firebase.google.com/project/superparty-frontend
- **GitHub**: https://github.com/SuperPartyByAI/kyc-app

---

## 📊 Database Schema (Firestore)

### Colecții Principale
- **users** - Date utilizatori + status KYC
- **staffProfiles** - Profile staff
- **evenimente** - Evenimente disponibile
- **evenimenteAlocate** - Alocări staff
- **disponibilitate** - Calendar disponibilitate
- **salarizare** - Ore + plăți
- **soferi** - Management șoferi

### Colecții AI Manager (Noi)
- **imageValidations** - Validări imagini cu Object Gatekeeper
- **performanceMetrics** - Metrici performanță zilnice
- **performanceAlerts** - Alerte active/rezolvate
- **aiManagerLogs** - Logs acțiuni AI Manager
- **dailyReports** - Rapoarte zilnice/săptămânale
- **aiConversations** - Istoric conversații chat

---

## 🎯 Features Implementate

### ✅ AI Manager (Complet)
- Object Gatekeeper pentru validare imagini
- Upload imagini în chat (max 3MB)
- Performance monitoring automat
- Comenzi performanță în chat

### ✅ Mod Admin (Complet)
- Admin KYC - Approve/Reject cereri
- Preview documente (CI, permis, cazier)
- Conversații AI - Istoric complet
- Activare: scrie `admin` în chat

### ✅ Mod GM (Complet)
- GM Overview - Dashboard metrici
- Sistem alerte active
- Rezolvare alerte
- Activare: scrie `gm` în chat

### ✅ Security (10/10)
- Toate secretele în Firebase Secret Manager
- Zero vulnerabilități
- OWASP Top 10 compliance
- GDPR compliance

---

## 🔄 Workflow Dezvoltare

### 1. Alege Task din TODO.md
```markdown
- [ ] **Preview imagini inline** (2-3 ore)
```

### 2. Creează Branch (Opțional)
```bash
git checkout -b feature/preview-imagini
```

### 3. Implementează
- Scrie cod
- Testează local: `npm run dev`
- Verifică că funcționează

### 4. Commit + Push
```bash
git add .
git commit -m "feat: add inline image preview to Admin KYC

- Add modal component for image preview
- Implement zoom functionality
- Update TODO.md

Co-authored-by: Ona <no-reply@ona.com>"

git push origin feature/ai-manager
```

### 5. Actualizează Documentația
- [x] Marchează task în TODO.md
- Adaugă entry în CHANGELOG.md
- Actualizează SESSION_SUMMARY.md

### 6. Deploy (Dacă e gata)
```bash
./deploy.sh
```

---

## 📝 Convenții Cod

### Commit Messages
```
feat: add new feature
fix: fix bug
docs: update documentation
refactor: refactor code
test: add tests
chore: maintenance tasks
```

### Code Style
- **React**: Functional components + Hooks
- **Naming**: camelCase pentru variabile, PascalCase pentru componente
- **Comments**: Doar pentru logică complexă (why, not what)
- **Imports**: Grupate (React, Firebase, Components, Utils)

### File Naming
- **Components**: PascalCase (HomeScreen.jsx)
- **Utils**: camelCase (gptExtraction.js)
- **Config**: lowercase (firebase.js, config.js)

---

## 🐛 Troubleshooting

### Error: "Firebase not authenticated"
```bash
firebase login
```

### Error: "Module not found"
```bash
npm install
```

### Error: "Deploy failed"
```bash
# Verifică token
firebase functions:secrets:access DEPLOY_TOKEN

# Re-deploy
./deploy.sh
```

### Error: "Build failed"
```bash
# Curăță și reinstalează
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📚 Documentație Completă

### Fișiere Documentație (în ordine de importanță)

1. **CONTEXT.md** (acest fișier) - Context general + quick start
2. **TODO.md** - Task-uri viitoare (ce e de făcut)
3. **CHANGELOG.md** - Istoric modificări (ce s-a făcut)
4. **SESSION_SUMMARY.md** - Rezumat ultima sesiune
5. **AI_ARCHITECTURE.md** - Arhitectură AI Manager (detaliat)
6. **ARCHITECTURE.md** - Arhitectură aplicație completă
7. **LOGICA_APLICATIE.md** - Documentație linie cu linie
8. **DEPLOY.md** - Ghid deploy
9. **SECURITY_AUDIT.md** - Audit securitate
10. **README.md** - Overview proiect

### Când Să Citești Ce

**La început de conversație:**
- CONTEXT.md (acest fișier)
- TODO.md (ce e de făcut)

**Când implementezi ceva:**
- ARCHITECTURE.md (arhitectură)
- LOGICA_APLICATIE.md (detalii implementare)

**Când deploy-ezi:**
- DEPLOY.md (ghid deploy)

**Când verifici securitate:**
- SECURITY_AUDIT.md (audit)

---

## 🎯 Obiective Curente

### Sprint Curent (Săptămâna 1)
- [ ] Preview imagini inline în Admin KYC
- [ ] Search în conversații AI
- [ ] Filtrare pe user în conversații
- [ ] Validare automată cu Object Gatekeeper

### Milestone Următor (Luna 1)
- [ ] Notificări push
- [ ] Export rapoarte PDF
- [ ] Grafice în GM Overview
- [ ] Testing (unit + E2E)

### Viziune Long-term (6 luni)
- [ ] Mobile app (React Native)
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] 2FA pentru admin

---

## 👥 Echipa & Contact

**Admin Email**: ursache.andrei1995@gmail.com  
**Project**: SuperParty KYC App  
**Repository**: https://github.com/SuperPartyByAI/kyc-app  
**Live App**: https://superparty-frontend.web.app

---

## ✅ Checklist Conversație Nouă

Când începi o conversație nouă, verifică:

- [ ] Am clonat/pull repository-ul
- [ ] Am citit CONTEXT.md (acest fișier)
- [ ] Am citit TODO.md (știu ce e de făcut)
- [ ] Am citit CHANGELOG.md (știu ce s-a făcut)
- [ ] Sunt pe branch-ul corect (feature/ai-manager)
- [ ] Am instalat dependențele (npm install)
- [ ] Știu ce task vreau să implementez
- [ ] Am acces la Firebase (firebase login)
- [ ] Pot face deploy (./deploy.sh funcționează)

---

**Ultima Actualizare**: 2025-12-26  
**Versiune**: 1.0.0  
**Status**: ✅ Production Ready  
**Next Review**: 2026-01-02
