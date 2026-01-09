# Firebase Web Setup Instructions

## Current Status

✅ **firebase_options.dart created** with platform-specific configurations  
⚠️ **Web App ID is placeholder** - needs to be registered in Firebase Console

## Required: Register Web App in Firebase Console

The `firebase_options.dart` file currently has a placeholder web app ID:
```dart
appId: '1:168752018174:web:YOUR_WEB_APP_ID',
```

### Steps to Register Web App

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Select project: `superparty-frontend`

2. **Add Web App**
   - Click on the gear icon (⚙️) → Project settings
   - Scroll down to "Your apps" section
   - Click "Add app" → Select Web (</>) icon
   - App nickname: `SuperParty Web`
   - ✅ Check "Also set up Firebase Hosting for this app" (optional)
   - Click "Register app"

3. **Copy Web App Configuration**
   Firebase will show you the configuration:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyB5zJqeDVenc9ygUx2zyW2WLkczY6FLavI",
     authDomain: "superparty-frontend.firebaseapp.com",
     projectId: "superparty-frontend",
     storageBucket: "superparty-frontend.firebasestorage.app",
     messagingSenderId: "168752018174",
     appId: "1:168752018174:web:ACTUAL_WEB_APP_ID"  // ← Copy this
   };
   ```

4. **Update firebase_options.dart**
   Replace the placeholder in `lib/firebase_options.dart`:
   ```dart
   static const FirebaseOptions web = FirebaseOptions(
     apiKey: 'AIzaSyB5zJqeDVenc9ygUx2zyW2WLkczY6FLavI',
     appId: '1:168752018174:web:ACTUAL_WEB_APP_ID',  // ← Paste here
     messagingSenderId: '168752018174',
     projectId: 'superparty-frontend',
     authDomain: 'superparty-frontend.firebaseapp.com',
     storageBucket: 'superparty-frontend.firebasestorage.app',
   );
   ```

## Alternative: Use FlutterFire CLI (Recommended)

If you have Flutter/Dart installed locally, you can use the FlutterFire CLI to automatically configure:

```bash
# Install FlutterFire CLI
dart pub global activate flutterfire_cli

# Configure Firebase for all platforms
cd superparty_flutter
flutterfire configure --project=superparty-frontend --platforms=android,web,ios --yes
```

This will:
- Register the web app automatically (if not already registered)
- Generate `lib/firebase_options.dart` with correct IDs
- Update all platform configurations

## Current Configuration

**Project ID:** `superparty-frontend`  
**Project Number:** `168752018174`  
**API Key:** `AIzaSyB5zJqeDVenc9ygUx2zyW2WLkczY6FLavI`  
**Storage Bucket:** `superparty-frontend.firebasestorage.app`  

**Android App ID:** `1:168752018174:android:3886f632a089ee14d82baf` ✅  
**Web App ID:** `1:168752018174:web:YOUR_WEB_APP_ID` ⚠️ (needs registration)  
**iOS App ID:** `1:168752018174:ios:YOUR_IOS_APP_ID` ⚠️ (needs registration if using iOS)  

## Testing Web App

After updating the web app ID:

```bash
cd superparty_flutter
flutter clean
flutter pub get
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051
```

Open: http://127.0.0.1:5051

**Expected:**
- ✅ No "[core/no-app]" error
- ✅ Firebase initialized successfully
- ✅ App loads without red error screen

## Troubleshooting

### Error: "[core/no-app] No Firebase App '[DEFAULT]' has been created"

**Cause:** Firebase not initialized before accessing Auth/Firestore

**Solution:** Already fixed in this PR:
- `FirebaseService` now uses lazy getters
- `main.dart` calls `FirebaseService.initialize()` before `runApp()`
- All services use `FirebaseService.auth` / `FirebaseService.firestore`

### Error: "Firebase: Error (auth/invalid-api-key)"

**Cause:** Web app not registered or wrong API key

**Solution:** Register web app in Firebase Console and update `firebase_options.dart`

### Error: "Firebase: Error (auth/unauthorized-domain)"

**Cause:** Domain not authorized in Firebase Console

**Solution:**
1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Add: `127.0.0.1` and `localhost`
3. For production, add your actual domain

## Security Notes

- ✅ API keys in `firebase_options.dart` are safe to commit (they're public by design)
- ✅ Security is enforced by Firestore rules, not by hiding API keys
- ⚠️ Never commit service account keys or admin SDK credentials

## Next Steps

1. Register web app in Firebase Console
2. Update `firebase_options.dart` with actual web app ID
3. Test web app: `flutter run -d web-server`
4. Verify no console errors in browser DevTools (F12)
5. Deploy to Firebase Hosting (optional)
