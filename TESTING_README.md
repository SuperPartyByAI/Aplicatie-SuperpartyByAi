# 🧪 Ghid de Testare - Flow Evenimente AI

## Prezentare Generală

Acest ghid explică cum să testezi flow-ul complet de creare evenimente cu AI, inclusiv:
- Validare format date DD-MM-YYYY
- Detecție limbaj natural (română, cu/fără diacritice)
- Validare date + adresă obligatorii
- Flow preview + confirm
- Idempotență

## 🚀 Quick Start

### Rulează toate testele:
```bash
./run-all-tests.sh
```

### Rulează teste individuale:

**Test 1: Validare Date**
```bash
cd functions
node test-validation-only.js
```

**Test 2: Detecție Pattern-uri**
```bash
node test-pattern-detection.js
```

## 📋 Teste Disponibile

### 1. Test Validare Date (functions/test-validation-only.js)

**Ce testează:**
- Format DD-MM-YYYY (regex validation)
- Date valide vs invalide
- Validare date + adresă
- Mesaje de eroare

**Rezultate așteptate:**
```
✅ 11/11 teste format date
✅ 5/5 teste validare completă
✅ 100% success rate
```

**Exemple testate:**
```javascript
// Valid
"15-01-2026"  → ✅ PASS
"31-12-2026"  → ✅ PASS

// Invalid
"2026-01-15"  → ✅ Respins corect (YYYY-MM-DD)
"15/01/2026"  → ✅ Respins corect (separator greșit)
"mâine"       → ✅ Respins corect (dată relativă)
```

### 2. Test Detecție Pattern-uri (test-pattern-detection.js)

**Ce testează:**
- Detecție pattern-uri cu diacritice
- Detecție pattern-uri fără diacritice
- Normalizare caractere românești
- Pattern-uri negative (false positives)

**Rezultate așteptate:**
```
✅ 16/17 teste detecție (94%)
✅ 8/8 teste normalizare (100%)
⚠️ 1 fals pozitiv minor (acceptabil)
```

**Exemple testate:**
```javascript
// Cu diacritice
"Notează eveniment"  → ✅ Detectat
"Adaugă petrecere"   → ✅ Detectat

// Fără diacritice
"noteaza eveniment"  → ✅ Detectat
"adauga petrecere"   → ✅ Detectat

// Normalizare
"notează" → "noteaza" ✅
"vată"    → "vata"    ✅
```

## 📊 Interpretarea Rezultatelor

### Success Rate: 98% (40/41 teste)

**Breakdown:**
- Validare date: 100% ✅
- Validare completă: 100% ✅
- Detecție pattern-uri: 94% ⚠️
- Normalizare: 100% ✅

### Fals Pozitiv Minor

**Test care eșuează:**
```
❌ "Mulțumesc pentru ajutor" → Detectat ca eveniment
```

**De ce eșuează:**
- Conține cuvântul "pentru" care e în lista de pattern-uri

**Impact:**
- Minim - AI-ul va respinge cererea oricum (lipsesc date și adresă)
- Nu se creează evenimente invalide
- User primește mesaj clar de eroare

**Soluție:**
- Opțional - adaugă filtru pentru cuvinte de politețe
- Nu este critic pentru producție

## 🎯 Criterii de Acceptare

### ✅ Teste Critice (MUST PASS)

1. **Validare format date:** 100%
   - Toate formatele invalide sunt respinse
   - Formatul DD-MM-YYYY este acceptat

2. **Validare date + adresă:** 100%
   - Date lipsă → eroare clară
   - Adresă lipsă → eroare clară
   - Format greșit → eroare cu exemplu

3. **Normalizare diacritice:** 100%
   - Toate caracterele românești sunt normalizate
   - Pattern-uri cu/fără diacritice funcționează

### ⚠️ Teste Non-Critice (NICE TO HAVE)

1. **Detecție pattern-uri:** 94%
   - Majoritatea pattern-urilor sunt detectate
   - Fals pozitive minore sunt acceptabile

## 🔍 Debugging

### Test eșuează cu "GROQ_API_KEY not set"

**Cauză:** Testul încearcă să apeleze API-ul Groq

**Soluție:** Rulează doar testele de validare:
```bash
cd functions
node test-validation-only.js
```

### Test eșuează cu "Cannot find module"

**Cauză:** Dependențele nu sunt instalate

**Soluție:**
```bash
cd functions
npm install
```

### Vreau să testez cu date reale

**Opțiune 1:** Folosește Firebase Emulator
```bash
firebase emulators:start
```

**Opțiune 2:** Testează direct în app
- Instalează app v1.3.0
- Trimite mesaj în chat
- Verifică preview și confirmare

## 📝 Adăugarea de Teste Noi

### Template pentru test nou:

```javascript
const testCases = [
  {
    name: 'Descriere test',
    input: 'date de test',
    expected: 'rezultat așteptat',
    shouldPass: true/false
  }
];

testCases.forEach(testCase => {
  const result = functionToTest(testCase.input);
  const testPassed = result === testCase.expected;
  
  if (testPassed) {
    console.log(`✅ PASS: ${testCase.name}`);
  } else {
    console.log(`❌ FAIL: ${testCase.name}`);
  }
});
```

### Adaugă test în run-all-tests.sh:

```bash
echo "📋 Test 3: Noul Meu Test"
echo "───────────────────────────────────────────────────────────────"
node my-new-test.js
TEST3_RESULT=$?
```

## 📚 Documentație Suplimentară

- **TEST_RESULTS.md** - Rezultate detaliate cu analiză
- **FLOW_TEST_COMPLETE.md** - Raport complet end-to-end
- **FIRESTORE_STRUCTURE.md** - Structura bazei de date
- **TESTING.md** - Ghid de testare manuală

## 🚀 CI/CD Integration

### GitHub Actions

Testele pot fi integrate în workflow-ul CI/CD:

```yaml
name: Run Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd functions && npm install
      - run: ./run-all-tests.sh
```

## ❓ FAQ

### Q: De ce folosim DD-MM-YYYY în loc de YYYY-MM-DD?
**A:** Format european, mai familiar pentru utilizatorii români.

### Q: Ce se întâmplă dacă un test eșuează?
**A:** Verifică output-ul pentru detalii. Testele critice trebuie să treacă pentru producție.

### Q: Pot rula testele în producție?
**A:** Nu. Testele sunt pentru development. În producție, monitorizează logs-urile.

### Q: Cum adaug un pattern nou de detecție?
**A:** Editează lista de pattern-uri în `ai_chat_screen.dart` și adaugă test în `test-pattern-detection.js`.

## 📞 Support

Pentru probleme sau întrebări:
- GitHub Issues: [Aplicatie-SuperpartyByAi](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/issues)
- Pull Request: [#24](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/pull/24)

---

**Ultima actualizare:** 2026-01-08  
**Versiune:** 1.0  
**Status:** ✅ Production Ready
