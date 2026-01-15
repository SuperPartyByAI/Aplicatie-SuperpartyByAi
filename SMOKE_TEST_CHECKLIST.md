# Smoke Test Checklist — PR #34

**Rulează după CI verde, înainte de merge/deploy.**

**Timp estimat**: 15 minute  
**Environment**: Staging sau Production (după deploy)

---

## A. Flutter App Smoke Test (10 minute)

### 1. Cold Start ✅
- [ ] Deschide app-ul (cold start)
- [ ] App pornește fără crash
- [ ] Login screen apare (sau auto-login dacă token valid)

**Expected**: App pornește normal, fără erori în console.

---

### 2. Navigation ✅
- [ ] Navighează la **Home** (sau ecran principal după login)
- [ ] Navighează la **Events** (`/evenimente`)
- [ ] Navighează la **Staff Settings** (`/staff-settings`) — dacă ești staff
- [ ] Navighează la **Admin** (`/admin`) — dacă ești admin

**Expected**: Navigația funcționează, fără erori `404` sau `PERMISSION_DENIED`.

---

### 3. Read Firestore ✅
- [ ] **Events list**: Deschide ecranul Events și confirmă că lista se încarcă
- [ ] **Event details**: Deschide un event și confirmă că datele se încarcă
- [ ] **Staff profile**: Dacă ești staff, verifică că profilul tău se încarcă

**Expected**: 
- Datele se încarcă din Firestore
- **NU** apar erori `PERMISSION_DENIED` în console/logs
- **NU** apar erori `Missing or insufficient permissions`

**Verificare în Firestore Console**:
- `evenimente/{eventId}` — readable
- `staffProfiles/{uid}` — readable (dacă ești staff)

---

### 4. Write Firestore ✅
- [ ] **Update user profile**: 
  - Ex: Schimbă `displayName` în Settings
  - Confirmă în Firestore Console că `users/{uid}` s-a actualizat
- [ ] **Create/update event** (dacă ai permisiuni):
  - Ex: Creează un event nou sau actualizează unul existent
  - Confirmă în Firestore Console că `evenimente/{eventId}` s-a creat/actualizat

**Expected**:
- Write-ul reușește (fără erori în UI)
- Datele apar în Firestore Console
- **NU** apar erori `PERMISSION_DENIED` pentru colecții permise (ex: `users`, `evenimente`)

**Verificare în Firestore Console**:
- `users/{uid}` — updated (doar câmpuri permise: `displayName`, `phone`, `kycData`, `updatedAt`)
- `evenimente/{eventId}` — created/updated (dacă ai permisiuni)

---

## B. Backend Functions Smoke Test (5 minute)

### 1. Protected Endpoint ✅
- [ ] **Obține token**: Folosește script `scripts/get-auth-emulator-token.ps1` (local) sau obține token de producție
- [ ] **Test endpoint**: 
  ```powershell
  # Exemple (ajustă URL-ul pentru environment)
  curl.exe -i https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccounts `
    -H "Authorization: Bearer <TOKEN>"
  ```

**Expected**:
- `200` (success) — dacă ai permisiuni
- `403` (forbidden) — dacă nu ai permisiuni (normal pentru non-admin)
- `500` (server error) — dacă e config issue (nu e blocant dacă e cunoscut)
- **NU** `401` "missing token" sau "Unauthorized" când token-ul e valid

---

### 2. Logs Check ✅
- [ ] **Verifică logs** (Railway / Firebase Functions logs):
  - [ ] **NU** apar spam-uri de erori repetate (ex: Logtail "Unauthorized" în loop)
  - [ ] **NU** apar erori de tip "Cannot find module" sau "Missing dependencies"
  - [ ] Logurile normale apar (ex: "QR code generated", "Connection created")

**Expected**:
- Logs curate, fără spam
- Dacă Logtail e dezactivat (token lipsă), apare doar un mesaj informativ la startup

---

## C. WhatsApp Backend (dacă e deploy-uit) ✅

- [ ] **Health check**: 
  ```powershell
  curl.exe https://whats-upp-production.up.railway.app/health
  ```
  Expected: `200 OK`

- [ ] **Logs**: Verifică Railway logs pentru:
  - [ ] **NU** spam "Logtail Unauthorized"
  - [ ] **NU** erori de conexiune repetate
  - [ ] Heartbeat-uri normale (dacă e configurat)

---

## ✅ Smoke Test Results

**Date**: _______________  
**Environment**: Staging / Production  
**Tester**: _______________

### Flutter App
- [ ] Cold start: ✅ PASS / ❌ FAIL
- [ ] Navigation: ✅ PASS / ❌ FAIL
- [ ] Read Firestore: ✅ PASS / ❌ FAIL
- [ ] Write Firestore: ✅ PASS / ❌ FAIL

### Backend Functions
- [ ] Protected endpoint: ✅ PASS / ❌ FAIL
- [ ] Logs check: ✅ PASS / ❌ FAIL

### WhatsApp Backend (dacă aplicabil)
- [ ] Health check: ✅ PASS / ❌ FAIL
- [ ] Logs check: ✅ PASS / ❌ FAIL

---

## 🚦 Decision

- ✅ **PASS** — Toate testele trec → **GO** pentru merge
- ❌ **FAIL** — Cel puțin un test eșuează → **NO-GO**, debug necesar

**Notes** (dacă FAIL):
- Ce test a eșuat: _______________
- Eroarea exactă: _______________
- Pași de debug: _______________

---

**Last updated**: 2026-01-15
