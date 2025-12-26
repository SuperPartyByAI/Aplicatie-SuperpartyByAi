# 🚀 SuperParty KYC App - START HERE

**Ultima actualizare:** 2024-12-26

---

## 📋 Quick Start

### Pentru Developeri Noi

1. **Citește acest fișier complet** (5 min)
2. **Setup environment:** `bash setup.sh` (10 min)
3. **Rulează app:** `cd kyc-app/kyc-app && npm start` (2 min)
4. **Rulează teste:** `npm test` (1 min)

**Total timp setup:** ~20 minute

---

## 🎯 Ce Este Acest Proiect?

**SuperParty KYC App** = Aplicație mobilă React Native pentru verificare KYC (Know Your Customer)

**Funcționalități:**
- 📱 Autentificare utilizatori (Firebase Auth)
- 📄 Upload documente identitate (CI, Pașaport)
- 🤖 Extracție automată date cu AI (GPT-4 Vision)
- 👤 Selfie verification
- 👨‍💼 Admin panel pentru aprobare KYC
- 💳 Integrare IBAN pentru plăți

---

## 🏗️ Arhitectură

```
SuperParty/
├── kyc-app/kyc-app/          # React Native App (Expo)
│   ├── src/
│   │   ├── screens/          # Ecrane UI
│   │   ├── components/       # Componente refolosibile
│   │   ├── utils/            # Utilități (validare, etc.)
│   │   └── test/             # Teste automate
│   ├── App.js                # Entry point
│   └── package.json          # Dependențe
│
├── .githooks/                # Git hooks (pre-commit, pre-push)
├── .github/workflows/        # CI/CD (GitHub Actions)
├── .ai-memory/               # AI Memory Database
│   ├── conversations/        # Conversații salvate
│   ├── decisions/            # Decizii tehnice (ADRs)
│   ├── snapshots/            # State snapshots
│   └── scripts/              # Scripturi helper
│
└── docs/                     # Documentație
    ├── TESTING.md            # Ghid testare
    ├── DECISIONS.md          # Decizii tehnice
    └── TODO.md               # Task-uri
```

---

## 🛠️ Tech Stack

### Frontend
- **React Native** - Framework mobile
- **Expo** - Development platform
- **React Navigation** - Routing
- **React Native Paper** - UI components

### Backend
- **Firebase Auth** - Autentificare
- **Firestore** - Database
- **Firebase Storage** - Stocare documente
- **OpenAI GPT-4 Vision** - Extracție date din documente

### Testing
- **Vitest** - Test runner
- **React Testing Library** - Component testing
- **GitHub Actions** - CI/CD

### Tools
- **Git Hooks** - Pre-commit/pre-push validation
- **AI Memory DB** - Context persistence între sesiuni

---

## 📚 Documentație Esențială

### Citește ACUM (Ordine Recomandată)

1. **[TESTING.md](kyc-app/kyc-app/TESTING.md)** - Cum să rulezi și scrii teste
2. **[DECISIONS.md](DECISIONS.md)** - De ce am luat anumite decizii tehnice
3. **[IMPROVEMENTS.md](IMPROVEMENTS.md)** - 🆕 Îmbunătățiri implementate (auto-save, search, backup)
4. **[.ai-memory/README.md](.ai-memory/README.md)** - Sistem AI Memory
5. **[.ai-memory/GUIDE.md](.ai-memory/GUIDE.md)** - Ghid complet AI Memory
6. **[TODO.md](TODO.md)** - Ce mai e de făcut

### Citește CÂND AI NEVOIE

- **[.ai-memory/CONVERSATION-REPLAY.md](.ai-memory/CONVERSATION-REPLAY.md)** - Cum să cauți în conversații
- **[Firebase Setup](https://firebase.google.com/docs)** - Configurare Firebase
- **[Expo Docs](https://docs.expo.dev/)** - Documentație Expo

---

## 🚦 Setup Rapid

### 1. Instalare Dependențe

```bash
# Instalează dependențe app
cd kyc-app/kyc-app
npm install

# Instalează Git Hooks
cd ../..
bash setup-hooks.sh
```

### 2. Configurare Firebase

Firebase config e deja în `App.js`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o",
  authDomain: "superparty-frontend.firebaseapp.com",
  projectId: "superparty-frontend",
  // ...
};
```

**⚠️ IMPORTANT:** Aceste keys sunt PUBLICE (Firebase client keys). Nu sunt secrete.

### 3. Rulare App

```bash
cd kyc-app/kyc-app
npm start
```

Apoi:
- Apasă `i` pentru iOS simulator
- Apasă `a` pentru Android emulator
- Scanează QR cu Expo Go app pe telefon

### 4. Rulare Teste

```bash
cd kyc-app/kyc-app
npm test
```

**Așteptat:** 18/18 teste passed ✅

---

## 🎯 Workflow Zilnic

### La Început de Zi

```bash
# 1. Pull ultimele modificări
git pull

# 2. Încarcă context AI (dacă folosești AI Memory)
bash .ai-memory/scripts/load-context.sh

# 3. Vezi ce e de făcut
cat TODO.md

# 4. Rulează teste să vezi că totul e ok
cd kyc-app/kyc-app && npm test
```

### În Timpul Dezvoltării

```bash
# Rulează app în dev mode
npm start

# Rulează teste în watch mode
npm test -- --watch

# Verifică cod înainte de commit (automat cu git hooks)
git add .
git commit -m "Your message"  # Pre-commit hook rulează automat
```

### La Sfârșit de Zi

```bash
# 1. Rulează toate testele
npm test

# 2. Commit modificări
git add .
git commit -m "Descriptive message"

# 3. Push (pre-push hook rulează teste automat)
git push

# 4. Salvează context AI (opțional)
bash .ai-memory/scripts/save-session.sh
```

---

## 🧪 Testing

### Rulare Teste

```bash
# Toate testele
npm test

# Watch mode (re-run la modificări)
npm test -- --watch

# Un singur fișier
npm test -- src/test/critical.test.js

# Cu coverage
npm test -- --coverage
```

### Scris Teste Noi

```bash
# Creează fișier de test
touch src/screens/__tests__/MyScreen.test.jsx

# Folosește template-ul din TESTING.md
```

Vezi **[TESTING.md](kyc-app/kyc-app/TESTING.md)** pentru detalii complete.

---

## 🔒 Git Hooks

### Pre-Commit Hook

Rulează automat **ÎNAINTE** de `git commit`:

**Verificări:**
- ❌ Blochează: `debugger` statements
- ❌ Blochează: TODO CRITICAL/URGENT
- ❌ Blochează: API keys hardcodate
- ⚠️ Avertizează: `console.log` (nu blochează)
- ⚠️ Avertizează: Tab-uri în loc de spații

**Bypass (doar în cazuri speciale):**
```bash
git commit --no-verify -m "Message"
```

### Post-Commit Hook (🆕 NOU!)

Rulează automat **DUPĂ** `git commit`:

**Funcție:**
- ✅ Auto-save conversație (CURRENT_SESSION.md)
- ✅ Auto-save snapshot (SNAPSHOT.json)
- ✅ Auto-save TODO (TODO.md)
- ✅ Actualizare index conversații

**Beneficiu:** Nu mai uiți să salvezi manual!

### Pre-Push Hook

Rulează automat **ÎNAINTE** de `git push`:

**Verificări:**
- ✅ Rulează toate testele
- ✅ Verifică package.json valid
- ✅ Verifică sync cu remote

**Bypass (NU recomandat):**
```bash
git push --no-verify
```

---

## 🧠 AI Memory Database

### Ce Este?

Sistem de stocare a contextului conversațiilor cu AI pentru **zero context loss** între sesiuni.

### Cum Funcționează?

```bash
# La sfârșit de sesiune
bash .ai-memory/scripts/save-session.sh

# La început de sesiune nouă
bash .ai-memory/scripts/load-context.sh

# Caută în conversații
bash .ai-memory/scripts/search.sh "keyword"
```

### Când Folosești?

- **Onboarding** - Citește conversații pentru a înțelege proiectul
- **Debugging** - Caută când/cum s-a introdus un bug
- **Code Review** - Vezi de ce s-au luat anumite decizii
- **Continuare muncă** - Încarcă context din sesiunea anterioară

### 🆕 Îmbunătățiri Noi

**1. Auto-Save (Post-Commit Hook)**
- Salvează automat după fiecare commit
- Zero risc de uitat

**2. Search Avansat**
```bash
bash .ai-memory/scripts/search-advanced.sh "keyword"
```
- 10x mai rapid
- Color highlighting
- Context automat

**3. Validare Conversații**
- Asigură calitate documentație
- Verifică timestamp-uri, cod, decizii

**4. Backup Automat**
```bash
bash .ai-memory/scripts/backup.sh
```
- Protecție împotriva pierderii
- Păstrează ultimele 30 backup-uri

Vezi **[IMPROVEMENTS.md](IMPROVEMENTS.md)** pentru detalii complete.

Vezi **[.ai-memory/README.md](.ai-memory/README.md)** pentru detalii AI Memory.

---

## 📋 Decizii Tehnice Importante

### ADR-001: Firebase pentru Backend
**Decizie:** Firebase (Auth + Firestore + Storage)
**Motivație:** Integrare rapidă, scalabil, managed service

### ADR-002: React Native + Expo
**Decizie:** React Native cu Expo
**Motivație:** Cross-platform, development rapid, comunitate mare

### ADR-008: Vitest pentru Testing
**Decizie:** Vitest în loc de Jest
**Motivație:** Suport ESM mai bun, mai rapid, API compatibil

Vezi toate deciziile în **[DECISIONS.md](DECISIONS.md)**

---

## 🐛 Troubleshooting

### Problema: "npm install failed"

```bash
# Șterge node_modules și reinstalează
rm -rf node_modules package-lock.json
npm install
```

### Problema: "Teste nu trec"

```bash
# Verifică că ai ultimele dependențe
npm install

# Rulează teste cu verbose
npm test -- --reporter=verbose

# Verifică că Firebase config e corect
grep "firebaseConfig" kyc-app/kyc-app/App.js
```

### Problema: "Expo nu pornește"

```bash
# Clear cache
npx expo start -c

# Sau reinstalează Expo CLI
npm install -g expo-cli
```

### Problema: "Git hooks nu funcționează"

```bash
# Reinstalează hooks
bash setup-hooks.sh

# Verifică permisiuni
chmod +x .githooks/*
```

---

## 🎓 Learning Resources

### React Native
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Expo Docs](https://docs.expo.dev/)

### Firebase
- [Firebase Docs](https://firebase.google.com/docs)
- [Firestore Guide](https://firebase.google.com/docs/firestore)

### Testing
- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)

### AI Memory
- [.ai-memory/README.md](.ai-memory/README.md)
- [.ai-memory/GUIDE.md](.ai-memory/GUIDE.md)

---

## 🤝 Contributing

### Workflow

1. **Creează branch nou**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Dezvoltă feature**
   ```bash
   # Scrie cod
   # Scrie teste
   # Rulează teste: npm test
   ```

3. **Commit**
   ```bash
   git add .
   git commit -m "Add my feature"
   # Pre-commit hook verifică automat
   ```

4. **Push**
   ```bash
   git push origin feature/my-feature
   # Pre-push hook rulează teste automat
   ```

5. **Creează Pull Request**
   - GitHub Actions rulează teste automat
   - Așteaptă review
   - Merge după approval

### Code Style

- **JavaScript:** ES6+, arrow functions
- **Indentare:** 2 spații (nu tab-uri)
- **Naming:** camelCase pentru variabile, PascalCase pentru componente
- **Teste:** Un test file pentru fiecare component/utility

---

## 📊 Status Proiect

### ✅ Completat

- [x] Setup React Native + Expo
- [x] Firebase Auth integration
- [x] Firestore database
- [x] Upload documente (CI, Pașaport, Selfie)
- [x] AI extraction (GPT-4 Vision)
- [x] Admin KYC approval
- [x] Testing infrastructure (18 teste)
- [x] CI/CD pipeline (GitHub Actions)
- [x] Git Hooks (pre-commit, pre-push)
- [x] AI Memory Database

### 🔄 În Progres

- [ ] IBAN validation improvement
- [ ] UI/UX polish
- [ ] Performance optimization

### 📅 Planificat

- [ ] Push notifications
- [ ] Biometric auth
- [ ] Multi-language support
- [ ] Analytics integration

Vezi **[TODO.md](TODO.md)** pentru lista completă.

---

## 🆘 Need Help?

### Căutare Rapidă

```bash
# Caută în conversații AI
bash .ai-memory/scripts/search.sh "keyword"

# Caută în cod
grep -r "keyword" kyc-app/kyc-app/src/

# Caută în documentație
grep -r "keyword" *.md
```

### Resurse

- **Documentație:** Citește fișierele .md din repo
- **Conversații AI:** Vezi `.ai-memory/conversations/`
- **Decizii:** Vezi `DECISIONS.md`
- **Issues:** Check GitHub Issues

---

## 📞 Contact

**Proiect:** SuperParty KYC App
**Repository:** https://github.com/SuperPartyByAI/SuperParty
**Tech Lead:** [Your Name]

---

**🎉 Bun venit în echipă! Happy coding!**

---

**Next Steps:**
1. ✅ Citește acest fișier complet
2. ⏳ Setup environment: `bash setup.sh`
3. ⏳ Rulează app: `npm start`
4. ⏳ Rulează teste: `npm test`
5. ⏳ Citește TESTING.md
6. ⏳ Citește DECISIONS.md
