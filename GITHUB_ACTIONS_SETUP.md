# GitHub Actions Setup - Flutter Build & Deploy

## Overview

GitHub Actions workflow automatically builds Flutter APK and uploads to Firebase App Distribution when code is pushed to `main` branch.

**Workflow file:** `.github/workflows/flutter-build.yml`

---

## Required GitHub Secrets

Navigate to: **GitHub Repo → Settings → Secrets and variables → Actions**

### 1. `FIREBASE_APP_ID`

**What:** Firebase App ID for Android app

**How to get:**

1. Go to [Firebase Console](https://console.firebase.google.com/project/superparty-frontend/settings/general)
2. Scroll to "Your apps" section
3. Find Android app (or create one if missing)
4. Copy the **App ID** (format: `1:123456789:android:abcdef123456`)

**Add to GitHub:**

```
Name: FIREBASE_APP_ID
Value: 1:123456789:android:abcdef123456
```

### 2. `FIREBASE_SERVICE_ACCOUNT`

**What:** Service account JSON for Firebase Admin SDK

**How to get:**

1. Go to [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/superparty-frontend/settings/serviceaccounts/adminsdk)
2. Click "Generate new private key"
3. Download JSON file
4. Copy entire JSON content

**Add to GitHub:**

```
Name: FIREBASE_SERVICE_ACCOUNT
Value: {
  "type": "service_account",
  "project_id": "superparty-frontend",
  "private_key_id": "...",
  "private_key": "<PRIVATE_KEY_PEM>",
  "client_email": "...",
  "client_id": "...",
  ...
}
```

**⚠️ Security:** Never commit this JSON to git. Only store in GitHub Secrets.

---

## Workflow Triggers

### Automatic (on push to main)

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'superparty_flutter/**'
```

**Triggers when:**

- Code is pushed to `main` branch
- Changes are in `superparty_flutter/` directory

### Manual (workflow_dispatch)

```yaml
on:
  workflow_dispatch:
```

**How to trigger manually:**

1. Go to GitHub → Actions → "Build Flutter APK"
2. Click "Run workflow"
3. Select branch (usually `main`)
4. Click "Run workflow"

---

## Workflow Steps

### 1. Setup Environment

- Checkout code
- Install Java 17 (required for Android build)
- Install Flutter 3.24.5 (stable channel)

### 2. Build APK

```bash
cd superparty_flutter
flutter pub get
flutter build apk --release
```

**Output:** `superparty_flutter/build/app/outputs/flutter-apk/app-release.apk`

### 3. Upload to Artifacts

- APK is uploaded as GitHub Actions artifact
- Available for download from workflow run page
- Artifact name: `superparty-app`

### 4. Upload to Firebase App Distribution

- APK is uploaded to Firebase App Distribution
- Testers receive email notification
- Release notes include latest features

---

## Testing the Workflow

### Option 1: Push to main (automatic)

```bash
git checkout main
git pull origin main
# Make a small change (e.g., update version in pubspec.yaml)
git add .
git commit -m "test: trigger build workflow"
git push origin main
```

### Option 2: Manual trigger

1. Go to [GitHub Actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
2. Select "Build Flutter APK" workflow
3. Click "Run workflow" → Select `main` → "Run workflow"

### Option 3: Test on feature branch first

```bash
git checkout feature/evenimente-ui-preview
# Workflow will run but won't trigger on push (only main branch)
# Use manual trigger to test
```

---

## Verifying Build Success

### 1. Check GitHub Actions

- Go to [Actions tab](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
- Find latest "Build Flutter APK" run
- All steps should be green ✅

### 2. Download APK from Artifacts

- Click on workflow run
- Scroll to "Artifacts" section
- Download `superparty-app.zip`
- Extract and install APK on Android device

### 3. Check Firebase App Distribution

- Go to [Firebase Console → App Distribution](https://console.firebase.google.com/project/superparty-frontend/appdistribution)
- Latest release should appear
- Testers should receive email

---

## Troubleshooting

### Error: "Missing FIREBASE_APP_ID secret"

**Fix:** Add `FIREBASE_APP_ID` secret in GitHub repo settings

### Error: "Missing FIREBASE_SERVICE_ACCOUNT secret"

**Fix:** Add `FIREBASE_SERVICE_ACCOUNT` secret with full JSON content

### Error: "Firebase App Distribution upload failed"

**Possible causes:**

1. Invalid service account JSON
2. Service account doesn't have "Firebase App Distribution Admin" role
3. App ID doesn't match Firebase project

**Fix:**

1. Verify service account has correct permissions in Firebase Console
2. Verify App ID matches Firebase project
3. Regenerate service account key if needed

### Error: "Flutter build failed"

**Possible causes:**

1. Syntax errors in Dart code
2. Missing dependencies
3. Version conflicts

**Fix:**

1. Run `flutter analyze` locally to check for errors
2. Run `flutter pub get` to update dependencies
3. Check workflow logs for specific error messages

---

## Release Notes

Release notes are automatically generated from workflow file:

```yaml
releaseNotes: |
  🎉 Evenimente + Dovezi Module (NEW):
  - Full Flutter native implementation
  - Firebase real-time sync
  - NEVER DELETE policy
  ...

  Build: ${{ github.run_number }}
```

**To update release notes:**

1. Edit `.github/workflows/flutter-build.yml`
2. Update `releaseNotes` section
3. Commit and push to main

---

## Security Best Practices

1. **Never commit secrets to git**
   - Use GitHub Secrets for sensitive data
   - Add `*.json` to `.gitignore` for service account files

2. **Rotate service account keys regularly**
   - Generate new key every 90 days
   - Update GitHub Secret with new key
   - Delete old key from Firebase Console

3. **Limit service account permissions**
   - Only grant "Firebase App Distribution Admin" role
   - Don't use project owner account

4. **Review workflow logs**
   - Check for exposed secrets in logs
   - Secrets are automatically masked by GitHub

---

## Next Steps

1. **Add secrets to GitHub** (see "Required GitHub Secrets" section)
2. **Test workflow** (manual trigger or push to main)
3. **Verify APK** (download from artifacts or Firebase App Distribution)
4. **Install on device** (test Evenimente + Dovezi module)

---

## Support

If you encounter issues:

1. Check [GitHub Actions logs](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
2. Verify secrets are correctly configured
3. Check Firebase Console for App Distribution status
4. Review this documentation for troubleshooting steps
