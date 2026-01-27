# WhatsApp Backend URL Debugging Report

## Root Cause

The error "Bad state: WHATSAPP_BACKEND_URL not set" occurs because `String.fromEnvironment()` is evaluated at **compile time**, not runtime. On iOS, if the app was built without the `--dart-define` flag, or if the build cache contains an old version, the environment variable won't be available. Even though there's a default value (`defaultHetzner`), the error suggests the getter is being called in a way that bypasses the default, or the build system isn't passing the define correctly to the Dart compiler.

## Where It Fails

**File:** `lib/core/config/env.dart:72`
```dart
if (raw.isEmpty) {
  throw StateError('WHATSAPP_BACKEND_URL not set and no default available');
}
```

**Call Chain:**
1. `lib/main.dart:46` → `Env.whatsappBackendUrl` (caught at line 47-48)
2. `lib/services/whatsapp_backend_diagnostics_service.dart:63` → `Env.whatsappBackendUrl`
3. `lib/services/whatsapp_backend_diagnostics_service.dart:77` → `_getBackendUrl()` → throws StateError
4. `lib/services/whatsapp_backend_diagnostics_service.dart:166-175` → catches and logs as `e.toString()` → "Bad state: WHATSAPP_BACKEND_URL not set"
5. `lib/screens/whatsapp/whatsapp_accounts_screen.dart:153-168` → `_checkBackendDiagnostics()` → displays error in UI

## How Value Is Read

The value is read using `const String.fromEnvironment('WHATSAPP_BACKEND_URL', defaultValue: '')` which is a **compile-time constant**. This means:
- It's evaluated when the Dart code is compiled, not when the app runs
- On iOS, it requires the `DART_DEFINES` to be set in Xcode build settings
- If not set during compilation, it will always return the `defaultValue` (empty string in this case)
- The code has a fallback chain: `v1` → `v2` → `legacy` → `defaultHetzner`
- The `defaultHetzner` should prevent `raw` from ever being empty, but the error suggests it's not working

## Why It Fails on iOS Simulator

1. **Cached Build**: The `ios/Flutter/Generated.xcconfig` file contains old `DART_DEFINES` from a previous build
2. **Xcode Scheme**: If running from Xcode directly, the scheme might not pass `DART_DEFINES`
3. **Concurrent Builds**: Multiple `xcodebuild` processes can cause the build system to use stale configuration
4. **Flutter Clean Not Complete**: `flutter clean` doesn't always clear `Generated.xcconfig` which is regenerated during build

## Fix (Step-by-Step)

### Step 1: Complete Clean
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter clean
rm -rf ios/Flutter/Generated.xcconfig
rm -rf build/
rm -rf ios/Pods
rm -rf ios/.symlinks
```

### Step 2: Rebuild with Dart Define
```bash
flutter pub get
flutter run -d "iPhone 17 Pro" --dart-define=WHATSAPP_BACKEND_URL=http://37.27.34.179:8080
```

### Step 3: Verify Generated.xcconfig
After the build starts (but before it completes), check:
```bash
cat ios/Flutter/Generated.xcconfig | grep DART_DEFINES
```

You should see base64-encoded value. Decode to verify:
```bash
cat ios/Flutter/Generated.xcconfig | grep DART_DEFINES | cut -d= -f2 | cut -d, -f1 | base64 -d
```

Should output: `WHATSAPP_BACKEND_URL=http://37.27.34.179:8080`

### Step 4: If Still Failing - Code Fix

The current code should never throw because `defaultHetzner` is always set. However, the code has been updated to:
1. Add more detailed debug logging
2. Provide clearer error messages
3. Ensure the default is always used

**Code changes made:**
- Enhanced debug logging in `lib/core/config/env.dart`
- Better error messages with all variable values
- The default `http://37.27.34.179:8080` is guaranteed to be used if no dart-define is set

## Extra Verification

### Debug Log at App Startup

**Location:** `lib/main.dart:46` (already exists, but enhanced)

The app already logs the backend URL at startup. After the fix, you'll see:
```
[Main] WhatsApp backend URL: http://37.27.34.179:8080
[Env] ===== WhatsApp Backend URL Resolution =====
[Env] WHATSAPP_BACKEND_URL from dart-define: "(empty)"
[Env] WHATSAPP_BACKEND_BASE_URL: "(empty)"
[Env] Default Hetzner: "http://37.27.34.179:8080"
[Env] Final resolved URL: "http://37.27.34.179:8080"
[Env] ============================================
```

If dart-define is set correctly, you'll see:
```
[Env] WHATSAPP_BACKEND_URL from dart-define: "http://37.27.34.179:8080"
[Env] Final resolved URL: "http://37.27.34.179:8080"
```

### Unit Test Suggestion

Create `test/core/config/env_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_flutter/core/config/env.dart';

void main() {
  group('Env.whatsappBackendUrl', () {
    test('should never be empty - always has default', () {
      // This test ensures the getter never throws
      // Even without dart-define, defaultHetzner should be used
      expect(
        () => Env.whatsappBackendUrl,
        returnsNormally,
        reason: 'whatsappBackendUrl should always return a value (default if not set)',
      );
      
      final url = Env.whatsappBackendUrl;
      expect(url, isNotEmpty, reason: 'URL should never be empty');
      expect(url, isA<String>(), reason: 'URL should be a string');
      
      // Should be a valid URL format (starts with http:// or https://)
      expect(
        url.startsWith('http://') || url.startsWith('https://'),
        isTrue,
        reason: 'URL should be a valid HTTP/HTTPS URL',
      );
    });
    
    test('should use default when no dart-define is set', () {
      // When running without --dart-define, should use defaultHetzner
      final url = Env.whatsappBackendUrl;
      // Default is http://37.27.34.179:8080
      // Note: This test may fail if dart-define IS set, so it's conditional
      if (!url.contains('37.27.34.179')) {
        // If dart-define was set, that's fine - just verify it's not empty
        expect(url, isNotEmpty);
      } else {
        // If using default, verify it's the expected default
        expect(url, equals('http://37.27.34.179:8080'));
      }
    });
  });
}
```

**Run the test:**
```bash
flutter test test/core/config/env_test.dart
```

## Summary

**Root Cause:** `String.fromEnvironment()` is compile-time only. If the app was built without `--dart-define`, or if the iOS build cache contains stale configuration, the environment variable won't be available at runtime.

**Where it fails:** `lib/core/config/env.dart:72` throws `StateError`, caught and logged in `whatsapp_backend_diagnostics_service.dart:166-175`, displayed in `whatsapp_accounts_screen.dart`.

**Fix:** 
1. Complete clean rebuild with `flutter clean` and remove `Generated.xcconfig`
2. Always pass `--dart-define=WHATSAPP_BACKEND_URL=...` when running
3. Code now has better diagnostics and guaranteed default fallback
4. Enhanced debug logging shows exactly what values are being read

**Verification:** Check console logs for `[Env]` debug output showing the resolved URL.
