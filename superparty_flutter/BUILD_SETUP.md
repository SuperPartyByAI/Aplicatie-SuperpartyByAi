# Flutter Build Setup

## Prerequisites

- **Flutter:** 3.24.5 (stable)
- **Java:** JDK 17
- **Android SDK:** API 34 (Android 14)

## Environment Setup

### 1. Install Flutter

```bash
# Download Flutter 3.24.5
git clone https://github.com/flutter/flutter.git -b stable
export PATH="$PATH:`pwd`/flutter/bin"

# Verify
flutter --version
```

### 2. Install Java 17

```bash
# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# macOS
brew install openjdk@17

# Windows
# Download from: https://adoptium.net/temurin/releases/?version=17
```

### 3. Configure Android SDK

```bash
# Set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin

# Verify
flutter doctor -v
```

## Release Signing (Optional)

For production builds with custom signing:

### 1. Create `android/key.properties`

```properties
storePassword=<your-keystore-password>
keyPassword=<your-key-password>
keyAlias=<your-key-alias>
storeFile=<path-to-keystore.jks>
```

### 2. Add to `.gitignore`

```bash
echo "android/key.properties" >> .gitignore
echo "android/*.jks" >> .gitignore
```

**Note:** If `key.properties` is missing, build will use **debug signing** automatically.

## Build Commands

### Development Build

```bash
flutter clean
flutter pub get
flutter build apk --debug
```

### Release Build (Local)

```bash
flutter clean
flutter pub get
flutter build apk --release --dart-define=ENVIRONMENT=production
```

**Output:** `build/app/outputs/flutter-apk/app-release.apk`

### Release Build (CI)

```bash
# Ensure key.properties exists or use debug signing
flutter clean
flutter pub get
flutter build apk --release --verbose --dart-define=ENVIRONMENT=production
```

## Troubleshooting

### Error: "Gradle task assembleRelease failed"

**Cause:** Missing `key.properties` or compilation errors

**Fix:**
1. Check if `android/key.properties` exists
2. If missing, build will use debug signing (safe for testing)
3. For production, create `key.properties` with valid credentials

### Error: "No Android SDK found"

**Fix:**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
flutter doctor -v
```

### Error: "Unsupported class file major version"

**Cause:** Wrong Java version

**Fix:**
```bash
# Verify Java 17
java -version

# Set JAVA_HOME
export JAVA_HOME=/path/to/jdk-17
```

## Verification

```bash
# 1. Clean build
flutter clean

# 2. Get dependencies
flutter pub get

# 3. Analyze code
flutter analyze

# 4. Run tests
flutter test

# 5. Build release APK
flutter build apk --release --dart-define=ENVIRONMENT=production

# 6. Verify APK
ls -lh build/app/outputs/flutter-apk/app-release.apk
```

## CI/CD Integration

### GitHub Actions

```yaml
- uses: actions/setup-java@v4
  with:
    distribution: 'zulu'
    java-version: '17'

- uses: subosito/flutter-action@v2
  with:
    flutter-version: '3.24.5'
    channel: 'stable'

- name: Build APK
  run: |
    cd superparty_flutter
    flutter clean
    flutter pub get
    flutter build apk --release --dart-define=ENVIRONMENT=production
```

## Dependencies

- **Gradle:** 8.3
- **Android Gradle Plugin:** 8.1.0
- **Kotlin:** 1.8.22
- **compileSdk:** 34
- **minSdk:** 23
- **targetSdk:** 34

All versions are compatible with JDK 17.
