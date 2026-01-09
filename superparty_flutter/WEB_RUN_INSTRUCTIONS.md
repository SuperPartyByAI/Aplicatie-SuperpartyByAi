# Flutter Web - Run Instructions

## Prerequisites

✅ Flutter SDK installed  
✅ Chrome or Edge browser  
✅ Firebase project configured (superparty-frontend)

## Quick Start

### Option 1: Use the Script (Recommended)

**Windows:**
```cmd
cd C:\Users\ursac\StudioProjects\Aplicatie-SuperpartyByAi\superparty_flutter
run-web.bat
```

**Linux/Mac:**
```bash
cd ~/StudioProjects/Aplicatie-SuperpartyByAi/superparty_flutter
./run-web.sh
```

### Option 2: Manual Commands

```bash
cd superparty_flutter
flutter clean
flutter pub get
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051
```

## Access the App

Open in browser: **http://127.0.0.1:5051**

## Hot Reload

While the app is running:
- Press **`r`** for hot reload (fast refresh)
- Press **`R`** for hot restart (full restart)
- Press **`q`** to quit

## Verify No Errors

Open browser DevTools (F12) → Console tab

### ✅ Expected (Good)
```
[Main] Initializing Firebase...
[FirebaseService] Initializing Firebase...
[FirebaseService] ✅ Firebase initialized successfully
[Main] ✅ Firebase initialized successfully
[Main] ℹ️ Background service skipped (not supported on web)
[Main] ℹ️ Push notifications skipped (not supported on web)
[Main] Starting app...
```

### ❌ Should NOT See (Bad)
```
[core/no-app] No Firebase App '[DEFAULT]' has been created
FirebaseOptions cannot be null
FormatException: Missing required field: min_version
MissingPluginException ... flutter_foreground_task
Future.catchError must return a value of the future's type
```

## Troubleshooting

### Error: "[core/no-app]"

**Cause:** Firebase not initialized before accessing Auth/Firestore

**Solution:** Already fixed in code:
- `FirebaseService.initialize()` called before `runApp()`
- All services use lazy getters

### Error: "FirebaseOptions cannot be null"

**Cause:** `firebase_options.dart` missing or not imported

**Solution:** Already fixed - file exists and is imported in `FirebaseService`

### Error: "MissingPluginException ... flutter_foreground_task"

**Cause:** Background service plugin not available on web

**Solution:** Already fixed - background service skipped on web with `kIsWeb` check

### Error: "FormatException: Missing required field: min_version"

**Cause:** Firestore config uses legacy schema

**Solution:** Already fixed - `AppVersionConfig` supports both legacy and new schemas

### Error: "Future.catchError must return a value"

**Cause:** `catchError` on `Future<bool>` without return statement

**Solution:** Already fixed - returns `false` in catchError

### Error: "Platform.isAndroid not available on web"

**Cause:** `dart:io` Platform class used on web

**Solution:** Already fixed - uses `defaultTargetPlatform` instead

## Web-Specific Limitations

### Not Available on Web
- ❌ Background services (flutter_foreground_task)
- ❌ Push notifications (native)
- ❌ Direct APK/IPA downloads
- ❌ File system access (dart:io)
- ❌ Native plugins (unless web-compatible)

### Available on Web
- ✅ Firebase Auth
- ✅ Firestore
- ✅ Firebase Storage
- ✅ Cloud Functions
- ✅ Most UI components
- ✅ Hot reload/restart

## Performance Tips

### Development Mode
```bash
flutter run -d web-server --web-renderer html
```
- Faster compilation
- Better debugging
- Use for development

### Production Build
```bash
flutter build web --release --web-renderer canvaskit
```
- Better performance
- Better graphics
- Use for deployment

## Deployment

### Build for Production
```bash
flutter build web --release
```

Output: `build/web/`

### Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

Make sure `firebase.json` points to the correct directory:
```json
{
  "hosting": {
    "public": "build/web",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

## Common Issues

### Issue: White screen on load

**Check:**
1. Browser console for errors (F12)
2. Network tab for failed requests
3. Firebase initialization logs

**Solution:**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Check Firebase config in `firebase_options.dart`

### Issue: Hot reload not working

**Check:**
1. Terminal shows "Hot reload succeeded"
2. Browser is connected to dev server
3. No compilation errors

**Solution:**
- Try hot restart (R) instead
- Restart dev server
- Clear browser cache

### Issue: Firebase auth not working

**Check:**
1. Firebase Console → Authentication → Sign-in methods
2. Authorized domains include `127.0.0.1` and `localhost`
3. Web app registered in Firebase Console

**Solution:**
1. Go to Firebase Console → Project Settings
2. Add authorized domain: `127.0.0.1`
3. Register web app if not already registered

## Development Workflow

### 1. Start Dev Server
```bash
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051
```

### 2. Make Changes
Edit files in `lib/`

### 3. Hot Reload
Press `r` in terminal

### 4. Test in Browser
Open http://127.0.0.1:5051

### 5. Check Console
F12 → Console for errors

### 6. Repeat
Make changes → Hot reload → Test

## Debugging

### Enable Verbose Logging
```bash
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051 -v
```

### Check Flutter Doctor
```bash
flutter doctor -v
```

### Check Web Support
```bash
flutter devices
```

Should show:
```
Chrome (web) • chrome • web-javascript • Google Chrome 120.0.6099.109
Web Server (web) • web-server • web-javascript • Flutter Tools
```

## Environment Variables

### Development
```bash
# .env.development
FLUTTER_WEB_RENDERER=html
FLUTTER_WEB_USE_SKIA=false
```

### Production
```bash
# .env.production
FLUTTER_WEB_RENDERER=canvaskit
FLUTTER_WEB_USE_SKIA=true
```

## Browser Compatibility

### Supported Browsers
- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+

### Recommended for Development
- Chrome (best DevTools)
- Edge (good performance)

## Security Notes

### CORS
If you see CORS errors:
1. Check Firebase Hosting configuration
2. Add CORS headers in `firebase.json`
3. Use Firebase Hosting for production

### API Keys
- ✅ API keys in `firebase_options.dart` are safe (public by design)
- ✅ Security enforced by Firestore rules
- ⚠️ Never commit service account keys

## Next Steps

1. ✅ Run web app: `flutter run -d web-server`
2. ✅ Verify no console errors (F12)
3. ✅ Test authentication
4. ✅ Test Firestore operations
5. ✅ Test hot reload (r)
6. 🚀 Deploy to Firebase Hosting

## Support

For issues:
1. Check browser console (F12)
2. Check Flutter logs in terminal
3. Run `flutter doctor -v`
4. Check Firebase Console configuration
