# Manual Verification Checklist - Stability Hardening

**PR**: #34  
**Branch**: `whatsapp-production-stable`  
**HEAD**: `f99e9c4cd`

---

## Setup (o singură dată)

### 1. Instalează Java (dacă nu e instalat)
```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
```

---

## Testare Locală (3 terminale)

### Terminal 1: Start Emulators
```powershell
npm run emu
```
**Așteaptă:** `✔  All emulators ready!`  
**URL-uri:**
- Firestore: http://127.0.0.1:8080
- Functions: http://127.0.0.1:5002
- Auth: http://127.0.0.1:9098
- UI: http://127.0.0.1:4001

### Terminal 2: Seed Firestore (după ce emulators pornesc)
```powershell
npm run seed:emu
```
**Așteaptă:** `✅ Seed completed for project: demo-test`

### Terminal 3: Run Flutter
```powershell
cd superparty_flutter
flutter run --dart-define=USE_EMULATORS=true
```

---

## Checklist de Verificare (12 pași)

### ✅ 1. Idempotency allocateStaffCode (double click)
**Pași:**
1. Login: `test@local.dev` / `test123456`
2. Navighează: `/staff-settings`
3. Selectează echipă: "Echipa A"
4. Click rapid "Alocă cod" de 2 ori (< 1 sec între click-uri)

**Verificări:**
- [ ] Doar un singur cod a fost alocat (nu duplicate)
- [ ] În Emulator UI (http://127.0.0.1:4001):
  - [ ] `teamAssignments/team_a_{uid}` există o singură dată
  - [ ] `staffRequestTokens/{uid}_{tokenHash}` există cu `result` cached (conține `teamId`, `prefix`, `number`, `assignedCode`)
- [ ] UI afișează codul alocat (nu eroare de duplicate)

---

### ✅ 2. Idempotency finalizeStaffSetup
**Pași:**
1. După alocare cod, completează telefon: `+40722123456`
2. Click rapid "Salvează" de 2 ori (< 1 sec)

**Verificări:**
- [ ] `staffProfiles/{uid}` are `setupDone: true` o singură dată
- [ ] `users/{uid}` are `staffSetupDone: true` o singură dată
- [ ] În Emulator UI: `staffRequestTokens/{uid}_{tokenHash}` pentru finalizeStaffSetup există cu `result` cached
- [ ] UI afișează mesaj de succes (nu eroare de duplicate)

---

### ✅ 3. Admin Gating / Redirect
**Pași:**
1. Login cu user non-admin (ex: `test@local.dev`)
2. Accesează `/admin` în URL sau prin UI

**Verificări:**
- [ ] Redirect automat la `/home` (nu acces la admin dashboard)
- [ ] Nu apare eroare 403 în console
- [ ] Logout, login cu admin, accesează `/admin`:
  - [ ] Acces permis (vezi admin dashboard)
  - [ ] Listă de staff profiles disponibilă

**Setup Admin (dacă nu ai admin):**
```powershell
# În Firestore emulator UI: users/{uid} -> {role: "admin"}
# SAU rulează:
node tools/set_admin_claim.js --email admin@local.dev --project demo-test
```

---

### ✅ 4. WhatsApp UI Double-Tap Protection
**Pași:**
1. Login ca admin
2. Navighează: `/whatsapp/accounts`
3. Click rapid "Add Account" de 2 ori (< 1 sec)
4. Completează formular, click rapid "Add" de 2 ori

**Verificări:**
- [ ] Doar un singur account a fost adăugat (nu duplicate)
- [ ] Button "Add Account" este disabled când `_isAddingAccount == true`
- [ ] Loading indicator apare când acțiunea e în flight

**Test Regenerate QR:**
5. Găsește un account cu QR, click rapid "Regenerate QR" de 2 ori

**Verificări:**
- [ ] Doar un singur request a fost trimis
- [ ] Button "Regenerate QR" este disabled când `_regeneratingQr.contains(accountId)`

---

### ✅ 5. Error Mapping (401 Unauthorized)
**Pași:**
1. Logout din app
2. Încearcă să accesezi `/staff-settings` sau `/admin`

**Verificări:**
- [ ] Redirect automat la `/` (login screen)
- [ ] Nu apare crash sau eroare neclară în UI

---

### ✅ 6. Error Mapping (403 Forbidden)
**Pași:**
1. Login cu user non-admin
2. Accesează `/admin`

**Verificări:**
- [ ] Redirect automat la `/home`
- [ ] Mesaj clar sau silent redirect (nu crash)

---

### ✅ 7. Retry Logic (nu retriază 401/403)
**Pași:**
1. Deschide DevTools / Network tab
2. Login cu credențiale invalide
3. Observă network requests

**Verificări:**
- [ ] După 401, nu se mai trimite request (nu retry)
- [ ] După 403, nu se mai trimite request (nu retry)

**Notă:** Retry logic este implementat în `retryWithBackoff`, dar verificarea manuală necesită monitoring network requests.

---

### ✅ 8. Firestore Rules - Client Write Denied
**Pași:**
1. În Flutter app, deschide DevTools console
2. Încearcă să scrii direct în Firestore:
```dart
// În Dart console (dacă e disponibil) sau prin UI
FirebaseFirestore.instance.collection('teamAssignments').doc('test').set({'test': true});
FirebaseFirestore.instance.collection('adminActions').doc('test').set({'test': true});
FirebaseFirestore.instance.collection('threads').doc('test').set({'test': true});
```

**Verificări:**
- [ ] Toate request-urile sunt denied (permission-denied error)
- [ ] În Emulator UI, documentele nu apar în colecțiile respective

---

### ✅ 9. WhatsAppApiService - ProjectId Derived
**Pași:**
1. Deschide `superparty_flutter/lib/services/whatsapp_api_service.dart`
2. Verifică că `_getFunctionsUrl()` folosește `Firebase.app().options.projectId`

**Verificări:**
- [ ] Nu există hardcoded `'superparty-by-ai'` sau alte valori fixe
- [ ] Codul derivează projectId din Firebase options

---

### ✅ 10. WhatsAppApiService - Emulator Support
**Pași:**
1. Rulează Flutter cu `--dart-define=USE_EMULATORS=true`
2. Check logs pentru `[FirebaseService] 🔧 Using Firebase emulators`

**Verificări:**
- [ ] Logs afișează că emulators sunt folosiți
- [ ] WhatsApp API calls merg la `http://127.0.0.1:5002` (nu la production)

---

### ✅ 11. Husky Pre-commit (Windows)
**Pași:**
1. Fă o modificare mică în orice fișier
2. `git add .`
3. `git commit -m "test husky"`

**Verificări:**
- [ ] Commit reușește (nu e blocat de husky)
- [ ] Dacă npx nu e disponibil, mesaj non-blocking apare: `⚠️  npx not found in PATH, skipping lint-staged`

---

### ✅ 12. Functions Build & Export
**Pași:**
```powershell
cd functions
npm ci
npm run build
```

**Verificări:**
- [ ] Build reușește fără erori TypeScript
- [ ] `functions/dist/index.js` există
- [ ] `functions/dist/index.js` conține exports pentru:
  - `allocateStaffCode`
  - `finalizeStaffSetup`
  - `updateStaffPhone`
  - `changeUserTeam`
  - `setUserStatus`

---

## Rezumat Verificare

| Test | Status | Note |
|------|--------|------|
| Idempotency allocateStaffCode | ⬜ | Double click -> același rezultat |
| Idempotency finalizeStaffSetup | ⬜ | Double click -> același rezultat |
| Admin gating / redirect | ⬜ | Non-admin -> redirect /home |
| WhatsApp UI double-tap protection | ⬜ | Buttons disabled când în flight |
| Error mapping 401 | ⬜ | Redirect la / |
| Error mapping 403 | ⬜ | Redirect la /home |
| Retry nu retriază 401/403 | ⬜ | Network monitoring necesar |
| Firestore rules - client write denied | ⬜ | Permission denied pentru server-only |
| WhatsAppApiService projectId derived | ⬜ | Nu hardcoded |
| WhatsAppApiService emulator support | ⬜ | USE_EMULATORS=true funcționează |
| Husky Windows resilient | ⬜ | Non-blocking pe Windows |
| Functions build & export | ⬜ | TypeScript compilează, exports există |

---

## Problema Identificată / Rezolvată

**Dacă găsești probleme:**
1. Notează pașii exacti pentru reproducere
2. Verifică logs (Flutter console, Functions logs, Emulator UI)
3. Verifică Firestore rules în Emulator UI (compilează fără erori?)

**Checklist complet = toate testele ✅ = PR ready pentru merge**
