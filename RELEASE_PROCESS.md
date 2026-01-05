# Release Process - SuperParty Flutter App

## Overview

This document describes the complete release process for the SuperParty Flutter app, from development to production deployment.

---

## Release Workflow

```
Feature Branch → PR Review → Merge to Main → Auto Build → Firebase App Distribution → Production
```

---

## 1. Development Phase

### Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Develop & Test Locally

```bash
cd superparty_flutter
flutter pub get
flutter run  # Test on emulator/device
flutter test  # Run unit tests
flutter analyze  # Check for issues
```

### Commit Changes

```bash
git add .
git commit -m "feat: your feature description

- Detail 1
- Detail 2

Co-authored-by: Ona <no-reply@ona.com>"
git push origin feature/your-feature-name
```

---

## 2. Pull Request Phase

### Create PR

1. Go to GitHub repository
2. Click "New Pull Request"
3. Select: `base: main` ← `compare: feature/your-feature-name`
4. Fill in PR template:
   - Title: Clear, descriptive
   - Description: What changed and why
   - Checklist: Mark completed items
   - Screenshots: If UI changes

### PR Review Checklist

- [ ] Code compiles without errors
- [ ] Unit tests pass
- [ ] No regression in existing features
- [ ] Firebase rules deployed (if infrastructure changes)
- [ ] Documentation updated
- [ ] Release notes prepared

### Merge PR

- **Squash and merge** (recommended) - Clean commit history
- **Merge commit** - Preserve all commits
- **Rebase and merge** - Linear history

---

## 3. Automatic Build Phase

### Trigger

When PR is merged to `main`, GitHub Actions automatically:

1. Checks out code
2. Sets up Flutter environment
3. Runs `flutter build apk --release`
4. Uploads APK to GitHub Artifacts
5. Uploads APK to Firebase App Distribution

### Monitor Build

1. Go to [GitHub Actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
2. Find "Build Flutter APK" workflow
3. Check all steps are green ✅

### Build Artifacts

- **GitHub Artifacts**: Download APK from workflow run
- **Firebase App Distribution**: Testers receive email notification

---

## 4. Testing Phase

### Internal Testing (Firebase App Distribution)

**Testers:** ursache.andrei1995@gmail.com (add more in workflow file)

**How to test:**

1. Receive email from Firebase App Distribution
2. Click "Download" link
3. Install APK on Android device
4. Test new features
5. Report bugs in GitHub Issues

**Test Checklist:**

- [ ] App launches without crashes
- [ ] New features work as expected
- [ ] No regression in existing features
- [ ] Performance is acceptable
- [ ] UI looks correct on different screen sizes

### Beta Testing (Optional)

**Expand testers:**

1. Edit `.github/workflows/flutter-build.yml`
2. Add more emails to `testers:` field
3. Commit and push to main

```yaml
testers: |
  ursache.andrei1995@gmail.com
  tester2@example.com
  tester3@example.com
```

---

## 5. Production Release

### Google Play Store (Android)

#### Prerequisites

1. Google Play Developer account ($25 one-time fee)
2. App signing key (keystore)
3. App bundle (AAB) instead of APK

#### Build App Bundle

```bash
cd superparty_flutter
flutter build appbundle --release
```

**Output:** `build/app/outputs/bundle/release/app-release.aab`

#### Upload to Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Select app (or create new app)
3. Navigate to "Production" → "Create new release"
4. Upload `app-release.aab`
5. Fill in release notes
6. Submit for review

**Review time:** 1-7 days

### Apple App Store (iOS)

#### Prerequisites

1. Apple Developer account ($99/year)
2. macOS with Xcode
3. iOS signing certificates

#### Build IPA

```bash
cd superparty_flutter
flutter build ios --release
```

#### Upload to App Store

1. Open Xcode
2. Archive app
3. Upload to App Store Connect
4. Fill in app metadata
5. Submit for review

**Review time:** 1-3 days

---

## 6. Version Management

### Update Version Number

**File:** `superparty_flutter/pubspec.yaml`

```yaml
version: 1.2.3+4
#        │ │ │  └─ Build number (auto-increment)
#        │ │ └──── Patch (bug fixes)
#        │ └────── Minor (new features, backward compatible)
#        └──────── Major (breaking changes)
```

**Semantic Versioning:**

- **Major (1.x.x):** Breaking changes, incompatible API changes
- **Minor (x.2.x):** New features, backward compatible
- **Patch (x.x.3):** Bug fixes, backward compatible
- **Build (+4):** Build number, auto-increment for each release

**Example:**

```yaml
# Before
version: 1.0.0+1

# After adding Evenimente module
version: 1.1.0+2
```

### Git Tags

**Create release tag:**

```bash
git tag -a v1.1.0 -m "Release v1.1.0: Evenimente + Dovezi module"
git push origin v1.1.0
```

**List tags:**

```bash
git tag -l
```

---

## 7. Release Notes

### Format

```markdown
## Version 1.1.0 (Build 2)

### 🎉 New Features

- Evenimente module: Full Flutter native implementation
- Dovezi module: Image upload with category organization
- Firebase real-time sync (Firestore + Storage)

### 🐛 Bug Fixes

- Fixed crash on startup
- Fixed image upload timeout

### 🔧 Improvements

- Improved performance (80-99.9% faster AI responses)
- Better error handling

### ⚠️ Breaking Changes

- None

### 📝 Notes

- NEVER DELETE policy enforced
- Dual-read v1/v2 schema (backward compatible)
```

### Where to Add Release Notes

1. **GitHub Release:**
   - Go to [Releases](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/releases)
   - Click "Draft a new release"
   - Select tag (e.g., `v1.1.0`)
   - Paste release notes
   - Publish release

2. **Firebase App Distribution:**
   - Automatically included from workflow file
   - Edit `.github/workflows/flutter-build.yml` → `releaseNotes`

3. **Google Play Store:**
   - Add to "Release notes" field when creating release
   - Max 500 characters per language

4. **Apple App Store:**
   - Add to "What's New" field in App Store Connect
   - Max 4000 characters

---

## 8. Rollback Procedure

### If Build Fails

1. Check GitHub Actions logs for errors
2. Fix issues in new PR
3. Merge fix to main
4. New build will trigger automatically

### If App Crashes in Production

1. **Immediate:** Disable feature flag (if using feature flags)
2. **Short-term:** Revert PR that caused issue
   ```bash
   git revert <commit-hash>
   git push origin main
   ```
3. **Long-term:** Fix issue in new PR

### If Need to Rollback Release

1. **Firebase App Distribution:** Upload previous APK manually
2. **Google Play Store:** Promote previous version to production
3. **Apple App Store:** Submit previous version for review

---

## 9. Monitoring & Analytics

### Crash Reporting

- **Firebase Crashlytics:** Monitor crashes in real-time
- **Sentry:** Alternative crash reporting (if configured)

### Analytics

- **Firebase Analytics:** Track user behavior
- **Google Analytics:** Web analytics (if using web version)

### Performance Monitoring

- **Firebase Performance:** Monitor app performance
- **Custom metrics:** Track specific operations (e.g., image upload time)

---

## 10. Checklist for Each Release

### Pre-Release

- [ ] All tests pass locally
- [ ] No console errors or warnings
- [ ] Version number updated in `pubspec.yaml`
- [ ] Release notes prepared
- [ ] Firebase infrastructure deployed (if needed)
- [ ] PR reviewed and approved

### Release

- [ ] PR merged to main
- [ ] GitHub Actions build successful
- [ ] APK uploaded to Firebase App Distribution
- [ ] Testers notified
- [ ] Internal testing completed

### Post-Release

- [ ] Git tag created
- [ ] GitHub Release published
- [ ] Release notes added to all platforms
- [ ] Monitor crash reports for 24-48 hours
- [ ] Gather user feedback

---

## 11. Emergency Hotfix Process

### For Critical Bugs in Production

1. **Create hotfix branch from main:**

   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug-fix
   ```

2. **Fix bug and test:**

   ```bash
   # Make minimal changes to fix bug
   flutter test
   flutter analyze
   ```

3. **Create PR with "HOTFIX" label:**
   - Title: `HOTFIX: Critical bug description`
   - Fast-track review (skip non-critical checks)

4. **Merge and deploy immediately:**
   - Merge to main
   - Monitor build
   - Test APK immediately
   - Deploy to production ASAP

5. **Increment patch version:**
   ```yaml
   # Before: 1.1.0+2
   # After:  1.1.1+3
   ```

---

## Support

For questions or issues with the release process:

1. Check this documentation
2. Review GitHub Actions logs
3. Check Firebase Console
4. Contact: ursache.andrei1995@gmail.com
