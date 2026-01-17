# Developer Setup Guide

Acest ghid conține instrucțiuni complete pentru configurarea mediului de dezvoltare, testare și build.

---

## 📋 Conținut

1. [Configurare Inițială](#configurare-inițială)
2. [Firebase Setup](#firebase-setup)
3. [App Check Configuration](#app-check-configuration)
4. [Firebase Emulator](#firebase-emulator)
5. [Environment Management](#environment-management)
6. [Testing](#testing)
7. [Build & Release](#build--release)
8. [Troubleshooting](#troubleshooting)

---

## 🚀 Configurare Inițială

### Cerințe

- Flutter SDK (3.5.4+)
- Dart SDK (3.10.7+)
- Android Studio / Xcode (pentru mobile)
- Node.js & npm (pentru Firebase Emulator)
- Firebase CLI (`npm install -g firebase-tools`)

### Instalare Dependencies

```bash
cd superparty_flutter
flutter pub get
```

---

## 🔥 Firebase Setup

### 1. Configurează Firebase pentru fiecare environment

```bash
# Development
flutterfire configure --project=your-dev-project-id --out=lib/firebase_options_dev.dart

# Staging (opțional)
flutterfire configure --project=your-staging-project-id --out=lib/firebase_options_staging.dart

# Production
flutterfire configure --project=your-prod-project-id --out=lib/firebase_options_prod.dart
```

**IMPORTANT:** Nu se commit-uiesc fișierele de configurare separate pentru staging/dev. Folosim `firebase_options.dart` standard generat de FlutterFire și gestionăm environment-ul prin `APP_ENV` dart-define.

### 2. Verifică Configurare

```bash
flutter doctor
flutter doctor --android-licenses  # Acceptă licențele Android SDK
```

---

## 🛡️ App Check Configuration

### Debug Mode (Development)

1. **Rulează aplicația în debug mode:**
   ```bash
   flutter run --dart-define=APP_ENV=dev
   ```

2. **Copiază debug token din loguri:**
   ```
   [FirebaseService] 🔑 App Check DEBUG TOKEN: <token-here>
   ```

3. **Adaugă token-ul în Firebase Console:**
   - Deschide Firebase Console -> App Check
   - Click pe "Manage debug tokens" (Android)
   - Adaugă token-ul copiat
   - Salvează

4. **Re-rulează aplicația** - warning-ul ar trebui să dispară

**NOTĂ:** În iOS, debug tokens sunt gestionate automat de Firebase SDK.

### Release Mode (Production)

1. **Build release:**
   ```bash
   flutter build apk --release
   flutter build ios --release
   ```

2. **App Check se activează automat:**
   - **Android**: `AndroidProvider.playIntegrity`
   - **iOS**: `AppleProvider.appAttest`

3. **Activează Enforcement în Firebase Console:**
   - **⚠️ NU activa enforcement până când:**
     - Release build-ul funcționează corect
     - Play Integrity / App Attest sunt testate
     - Ai confirmat că token-urile sunt generate corect

   - **Pași pentru activare:**
     1. Mergi la Firebase Console -> App Check
     2. Verifică că token-urile sunt generate corect pentru release builds
     3. Testează aplicația pe device-uri reale în release mode
     4. Doar după confirmare, activează "Enforce App Check" pentru servicii relevante (Auth, Firestore, Functions)

---

## 🧪 Firebase Emulator

### Setup Emulator

1. **Instalează Firebase Emulator Suite:**
   ```bash
   npm install -g firebase-tools
   firebase init emulators
   # Selectează: Authentication, Firestore, Functions (dacă e cazul)
   ```

2. **Start emulators:**
   ```bash
   firebase emulators:start
   # Sau folosește script-ul npm (dacă există):
   npm run emu:start
   ```

   Emulator UI va fi disponibil la: `http://localhost:4001`

### Conectează Aplicația la Emulator

```bash
# Android (folosește 10.0.2.2 automat)
flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false

# Android (folosește 127.0.0.1, necesită adb reverse)
adb reverse tcp:9098 tcp:9098  # Auth
adb reverse tcp:8082 tcp:8082  # Firestore
adb reverse tcp:5002 tcp:5002  # Functions (dacă e cazul)
flutter run --dart-define=USE_EMULATORS=true

# iOS (folosește 127.0.0.1 automat)
flutter run --dart-define=USE_EMULATORS=true
```

### Creează User de Test în Emulator

```bash
# Via Firebase Emulator UI (http://localhost:4001)
# Sau via REST API:
curl -X POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123"
  }'
```

---

## 🌍 Environment Management

### Environment Variables

Aplicația suportă 3 environment-uri: `dev`, `staging`, `prod`.

```bash
# Development (default în debug)
flutter run --dart-define=APP_ENV=dev

# Staging
flutter run --dart-define=APP_ENV=staging

# Production (default în release)
flutter build apk --release  # Folosește prod automat
flutter build apk --release --dart-define=APP_ENV=prod  # Explicit
```

### Verifică Environment Activ

```dart
import 'package:superparty_app/core/config/env.dart';

if (Env.isDev) {
  print('Running in development mode');
}
```

---

## ✅ Testing

### Unit Tests

```bash
flutter test
```

### Integration Tests (cu Emulator)

```bash
# 1. Start emulator
firebase emulators:start

# 2. În alt terminal, rulează integration tests
flutter test integration_test/login_test.dart --dart-define=USE_EMULATORS=true
```

### Logcat Filter (Android)

```bash
# Filtrează log-urile Firebase și Auth
adb logcat | grep -E "FirebaseService|Auth|AppCheck"

# Doar erori
adb logcat *:E | grep -E "FirebaseService|Auth"
```

---

## 🧭 Navigation Guard

Aplicația folosește **GoRouter** (`MaterialApp.router`), nu `MaterialApp` cu named routes. **Navigator.pushNamed** va cauza crash-uri.

### Verificare Regresii Navigation

Rulează scriptul de guard înainte de commit pentru a preveni introducerea accidentale a `Navigator.pushNamed`:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
./tool/forbid_named_navigator.sh
```

**Folosește GoRouter navigation:**
- `context.go('/path')` - pentru navigare/tabs/drawer (înlocuiește ruta curentă)
- `context.push('/path')` - pentru push details screens (adăugă pe stack)

**NU folosi:**
- ❌ `Navigator.pushNamed(context, '/path')`
- ❌ `Navigator.pushReplacementNamed(...)`
- ❌ `Navigator.pushNamedAndRemoveUntil(...)`

### Rute Disponibile

Vezi `lib/router/app_router.dart` pentru toate rutele disponibile (ex: `/home`, `/evenimente`, `/team`, etc.).

---

## 📦 Build & Release

### Android

```bash
# Debug
flutter build apk --debug --dart-define=APP_ENV=dev

# Release
flutter build apk --release  # Folosește prod automat
flutter build appbundle --release
```

### iOS

```bash
# Debug
flutter build ios --debug --dart-define=APP_ENV=dev --no-codesign

# Release (necesită Xcode pentru signing)
flutter build ios --release
```

---

## 🐛 Troubleshooting

### "No AppCheckProvider installed"

**Cauză:** App Check nu este configurat sau debug token nu este adăugat în Firebase Console.

**Soluție:**
1. Verifică că `firebase_app_check` este în `pubspec.yaml`
2. Rulează aplicația în debug și copiază debug token
3. Adaugă token-ul în Firebase Console -> App Check -> Debug tokens
4. Re-rulează aplicația

### "Email invalid" la login (deși e valid)

**Cauză:** Email-ul nu este normalizat (spații, majuscule).

**Soluție:** Aplicația normalizează automat email-ul (trim + lowercase). Verifică că nu există probleme de format.

### Emulator Connection Failed

**Cauză:** Porturile nu sunt accesibile sau adb reverse nu este configurat.

**Soluții:**
1. Verifică că emulatorul rulează: `firebase emulators:start`
2. Pentru Android, folosește `USE_ADB_REVERSE=false` (folosește 10.0.2.2)
3. Sau configurează adb reverse manual:
   ```bash
   adb reverse tcp:9098 tcp:9098
   adb reverse tcp:8082 tcp:8082
   ```

### Build Failures (NDK)

**Cauză:** NDK lipsă sau corupt.

**Soluție:**
```bash
# Instalează NDK prin Android Studio:
# SDK Manager -> SDK Tools -> NDK (Side by side) -> Instalează versiunea necesară

# Sau lasă Gradle să instaleze automat:
flutter clean
flutter build apk
```

---

## 📚 Referințe

- [Firebase App Check Documentation](https://firebase.google.com/docs/app-check)
- [Firebase Emulator Documentation](https://firebase.google.com/docs/emulator-suite)
- [FlutterFire Documentation](https://firebase.flutter.dev/)
- [Flutter Testing Guide](https://docs.flutter.dev/testing)

---

## ✅ Checklist Pre-Release

- [ ] App Check debug token adăugat în Firebase Console
- [ ] Release build testat pe device real
- [ ] Play Integrity / App Attest funcționează în release
- [ ] Environment-urile (dev/staging/prod) sunt configurate corect
- [ ] Integration tests trec cu emulator
- [ ] Logging-ul nu expune parole sau informații sensibile
- [ ] Email normalization și validare funcționează corect
- [ ] Error messages sunt clare și în română
- [ ] **NU** se activează App Check enforcement până când release-ul e testat complet

---

**Ultima actualizare:** $(date)