# 🧪 Testing Guide

**Automated Testing pentru SuperParty KYC App**

---

## 🎯 De Ce Avem Teste?

### Problema Fără Teste:
```
Modifici cod → Deploy → ❌ Ceva se strică → User raportează → Fix → Re-deploy
Timp pierdut: 2 ore
```

### Cu Teste:
```
Modifici cod → Rulezi teste → ❌ Test FAIL → Fixezi imediat → ✅ Tests PASS → Deploy
Timp pierdut: 5 minute
```

**Teste = Siguranță că nimic nu se strică!** 🛡️

---

## 🚀 Quick Start

### Rulează Toate Testele
```bash
npm test
```

### Rulează Testele cu UI
```bash
npm run test:ui
```

### Generează Coverage Report
```bash
npm run test:coverage
```

---

## 📊 Ce Testăm?

### 🔴 CRITICAL TESTS (Esențiale)
```
✅ Authentication (login/register)
✅ Validation (email, password, CNP)
✅ Error messages (în română)
✅ Security (no hardcoded secrets)
✅ Build configuration
```

**Dacă ORICARE din aceste teste FAIL → NU DEPLOY!**

### 🟡 UNIT TESTS (Funcții individuale)
```
✅ Email validation
✅ Password validation
✅ CNP validation
✅ Date formatting
✅ Helper functions
```

### 🟢 COMPONENT TESTS (UI)
```
✅ AuthScreen renderează corect
✅ Butoane funcționează
✅ Formulare se validează
✅ Mesaje de eroare apar
```

---

## 📁 Structura Teste

```
src/
├── test/
│   ├── setup.js                    # Setup global
│   └── critical.test.js            # 🔴 Teste critice
├── screens/
│   └── __tests__/
│       └── AuthScreen.test.jsx     # Teste AuthScreen
└── utils/
    └── __tests__/
        └── validation.test.js      # Teste validare
```

---

## 🧪 Cum Să Scrii Teste Noi

### Template Test Simplu

```javascript
import { describe, it, expect } from 'vitest';

describe('Numele Funcției', () => {
  it('face X când Y', () => {
    // Arrange (pregătire)
    const input = 'test@test.com';
    
    // Act (execuție)
    const result = isValidEmail(input);
    
    // Assert (verificare)
    expect(result).toBe(true);
  });
});
```

### Template Test Component

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renderează corect', () => {
    render(<MyComponent />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

---

## 🔄 Workflow cu Teste

### 1. Înainte de Modificare
```bash
# Rulează testele să vezi că totul e OK
npm test
```

### 2. După Modificare
```bash
# Rulează testele din nou
npm test

# Dacă FAIL:
#   - Fixează codul
#   - Sau actualizează testul (dacă schimbarea e intenționată)

# Dacă PASS:
#   - Deploy cu confidence!
```

### 3. Înainte de Deploy
```bash
# Rulează toate testele + coverage
npm run test:coverage

# Verifică că coverage > 70%
# Verifică că toate testele PASS
# Apoi deploy
```

---

## 🤖 CI/CD Automat (GitHub Actions)

### Ce Se Întâmplă Automat

**La fiecare push pe GitHub:**
```
1. GitHub Actions se declanșează
2. Instalează dependențele
3. Rulează toate testele
4. Generează coverage report
5. Dacă PASS → ✅ Safe to deploy
6. Dacă FAIL → ❌ DO NOT DEPLOY!
```

**Vezi rezultatele:**
- GitHub → Actions tab
- Fiecare commit are ✅ sau ❌

---

## 📊 Coverage (Acoperire)

### Ce E Coverage?

**Coverage** = Cât % din cod e testat

```
100% coverage = Tot codul e testat
70% coverage = 70% din cod e testat
0% coverage = Nimic nu e testat
```

### Target Coverage

```
🟢 > 80% = Excelent
🟡 60-80% = Bun
🟠 40-60% = Acceptabil
🔴 < 40% = Prea puțin
```

### Verifică Coverage

```bash
npm run test:coverage

# Output:
File                | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
All files           |   75.5  |   68.2   |   82.1  |   75.5
 AuthScreen.jsx     |   80.0  |   70.0   |   85.0  |   80.0
 validation.js      |   90.0  |   85.0   |   95.0  |   90.0
```

---

## 🐛 Debugging Teste

### Test FAIL - Ce Fac?

**1. Citește mesajul de eroare:**
```
❌ FAIL src/test/critical.test.js
  ● Email validation funcționează corect
    expect(received).toBe(expected)
    Expected: true
    Received: false
```

**2. Identifică problema:**
- Ce test a picat?
- Ce se aștepta?
- Ce a primit?

**3. Fixează:**
- Fie codul e greșit → Fixează codul
- Fie testul e greșit → Actualizează testul

### Test Lent - Ce Fac?

```bash
# Rulează doar un test specific
npm test -- critical.test.js

# Rulează în watch mode (re-run automat la modificări)
npm test -- --watch
```

---

## 📋 Checklist Înainte de Deploy

- [ ] Toate testele PASS (`npm test`)
- [ ] Coverage > 70% (`npm run test:coverage`)
- [ ] Build success (`npm run build`)
- [ ] Lint success (`npm run lint`)
- [ ] GitHub Actions ✅ (check pe GitHub)

**Dacă toate sunt ✅ → SAFE TO DEPLOY!** 🚀

---

## 🎯 Best Practices

### ✅ DO

1. **Scrie teste pentru cod nou**
   - Fiecare funcție nouă = test nou
   - Fiecare component nou = test nou

2. **Rulează testele des**
   - După fiecare modificare
   - Înainte de commit
   - Înainte de deploy

3. **Menține testele simple**
   - Un test = o verificare
   - Nume clare și descriptive
   - Ușor de înțeles

4. **Actualizează testele când schimbi codul**
   - Dacă schimbi comportamentul → Actualizează testul
   - Nu șterge teste care FAIL

### ❌ DON'T

1. **Nu ignora teste care FAIL**
   - Dacă test FAIL → Fixează!
   - Nu comenta testul
   - Nu șterge testul

2. **Nu scrie teste complicate**
   - Testele trebuie să fie simple
   - Dacă testul e complicat → Simplifică

3. **Nu deploy-a cu teste FAIL**
   - NICIODATĂ!
   - Fixează mai întâi

---

## 🚨 Teste Critice - NU ȘTERGE!

Aceste teste sunt **ESENȚIALE** pentru siguranța aplicației:

```javascript
// src/test/critical.test.js
describe('🔴 CRITICAL TESTS', () => {
  // Dacă ORICARE din aceste teste FAIL → NU DEPLOY!
});
```

**Dacă vrei să modifici un test critic:**
1. Înțelege DE CE vrei să-l modifici
2. Verifică că schimbarea e intenționată
3. Actualizează testul
4. Documentează de ce ai modificat

---

## 📞 Ajutor

### Test FAIL și nu știi de ce?

1. Citește mesajul de eroare
2. Verifică codul
3. Verifică testul
4. Întreabă în chat: "Test X FAIL, ce fac?"

### Vrei să adaugi teste noi?

1. Copiază template-ul de mai sus
2. Adaptează pentru funcția/componentul tău
3. Rulează `npm test`
4. Verifică că PASS

---

## 📊 Status Actual

**Teste Implementate**: 15+  
**Coverage**: ~75%  
**CI/CD**: ✅ GitHub Actions  
**Status**: 🟢 Production Ready  

---

**Ultima Actualizare**: 2025-12-26  
**Creat De**: Ona AI Assistant  
**Versiune**: 1.0.0
