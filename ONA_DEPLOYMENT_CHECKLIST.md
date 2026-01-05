# ONA Deployment Checklist - AI Chat + Force Update

## Package Info

- **Package Name**: `com.superpartybyai.superparty_app`
- **FileProvider Authority**: `com.superpartybyai.superparty_app.fileprovider`

---

## ✅ Status Verificare

### Force Update Components

- ✅ `UpdateGate` - wraps MaterialApp in main.dart
- ✅ `ForceUpdateScreen` - full-screen blocking UI
- ✅ `ForceUpdateCheckerService` - checks Firestore config
- ✅ `AppStateMigrationService` - cache cleanup without logout
- ✅ `ApkDownloaderService` - stream-to-file download
- ✅ `ApkInstallerBridge` - MethodChannel to native

### Android Installation Setup

- ✅ `MainActivity.kt` - MethodChannel implementation
- ✅ `AndroidManifest.xml` - FileProvider configured
- ✅ `file_paths.xml` - external-path for APK storage
- ✅ Permissions: `REQUEST_INSTALL_PACKAGES`

### AI Chat Components

- ✅ Auth guard in `ai_chat_screen.dart`
- ✅ Error mapping for Firebase Functions exceptions
- ✅ Backend: `functions/index.js` with GROQ_API_KEY check

---

## 🚀 Deployment Steps

### 1. Cherry-pick Commits (Optional - dacă vrei branch separat)

```bash
git checkout -b ona/ai-chat-force-update

# AI Chat fix
git cherry-pick d9f02e2e

# Force Update fără logout
git cherry-pick 6987bac2
```

**SAU** folosește direct `main` (commits deja merged).

---

### 2. Backend - AI Chat (Firebase Functions)

```bash
cd functions

# Setează GROQ_API_KEY (NOT OpenAI!)
firebase functions:secrets:set GROQ_API_KEY
# Paste key when prompted

# Deploy functions
firebase deploy --only functions
```

**Verificare:**

```bash
# Check logs
firebase functions:log --only chatWithAI

# Should see: "GROQ_API_KEY loaded from secrets"
```

---

### 3. Flutter - Build APK

```bash
cd superparty_flutter

# Get dependencies
flutter pub get

# Build release APK
flutter build apk --release

# APK location:
# build/app/outputs/flutter-apk/app-release.apk
```

---

### 4. Upload APK to Firebase Storage

**Manual (Firebase Console):**

1. Go to Firebase Console → Storage
2. Create folder: `apk/`
3. Upload: `app-release.apk`
4. Get download URL (click file → copy URL)

**OR Automated (if script works):**

```bash
node .github/scripts/upload-apk-to-storage.js
```

---

### 5. Firestore Config - Force Update

**Collection:** `app_config`  
**Document:** `version`

```javascript
{
  "min_version": "1.0.2",           // String
  "min_build_number": 3,            // Int (current build + 1 for testing)
  "force_update": true,             // Boolean
  "update_message": "Versiune nouă disponibilă! Descarcă acum.",
  "release_notes": "- AI Chat fix\n- Force Update fără logout",
  "android_download_url": "https://firebasestorage.googleapis.com/.../app-release.apk",
  "ios_download_url": null,         // Null (Android only)
  "updated_at": FieldValue.serverTimestamp()
}
```

**Firebase Console:**

1. Firestore Database → `app_config` collection
2. Create/Edit document `version`
3. Add fields above

---

### 6. Test - AI Chat

**Prerequisites:**

- User logged in
- GROQ_API_KEY deployed

**Steps:**

1. Open app → Navigate to AI Chat
2. Send message: "Salut"
3. **Expected:** Response from GROQ (not error)
4. **Check logs:** No "unauthenticated" or "failed-precondition" errors

**Error Messages (if any):**

- ❌ "Trebuie să fii logat" → User not authenticated
- ❌ "AI nu este configurat" → GROQ_API_KEY missing
- ✅ Actual response → SUCCESS

---

### 7. Test - Force Update

**Prerequisites:**

- APK uploaded to Storage
- Firestore `app_config/version` configured
- `min_build_number` > current build

**Steps:**

1. Open app
2. **Expected:** ForceUpdateScreen appears (blocking)
3. Tap "Descarcă Actualizare"
4. **Expected:** Progress bar 0-100%
5. **Expected:** "Instalează" button appears
6. Tap "Instalează"
7. **Expected:** Android install prompt
8. Install APK
9. **Expected:** User still logged in (NO re-login)

**Verification:**

- ✅ User stays authenticated
- ✅ No signOut() called
- ✅ Cache cleared (SharedPreferences)
- ✅ FirebaseAuth session preserved

---

## 🔍 Troubleshooting

### AI Chat Issues

**Error: "Trebuie să fii logat"**

- Check: `FirebaseAuth.instance.currentUser != null`
- Fix: Ensure user is logged in before calling AI

**Error: "AI nu este configurat"**

- Check: `firebase functions:secrets:access GROQ_API_KEY`
- Fix: Set secret: `firebase functions:secrets:set GROQ_API_KEY`

**Error: "Conexiune eșuată"**

- Check: Firebase Functions logs
- Fix: Verify GROQ API key is valid

---

### Force Update Issues

**UpdateGate not triggering:**

- Check: `UpdateGate` wraps `MaterialApp` in `main.dart`
- Check: `min_build_number` > current build number

**Download fails:**

- Check: `android_download_url` is accessible (open in browser)
- Check: Firebase Storage rules allow read

**Install fails:**

- Check: `REQUEST_INSTALL_PACKAGES` permission in manifest
- Check: FileProvider authority matches package name
- Check: User granted "Install unknown apps" permission

**User logged out after update:**

- ❌ WRONG: This should NOT happen
- Check: `AppStateMigrationService` is called (not `signOut()`)
- Check: No `FirebaseAuth.instance.signOut()` in update flow

---

## 📊 Current Build Info

**From `pubspec.yaml`:**

```yaml
version: 1.0.2+3
```

- Version: `1.0.2`
- Build number: `3`

**For testing Force Update:**

- Set `min_build_number: 4` in Firestore
- App will trigger update on next launch

---

## 🎯 Success Criteria

### AI Chat

- ✅ User can send messages
- ✅ Receives responses from GROQ
- ✅ No generic error messages
- ✅ Specific errors for auth/config issues

### Force Update

- ✅ Blocking screen appears when update required
- ✅ Download completes successfully
- ✅ Install prompt appears
- ✅ User stays authenticated (NO logout)
- ✅ App works after update

---

## 📝 Notes

1. **FileProvider Authority**: Already correct (`${applicationId}.fileprovider`)
2. **GROQ vs OpenAI**: Backend uses GROQ, NOT OpenAI
3. **No Logout**: Force Update preserves auth session
4. **Stream Download**: Prevents OOM on large APKs
5. **Build Number**: Increment for each release

---

## 🔗 Related Docs

- `FORCE_UPDATE_NO_LOGOUT.md` - Implementation details
- `AI_CHAT_TROUBLESHOOTING.md` - AI Chat debugging
- `FORCE_UPDATE_IMPLEMENTATION_SUMMARY.md` - Original implementation

---

**Last Updated:** 2026-01-05  
**Status:** ✅ Ready for deployment
