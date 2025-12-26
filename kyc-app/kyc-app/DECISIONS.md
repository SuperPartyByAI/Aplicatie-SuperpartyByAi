# 🧠 DECISIONS LOG - Decizii Tehnice

**Toate deciziile importante luate în dezvoltarea aplicației.**

Format: [Architecture Decision Records (ADR)](https://adr.github.io/)

---

## 📋 Index Decizii

| ID | Decizie | Data | Status |
|----|---------|------|--------|
| ADR-001 | Firebase ca Backend | 2025-12-20 | ✅ Accepted |
| ADR-002 | React + Vite ca Frontend | 2025-12-20 | ✅ Accepted |
| ADR-003 | OpenAI pentru AI Features | 2025-12-26 | ✅ Accepted |
| ADR-004 | Firebase Secret Manager pentru Secrete | 2025-12-26 | ✅ Accepted |
| ADR-005 | Mod Admin/GM Integrat în HomeScreen | 2025-12-26 | ✅ Accepted |
| ADR-006 | Mesaje Eroare în Română | 2025-12-26 | ✅ Accepted |
| ADR-007 | Merge în Main (Nu Branch Separat) | 2025-12-26 | ✅ Accepted |
| ADR-008 | Documentație în 10+ Fișiere | 2025-12-26 | ✅ Accepted |

---

## ADR-001: Firebase ca Backend

**Data**: 2025-12-20  
**Status**: ✅ Accepted  
**Decidenti**: Development Team

### Context
Trebuia ales un backend pentru aplicația KYC.

### Opțiuni Considerate
1. **Firebase** (Google)
2. Node.js + Express + MongoDB
3. Supabase
4. AWS Amplify

### Decizie
**Ales: Firebase**

### Motivație
- ✅ Authentication built-in (email/password)
- ✅ Firestore (NoSQL database) scalabil
- ✅ Cloud Functions pentru backend logic
- ✅ Storage pentru fișiere
- ✅ Hosting gratuit
- ✅ Secret Manager pentru secrete
- ✅ Free tier generos
- ✅ Integrare ușoară cu React

### Consecințe
**Pozitive:**
- Setup rapid (< 1 zi)
- Scalabilitate automată
- Costuri mici (free tier)
- Security rules built-in

**Negative:**
- Vendor lock-in (Google)
- Limitat la NoSQL (nu SQL)

---

## ADR-002: React + Vite ca Frontend

**Data**: 2025-12-20  
**Status**: ✅ Accepted

### Context
Trebuia ales un framework frontend modern.

### Opțiuni Considerate
1. **React + Vite**
2. Next.js
3. Vue.js
4. Angular

### Decizie
**Ales: React + Vite**

### Motivație
- ✅ React = cel mai popular (comunitate mare)
- ✅ Vite = build ultra-rapid (< 5 secunde)
- ✅ Hot Module Replacement (HMR) instant
- ✅ Bundle size mic (~220KB gzipped)
- ✅ Ecosistem vast de librării

### Consecințe
**Pozitive:**
- Development experience excelent
- Build time rapid
- Bundle size mic
- Performanță excelentă

**Negative:**
- Nu e SSR (Server-Side Rendering) by default
- Trebuie configurare manuală pentru SEO

---

## ADR-003: OpenAI pentru AI Features

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
Trebuia implementat AI Manager cu validare imagini și chat.

### Opțiuni Considerate
1. **OpenAI GPT-4o + Vision**
2. Google Gemini
3. Anthropic Claude
4. Open-source (Llama, Mistral)

### Decizie
**Ales: OpenAI GPT-4o-mini (chat) + GPT-4o Vision (imagini)**

### Motivație
- ✅ GPT-4o Vision = cel mai bun pentru validare imagini
- ✅ API simplu și bine documentat
- ✅ Rate limits generoase
- ✅ Costuri rezonabile (~$50-100/lună)
- ✅ Suport pentru Object Gatekeeper prompt
- ✅ JSON mode pentru răspunsuri structurate

### Consecințe
**Pozitive:**
- Acuratețe excelentă (>95%)
- Timp răspuns rapid (< 3 secunde)
- Suport pentru imagini multiple
- JSON responses reliable

**Negative:**
- Costuri variabile (depinde de usage)
- Vendor lock-in (OpenAI)
- Rate limits (10k tokens/min)

---

## ADR-004: Firebase Secret Manager pentru Secrete

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
Trebuia ales unde să salvăm secretele (OpenAI API Key, Deploy Token).

### Opțiuni Considerate
1. **Firebase Secret Manager**
2. .env files (local)
3. GitHub Secrets
4. HashiCorp Vault
5. AWS Secrets Manager

### Decizie
**Ales: Firebase Secret Manager**

### Motivație
- ✅ Encryption AES-256-GCM (enterprise-grade)
- ✅ IAM access control
- ✅ Audit logs pentru toate accesările
- ✅ Versioning (poți reveni la versiuni anterioare)
- ✅ Integrare nativă cu Cloud Functions
- ✅ Gratuit (inclus în Firebase)
- ✅ Accesibil din orice workspace

### Consecințe
**Pozitive:**
- Securitate maximă (10/10)
- Zero secrete hardcodate
- Zero secrete pe GitHub
- Acces controlat și auditat

**Negative:**
- Trebuie Firebase CLI pentru acces local
- Nu poți vedea secretele în Firebase Console (security feature)

---

## ADR-005: Mod Admin/GM Integrat în HomeScreen

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
User voia mod Admin și GM, dar nu era clar dacă să fie pagini separate sau integrate.

### Opțiuni Considerate
1. **Integrat în HomeScreen** (sidebar dinamic)
2. Pagini separate (AdminScreen.jsx, GMScreen.jsx)
3. Modal overlay
4. Tab-uri în HomeScreen

### Decizie
**Ales: Integrat în HomeScreen cu sidebar dinamic**

### Motivație
- ✅ User experience mai bun (nu schimbi pagina)
- ✅ Același layout și navbar
- ✅ Activare rapidă (scrie `admin` sau `gm` în chat)
- ✅ Dezactivare rapidă (buton "Ieși din Admin/GM")
- ✅ Indicator clar în navbar (culoare violet/verde)
- ✅ Cod mai organizat (tot în HomeScreen)

### Consecințe
**Pozitive:**
- UX excelent
- Cod centralizat
- Ușor de întreținut
- Activare/dezactivare instant

**Negative:**
- HomeScreen.jsx mai mare (~1200 linii)
- Logică mai complexă (state management)

---

## ADR-006: Mesaje Eroare în Română

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
Firebase returnează erori în engleză (ex: "auth/invalid-credential").

### Opțiuni Considerate
1. **Traducere manuală în română**
2. Lăsat în engleză
3. Librărie i18n (multi-language)

### Decizie
**Ales: Traducere manuală în română**

### Motivație
- ✅ Utilizatorii sunt români
- ✅ Mesaje clare și user-friendly
- ✅ Implementare simplă (switch statement)
- ✅ Nu trebuie librărie extra
- ✅ User înțelege exact ce e greșit

### Consecințe
**Pozitive:**
- UX mult îmbunătățit
- Utilizatori înțeleg erorile
- Reducere support requests

**Negative:**
- Trebuie mențin lista de traduceri
- Dacă Firebase adaugă erori noi, trebuie actualizat

---

## ADR-007: Merge în Main (Nu Branch Separat)

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
Toate modificările erau pe `feature/ai-manager`. Trebuia decis dacă să facem merge în `main`.

### Opțiuni Considerate
1. **Merge în main**
2. Păstrare pe feature branch
3. Creare branch `develop` intermediar

### Decizie
**Ales: Merge în main**

### Motivație
- ✅ `main` devine versiunea oficială
- ✅ Alți developeri văd modificările
- ✅ Deploy de obicei se face din `main`
- ✅ Repository mai curat (1 branch activ)
- ✅ Toate features sunt testate și funcționale

### Consecințe
**Pozitive:**
- Repository organizat
- `main` actualizat cu toate features
- Ușor de urmărit progresul
- Deploy din `main` (best practice)

**Negative:**
- Nu mai ai branch separat pentru features noi
- Trebuie creat branch nou pentru next feature

---

## ADR-008: Documentație în 10+ Fișiere

**Data**: 2025-12-26  
**Status**: ✅ Accepted

### Context
Trebuia documentată aplicația pentru conversații viitoare.

### Opțiuni Considerate
1. **10+ fișiere specializate**
2. Un singur README.md mare
3. Wiki extern (Notion, Confluence)
4. Comentarii în cod

### Decizie
**Ales: 10+ fișiere specializate**

### Motivație
- ✅ Fiecare fișier are scop clar
- ✅ Ușor de găsit informația
- ✅ Ușor de actualizat
- ✅ Poate fi citit selectiv (nu tot deodată)
- ✅ Versionat cu Git (istoric complet)
- ✅ Accesibil din orice workspace

### Fișiere Create
```
START_HERE.md       → Quick start (1 min)
CONTEXT.md          → Context complet (5 min)
TODO.md             → Task-uri viitoare
CHANGELOG.md        → Istoric modificări
DECISIONS.md        → Decizii tehnice (acest fișier)
CURRENT_SESSION.md  → Sesiune curentă
SECURITY_AUDIT.md   → Audit securitate
AI_ARCHITECTURE.md  → Arhitectură AI
ARCHITECTURE.md     → Arhitectură app
DEPLOY.md           → Ghid deploy
```

### Consecințe
**Pozitive:**
- Documentație completă și organizată
- Ușor de navigat
- Ușor de actualizat
- Versionat cu Git

**Negative:**
- Mai multe fișiere de întreținut
- Risc de duplicare informații

---

## 📝 Template Decizie Nouă

```markdown
## ADR-XXX: [Titlu Decizie]

**Data**: YYYY-MM-DD  
**Status**: 🔄 Proposed / ✅ Accepted / ❌ Rejected / ⚠️ Deprecated

### Context
[De ce trebuie luată această decizie?]

### Opțiuni Considerate
1. **Opțiunea 1**
2. Opțiunea 2
3. Opțiunea 3

### Decizie
**Ales: [Opțiunea aleasă]**

### Motivație
- ✅ Pro 1
- ✅ Pro 2
- ✅ Pro 3

### Consecințe
**Pozitive:**
- Beneficiu 1
- Beneficiu 2

**Negative:**
- Dezavantaj 1
- Dezavantaj 2
```

---

## 🔄 Proces Luare Decizii

### 1. Identificare Problemă
- Ce trebuie decis?
- De ce e important?
- Care e impactul?

### 2. Research Opțiuni
- Ce alternative există?
- Care sunt pro/contra pentru fiecare?
- Ce fac alții în industrie?

### 3. Evaluare
- Care opțiune se potrivește cel mai bine?
- Care sunt trade-off-urile?
- Ce consecințe pe termen lung?

### 4. Decizie
- Alege opțiunea
- Documentează în acest fișier
- Commit + Push

### 5. Review
- După 1-3 luni, verifică dacă decizia a fost bună
- Dacă nu, documentează de ce și ia decizie nouă

---

**Ultima Actualizare**: 2025-12-26  
**Total Decizii**: 8  
**Status**: ✅ Active
