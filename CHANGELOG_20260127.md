# Changelog - 27 Ianuarie 2026

## Rezumat Modificări

Acest document descrie toate modificările făcute în sesiunea de astăzi pentru îmbunătățirea aplicației WhatsApp.

---

## 1. Separarea Inbox-urilor WhatsApp

### Problema
Inbox-ul afișa toate conversațiile din toate conturile conectate, fără separare între contul personal și conturile de angajat.

### Soluție Implementată

#### A. Serviciu nou: `WhatsAppAccountService`
**Fișier:** `superparty_flutter/lib/services/whatsapp_account_service.dart`

**Funcționalități:**
- `getMyWhatsAppAccountId()` - Obține contul WhatsApp personal al utilizatorului
- `getEmployeeWhatsAppAccountIds()` - Obține conturile WhatsApp de angajat
- `getAllowedAccountIds()` - Obține toate conturile permise (personal + angajat)
- `setMyWhatsAppAccountId()` - Setează contul personal
- `setEmployeeWhatsAppAccountIds()` - Setează conturile de angajat

**Configurare Firestore:**
```javascript
// users/{uid}
{
  "myWhatsAppAccountId": "account_prod_...",  // Pentru My Inbox
  "employeeWhatsAppAccountIds": [              // Pentru Employee Inbox
    "account_prod_team_1",
    "account_prod_team_2"
  ]
}
```

#### B. Ecran nou: `MyInboxScreen`
**Fișier:** `superparty_flutter/lib/screens/whatsapp/my_inbox_screen.dart`

**Caracteristici:**
- Afișează doar thread-urile din contul personal (`myWhatsAppAccountId`)
- Fără dropdown (un singur cont)
- Sortare descrescătoare după `lastMessageAt`
- Butoane pentru apel WhatsApp și telefon

**Rută:** `/whatsapp/my-inbox`

#### C. Ecran nou: `EmployeeInboxScreen`
**Fișier:** `superparty_flutter/lib/screens/whatsapp/employee_inbox_screen.dart`

**Caracteristici:**
- Afișează thread-urile din conturile de angajat (`employeeWhatsAppAccountIds`)
- Dropdown pentru selectarea contului (dacă sunt multiple)
- Sortare descrescătoare după `lastMessageAt`
- Butoane pentru apel WhatsApp și telefon

**Rută:** `/whatsapp/employee-inbox`

#### D. Actualizat `WhatsAppScreen`
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart`

**Modificări:**
- Adăugat buton "My Inbox" (apare doar dacă `myWhatsAppAccountId` este setat)
- Adăugat buton "Employee Inbox" (apare doar dacă utilizatorul este angajat și are conturi)
- Păstrat buton "Inbox (All Accounts)" pentru admin

#### E. Routing actualizat
**Fișier:** `superparty_flutter/lib/router/app_router.dart`

**Rute noi:**
- `/whatsapp/my-inbox` → `MyInboxScreen`
- `/whatsapp/employee-inbox` → `EmployeeInboxScreen`

**Documentație:** `superparty_flutter/WHATSAPP_INBOX_SEPARATION.md`

---

## 2. Fix Sortare Stabilă pentru Inbox

### Problema
Contactele "săreau" la refresh - ordinea se schimba aleatoriu când mai multe thread-uri aveau același `lastMessageAt` sau null.

### Soluție Implementată

#### A. Parser robust pentru `lastMessageAt`
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`

**Funcție nouă:** `_parseLastMessageAt(dynamic v)`

**Suportă formate:**
- `DateTime` direct
- `Timestamp` (Firestore)
- `Map` cu `_seconds` / `_milliseconds` / `seconds` / `milliseconds`
- `int` (milliseconds dacă > 1e12, altfel seconds)
- `String` (ISO 8601)
- Fallback la `updatedAt`, `lastMessageAtMs`, `lastMessageTimestamp`

#### B. Sortare stabilă cu tie-breaker
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`

**Modificare în `_rebuildThreadsFromCache()`:**
- Adăugat index original (`__idx`) pentru fiecare thread
- Sortare după timestamp (descrescător)
- Tie-breaker pe index când timpurile sunt egale/null
- Previne "săritul" thread-urilor la refresh

**Rezultat:**
- Thread-urile rămân în aceeași ordine la refresh
- Sortare corectă descrescătoare (cele mai recente primele)
- Funcționează corect chiar dacă unele thread-uri au `lastMessageAt` null

---

## 3. Securitate: Whitelist pentru Return Route

### Problema
După login, aplicația naviga la orice rută din parametrul `?from=`, inclusiv URL-uri externe (risc de open redirect attack).

### Soluție Implementată

#### A. Funcție de validare
**Fișier:** `superparty_flutter/lib/screens/auth/auth_wrapper.dart`

**Funcție:** `_isValidReturnRoute(String route)`

**Verificări:**
- Ruta trebuie să înceapă cu `/` (rută internă)
- Blochează scheme/host (URL-uri externe)
- Blochează root path `/` (previne loop-uri)
- Whitelist de rute permise:
  - `/home`, `/evenimente`, `/disponibilitate`, `/salarizare`
  - `/centrala`, `/whatsapp`, `/team`, `/admin`, `/ai-chat`, `/kyc`
- Permite sub-rute (ex: `/whatsapp/inbox`, `/whatsapp/my-inbox`)

#### B. Folosit în navigare
**Fișier:** `superparty_flutter/lib/screens/auth/auth_wrapper.dart`

**Modificare:**
- Înainte: `context.go(decodedRoute)` direct
- Acum: Verifică cu `_isValidReturnRoute()` → navighează doar dacă e valid, altfel fallback la `/home`

---

## 4. Web Compatibility: Eliminat `dart:io` din Router

### Problema
`app_router.dart` importa `dart:io` și folosea `File()` pentru logging, ceea ce putea cauza probleme pe Web.

### Soluție Implementată

#### A. Creat `DebugLogger` cross-platform
**Fișier:** `superparty_flutter/lib/utils/debug_logger.dart`

**Caracteristici:**
- Folosește `developer.log()` (safe pentru Web)
- Fără path-uri hardcodate
- Funcții helper: `log()`, `logUI()`, `logNavigation()`
- Funcționează pe toate platformele (iOS, Android, Web)

#### B. Eliminat `dart:io` din router
**Fișier:** `superparty_flutter/lib/router/app_router.dart`

**Modificări:**
- Eliminat `import 'dart:io';`
- Eliminat `import 'dart:convert';` (nu mai e necesar)
- Înlocuit toate `File('/Users/universparty/.cursor/debug.log')` cu `DebugLogger.log()`
- Safe pentru Web

---

## 5. Eliminat Referințe la Railway

### Problema
Codul conținea referințe la Railway (deprecated), deși acum se folosește Hetzner.

### Soluție Implementată

#### A. Actualizat `backend-url.js`
**Fișier:** `functions/lib/backend-url.js`

**Modificări:**
- Eliminat `WHATSAPP_RAILWAY_BASE_URL` (deprecated)
- Eliminat comentariile despre Railway
- Adăugat default Hetzner: `http://37.27.34.179:8080`
- Adăugat warning dacă nu e configurat (folosește default Hetzner)

**Priority order:**
1. `BACKEND_BASE_URL` (preferred)
2. `WHATSAPP_BACKEND_BASE_URL` (legacy)
3. `WHATSAPP_BACKEND_URL` (legacy)
4. Firebase config (`whatsapp.backend_base_url`)
5. Default Hetzner (`http://37.27.34.179:8080`)

#### B. Îmbunătățit error handling
**Fișier:** `functions/whatsappProxy.js`

**Modificări:**
- Error handling mai detaliat în `sendHandler`
- Logging pentru debugging
- Mesaje de eroare mai clare

---

## 6. Butoane Apel WhatsApp

### Implementat Anterior (Confirmat)

#### A. Buton WhatsApp în Chat Screen
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`

**Caracteristici:**
- Buton `Icons.video_call` (verde) în AppBar
- Deschide WhatsApp cu `whatsapp://send?phone=...` (nativ)
- Fallback la `https://wa.me/...` (web)
- Mesaj: "S-a deschis WhatsApp. Apasă iconița Call acolo."

#### B. Buton WhatsApp în Inbox Screen
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart`

**Caracteristici:**
- Buton `Icons.video_call` (verde) în ListTile
- Același comportament ca în Chat Screen

#### C. Buton Telefon Clasic
- Păstrat în ambele ecrane (`Icons.phone` albastru)
- Deschide aplicația de telefon nativă

---

## 7. Media și Locație Sharing

### Implementat Anterior (Confirmat)

#### A. Butoane Media în Chat Screen
**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`

**Funcționalități:**
- `_pickImage()` - Selectează poze din galerie
- `_takePhoto()` - Face poze cu camera
- `_pickFile()` - Selectează fișiere (PDF, DOC, etc.)
- `_sendLocation()` - Trimite locația curentă (Google Maps link)

**Implementare:**
- Upload în Firebase Storage
- Trimite link-ul ca text message
- Compatibil cu endpoint-ul actual

#### B. Permisiuni iOS
**Fișier:** `superparty_flutter/ios/Runner/Info.plist`

**Adăugate:**
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`
- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSLocationWhenInUseUsageDescription`

#### C. Dependențe
**Fișier:** `superparty_flutter/pubspec.yaml`

**Adăugate:**
- `file_picker: ^8.1.4`
- `geolocator: ^13.0.3`

---

## 8. Link-uri Clickabile în Mesaje

### Implementat Anterior (Confirmat)

**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart`

**Funcție:** `_buildMessageText(String body, bool isOutbound)`

**Caracteristici:**
- Detectează URL-uri în text
- Face URL-urile clickabile cu `TapGestureRecognizer`
- Deschide cu `launchUrl()` în browser extern
- Suport pentru link-uri complete sau parțiale

---

## 9. Buton Home în WhatsApp Screen

### Implementat

**Fișier:** `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart`

**Modificare:**
- Adăugat buton Home în AppBar (stânga sus)
- Navighează la `/home` (ecranul principal)

---

## Fișiere Modificate

### Flutter App
1. `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart` - Sortare stabilă
2. `superparty_flutter/lib/screens/whatsapp/whatsapp_screen.dart` - Buton Home + My/Employee Inbox
3. `superparty_flutter/lib/screens/auth/auth_wrapper.dart` - Whitelist return route
4. `superparty_flutter/lib/router/app_router.dart` - Eliminat dart:io, adăugat rute noi
5. `superparty_flutter/lib/screens/whatsapp/whatsapp_chat_screen.dart` - Error handling îmbunătățit

### Fișiere Noi (Flutter)
1. `superparty_flutter/lib/services/whatsapp_account_service.dart` - Serviciu pentru accountId mapping
2. `superparty_flutter/lib/screens/whatsapp/my_inbox_screen.dart` - Inbox personal
3. `superparty_flutter/lib/screens/whatsapp/employee_inbox_screen.dart` - Inbox angajat
4. `superparty_flutter/lib/utils/debug_logger.dart` - Logger cross-platform
5. `superparty_flutter/WHATSAPP_INBOX_SEPARATION.md` - Documentație
6. `superparty_flutter/TESTING_CHECKLIST_AUTH.md` - Checklist testare

### Firebase Functions
1. `functions/lib/backend-url.js` - Eliminat Railway, adăugat default Hetzner
2. `functions/whatsappProxy.js` - Error handling îmbunătățit

---

## Pași de Configurare

### 1. Configurare Firestore pentru Inbox-uri Separate

Pentru fiecare utilizator, adaugă în `users/{uid}`:

```javascript
{
  "myWhatsAppAccountId": "account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443",
  "employeeWhatsAppAccountIds": [
    "account_prod_team_1",
    "account_prod_team_2"
  ]
}
```

### 2. Configurare Firebase Functions

Setare secret pentru backend URL:

```bash
firebase functions:secrets:set BACKEND_BASE_URL
# Sau
firebase functions:config:set whatsapp.backend_base_url="http://37.27.34.179:8080"
```

---

## Testare

### 1. Testare Sortare Stabilă
- Deschide Inbox
- Verifică că contactele sunt sortate descrescător (cele mai recente primele)
- Apasă refresh - ordinea ar trebui să rămână stabilă

### 2. Testare Inbox-uri Separate
- Configurează `myWhatsAppAccountId` în Firestore
- Deschide "My Inbox" - ar trebui să vezi doar thread-urile din contul personal
- Configurează `employeeWhatsAppAccountIds` în Firestore
- Deschide "Employee Inbox" - ar trebui să vezi thread-urile din conturile de angajat

### 3. Testare Securitate Return Route
- Încearcă să accesezi o rută protejată fără login
- Login → ar trebui să te întoarcă la ruta protejată
- Încearcă cu `?from=http://evil.com` → ar trebui să ignore și să meargă la `/home`

---

## Note Importante

1. **Backward Compatibility**: Inbox-ul original (`/whatsapp/inbox`) rămâne disponibil pentru admin
2. **Default Backend**: Dacă nu e configurat, folosește Hetzner (`http://37.27.34.179:8080`)
3. **Web Safe**: Router-ul este acum safe pentru Web (fără `dart:io`)
4. **Security**: Return route este acum protejat cu whitelist

---

## Commit Message Sugestie

```
feat: WhatsApp inbox separation + stable sorting + security improvements

- Add My Inbox and Employee Inbox screens with account filtering
- Implement stable sorting for threads (prevents order jumping)
- Add whitelist validation for return route (security)
- Remove Railway references, use Hetzner as default
- Replace File logging with DebugLogger (Web-safe)
- Improve error handling in chat screen and Firebase Functions

Breaking changes: None (backward compatible)
```
