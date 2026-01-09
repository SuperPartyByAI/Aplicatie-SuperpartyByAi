# Force Update Fail-Safe Testing Guide

## Test Scenarios

### ✅ Test 1: Legacy Schema (latest_version, latest_build_number)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "latest_version": "1.2.2",
  "latest_build_number": 22,
  "force_update": true,
  "update_message": "Versiune nouă disponibilă!",
  "android_download_url": "https://..."
}
```

**Expected Logs:**
```
[ForceUpdateChecker] ✅ Config data: {latest_version: 1.2.2, latest_build_number: 22, ...}
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ✅ Found build number field: 22
[AppVersionConfig] ℹ️ Legacy schema detected: using latest_* fields
[AppVersionConfig] 💡 Consider migrating to min_version and min_build_number
```

**Expected Behavior:**
- ✅ App parses config successfully
- ✅ No FormatException thrown
- ✅ Force update works if build < 22

---

### ✅ Test 2: Missing Document

**Setup:**
- Delete `app_config/version` document from Firestore

**Expected Logs:**
```
[ForceUpdateChecker] Reading from Firestore: app_config/version
[ForceUpdateChecker] Document exists: false
[ForceUpdateChecker] ⚠️ No version config in Firestore
[ForceUpdateChecker] ℹ️ Using safe default (force_update=false)
[ForceUpdateChecker] Force update disabled in config
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ No force update dialog shown
- ✅ User can use app normally

---

### ✅ Test 3: Empty Document

**Setup:**
```javascript
// Firestore: app_config/version
{}
```

**Expected Logs:**
```
[ForceUpdateChecker] ✅ Config data: {}
[AppVersionConfig] ⚠️ Missing required fields in Firestore config
[AppVersionConfig] ⚠️ Using safe default: force_update=false, min_build_number=0
[AppVersionConfig] 💡 Recommendation: Update Firestore app_config/version with:
[AppVersionConfig]    - min_version: "1.0.0"
[AppVersionConfig]    - min_build_number: 1
[ForceUpdateChecker] Force update disabled in config
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ No force update dialog shown
- ✅ Safe default config used

---

### ✅ Test 4: Partial Document (Missing min_version)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_build_number": 22,
  "force_update": true,
  "update_message": "Please update"
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found build number field: 22
[AppVersionConfig] ⚠️ Missing required fields in Firestore config
[AppVersionConfig] ⚠️ Using safe default: force_update=false, min_build_number=0
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ Safe default overrides force_update=true
- ✅ No force update dialog shown

---

### ✅ Test 5: Partial Document (Missing min_build_number)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "force_update": true,
  "update_message": "Please update"
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ⚠️ Missing required fields in Firestore config
[AppVersionConfig] ⚠️ Using safe default: force_update=false, min_build_number=0
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ Safe default overrides force_update=true
- ✅ No force update dialog shown

---

### ✅ Test 6: Type Mismatch (String Build Number)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": "22",        // String instead of int
  "force_update": true
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ✅ Found build number field: 22
[ForceUpdateChecker] Parsed config:
[ForceUpdateChecker]   - min_version: 1.2.2
[ForceUpdateChecker]   - min_build_number: 22
```

**Expected Behavior:**
- ✅ App parses config successfully
- ✅ String "22" converted to int 22
- ✅ Force update works correctly

---

### ✅ Test 7: Type Mismatch (Double Build Number)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": 22.0,        // Double instead of int
  "force_update": true
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ✅ Found build number field: 22
```

**Expected Behavior:**
- ✅ App parses config successfully
- ✅ Double 22.0 converted to int 22
- ✅ Force update works correctly

---

### ✅ Test 8: Offline Mode (No Internet)

**Setup:**
1. Enable airplane mode on device
2. Start app

**Expected Logs:**
```
[ForceUpdateChecker] Reading from Firestore: app_config/version
[ForceUpdateChecker] ⚠️ Firestore timeout (10s)
[ForceUpdateChecker] ℹ️ App will continue without force update check
[ForceUpdateChecker] Force update disabled in config
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ Timeout after 10 seconds
- ✅ Safe default used
- ✅ No force update dialog shown

---

### ✅ Test 9: Firestore Rules Block Read

**Setup:**
```javascript
// Firestore rules
match /app_config/{document} {
  allow read: if false;  // Block all reads
}
```

**Expected Logs:**
```
[ForceUpdateChecker] ⚠️ Firebase error: permission-denied
[ForceUpdateChecker] ℹ️ Common causes:
[ForceUpdateChecker]    - Firestore not initialized
[ForceUpdateChecker]    - No internet connection
[ForceUpdateChecker]    - Firestore rules blocking read
[ForceUpdateChecker] ℹ️ App will continue without force update check
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ Safe default used
- ✅ No force update dialog shown

---

### ✅ Test 10: Firebase Not Initialized

**Setup:**
- Comment out `FirebaseService.initialize()` in main.dart
- Start app

**Expected Logs:**
```
[Main] ❌ Firebase initialization failed: ...
[Main] ⚠️ App will continue with limited functionality
[ForceUpdateChecker] ⚠️ Firebase not initialized
[ForceUpdateChecker] ℹ️ Skipping force update check
```

**Expected Behavior:**
- ✅ App starts without crashing
- ✅ No force update check performed
- ✅ App continues with limited functionality

---

### ✅ Test 11: CamelCase Schema

**Setup:**
```javascript
// Firestore: app_config/version
{
  "minVersion": "1.2.2",
  "minBuildNumber": 22,
  "force_update": true
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ✅ Found build number field: 22
```

**Expected Behavior:**
- ✅ App parses config successfully
- ✅ CamelCase fields recognized
- ✅ Force update works correctly

---

### ✅ Test 12: Mixed Schema (Both Old and New)

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "latest_version": "1.2.1",       // Ignored (min_version takes priority)
  "latest_build_number": 21,       // Ignored (min_build_number takes priority)
  "force_update": true
}
```

**Expected Logs:**
```
[AppVersionConfig] ✅ Found version field: 1.2.2
[AppVersionConfig] ✅ Found build number field: 22
```

**Expected Behavior:**
- ✅ App uses min_version (1.2.2) not latest_version (1.2.1)
- ✅ App uses min_build_number (22) not latest_build_number (21)
- ✅ Priority order respected

---

### ✅ Test 13: Valid Config with Force Update

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "force_update": true,
  "update_message": "Versiune nouă disponibilă!",
  "release_notes": "• Feature X\n• Bug fix Y",
  "android_download_url": "https://..."
}

// Current app build: 21
```

**Expected Logs:**
```
[ForceUpdateChecker] Current build: 21
[ForceUpdateChecker] Min required build: 22
[ForceUpdateChecker] ⚠️ Force update required!
[ForceUpdateChecker] ℹ️ Current: 21, Required: 22
```

**Expected Behavior:**
- ✅ Force update dialog shown
- ✅ User cannot dismiss dialog
- ✅ Download button works
- ✅ Update message and release notes displayed

---

### ✅ Test 14: Valid Config, No Update Needed

**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "force_update": true
}

// Current app build: 22 or higher
```

**Expected Logs:**
```
[ForceUpdateChecker] Current build: 22
[ForceUpdateChecker] Min required build: 22
[ForceUpdateChecker] ✅ App is up to date
```

**Expected Behavior:**
- ✅ No force update dialog shown
- ✅ App continues to home screen
- ✅ Normal functionality

---

## Manual Testing Checklist

### Pre-Test Setup
- [ ] Install app on test device
- [ ] Note current build number: `flutter --version` or check pubspec.yaml
- [ ] Access to Firebase Console
- [ ] Access to Firestore database

### Test Execution

#### Phase 1: Legacy Schema Support
- [ ] Test 1: Legacy schema (latest_version, latest_build_number)
- [ ] Test 11: CamelCase schema
- [ ] Test 12: Mixed schema (priority order)

#### Phase 2: Missing/Invalid Config
- [ ] Test 2: Missing document
- [ ] Test 3: Empty document
- [ ] Test 4: Partial document (missing version)
- [ ] Test 5: Partial document (missing build number)

#### Phase 3: Type Handling
- [ ] Test 6: String build number
- [ ] Test 7: Double build number

#### Phase 4: Network/Firebase Issues
- [ ] Test 8: Offline mode
- [ ] Test 9: Firestore rules block read
- [ ] Test 10: Firebase not initialized

#### Phase 5: Normal Operation
- [ ] Test 13: Valid config with force update required
- [ ] Test 14: Valid config, no update needed

### Success Criteria

For each test:
- ✅ App starts without crashing
- ✅ Expected logs appear in console
- ✅ Expected behavior matches description
- ✅ No unhandled exceptions
- ✅ User experience is smooth

### Failure Indicators

If any of these occur, the test FAILED:
- ❌ App crashes on startup
- ❌ FormatException thrown
- ❌ App hangs indefinitely
- ❌ Force update blocks when it shouldn't
- ❌ Force update doesn't block when it should

## Automated Testing

### Unit Test Example

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/models/app_version_config.dart';

void main() {
  group('AppVersionConfig.fromFirestore', () {
    test('parses legacy schema', () {
      final data = {
        'latest_version': '1.2.2',
        'latest_build_number': 22,
        'force_update': true,
      };

      final config = AppVersionConfig.fromFirestore(data);

      expect(config.minVersion, '1.2.2');
      expect(config.minBuildNumber, 22);
      expect(config.forceUpdate, true);
    });

    test('returns safe default for empty data', () {
      final data = <String, dynamic>{};

      final config = AppVersionConfig.fromFirestore(data);

      expect(config.minVersion, '0.0.0');
      expect(config.minBuildNumber, 0);
      expect(config.forceUpdate, false);
    });

    test('handles string build number', () {
      final data = {
        'min_version': '1.2.2',
        'min_build_number': '22',
        'force_update': true,
      };

      final config = AppVersionConfig.fromFirestore(data);

      expect(config.minBuildNumber, 22);
    });

    test('handles double build number', () {
      final data = {
        'min_version': '1.2.2',
        'min_build_number': 22.0,
        'force_update': true,
      };

      final config = AppVersionConfig.fromFirestore(data);

      expect(config.minBuildNumber, 22);
    });

    test('prioritizes min_version over latest_version', () {
      final data = {
        'min_version': '1.2.2',
        'latest_version': '1.2.1',
        'min_build_number': 22,
        'force_update': true,
      };

      final config = AppVersionConfig.fromFirestore(data);

      expect(config.minVersion, '1.2.2');
    });
  });
}
```

## Debugging Commands

### View Flutter Logs
```bash
flutter logs | grep -E "(ForceUpdateChecker|AppVersionConfig|UpdateGate|Main)"
```

### View Only Warnings
```bash
flutter logs | grep "⚠️"
```

### View Only Errors
```bash
flutter logs | grep "❌"
```

### View Config Parsing
```bash
flutter logs | grep "AppVersionConfig"
```

### View Update Check Flow
```bash
flutter logs | grep "ForceUpdateChecker"
```

## Rollback Plan

If issues are discovered:

1. **Immediate Rollback** (Firestore):
   ```javascript
   // Set force_update to false
   {
     "min_version": "1.0.0",
     "min_build_number": 1,
     "force_update": false  // Disable force update
   }
   ```

2. **Code Rollback** (if needed):
   ```bash
   git checkout HEAD~1 superparty_flutter/lib/models/app_version_config.dart
   git checkout HEAD~1 superparty_flutter/lib/services/force_update_checker_service.dart
   ```

3. **Verify Rollback**:
   - Check logs for errors
   - Verify app starts normally
   - Confirm force update disabled

## Support

### Common Issues

**Q: App still crashes with FormatException**
A: Check you're running the latest version with fail-safe code. Old versions don't have the fix.

**Q: Logs show "Legacy schema detected" but I want to migrate**
A: Follow migration guide in FORCE_UPDATE_SCHEMA_MIGRATION.md

**Q: Force update not working even with valid config**
A: Check:
- Firestore rules allow read
- Device has internet
- `force_update` is boolean true, not string "true"
- Current build < min_build_number

**Q: App hangs on "Verificare actualizări..."**
A: Firestore read is timing out. Check:
- Internet connection
- Firestore rules
- Firebase initialization

## Conclusion

All tests should pass with the fail-safe implementation. The app should **never crash** due to missing or invalid force update config.

**Key Principle**: When in doubt, don't block the user. It's better to let them use an old version than to prevent them from using the app at all.
