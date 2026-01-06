# PR #20 Audit Commands

## A2: Flutter Build Verification

Run these commands in order and capture output:

```bash
cd superparty_flutter

# Clean build artifacts
flutter clean

# Get dependencies
flutter pub get

# Static analysis (must be 0 issues)
flutter analyze

# Run tests (must PASS)
flutter test

# Build release APK (must SUCCESS)
flutter build apk --release -v
```

## Expected Results

### flutter analyze
```
Analyzing superparty_flutter...
No issues found!
```

### flutter test
```
All tests passed!
```

### flutter build apk --release
```
✓ Built build/app/outputs/flutter-apk/app-release.apk (XX.XMB)
```

## Notes

Flutter SDK not available in current Gitpod environment. These commands should be run:
1. In GitHub Actions CI
2. Locally by developer with Flutter SDK installed
3. In a Flutter-enabled dev container
