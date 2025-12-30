# Instrucțiuni Deploy Firebase

## Problema
Eroarea apare pentru că rulezi din `whatsapp-backend/` dar `firebase.json` și `firestore.rules` sunt în root.

## Soluție

### 1. Navighează în directorul ROOT al proiectului

```powershell
cd C:\Users\ursac\Aplicatie-SuperpartyByAi
```

**NU** din `whatsapp-backend\`

---

### 2. Deploy Firestore Rules

**Opțiunea A - Fără token (cu login interactiv):**

```powershell
firebase login
firebase deploy --only firestore
```

**Opțiunea B - Cu token Firebase CI:**

```powershell
firebase deploy --only firestore --token "YOUR_ACTUAL_TOKEN_HERE"
```

⚠️ **IMPORTANT:** Înlocuiește `YOUR_ACTUAL_TOKEN_HERE` cu token-ul tău real Firebase CI.

---

### 3. Deploy Hosting (aplicația React)

**După ce ai deployat regulile Firestore:**

```powershell
firebase deploy --only hosting
```

**SAU deploy complet (reguli + hosting):**

```powershell
firebase deploy
```

---

## Verificare

După deploy, verifică:

1. **Firestore Rules:** https://console.firebase.google.com/project/superparty-frontend/firestore/rules
2. **Hosting:** https://superparty-frontend.web.app/home

---

## Structura Corectă

```
C:\Users\ursac\Aplicatie-SuperpartyByAi\
├── firebase.json          ← Firebase config
├── firestore.rules        ← Firestore rules
├── kyc-app/
│   └── kyc-app/
│       └── dist/          ← Build-ul aplicației
└── whatsapp-backend/      ← Backend WhatsApp
```

**Rulează comenzile firebase din ROOT (`C:\Users\ursac\Aplicatie-SuperpartyByAi\`)**
