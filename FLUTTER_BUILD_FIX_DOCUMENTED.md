# Flutter macOS Build Error: `-G` flag

## Problem
```
clang: error: unsupported option '-G' for target 'arm64-apple-macos13.0'
```

## Root Cause
The `-G` flag comes from `gRPC-Core` / `BoringSSL-GRPC` dependencies used by Firebase (specifically `firebase_firestore` and `firebase_messaging`). This is a known issue with Firebase iOS/macOS SDK on arm64 architecture.

## Attempted Fixes
1. ✅ Updated `Podfile` to remove `-G` flag from build settings (partial success)
2. ✅ Added `-Wno-unused-command-line-argument` to suppress warnings
3. ❌ Issue persists because `-G` is hardcoded in gRPC pod build scripts

## Solutions

### Option 1: Upgrade Firebase Dependencies (Recommended)
Update `pubspec.yaml` Firebase plugins to latest versions:
```yaml
dependencies:
  firebase_core: ^3.0.0  # Latest
  cloud_firestore: ^5.0.0  # Latest
  firebase_auth: ^5.0.0  # Latest
  firebase_messaging: ^15.0.0  # Latest
```

Then run:
```bash
cd superparty_flutter
flutter pub upgrade
cd macos && pod install
flutter build macos
```

### Option 2: Temporarily Remove firebase_messaging (Quick Fix)
If push notifications are not immediately needed, comment out `firebase_messaging` in `pubspec.yaml`:
```yaml
dependencies:
  # firebase_messaging: ^14.7.19  # Temporarily disabled
```

### Option 3: Use Rosetta 2 (Workaround)
Build for x86_64 instead of arm64:
```bash
arch -x86_64 flutter build macos
```

### Option 4: Manual Xcode Fix
1. Open `macos/Runner.xcworkspace` in Xcode
2. Select Pods project → gRPC-Core target
3. Build Settings → Other C Flags → Remove `-G`
4. Repeat for BoringSSL-GRPC target
5. Build from Xcode

## Status
- **Web version**: ✅ Working (not affected)
- **Backend**: ✅ Working (legacy hosting)
- **macOS build**: ⚠️  Blocked by `-G` flag
- **Workaround**: Use Option 2 or 3 for immediate testing

## Next Steps
1. Test Option 1 (Firebase upgrade) when time permits
2. If upgrade breaks other features, use Option 2
3. Document any new errors encountered

## References
- https://github.com/firebase/firebase-ios-sdk/issues/11012
- https://github.com/grpc/grpc/issues/31574
