# Force Update System - Setup Guide

## Overview

Sistemul de **Force Update** obligă utilizatorii să actualizeze aplicația înainte de a o putea folosi. Verificarea se face la pornirea app-ului, ÎNAINTE de login.

## Features

✅ **Non-dismissible dialog** - user-ul NU poate închide dialog-ul (back button disabled, barrierDismissible=false)  
✅ **Download APK cu progress bar** - stream-to-file (fără OOM pe APK-uri mari)  
✅ **Instalare nativă Android** - deschide installerul Android prin MethodChannel  
✅ **Fallback la Settings** - dacă "Install unknown apps" e disabled, ghidează user-ul  
✅ **Zero URL-uri hardcodate** - totul vine din Firestore config  

## Flow

```
1. User deschide app
   ↓
2. AuthWrapper verifică versiunea din Firestore (app_config/version)
   ↓
3. Dacă force_update=true și build local < min_build_number:
   ↓
4. Afișează ForceUpdateDialog (NON-DISMISSIBLE)
   ↓
5. User apasă "Actualizează Acum"
   ↓
6. Download APK din Firebase Storage (cu progress bar)
   ↓
7. Verifică permisiunea "Install unknown apps"
   ↓
8a. Dacă permisiunea e acordată → deschide installerul Android
8b. Dacă permisiunea lipsește → deschide Settings, apoi reîncearcă
   ↓
9. User instalează APK-ul
   ↓
10. App se reporneză cu versiunea nouă
```

## Firestore Schema

### Collection: `app_config`
### Document: `version`

```javascript
{
  // Versiune minimă acceptată (obligatoriu)
  "min_version": "1.0.1",           // String: "major.minor.patch"
  "min_build_number": 2,            // Int: build number minim acceptat
  
  // Force update (obligatoriu)
  "force_update": true,             // Bool: dacă true, blochează app-ul
  
  // Mesaje (opțional)
  "update_message": "Versiune nouă disponibilă! Actualizează pentru a continua.",
  "release_notes": "- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Bug fixes",
  
  // URL-uri download (obligatoriu pentru force update)
  "android_download_url": "https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media&token=...",
  "ios_download_url": "https://apps.apple.com/app/superparty/id123456789",
  
  // Metadata
  "updated_at": "2026-01-05T05:45:00Z"
}
```

**IMPORTANT**: Schema folosește **snake_case** (nu camelCase) pentru consistență cu codul existent.

## Setup Inițial

### 1. Configurează Firestore

#### Opțiunea A: Firebase Console (Manual)

1. Deschide Firebase Console → Firestore Database
2. Creează collection `app_config`
3. Creează document `version`
4. Adaugă câmpurile:

```
min_version: "1.0.1" (string)
min_build_number: 2 (number)
force_update: true (boolean)
update_message: "Versiune nouă disponibilă! Actualizează pentru a continua." (string)
release_notes: "- Feature X\n- Bug fix Y" (string)
android_download_url: "https://..." (string)
ios_download_url: "https://..." (string)
updated_at: "2026-01-05T05:45:00Z" (string)
```

#### Opțiunea B: Programatic (Dart)

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

Future<void> initializeVersionConfig() async {
  await FirebaseFirestore.instance
      .collection('app_config')
      .doc('version')
      .set({
    'min_version': '1.0.1',
    'min_build_number': 2,
    'force_update': true,
    'update_message': 'Versiune nouă disponibilă! Actualizează pentru a continua.',
    'release_notes': '- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi',
    'android_download_url': 'https://firebasestorage.googleapis.com/...',
    'ios_download_url': 'https://apps.apple.com/...',
    'updated_at': DateTime.now().toIso8601String(),
  });
}
```

### 2. Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_config/{document} {
      allow read: if true;  // Public read pentru version check
      allow write: if false; // Doar admin prin console
    }
  }
}
```

### 3. Obține APK URL din Firebase Storage

1. Build APK signed:
   ```bash
   cd superparty_flutter
   flutter build apk --release
   ```

2. Upload în Firebase Storage:
   - Firebase Console → Storage
   - Creează folder `apk/`
   - Upload `build/app/outputs/flutter-apk/app-release.apk`

3. Obține download URL:
   - Click pe fișier → "Get download URL"
   - Copiază URL-ul complet (cu token)
   - Adaugă în Firestore `android_download_url`

**Alternativ**: GitHub Actions face asta automat (vezi `.github/workflows/build-signed-apk.yml`)

## Cum să Actualizezi Versiunea

### Pas 1: Modifică `pubspec.yaml`

```yaml
version: 1.0.2+3  # Format: MAJOR.MINOR.PATCH+BUILD_NUMBER
```

**IMPORTANT**: `BUILD_NUMBER` (după `+`) este folosit pentru comparare, nu `MAJOR.MINOR.PATCH`!

### Pas 2: Build APK Nou

```bash
cd superparty_flutter
flutter build apk --release
```

### Pas 3: Upload APK în Firebase Storage

- Manual: Firebase Console → Storage → apk/ → Upload `app-release.apk`
- Sau: GitHub Actions face asta automat la push pe `main`

### Pas 4: Update Firestore Config

```javascript
// Firebase Console → Firestore → app_config/version
{
  "min_version": "1.0.2",
  "min_build_number": 3,  // Incrementează!
  "force_update": true,   // Dacă vrei să forțezi update-ul
  "update_message": "Versiune nouă cu feature X!",
  "release_notes": "- Feature X\n- Bug fix Y",
  "android_download_url": "...",  // Același URL sau nou dacă token-ul s-a schimbat
  "updated_at": "2026-01-05T06:00:00Z"
}
```

### Pas 5: Testează

1. Instalează APK vechi (build 2) pe un device
2. Setează în Firestore: `min_build_number: 3`
3. Deschide app-ul
4. ✅ Trebuie să apară dialog "Actualizare Obligatorie"

## Manual Testing Steps

### Test 1: Force Update (build vechi)

**Setup:**
1. Instalează APK cu build number 1
2. Setează în Firestore:
   ```javascript
   {
     "min_build_number": 2,
     "force_update": true,
     "android_download_url": "https://..."
   }
   ```

**Expected:**
1. ✅ App afișează "Verificare actualizări..."
2. ✅ Apare dialog "Actualizare Obligatorie" (non-dismissible)
3. ✅ Back button NU închide dialog-ul
4. ✅ Tap outside NU închide dialog-ul
5. ✅ Apasă "Actualizează Acum" → progress bar 0-100%
6. ✅ După download → installerul Android se deschide
7. ✅ Instalează APK → app se reporneză cu versiunea nouă

### Test 2: No Update (build curent)

**Setup:**
1. Instalează APK cu build number 2
2. Setează în Firestore: `min_build_number: 2`

**Expected:**
1. ✅ App afișează "Verificare actualizări..."
2. ✅ NU apare dialog de update
3. ✅ Merge direct la login/home

### Test 3: Permission Required

**Setup:**
1. Instalează APK cu build number 1
2. Setează în Firestore: `min_build_number: 2, force_update: true`
3. Dezactivează "Install unknown apps" pentru app:
   - Settings → Apps → SuperParty → Advanced → Install unknown apps → OFF

**Expected:**
1. ✅ Dialog apare și download pornește
2. ✅ După download → mesaj "Permisiune necesară"
3. ✅ Butonul se schimbă în "Deschide Setări"
4. ✅ Apasă buton → Settings se deschid la "Install unknown apps"
5. ✅ Activează permisiunea → revino la app
6. ✅ Apasă din nou "Actualizează Acum" → installerul se deschide

### Test 4: Download Error

**Setup:**
1. Setează în Firestore un URL invalid: `android_download_url: "https://invalid.url"`

**Expected:**
1. ✅ Dialog apare
2. ✅ Apasă "Actualizează Acum" → progress bar pornește
3. ✅ După câteva secunde → mesaj de eroare roșu
4. ✅ Butonul se schimbă în "Încearcă Din Nou"
5. ✅ Apasă din nou → reîncearcă download-ul

## Troubleshooting

### Dialog nu apare

**Cauze posibile:**
- `app_config/version` nu există în Firestore
- `force_update: false` în Firestore
- `min_build_number` <= build-ul curent
- Eroare la citire Firestore (check logs)

**Soluție:**
```bash
# Check logs
flutter logs

# Verifică Firestore
# Firebase Console → Firestore → app_config/version
```

### APK nu se descarcă

**Cauze posibile:**
- URL invalid în `android_download_url`
- Firebase Storage nu are permisiuni de citire publice
- Conexiune la internet lipsește

**Soluție:**
```bash
# Verifică URL-ul în browser
# Trebuie să descarce APK-ul direct

# Verifică Storage Rules
# Firebase Console → Storage → Rules
# allow read: if true;
```

### APK nu se instalează

**Cauze posibile:**
- "Install unknown apps" disabled pentru app
- APK nu e signed corect
- FileProvider nu e configurat corect

**Soluție:**
```bash
# Verifică permisiunea
# Settings → Apps → SuperParty → Advanced → Install unknown apps → ON

# Verifică signing
# android/app/build.gradle trebuie să aibă signingConfigs

# Verifică FileProvider
# android/app/src/main/AndroidManifest.xml
# android/app/src/main/res/xml/file_paths.xml
```

### "Checking for updates..." infinit

**Cauze posibile:**
- Firebase nu e inițializat corect
- Firestore rules blochează citirea
- Network timeout

**Soluție:**
```bash
# Check Firebase init
# lib/main.dart → FirebaseService.initialize()

# Check Firestore rules
# allow read: if true; pentru app_config

# Check network
# Verifică conexiunea la internet
```

## Known Limitations

1. **iOS**: Instalarea automată NU e posibilă pe iOS (App Store policy). Pe iOS, `ios_download_url` trebuie să fie link către App Store.

2. **APK Size**: Pentru APK-uri foarte mari (>100MB), download-ul poate dura mult. Consider adding a "Download in background" feature.

3. **Storage Space**: Dacă device-ul nu are spațiu, download-ul va eșua. Consider checking available space before download.

4. **Network**: Dacă conexiunea se pierde în timpul download-ului, trebuie reînceput de la 0. Consider adding resume capability.

5. **Multiple Updates**: Dacă user-ul are build 1 și există build 2, 3, 4, va trebui să instaleze fiecare în parte (nu sare direct la 4).

## Architecture

### Flutter Side

```
lib/
├── models/
│   └── app_version_config.dart          # Model pentru Firestore config
├── services/
│   ├── force_update_checker_service.dart # Verificare versiune
│   ├── apk_downloader_service.dart       # Download APK (stream-to-file)
│   └── apk_installer_bridge.dart         # Bridge Flutter <-> Android
├── widgets/
│   └── force_update_dialog.dart          # Dialog non-dismissible
└── main.dart                             # AuthWrapper integration
```

### Android Side

```
android/app/src/main/
├── kotlin/.../MainActivity.kt            # MethodChannel implementation
├── AndroidManifest.xml                   # Permissions + FileProvider
└── res/xml/file_paths.xml               # FileProvider paths
```

### Firestore

```
app_config/
└── version/                              # Version config document
```

### Firebase Storage

```
apk/
└── app-release.apk                       # Latest APK
```

## Version Format

```
version: MAJOR.MINOR.PATCH+BUILD_NUMBER

Example: 1.0.1+2
- MAJOR: 1 (breaking changes)
- MINOR: 0 (new features)
- PATCH: 1 (bug fixes)
- BUILD_NUMBER: 2 (incrementează la fiecare build)
```

**IMPORTANT**: Compararea se face pe `BUILD_NUMBER`, nu pe `MAJOR.MINOR.PATCH`!

## Production Workflow

```
1. Developer modifică cod
   ↓
2. Incrementează version în pubspec.yaml (ex: 1.0.1+2 → 1.0.2+3)
   ↓
3. Commit + push pe main
   ↓
4. GitHub Actions:
   - Build APK signed
   - Upload în Firebase Storage (apk/app-release.apk)
   ↓
5. Admin actualizează manual Firestore app_config/version:
   - min_build_number: 3
   - force_update: true
   - android_download_url: (URL nou dacă token s-a schimbat)
   ↓
6. La următoarea pornire, toți userii primesc dialog de update
   ↓
7. Userii descarcă + instalează automat
   ↓
8. App pornește cu noua versiune
```

## Future Improvements

- [ ] Auto-update Firestore din GitHub Actions (după build success)
- [ ] Background download (fără să blocheze UI-ul)
- [ ] Resume download dacă conexiunea se pierde
- [ ] Check available storage space înainte de download
- [ ] Delta updates (doar diff-ul, nu tot APK-ul)
- [ ] Notificare push când apare update nou
- [ ] Optional update (cu "Mai târziu" button)
- [ ] Scheduled updates (update doar în anumite ore)
