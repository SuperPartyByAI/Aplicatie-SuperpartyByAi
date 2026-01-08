# 🔧 Instalare Firebase CLI pe Windows

## Problema
```
firebase: The term 'firebase' is not recognized...
```

Firebase CLI nu este instalat pe sistemul tău Windows.

---

## ✅ Soluție: Instalare Firebase CLI

### Opțiunea 1: NPM (Recomandat - Rapid)

**Pasul 1: Verifică Node.js**

```powershell
node --version
npm --version
```

**Dacă vezi versiuni (ex: v18.x.x, 9.x.x)** → Node.js este instalat, continuă la Pasul 2

**Dacă vezi eroare** → Instalează Node.js:
1. Download: https://nodejs.org/en/download/
2. Instalează versiunea LTS (Long Term Support)
3. Restart PowerShell
4. Verifică din nou: `node --version`

**Pasul 2: Instalează Firebase CLI**

```powershell
npm install -g firebase-tools
```

**Timp estimat:** 1-2 minute

**Pasul 3: Verifică instalarea**

```powershell
firebase --version
```

Ar trebui să vezi: `15.x.x` sau similar

**Pasul 4: Continuă cu deploy**

```powershell
firebase login
firebase deploy --only functions
```

---

### Opțiunea 2: Standalone Installer (Alternativă)

**Dacă NPM nu funcționează:**

1. **Download Firebase CLI Standalone**
   - Link: https://firebase.tools/bin/win/instant/latest
   - Salvează ca: `firebase-tools.exe`

2. **Rulează installer-ul**
   - Double-click pe `firebase-tools.exe`
   - Urmează instrucțiunile

3. **Restart PowerShell**
   - Închide și redeschide PowerShell
   - Verifică: `firebase --version`

4. **Continuă cu deploy**
   ```powershell
   firebase login
   firebase deploy --only functions
   ```

---

### Opțiunea 3: NPX (Fără instalare globală)

**Dacă nu vrei să instalezi global:**

Folosește `npx` pentru a rula Firebase CLI direct:

```powershell
# Login
npx firebase-tools login

# Deploy
npx firebase-tools deploy --only functions
```

**Notă:** Va descărca Firebase CLI temporar la fiecare rulare (mai lent).

---

## 🔍 Troubleshooting

### Error: npm not found

**Cauză:** Node.js nu este instalat sau nu este în PATH

**Soluție:**
1. Instalează Node.js: https://nodejs.org/
2. Restart PowerShell
3. Verifică: `node --version`

### Error: Permission denied (npm install -g)

**Soluție 1 - Rulează ca Administrator:**
1. Click dreapta pe PowerShell
2. "Run as Administrator"
3. Rulează: `npm install -g firebase-tools`

**Soluție 2 - Folosește npx:**
```powershell
npx firebase-tools login
npx firebase-tools deploy --only functions
```

### Error: firebase command not found după instalare

**Cauză:** PATH nu este actualizat

**Soluție:**
1. Închide toate ferestrele PowerShell
2. Redeschide PowerShell
3. Verifică: `firebase --version`

**Dacă tot nu funcționează:**
```powershell
# Găsește locația Firebase
npm list -g firebase-tools

# Adaugă manual la PATH (temporar)
$env:Path += ";C:\Users\ursac\AppData\Roaming\npm"
```

---

## ✅ Verificare Finală

După instalare, rulează:

```powershell
# Verifică versiune
firebase --version

# Verifică comenzi disponibile
firebase --help

# Login
firebase login

# Verifică proiecte
firebase projects:list
```

---

## 🚀 După Instalare

**Continuă cu deploy-ul:**

```powershell
cd C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\functions

# Login (o singură dată)
firebase login

# Deploy
firebase deploy --only functions
```

---

## 📋 Quick Install Commands

**Copie-paste în PowerShell:**

```powershell
# Verifică Node.js
node --version

# Instalează Firebase CLI
npm install -g firebase-tools

# Verifică instalare
firebase --version

# Login
firebase login

# Deploy
cd C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\functions
firebase deploy --only functions
```

---

## ⏱️ Timp Estimat

- **Instalare Firebase CLI:** 1-2 minute
- **Login:** 30 secunde
- **Deploy:** 3-5 minute

**Total:** ~5-8 minute

---

## 📞 Ajutor Suplimentar

### Documentație Oficială
- Firebase CLI: https://firebase.google.com/docs/cli
- Node.js: https://nodejs.org/

### Verificări Rapide
```powershell
# Node.js instalat?
node --version

# NPM instalat?
npm --version

# Firebase CLI instalat?
firebase --version

# În directorul corect?
pwd
# Ar trebui să fie: C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\functions
```

---

**Next Step:** După ce vezi `firebase --version` funcționând, rulează:
```powershell
firebase login
```
