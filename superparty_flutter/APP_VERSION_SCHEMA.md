# App Version Management Schema

## Firestore Collection: `app_config`

### Document: `version`

```json
{
  "latestVersion": "1.0.0",
  "latestBuildNumber": 1,
  "minRequiredVersion": "1.0.0",
  "minRequiredBuildNumber": 1,
  "apkUrl": "https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media",
  "forceUpdate": true,
  "updateMessage": "Versiune nouă disponibilă! Actualizează pentru a continua.",
  "releaseNotes": "- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Îmbunătățiri performanță",
  "updatedAt": "2026-01-05T05:30:00Z"
}
```

## Fields:

- **latestVersion** (string): Versiunea curentă (ex: "1.0.0")
- **latestBuildNumber** (number): Build number curent (ex: 1)
- **minRequiredVersion** (string): Versiunea minimă acceptată
- **minRequiredBuildNumber** (number): Build number minim acceptat
- **apkUrl** (string): URL direct către APK în Firebase Storage
- **forceUpdate** (boolean): Dacă true, user-ul NU poate folosi app-ul fără update
- **updateMessage** (string): Mesaj afișat în dialog
- **releaseNotes** (string): Ce e nou în versiune
- **updatedAt** (timestamp): Când a fost actualizat

## Setup Manual:

```javascript
// Run in Firebase Console > Firestore
db.collection('app_config').doc('version').set({
  latestVersion: "1.0.0",
  latestBuildNumber: 1,
  minRequiredVersion: "1.0.0",
  minRequiredBuildNumber: 1,
  apkUrl: "https://firebasestorage.googleapis.com/v0/b/superparty-ai.appspot.com/o/apk%2Fapp-release.apk?alt=media",
  forceUpdate: true,
  updateMessage: "Versiune nouă disponibilă! Actualizează pentru a continua.",
  releaseNotes: "- Adăugat pagina Evenimente\n- Adăugat sistem Dovezi\n- Îmbunătățiri performanță",
  updatedAt: new Date()
});
```

## Security Rules:

```
match /app_config/{document} {
  allow read: if true; // Public read pentru version check
  allow write: if false; // Doar admin prin console
}
```

## Flow:

1. App pornește → citește `app_config/version`
2. Compară `latestBuildNumber` cu build-ul local din `package_info_plus`
3. Dacă `forceUpdate: true` și build local < `minRequiredBuildNumber`:
   - Arată dialog NON-DISMISSIBLE
   - Buton "Actualizează" → descarcă APK de la `apkUrl`
   - Trigger install
4. User NU poate folosi app-ul până nu actualizează
