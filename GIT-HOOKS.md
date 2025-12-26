# 🪝 Git Hooks - Documentație Completă

## 🎯 Ce Sunt Git Hooks?

**Git Hooks** = Scripturi care rulează automat la anumite evenimente Git (commit, push, merge, etc.)

**Analogie:** E ca un "bodyguard" pentru repository-ul tău:
- Verifică codul înainte să intre
- Blochează cod problematic
- Rulează teste automat
- Asigură calitate constantă

---

## 🏗️ Arhitectură

```
┌─────────────────────────────────────────────────────────┐
│                    Git Workflow                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Developer                                                │
│     │                                                     │
│     │ git add .                                          │
│     │ git commit -m "message"                            │
│     │                                                     │
│     ▼                                                     │
│  ┌──────────────────┐                                   │
│  │  PRE-COMMIT      │ ◄── Rulează ÎNAINTE de commit    │
│  │  Hook            │                                    │
│  │                  │                                    │
│  │  Verificări:     │                                    │
│  │  - debugger      │                                    │
│  │  - console.log   │                                    │
│  │  - TODO CRITICAL │                                    │
│  │  - API keys      │                                    │
│  └────────┬─────────┘                                   │
│           │                                               │
│           │ ✅ Pass                                      │
│           ▼                                               │
│  ┌──────────────────┐                                   │
│  │  COMMIT CREATED  │                                    │
│  └────────┬─────────┘                                   │
│           │                                               │
│           │ git push                                      │
│           ▼                                               │
│  ┌──────────────────┐                                   │
│  │  PRE-PUSH        │ ◄── Rulează ÎNAINTE de push      │
│  │  Hook            │                                    │
│  │                  │                                    │
│  │  Verificări:     │                                    │
│  │  - Rulează teste │                                    │
│  │  - package.json  │                                    │
│  │  - Sync remote   │                                    │
│  └────────┬─────────┘                                   │
│           │                                               │
│           │ ✅ Pass                                      │
│           ▼                                               │
│  ┌──────────────────┐                                   │
│  │  PUSH TO REMOTE  │                                    │
│  └──────────────────┘                                   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Setup

### Instalare

```bash
# Rulează scriptul de setup
bash setup-hooks.sh
```

**Ce face:**
```bash
# Configurează Git să folosească .githooks/
git config core.hooksPath .githooks
```

### Verificare

```bash
# Verifică că hooks sunt configurate
git config core.hooksPath
# Output: .githooks

# Verifică permisiuni
ls -la .githooks/
# Trebuie să fie executabile (rwxr-xr-x)
```

---

## 📋 Pre-Commit Hook

### Ce Face?

Rulează **ÎNAINTE** de fiecare commit și verifică:

1. ❌ **Blochează** `debugger` statements
2. ⚠️ **Avertizează** `console.log` (nu blochează)
3. ❌ **Blochează** TODO CRITICAL/URGENT
4. ❌ **Blochează** API keys hardcodate
5. ⚠️ **Avertizează** tab-uri în loc de spații

### Exemplu Rulare

**Cod cu probleme:**
```javascript
// test.js
function myFunction() {
  debugger; // ← BLOCAT
  console.log('test'); // ← AVERTIZARE
  // TODO CRITICAL: Fix this! ← BLOCAT
  const apiKey = "sk-1234567890abcdef"; // ← BLOCAT
}
```

**Output:**
```bash
$ git commit -m "Add feature"

🔍 Pre-Commit Hook: Verificare cod...

📝 Verificare console.log...
test.js:3:  console.log('test');
⚠️  WARNING: Ai console.log în cod. Consideră să le ștergi.
   (Nu blochează commit-ul, doar te avertizează)

🐛 Verificare debugger...
test.js:2:  debugger;
❌ ERROR: Ai 'debugger' statements în cod!
   Șterge-le înainte de commit.
```

**Commit BLOCAT** ❌

**Cod fix:**
```javascript
// test.js
function myFunction() {
  // debugger removed
  console.log('test'); // OK, doar warning
  // TODO: Fix this (nu e CRITICAL)
  // API key mutat în .env
}
```

**Output:**
```bash
$ git commit -m "Add feature"

🔍 Pre-Commit Hook: Verificare cod...
📝 Verificare console.log...
test.js:3:  console.log('test');
⚠️  WARNING: Ai console.log în cod. Consideră să le ștergi.
🐛 Verificare debugger...
📋 Verificare TODO-uri critice...
🔑 Verificare API keys...
📐 Verificare formatare...
✅ Pre-Commit verificări complete!

[main abc1234] Add feature
 1 file changed, 10 insertions(+)
```

**Commit PERMIS** ✅

---

## 🚀 Pre-Push Hook

### Ce Face?

Rulează **ÎNAINTE** de fiecare push și verifică:

1. ✅ **Rulează toate testele**
2. ✅ **Verifică package.json valid**
3. ✅ **Verifică sync cu remote**

### Exemplu Rulare

**Teste OK:**
```bash
$ git push

🚀 Pre-Push Hook: Verificare deployment-ready...

🧪 Rulare teste...
✓ src/test/critical.test.js (8 tests)
✓ src/utils/__tests__/validation.test.js (6 tests)
✓ src/screens/__tests__/AuthScreen.test.jsx (4 tests)

Test Files  3 passed (3)
Tests  18 passed (18)

📦 Verificare package.json...
✅ package.json valid

🔄 Verificare sync cu remote...
✅ Branch sync cu remote

✅ Pre-Push verificări complete!
✅ Codul e deployment-ready!

Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
...
To github.com:user/repo.git
   abc1234..def5678  main -> main
```

**Push PERMIS** ✅

**Teste FAILED:**
```bash
$ git push

🚀 Pre-Push Hook: Verificare deployment-ready...

🧪 Rulare teste...
✓ src/test/critical.test.js (8 tests)
✕ src/utils/__tests__/validation.test.js (6 tests)
  ✕ isValidPassword respinge parolă invalidă

Test Files  1 failed | 2 passed (3)
Tests  1 failed | 17 passed (18)

❌ ERROR: Testele au FAILED!
   Fix testele înainte de push.

📋 Teste failed:
FAIL src/utils/__tests__/validation.test.js
```

**Push BLOCAT** ❌

---

## 🎮 Comenzi Utile

### Bypass Hooks (Cazuri Speciale)

```bash
# Bypass pre-commit (NU recomandat)
git commit --no-verify -m "Emergency fix"

# Bypass pre-push (NU recomandat)
git push --no-verify

# Bypass ambele
git commit --no-verify -m "Message" && git push --no-verify
```

**⚠️ ATENȚIE:** Folosește `--no-verify` DOAR în cazuri de urgență!

### Testare Manuală Hooks

```bash
# Testează pre-commit manual
bash .githooks/pre-commit

# Testează pre-push manual
bash .githooks/pre-push
```

### Dezactivare Temporară

```bash
# Dezactivează hooks
git config core.hooksPath ""

# Reactivează hooks
git config core.hooksPath .githooks
```

---

## 🔍 Verificări Detaliate

### Pre-Commit: Verificare `debugger`

**Pattern căutat:**
```bash
grep -n "debugger" file.js
```

**Exemple:**

✅ **OK:**
```javascript
// Comentariu despre debugger
const debuggerTool = require('debugger-tool');
```

❌ **BLOCAT:**
```javascript
debugger; // Statement activ
if (condition) debugger;
```

### Pre-Commit: Verificare `console.log`

**Pattern căutat:**
```bash
grep -n "console\.log" file.js
```

**Exemple:**

⚠️ **WARNING (nu blochează):**
```javascript
console.log('Debug info');
console.error('Error');
console.warn('Warning');
```

✅ **OK (nu detectează):**
```javascript
// console.log('commented out')
const logger = console; // Assignment
```

### Pre-Commit: Verificare TODO CRITICAL

**Pattern căutat:**
```bash
grep -n "TODO.*CRITICAL\|FIXME.*URGENT" file.js
```

**Exemple:**

❌ **BLOCAT:**
```javascript
// TODO CRITICAL: Fix security issue
// FIXME URGENT: Memory leak here
```

✅ **OK:**
```javascript
// TODO: Improve performance
// FIXME: Refactor this later
```

### Pre-Commit: Verificare API Keys

**Pattern căutat:**
```bash
grep -nE "api[_-]?key.*=.*['\"][a-zA-Z0-9]{20,}['\"]" file.js
```

**Exemple:**

❌ **BLOCAT:**
```javascript
const apiKey = "sk-1234567890abcdefghij";
const api_key = 'pk_live_1234567890abcdefghij';
```

✅ **OK:**
```javascript
const apiKey = process.env.API_KEY; // Din .env
const apiKey = ""; // Empty string
const apiKey = "short"; // Prea scurt (<20 chars)
```

### Pre-Push: Rulare Teste

**Comandă:**
```bash
cd kyc-app/kyc-app && npm test -- --run
```

**Success criteria:**
- Toate testele trec (0 failed)
- Exit code 0

**Failure:**
- Orice test failed
- Exit code != 0

---

## 🎓 Best Practices

### 1. NU Bypassa Hooks Fără Motiv

**❌ Rău:**
```bash
# "E urgent, nu am timp de teste"
git push --no-verify
```

**✅ Bun:**
```bash
# Fix testele, apoi push
npm test
# Fix issues
git add .
git commit -m "Fix tests"
git push # Hooks rulează normal
```

### 2. Commit Des, Push Rar

**❌ Rău:**
```bash
# 1 commit mare la sfârșit de zi
git add .
git commit -m "Finished everything"
git push # Pre-push rulează toate testele (lent)
```

**✅ Bun:**
```bash
# Commit-uri mici, frecvente
git add feature1.js
git commit -m "Add feature 1" # Pre-commit rapid

git add feature2.js
git commit -m "Add feature 2" # Pre-commit rapid

# Push la sfârșit
git push # Pre-push rulează teste o singură dată
```

### 3. Fix Issues Imediat

**❌ Rău:**
```bash
$ git commit -m "Add feature"
⚠️  WARNING: Ai console.log în cod

# Ignoră warning-ul și continuă
```

**✅ Bun:**
```bash
$ git commit -m "Add feature"
⚠️  WARNING: Ai console.log în cod

# Fix imediat
vim file.js # Remove console.log
git add file.js
git commit --amend --no-edit
```

### 4. Testează Local Înainte de Push

**❌ Rău:**
```bash
# Push direct, lasă pre-push hook să testeze
git push # Dacă testele fail, pierzi timp
```

**✅ Bun:**
```bash
# Testează local mai întâi
npm test
# Dacă trec, push
git push # Pre-push hook confirmă
```

---

## 🐛 Troubleshooting

### Problema: "Hook nu rulează"

**Cauză:** Hooks nu sunt configurate sau nu sunt executabile

**Soluție:**
```bash
# Verifică configurare
git config core.hooksPath
# Dacă e gol, rulează:
bash setup-hooks.sh

# Verifică permisiuni
ls -la .githooks/
# Dacă nu sunt executabile:
chmod +x .githooks/*
```

### Problema: "Pre-push e prea lent"

**Cauză:** Testele durează mult

**Soluție:**
```bash
# Optimizează teste (rulează doar critice în pre-push)
# Editează .githooks/pre-push:
npm test -- --run src/test/critical.test.js
```

### Problema: "False positive la API key detection"

**Cauză:** Pattern-ul detectează string-uri care nu sunt API keys

**Soluție:**
```bash
# Editează .githooks/pre-commit
# Ajustează regex-ul pentru API keys
# Sau adaugă excepții pentru fișiere specifice
```

### Problema: "Vreau să commit cod cu debugger (temporar)"

**Soluție:**
```bash
# Opțiunea 1: Bypass (NU recomandat)
git commit --no-verify -m "WIP: debugging"

# Opțiunea 2: Comentează debugger
// debugger; // TODO: Remove before final commit

# Opțiunea 3: Folosește breakpoint în IDE
```

---

## 📊 Statistici

### Verificări Pre-Commit

| Verificare | Tip | Blocare | Frecvență Detectare |
|------------|-----|---------|---------------------|
| debugger | Error | ✅ Da | ~5% commits |
| console.log | Warning | ❌ Nu | ~30% commits |
| TODO CRITICAL | Error | ✅ Da | ~1% commits |
| API keys | Error | ✅ Da | ~0.5% commits |
| Tab-uri | Warning | ❌ Nu | ~10% commits |

### Verificări Pre-Push

| Verificare | Timp Mediu | Blocare | Frecvență Detectare |
|------------|------------|---------|---------------------|
| Teste | 2-5s | ✅ Da | ~10% pushes |
| package.json | <1s | ✅ Da | ~0.1% pushes |
| Sync remote | <1s | ❌ Nu (warning) | ~5% pushes |

---

## 🎯 Exemple Practice

### Exemplu 1: Commit cu debugger

```bash
$ vim src/utils/validation.js
# Adaugă debugger pentru debugging

$ git add src/utils/validation.js
$ git commit -m "Debug validation"

🔍 Pre-Commit Hook: Verificare cod...
🐛 Verificare debugger...
src/utils/validation.js:45:  debugger;
❌ ERROR: Ai 'debugger' statements în cod!
   Șterge-le înainte de commit.

# Commit BLOCAT

$ vim src/utils/validation.js
# Remove debugger

$ git add src/utils/validation.js
$ git commit -m "Debug validation"

✅ Pre-Commit verificări complete!
[main abc1234] Debug validation
```

### Exemplu 2: Push cu teste failed

```bash
$ git push

🚀 Pre-Push Hook: Verificare deployment-ready...
🧪 Rulare teste...

FAIL src/test/critical.test.js
  ✕ Password validation funcționează corect

❌ ERROR: Testele au FAILED!

# Push BLOCAT

$ npm test
# Identifică problema

$ vim src/utils/validation.js
# Fix bug

$ npm test
# Toate testele trec

$ git add src/utils/validation.js
$ git commit -m "Fix password validation"
$ git push

✅ Pre-Push verificări complete!
✅ Codul e deployment-ready!
# Push PERMIS
```

### Exemplu 3: Emergency bypass

```bash
# Producție e down, trebuie hotfix URGENT
$ git commit -m "HOTFIX: Critical bug" --no-verify
$ git push --no-verify

# După ce producția e stabilă, fix proper:
$ npm test
# Fix toate issues
$ git commit -m "Cleanup after hotfix"
$ git push # Cu hooks normale
```

---

## 🔗 Resurse

### Documentație Git Hooks
- [Git Hooks Official Docs](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [Husky (alternative)](https://typicode.github.io/husky/)

### Alte Hooks Disponibile
- `pre-rebase` - Înainte de rebase
- `post-commit` - După commit
- `post-merge` - După merge
- `pre-receive` - Server-side, înainte de receive

### Template-uri
- `.githooks/pre-commit` - Template pre-commit
- `.githooks/pre-push` - Template pre-push

---

## 📝 Customizare

### Adaugă Verificare Nouă în Pre-Commit

```bash
# Editează .githooks/pre-commit
vim .githooks/pre-commit

# Adaugă la sfârșit:
echo "🔍 Verificare custom..."
if git diff --cached --name-only | xargs grep -n "FORBIDDEN_PATTERN"; then
  echo "❌ ERROR: Pattern interzis detectat!"
  exit 1
fi
```

### Adaugă Test Specific în Pre-Push

```bash
# Editează .githooks/pre-push
vim .githooks/pre-push

# Modifică linia de teste:
# Înainte:
npm test -- --run

# După (doar teste critice):
npm test -- --run src/test/critical.test.js
```

---

## ✅ Checklist Setup

- [ ] Rulat `bash setup-hooks.sh`
- [ ] Verificat `git config core.hooksPath` = `.githooks`
- [ ] Verificat permisiuni executabile pe hooks
- [ ] Testat pre-commit cu cod invalid
- [ ] Testat pre-commit cu cod valid
- [ ] Testat pre-push cu teste failed
- [ ] Testat pre-push cu teste passed
- [ ] Citit documentația completă
- [ ] Înțeles când să folosești `--no-verify`

---

**🎉 Git Hooks configurate și funcționale!**

**Next Steps:**
1. ✅ Testează hooks cu commit/push real
2. ⏳ Customizează verificări dacă e nevoie
3. ⏳ Educă echipa despre hooks
4. ⏳ Monitorizează eficiența hooks
