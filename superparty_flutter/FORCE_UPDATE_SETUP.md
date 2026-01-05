# Force Update System - Setup Guide

## Overview

Sistemul de **Force Update** obligă utilizatorii să actualizeze aplicația la ultima versiune înainte de a o putea folosi.

## Flow:

1. User deschide app
2. App verifică versiunea din Firestore (`app_config/version`)
3. Dacă `forceUpdate: true` și build-ul local < `minRequiredBuildNumber`:
   - Arată dialog NON-DISMISSIBLE
   - User NU poate folosi app-ul
   - Trebuie să apese "Actualizează Acum"
4. APK se descarcă din Firebase Storage
5. Se deschide installerul Android
6. După instalare, app pornește cu noua versiune

## Setup Firestore:

### 1. Creează collection `app_config`:

```javascript
// Firebase Console > Firestore > Start collection
// Collection ID: app_config
// Document ID: version

{
  "latestVersion": "1.0.1",
  "latestBuildNumber": 2,
  "minRequiredVersion": "1.0.1",
  "minRequiredBuildNumber": 2,
  "apkUrl": "https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media&token=YOUR_TOKEN",
  "forceUpdate": true,
  "updateMessage": "Versiune nouă disponibilă! Actualizează pentru a continua.",
  "releaseNotes": "- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Sistem de actualizare automată",
  "updatedAt": "2026-01-05T05:30:00Z"
}
```

### 2. Security Rules:

```
match /app_config/{document} {
  allow read: if true; // Public read pentru version check
  allow write: if false; // Doar admin prin console
}
```

### 3. Obține APK URL din Firebase Storage:

```bash
# Firebase Console > Storage > apk/app-release.apk
# Click pe fișier > Get download URL
# Copiază URL-ul și pune-l în apkUrl
```

## Cum să actualizezi versiunea:

### 1. Modifică `pubspec.yaml`:

```yaml
version: 1.0.2+3  # Format: MAJOR.MINOR.PATCH+BUILD_NUMBER
```

### 2. Build APK nou:

```bash
cd superparty_flutter
flutter build apk --release
```

### 3. Upload APK în Firebase Storage:

- Manual: Firebase Console > Storage > apk/ > Upload `app-release.apk`
- Sau: GitHub Actions face asta automat la push pe main

### 4. Update Firestore `app_config/version`:

```javascript
{
  "latestVersion": "1.0.2",
  "latestBuildNumber": 3,
  "minRequiredVersion": "1.0.2",  // Dacă vrei force update
  "minRequiredBuildNumber": 3,    // Dacă vrei force update
  "apkUrl": "...",  // Același URL sau nou dacă s-a schimbat token-ul
  "forceUpdate": true,
  "updateMessage": "Versiune nouă disponibilă! Actualizează pentru a continua.",
  "releaseNotes": "- Feature nou X\n- Bug fix Y",
  "updatedAt": "2026-01-05T06:00:00Z"
}
```

## Testare:

### Test 1: Force Update (build vechi)

1. Instalează APK cu build 1
2. Setează în Firestore: `minRequiredBuildNumber: 2`
3. Deschide app
4. ✅ Trebuie să apară dialog "Actualizare Obligatorie"
5. ✅ NU poți închide dialog-ul (back button disabled)
6. ✅ Apasă "Actualizează Acum" → descarcă APK
7. ✅ Se deschide installerul Android

### Test 2: No Update (build curent)

1. Instalează APK cu build 2
2. Setează în Firestore: `minRequiredBuildNumber: 2`
3. Deschide app
4. ✅ NU apare dialog
5. ✅ Merge direct la login

### Test 3: Optional Update (dezactivat momentan)

Dacă vrei să faci update-ul opțional:
- Setează `forceUpdate: false` în Firestore
- User-ul poate folosi app-ul fără să actualizeze

## Troubleshooting:

### Dialog nu apare:

- Verifică că `app_config/version` există în Firestore
- Verifică că `forceUpdate: true`
- Verifică că `minRequiredBuildNumber` > build-ul curent
- Check logs: `flutter logs` sau Android Studio Logcat

### APK nu se descarcă:

- Verifică că `apkUrl` este valid
- Verifică că Firebase Storage are permisiuni de citire publice
- Check internet connection

### APK nu se instalează:

- Verifică că user-ul are "Install unknown apps" enabled pentru app
- Android Settings > Apps > Special access > Install unknown apps > SuperParty > Allow
- Verifică că APK-ul este signed corect

### "Checking for updates..." infinit:

- Verifică că Firebase este inițializat corect
- Verifică că Firestore rules permit citire publică pentru `app_config`
- Check network connectivity

## Files Modified:

- `lib/services/update_checker_service.dart` - Service pentru verificare versiune
- `lib/widgets/force_update_dialog.dart` - Dialog non-dismissible
- `lib/screens/auth/login_screen.dart` - Integrare update checker
- `android/app/src/main/kotlin/.../MainActivity.kt` - Native code pentru install APK
- `android/app/src/main/AndroidManifest.xml` - Permissions + FileProvider
- `android/app/src/main/res/xml/file_paths.xml` - FileProvider config
- `pubspec.yaml` - Version bump

## Version Format:

```
version: MAJOR.MINOR.PATCH+BUILD_NUMBER

Example: 1.0.1+2
- MAJOR: 1 (breaking changes)
- MINOR: 0 (new features)
- PATCH: 1 (bug fixes)
- BUILD_NUMBER: 2 (incrementează la fiecare build)
```

**IMPORTANT**: `BUILD_NUMBER` este folosit pentru comparare, nu `MAJOR.MINOR.PATCH`!

## Production Workflow:

1. Developer face modificări în cod
2. Incrementează `version` în `pubspec.yaml`
3. Commit + push pe `main`
4. GitHub Actions:
   - Build APK signed
   - Upload în Firebase Storage
5. Admin actualizează manual Firestore `app_config/version`
6. La următoarea pornire, toți userii primesc dialog de update
7. Userii descarcă + instalează automat
8. App pornește cu noua versiune

## Future Improvements:

- [ ] Auto-update Firestore din GitHub Actions (după build success)
- [ ] Notificare push când apare update nou
- [ ] Download progress bar mai detaliat
- [ ] Retry logic dacă download eșuează
- [ ] Background download (fără să blocheze UI-ul)
- [ ] Delta updates (doar diff-ul, nu tot APK-ul)
