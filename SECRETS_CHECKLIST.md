# Secrets Checklist

**⚠️ CRITICAL: These files contain secrets and are NOT committed to Git.**

Before running the app on a new machine, you must configure these files locally.

## Required Configuration Files

### 1. Firebase Android Configuration

**File:** `superparty_flutter/android/app/google-services.json`

**How to get it:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `superparty-frontend`
3. Project Settings → Your apps → Android app
4. Click "Download google-services.json"
5. Place the file at: `superparty_flutter/android/app/google-services.json`

**Template:** See `superparty_flutter/android/app/google-services.json.example`

**Status:** ❌ NOT committed (in `.gitignore`)

---

### 2. Firebase Flutter Configuration

**File:** `superparty_flutter/lib/firebase_options.dart`

**How to generate it:**

```powershell
cd superparty_flutter
flutter pub global activate flutterfire_cli
flutterfire configure
# Select project: superparty-frontend
# Select platforms: android, ios (if needed), web
```

This generates `lib/firebase_options.dart` with Firebase API keys.

**Status:** ❌ NOT committed (in `.gitignore`)

---

### 3. Environment Variables

**File:** `.env` (in repo root)

**How to create it:**

```powershell
# Copy example
Copy-Item LEGACY_HOSTING-VARIABLES.env.example .env
# Edit .env with your actual API keys
```

**Required variables:**

- `OPENAI_API_KEY` - For AI chat features
- `TWILIO_ACCOUNT_SID` - For WhatsApp/Voice features
- `TWILIO_AUTH_TOKEN` - For WhatsApp/Voice features
- Other service credentials as needed (see `LEGACY_HOSTING-VARIABLES.env.example`)

**Status:** ❌ NOT committed (in `.gitignore`)

---

### 4. iOS Configuration (if developing for iOS)

**File:** `superparty_flutter/ios/Runner/GoogleService-Info.plist`

**How to get it:**

1. Firebase Console → Project Settings → iOS app
2. Download `GoogleService-Info.plist`
3. Place at: `superparty_flutter/ios/Runner/GoogleService-Info.plist`

**Status:** ❌ NOT committed (in `.gitignore`)

---

## Verification

After setting up secrets, verify:

```powershell
# Check Firebase config exists
Test-Path superparty_flutter/android/app/google-services.json
# Should return: True

# Check Flutter Firebase config exists
Test-Path superparty_flutter/lib/firebase_options.dart
# Should return: True

# Check .env exists
Test-Path .env
# Should return: True
```

## What's Excluded from Git

The following patterns are in `.gitignore` and will NOT be committed:

- `google-services.json` (Firebase Android config)
- `GoogleService-Info.plist` (Firebase iOS config)
- `firebase_options.dart` (Firebase Flutter config)
- `*.env` files (environment variables)
- `*.key`, `*.pem`, `*.p12`, `*.jks`, `*.keystore` (private keys)
- `*serviceAccount*.json` (Firebase service account keys)
- `firebase-adminsdk*.json` (Firebase Admin SDK keys)
- `.firebase-token` (Firebase CLI token)

## Security Notes

- **Never commit secrets to Git**
- **Never share `.env` files**
- **Never commit `google-services.json` or `firebase_options.dart`**
- Use `.example` files as templates (these are safe to commit)
- Rotate keys if accidentally committed (even if immediately removed)

## See Also

- `SETUP_NEW_LAPTOP.md` - Complete setup instructions
- `README.md` - Quick start guide with secrets checklist
