# Checklist de Testare - Login/Auth Flow

## ✅ Testare Manuală

### 1. Login / Înregistrare
- [ ] **Login cu email valid** → Se autentifică corect
- [ ] **Login cu email cu majuscule** → Se normalizează (lowercase)
- [ ] **Login cu email cu spații** → Se normalizează (trim)
- [ ] **Login cu email invalid** → Afișează eroare corectă
- [ ] **Login cu parolă greșită** → Afișează eroare corectă
- [ ] **Înregistrare cont nou** → Creează cont + salvează în Firestore
- [ ] **Detecție typo domeniu** → Sugerează corect (ex. gmail.com vs gmai.com)

### 2. Protecția Rutelor
- [ ] **Acces rute protejate fără login** → Redirecționează la login
- [ ] **Acces `/home` fără login** → Redirecționează la login
- [ ] **Acces `/whatsapp` fără login** → Redirecționează la login
- [ ] **Acces `/evenimente` fără login** → Redirecționează la login
- [ ] **După login** → Acces permis la toate rutele protejate

### 3. Return Route (Navigare după login)
- [ ] **Login de pe `/evenimente`** → După login, revine la `/evenimente`
- [ ] **Login de pe `/whatsapp/inbox`** → După login, revine la `/whatsapp/inbox`
- [ ] **Login de pe `/home`** → După login, rămâne pe `/home`
- [ ] **Login cu `?from=/invalid-route`** → Fallback la `/home` (validare)
- [ ] **Login cu `?from=http://external.com`** → Fallback la `/home` (securitate)
- [ ] **Login cu `?from=/`** → Navighează corect

### 4. Salvare Date User (Firestore)
- [ ] **Înregistrare cont nou** → Creează document în `users/{uid}`
- [ ] **Câmpuri salvate corect**: email, name, phone, status, createdAt, updatedAt
- [ ] **Update profil** → Actualizează `updatedAt` corect
- [ ] **Merge: true** → Nu suprascrie date existente

### 5. KYC Redirect
- [ ] **User cu `status: 'kyc_required'`** → Redirecționează la `/kyc`
- [ ] **User cu `status: 'active'`** → Nu redirecționează
- [ ] **User fără status** → Nu redirecționează

### 6. Logout
- [ ] **Logout din aplicație** → Se deconectează corect
- [ ] **După logout** → Redirecționează la login
- [ ] **După logout, acces rute protejate** → Redirecționează la login

### 7. Timeout & Fallback
- [ ] **Auth stream timeout (debug)** → Folosește `currentUser` ca fallback
- [ ] **Auth stream timeout (release)** → Folosește `currentUser` ca fallback
- [ ] **Firestore timeout (debug)** → Nu blochează aplicația
- [ ] **Firestore timeout (release)** → Nu blochează aplicația

## ✅ Testare pe Platforme

### iOS Simulator
- [ ] Toate testele de mai sus funcționează
- [ ] Nu există crash-uri la startup
- [ ] Logging nu cauzează probleme

### Android Emulator
- [ ] Toate testele de mai sus funcționează
- [ ] Nu există crash-uri la startup
- [ ] Logging nu cauzează probleme

### Web (dacă aplicabil)
- [ ] **Login funcționează** → Nu există erori `dart:io`
- [ ] **Navigare funcționează** → Rutele se schimbă corect
- [ ] **Return route funcționează** → Revine la ruta corectă
- [ ] **Nu există erori în console** → Logging funcționează (developer.log)

## ✅ Testare Integration

### Flow Complet
1. [ ] **User nou** → Înregistrare → Login → Navigare → Logout
2. [ ] **User existent** → Login → Navigare → Logout
3. [ ] **User cu KYC required** → Login → Redirect KYC → Completare → Navigare

### Edge Cases
- [ ] **Login rapid după logout** → Funcționează corect
- [ ] **Navigare rapidă între rute** → Nu există race conditions
- [ ] **App restart după login** → Păstrează sesiunea
- [ ] **Network offline** → Afișează eroare corectă (nu blochează)

## 🔍 Verificări Tehnice

### Cod
- [ ] **Validare return route** → Doar rute whitelist-uite sunt permise
- [ ] **Logging** → Nu folosește path-uri hardcodate Mac (sau e în try/catch)
- [ ] **dart:io imports** → Conditional pentru Web (dacă e necesar)

### Performance
- [ ] **Login time** → < 2 secunde (normal), < 5 secunde (timeout fallback)
- [ ] **Navigare** → Instant (fără delay vizibil)
- [ ] **Memory leaks** → Nu există (verifică cu DevTools)

## 📝 Note

- **Timeout-uri**: Debug mode = 30s, Release = 5s (pentru emulatoare)
- **Validare rute**: Whitelist în `_isValidReturnRoute()` din `auth_wrapper.dart`
- **Logging**: Folosește `developer.log` (safe pentru Web) sau try/catch pentru file logging
