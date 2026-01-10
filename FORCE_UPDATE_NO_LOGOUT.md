# Force Update Without Logout - Implementation Guide

## ✅ Overview

Sistemul de Force Update acum **NU mai deconectează utilizatorul**. User-ul rămâne autentificat prin tot procesul de actualizare.

### Key Changes

1. **Single MaterialApp** - Only ONE MaterialApp in entire app (no nesting)
2. **UpdateGate as overlay** - Inside MaterialApp.builder, NOT wrapping MaterialApp
3. **ForceUpdateScreen** full-screen non-dismissible - blochează app-ul complet
4. **NO signOut()** - FirebaseAuth session persistă prin update
5. **AppStateMigrationService** - curăță cache-uri fără să delogheze user-ul

### Critical Architecture Rules

**✅ CORRECT (current implementation)**:

```dart
MaterialApp(
  builder: (context, child) {
    if (!FirebaseService.isInitialized) {
      return const Scaffold(...);  // Loading
    }
    return UpdateGate(child: child ?? const SizedBox.shrink());
  },
)
```

**❌ WRONG (old implementation)**:

```dart
UpdateGate(  // ❌ Wrapping MaterialApp from outside
  child: MaterialApp(...),
)
```

**Why this matters**:

- UpdateGate inside builder has Directionality/Theme/MediaQuery from MaterialApp
- No "No Directionality widget found" errors
- No blank screens on web
- Single Navigator, single Theme, single Directionality

---

## 🏗️ Architecture

```
App Start
   ↓
SuperPartyApp
   ↓
MaterialApp (SINGLE INSTANCE)
   ↓
MaterialApp.builder
   ├─→ Firebase not initialized?
   │   └─→ YES: Show loading Scaffold
   │
   └─→ Firebase initialized
       ↓
       UpdateGate (overlay inside MaterialApp.builder)
       ↓
       ├─→ Force Update Required?
       │   ├─→ YES: Show ForceUpdateScreen overlay (full-screen, non-dismissible)
       │   │         ↓
       │   │         User downloads & installs APK
       │   │         ↓
       │   │         App restarts with new version
       │   │         ↓
       │   │         UpdateGate checks again → NO update needed
       │   │         ↓
       │   │         AppStateMigrationService runs (cache cleanup)
       │   │         ↓
       │   │         User enters app (STILL AUTHENTICATED)
       │   │
       │   └─→ NO: AppStateMigrationService runs (if version changed)
       │            ↓
       │            Routes to AuthWrapper → Home/Login
```

---

## 📁 Files Structure

### New Files

1. **lib/widgets/update_gate.dart**
   - Overlay widget inside MaterialApp.builder
   - Checks for updates before showing app
   - Returns Stack with overlays when update needed
   - Returns child directly when no overlay needed
   - NO nested MaterialApp - only Directionality → Stack → Material overlays

2. **lib/screens/update/force_update_screen.dart**
   - Full-screen non-dismissible UI
   - Download APK with progress
   - Install via native Android code
   - NO signOut() anywhere

3. **lib/services/app_state_migration_service.dart**
   - Handles data migration between versions
   - Clears cache/SharedPreferences
   - Preserves FirebaseAuth session

### Modified Files

1. **lib/main.dart**
   - Single MaterialApp with UpdateGate in builder
   - MaterialApp.builder: Firebase check → UpdateGate(child: child)
   - UpdateGate is overlay, NOT wrapper
   - Simplified AuthWrapper (no update logic)
   - Removed AutoUpdateService calls

2. **lib/services/auto_update_service.dart**
   - Deprecated forceLogout() method
   - Changed return values (no more 'logout')
   - Marked as @Deprecated

---

## 🔄 Flow Comparison

### OLD Flow (with logout):

```
1. User opens app
2. AuthWrapper checks for update
3. If update needed → signOut() + show dialog
4. User downloads APK
5. User installs APK
6. App restarts
7. User sees LOGIN SCREEN (must re-enter credentials)
```

### NEW Flow (without logout):

```
1. User opens app
2. UpdateGate checks for update (before routing)
3. If update needed → show ForceUpdateScreen (full-screen)
4. User downloads APK
5. User installs APK
6. App restarts
7. UpdateGate checks again → no update needed
8. AppStateMigrationService cleans cache
9. User enters app DIRECTLY (still authenticated)
```

---

## 🎯 Key Features

### 1. UpdateGate (Overlay in MaterialApp.builder)

**Location**: Inside MaterialApp.builder in main.dart

**Responsibilities**:

- Check for force update at app startup
- Show overlay when checking or update needed
- Run AppStateMigrationService if version changed
- Pass through to normal app if no update

**Implementation**:

```dart
// In main.dart
MaterialApp(
  builder: (context, child) {
    // Firebase check first
    if (!FirebaseService.isInitialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // UpdateGate as overlay
    return UpdateGate(child: child ?? const SizedBox.shrink());
  },
  onGenerateRoute: (settings) {
    // Routes...
  },
)

// In update_gate.dart
@override
Widget build(BuildContext context) {
  // Early return when no overlay needed
  if (!_checking && !_needsUpdate) {
    return widget.child;  // Passthrough
  }

  // Wrap with Directionality for overlays
  return Directionality(
    textDirection: TextDirection.ltr,
    child: Stack(
      children: [
        widget.child,  // Main app always present
        if (_checking) Positioned.fill(child: Material(...)),  // Loading overlay
        if (_needsUpdate) Positioned.fill(child: Material(...)),  // Update overlay
      ],
    ),
  );
}
```

**Key points**:

- ✅ UpdateGate is INSIDE MaterialApp.builder (has Directionality/Theme)
- ✅ Returns Stack with overlays, NOT nested MaterialApp
- ✅ Early return when no overlay needed (performance)
- ✅ Wraps Stack with Directionality (defensive)

### 2. ForceUpdateScreen (Full-Screen)

**Features**:

- Non-dismissible (back button disabled)
- Full-screen UI (not a dialog)
- Download progress 0-100%
- Install via MethodChannel
- Fallback to Settings for permissions
- **NO signOut() call**

**States**:

- idle: Ready to download
- downloading: Progress bar active
- installing: Opening installer
- permissionRequired: Need to enable "Install unknown apps"
- error: Show error with retry button

### 3. AppStateMigrationService

**Purpose**: Clean up incompatible data between versions WITHOUT logging out

**What it does**:

- Checks if build number changed
- Clears old cache flags
- Resets incompatible SharedPreferences
- Preserves FirebaseAuth session

**What it DOESN'T do**:

- Call FirebaseAuth.instance.signOut()
- Clear auth tokens
- Delete user data

**Usage**:

```dart
// Automatically called by UpdateGate
await AppStateMigrationService.checkAndMigrate();
```

---

## 🔧 Configuration

### Firestore Schema (unchanged)

```javascript
// app_config/version
{
  "min_version": "1.0.2",
  "min_build_number": 3,
  "force_update": true,
  "update_message": "Versiune nouă disponibilă!",
  "release_notes": "- Feature X\n- Bug fix Y",
  "android_download_url": "https://...",
  "updated_at": "2026-01-05T06:00:00Z"
}
```

### pubspec.yaml

```yaml
version: 1.0.2+3 # Increment build number for each release
```

---

## 🧪 Testing

### Test 1: Force Update (User Stays Authenticated)

**Setup**:

1. Login to app with build 2
2. Set Firestore: `min_build_number: 3, force_update: true`
3. Close and reopen app

**Expected**:

1. ✅ UpdateGate shows "Verificare actualizări..."
2. ✅ ForceUpdateScreen appears (full-screen, non-dismissible)
3. ✅ Back button does nothing
4. ✅ Download APK → progress bar 0-100%
5. ✅ Install APK → Android installer opens
6. ✅ After install → app restarts
7. ✅ UpdateGate checks → no update needed
8. ✅ User enters app **WITHOUT re-login**
9. ✅ FirebaseAuth.currentUser is NOT null

### Test 2: Data Migration (Version Change)

**Setup**:

1. Install app with build 2
2. Use app (creates cache/preferences)
3. Install app with build 3 (no force update, just version change)

**Expected**:

1. ✅ UpdateGate checks → no force update
2. ✅ AppStateMigrationService runs
3. ✅ Old cache flags cleared
4. ✅ User still authenticated
5. ✅ App works normally

### Test 3: No Update Needed

**Setup**:

1. Install app with build 3
2. Set Firestore: `min_build_number: 3`

**Expected**:

1. ✅ UpdateGate checks → no update needed
2. ✅ AppStateMigrationService checks → no migration needed
3. ✅ App goes directly to AuthWrapper
4. ✅ User sees Home or Login (based on auth state)

---

## 🚫 What NOT to Do

### ❌ DON'T Call signOut() in Update Flow

**Wrong**:

```dart
if (needsUpdate) {
  await FirebaseAuth.instance.signOut(); // ❌ NO!
  showUpdateDialog();
}
```

**Correct**:

```dart
if (needsUpdate) {
  // Just show update screen, user stays authenticated
  showForceUpdateScreen();
}
```

### ❌ DON'T Use Old AutoUpdateService

**Wrong**:

```dart
final action = await AutoUpdateService.checkAndApplyUpdate();
if (action == 'logout') {
  await AutoUpdateService.forceLogout(); // ❌ Deprecated!
}
```

**Correct**:

```dart
// UpdateGate handles everything automatically
// No need to call AutoUpdateService
```

### ❌ DON'T Clear Auth Data in Migration

**Wrong**:

```dart
Future<void> migrate() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.clear(); // ❌ Clears auth tokens too!
}
```

**Correct**:

```dart
Future<void> migrate() async {
  final prefs = await SharedPreferences.getInstance();
  // Clear only non-auth keys
  await prefs.remove('cache_flag');
  await prefs.remove('temp_data');
  // Preserve auth tokens
}
```

---

## 📊 Migration Examples

### Example 1: Clear Old Cache Flags

```dart
// In AppStateMigrationService._performMigration()
if (fromBuild < 3 && toBuild >= 3) {
  print('[Migration] Clearing old cache flags');
  await prefs.remove('old_cache_flag');
  await prefs.remove('deprecated_setting');
}
```

### Example 2: Reset Incompatible Preferences

```dart
if (fromBuild < 4 && toBuild >= 4) {
  print('[Migration] Resetting preferences for new schema');
  await prefs.remove('old_format_data');
  // Optionally set new defaults
  await prefs.setString('new_format_data', 'default_value');
}
```

### Example 3: Clean Up Old Files

```dart
if (fromBuild < 5 && toBuild >= 5) {
  print('[Migration] Cleaning up old files');
  final dir = await getApplicationDocumentsDirectory();
  final oldFile = File('${dir.path}/old_cache.db');
  if (await oldFile.exists()) {
    await oldFile.delete();
  }
}
```

---

## 🔍 Debugging

### Check if User is Authenticated

```dart
final user = FirebaseAuth.instance.currentUser;
print('User authenticated: ${user != null}');
print('User uid: ${user?.uid}');
print('User email: ${user?.email}');
```

### Check Build Numbers

```dart
final current = await AppStateMigrationService.getCurrentBuildNumber();
final lastSeen = await AppStateMigrationService.getLastSeenBuildNumber();
print('Current build: $current');
print('Last seen build: $lastSeen');
```

### Check Update Status

```dart
final checker = ForceUpdateCheckerService();
final needsUpdate = await checker.needsForceUpdate();
print('Needs force update: $needsUpdate');
```

### Logs to Look For

```
[UpdateGate] Checking for force update...
[UpdateGate] Force update required: false
[UpdateGate] No force update needed, checking for data migration...
[AppStateMigration] Current build: 3, Last seen: 2
[AppStateMigration] New version detected, running migration...
[AppStateMigration] Migrating from build 2 to 3
[AppStateMigration] Running general cleanup
[AppStateMigration] Migration complete
```

---

## ⚠️ Important Notes

1. **User ALWAYS stays authenticated** through update process
2. **UpdateGate is at root** - checks before any routing
3. **ForceUpdateScreen is full-screen** - not a dialog
4. **AppStateMigrationService preserves auth** - only clears cache
5. **Old AutoUpdateService is deprecated** - don't use it

---

## 🚀 Deployment Checklist

- [ ] Increment build number in pubspec.yaml
- [ ] Build APK: `flutter build apk --release`
- [ ] Upload APK to Firebase Storage
- [ ] Update Firestore `app_config/version`:
  - [ ] Set `min_build_number` to new build
  - [ ] Set `force_update: true`
  - [ ] Update `android_download_url`
- [ ] Test on device with old version:
  - [ ] User stays authenticated after update
  - [ ] No login screen after install
  - [ ] App works normally

---

## 🐛 Troubleshooting Web/Windows Crashes

### Issue: "No Directionality widget found"

**Cause**: UpdateGate wrapping MaterialApp from outside (old architecture)

**Solution**: UpdateGate must be INSIDE MaterialApp.builder

**Check**:

```bash
# Should show only 1 MaterialApp
grep -rn "MaterialApp(" superparty_flutter/lib/
# Result: lib/main.dart:122:      child: MaterialApp(

# UpdateGate should NOT wrap MaterialApp
grep -B 5 "MaterialApp(" superparty_flutter/lib/main.dart
# Should show: ChangeNotifierProvider → MaterialApp
# NOT: UpdateGate → MaterialApp
```

**Fix**:

```dart
// ❌ WRONG
UpdateGate(
  child: MaterialApp(...),
)

// ✅ CORRECT
MaterialApp(
  builder: (context, child) {
    return UpdateGate(child: child ?? const SizedBox.shrink());
  },
)
```

### Issue: Blank screen on web

**Cause**: UpdateGate returning MaterialApp in overlays

**Solution**: UpdateGate must return Directionality → Stack, NOT MaterialApp

**Check**:

```bash
# UpdateGate should NOT have MaterialApp
grep -n "MaterialApp" superparty_flutter/lib/widgets/update_gate.dart
# Result: No matches (good!)

# UpdateGate should have Directionality wrapper
grep -A 5 "return Directionality" superparty_flutter/lib/widgets/update_gate.dart
# Should show: return Directionality(textDirection: ltr, child: Stack(...))
```

**Fix**:

```dart
// ❌ WRONG
if (_checking) {
  return MaterialApp(
    home: Scaffold(body: Center(child: CircularProgressIndicator())),
  );
}

// ✅ CORRECT
if (_checking) {
  return Directionality(
    textDirection: TextDirection.ltr,
    child: Stack(
      children: [
        widget.child,
        Positioned.fill(child: Material(...)),
      ],
    ),
  );
}
```

### Issue: "Could not find a generator for route"

**Cause**: Routing broken by nested MaterialApp

**Solution**: Single MaterialApp with onGenerateRoute

**Check**:

```bash
# Verify single MaterialApp
bash scripts/check_unsafe_patterns.sh
# Should show: ✅ Single MaterialApp found
```

### Testing on Web

```bash
cd superparty_flutter
flutter run -d web-server --web-port=5051 -v

# Test URLs:
# http://localhost:5051/
# http://localhost:5051/#/evenimente
# http://localhost:5051/#/kyc
# http://localhost:5051/#/admin

# Expected:
# ✅ No blank screen
# ✅ No "No Directionality widget found"
# ✅ No "Could not find a generator for route"
# ✅ UI renders correctly
```

### Capture Crash Logs

```bash
# Use crash capture script
bash scripts/capture_crash.sh

# Navigate to URL that crashes
# Press Ctrl+C

# Check logs
grep -A 30 "EXCEPTION CAUGHT" logs/crash_*.log
# Look for first lib/...dart:line reference
```

---

## 📚 Related Documentation

- [FORCE_UPDATE_SETUP.md](./superparty_flutter/FORCE_UPDATE_SETUP.md) - Original setup guide
- [APP_VERSION_SCHEMA.md](./superparty_flutter/APP_VERSION_SCHEMA.md) - Firestore schema
- [AI_CHAT_REPAIR_COMPLETE.md](./AI_CHAT_REPAIR_COMPLETE.md) - AI Chat fix

---

## ✅ Acceptance Criteria

- [x] User stays authenticated through update
- [x] No signOut() calls in update flow
- [x] UpdateGate at app root
- [x] ForceUpdateScreen full-screen non-dismissible
- [x] AppStateMigrationService cleans cache without logout
- [x] Old AutoUpdateService deprecated
- [x] Single update system (no conflicts)

**Status**: COMPLETE ✅
