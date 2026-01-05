# App Version Schema - Firestore

## Collection: `app_config`
## Document: `version`

Schema pentru configurația de versiune folosită de sistemul de Force Update.

## Schema Completă

```javascript
{
  // ===== CÂMPURI OBLIGATORII =====
  
  // Versiunea minimă acceptată (string format: "major.minor.patch")
  "min_version": "1.0.1",
  
  // Build number minim acceptat (int, folosit pentru comparare)
  "min_build_number": 2,
  
  // Dacă true, user-ul NU poate folosi app-ul fără update
  "force_update": true,
  
  
  // ===== CÂMPURI OPȚIONALE =====
  
  // Mesaj afișat în dialog de update
  "update_message": "Versiune nouă disponibilă! Actualizează pentru a continua.",
  
  // Release notes (ce e nou în versiune)
  "release_notes": "- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Bug fixes și îmbunătățiri",
  
  // URL de download pentru Android (Firebase Storage sau altă sursă)
  "android_download_url": "https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media&token=abc123",
  
  // URL de download pentru iOS (App Store link)
  "ios_download_url": "https://apps.apple.com/app/superparty/id123456789",
  
  // Timestamp când a fost actualizat config-ul
  "updated_at": "2026-01-05T05:45:00Z"
}
```

## Tipuri de Date

| Câmp | Tip | Obligatoriu | Default | Descriere |
|------|-----|-------------|---------|-----------|
| `min_version` | String | ✅ Da | - | Versiunea minimă (ex: "1.0.1") |
| `min_build_number` | Int | ✅ Da | - | Build number minim (ex: 2) |
| `force_update` | Boolean | ❌ Nu | `false` | Dacă true, blochează app-ul |
| `update_message` | String | ❌ Nu | Default message | Mesaj afișat în dialog |
| `release_notes` | String | ❌ Nu | `""` | Ce e nou în versiune |
| `android_download_url` | String | ❌ Nu | `null` | URL APK pentru Android |
| `ios_download_url` | String | ❌ Nu | `null` | URL App Store pentru iOS |
| `updated_at` | String | ❌ Nu | `null` | Timestamp ISO 8601 |

## Validare

### Câmpuri Obligatorii

```dart
// AppVersionConfig.fromFirestore() va arunca FormatException dacă:
// - min_version lipsește sau nu e String
// - min_build_number lipsește sau nu e int
```

### Exemple Valide

```javascript
// Minim valid
{
  "min_version": "1.0.0",
  "min_build_number": 1
}

// Complet
{
  "min_version": "1.0.1",
  "min_build_number": 2,
  "force_update": true,
  "update_message": "Actualizare obligatorie!",
  "release_notes": "- Bug fixes",
  "android_download_url": "https://...",
  "ios_download_url": "https://...",
  "updated_at": "2026-01-05T05:45:00Z"
}
```

### Exemple Invalide

```javascript
// ❌ Lipsește min_version
{
  "min_build_number": 1
}

// ❌ Lipsește min_build_number
{
  "min_version": "1.0.0"
}

// ❌ Tip greșit pentru min_version (trebuie String)
{
  "min_version": 1.0,
  "min_build_number": 1
}

// ❌ Tip greșit pentru min_build_number (trebuie int)
{
  "min_version": "1.0.0",
  "min_build_number": "1"
}
```

## Logica de Comparare

```dart
// Compararea se face pe BUILD_NUMBER, nu pe VERSION STRING!

// pubspec.yaml
version: 1.0.1+2  // BUILD_NUMBER = 2

// Firestore
min_build_number: 3

// Rezultat: needsForceUpdate = true (2 < 3)
```

**IMPORTANT**: `min_version` (ex: "1.0.1") este doar informativ. Compararea efectivă se face pe `min_build_number`.

## Naming Convention

Schema folosește **snake_case** pentru consistență cu codul existent:
- ✅ `min_version`, `min_build_number`, `force_update`
- ❌ NU `minVersion`, `minBuildNumber`, `forceUpdate` (camelCase)

Acest lucru e important pentru:
1. Consistență cu `AutoUpdateService` existent
2. Compatibilitate cu documentația existentă (`AUTO_UPDATE_DOCUMENTATION.md`)
3. Evitarea confuziei între două scheme diferite

## Exemple de Utilizare

### Setup Inițial (Admin)

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

Future<void> setupVersionConfig() async {
  await FirebaseFirestore.instance
      .collection('app_config')
      .doc('version')
      .set({
    'min_version': '1.0.0',
    'min_build_number': 1,
    'force_update': false,
    'update_message': 'Versiune nouă disponibilă!',
    'release_notes': '',
    'android_download_url': null,
    'ios_download_url': null,
    'updated_at': DateTime.now().toIso8601String(),
  });
}
```

### Update Versiune (Admin)

```dart
Future<void> releaseNewVersion({
  required String version,
  required int buildNumber,
  required bool forceUpdate,
  required String androidUrl,
  String? releaseNotes,
}) async {
  await FirebaseFirestore.instance
      .collection('app_config')
      .doc('version')
      .update({
    'min_version': version,
    'min_build_number': buildNumber,
    'force_update': forceUpdate,
    'android_download_url': androidUrl,
    'release_notes': releaseNotes ?? '',
    'updated_at': DateTime.now().toIso8601String(),
  });
}

// Exemplu
await releaseNewVersion(
  version: '1.0.2',
  buildNumber: 3,
  forceUpdate: true,
  androidUrl: 'https://firebasestorage.googleapis.com/...',
  releaseNotes: '- Bug fixes\n- New features',
);
```

### Citire Config (App)

```dart
import 'package:superparty_app/services/force_update_checker_service.dart';

final checker = ForceUpdateCheckerService();

// Citește config
final config = await checker.getVersionConfig();
if (config != null) {
  print('Min version: ${config.minVersion}');
  print('Min build: ${config.minBuildNumber}');
  print('Force update: ${config.forceUpdate}');
}

// Verifică dacă e nevoie de update
final needsUpdate = await checker.needsForceUpdate();
if (needsUpdate) {
  // Afișează ForceUpdateDialog
}
```

## Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_config/{document} {
      // Toată lumea poate citi (pentru version check)
      allow read: if true;
      
      // Doar admin poate scrie (prin Firebase Console)
      allow write: if false;
    }
  }
}
```

**Notă**: Pentru a permite write programatic (ex: din Cloud Functions), modifică regula:

```
allow write: if request.auth != null && request.auth.token.admin == true;
```

## Migration de la camelCase

Dacă ai folosit anterior camelCase (`latestVersion`, `minRequiredBuildNumber`), migrează astfel:

```dart
// Script de migrare (rulează o singură dată)
Future<void> migrateToSnakeCase() async {
  final doc = await FirebaseFirestore.instance
      .collection('app_config')
      .doc('version')
      .get();
  
  if (!doc.exists) return;
  
  final oldData = doc.data()!;
  
  // Mapează camelCase → snake_case
  final newData = {
    'min_version': oldData['latestVersion'] ?? oldData['minRequiredVersion'],
    'min_build_number': oldData['latestBuildNumber'] ?? oldData['minRequiredBuildNumber'],
    'force_update': oldData['forceUpdate'] ?? false,
    'update_message': oldData['updateMessage'] ?? '',
    'release_notes': oldData['releaseNotes'] ?? '',
    'android_download_url': oldData['apkUrl'] ?? oldData['androidDownloadUrl'],
    'ios_download_url': oldData['iosDownloadUrl'],
    'updated_at': DateTime.now().toIso8601String(),
  };
  
  await doc.reference.set(newData);
  print('Migration complete!');
}
```

## Changelog

### v1.0.1 (2026-01-05)
- Schema inițială cu snake_case
- Câmpuri obligatorii: `min_version`, `min_build_number`
- Câmpuri opționale: `force_update`, `update_message`, `release_notes`, `android_download_url`, `ios_download_url`, `updated_at`
- Validare strictă în `AppVersionConfig.fromFirestore()`

## Related Documentation

- [FORCE_UPDATE_SETUP.md](./FORCE_UPDATE_SETUP.md) - Setup complet și troubleshooting
- [AUTO_UPDATE_DOCUMENTATION.md](../AUTO_UPDATE_DOCUMENTATION.md) - Sistem de auto-update existent
- [README_AUTO_UPDATE.md](../README_AUTO_UPDATE.md) - Overview auto-update
