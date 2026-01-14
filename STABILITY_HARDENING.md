# Flutter App Stability Hardening

**Date:** 2026-01-14  
**Branch:** `stability-hardening`  
**Goal:** Eliminate boot-time hangs/crashes, add global error boundaries, enforce single MaterialApp, remove null-safety crash patterns.

---

## Summary of Changes

### A) Boot-Time Robustness ✅
- **Removed:** Firebase init blocking in `main()` (was causing blank screen on failure)
- **Added:** `FirebaseInitGate` with retry logic (exponential backoff: 10s, 20s, 40s, max 3 attempts)
- **Result:** UI appears immediately; init happens asynchronously with timeout + retry

### B) Global Error Boundaries ✅
- **Added:** `runZonedGuarded` wrapping entire app in `main()`
- **Enhanced:** `FlutterError.onError` forwards to zone handler
- **Fixed:** `ErrorWidget.builder` returns minimal error UI (no MaterialApp)

### C) Single MaterialApp Enforcement ✅
- **Fixed:** `ErrorScreen` no longer creates MaterialApp (returns Scaffold only)
- **Verified:** Only `lib/main.dart` → `AppShell` creates MaterialApp
- **Result:** No duplicate MaterialApp instances

### D) Null-Safety Hardening ✅
- **Fixed:** Unsafe `.data()!` in `ai_event_override_screen.dart` and `ai_logic_global_screen.dart`
- **Fixed:** Unsafe casts in `user_display_name.dart` and `evidence_model.dart`
- **Replaced:** `print()` → `debugPrint()` in `FirebaseService`

### E) CI Quality Gates ✅
- **Created:** `.github/workflows/flutter-ci.yml` with:
  - Format check (`dart format --set-exit-if-changed`)
  - Analyze (`flutter analyze --fatal-infos --fatal-warnings`)
  - Test (`flutter test`)
  - Guardrails (grep checks for anti-patterns)

---

## Files Changed

### Core Stability
- `superparty_flutter/lib/main.dart` - Added `runZonedGuarded`, improved error boundaries
- `superparty_flutter/lib/app/app_shell.dart` - Added retry logic to `FirebaseInitGate`
- `superparty_flutter/lib/screens/error/error_screen.dart` - Removed MaterialApp

### Null-Safety Fixes
- `superparty_flutter/lib/services/firebase_service.dart` - Replaced `print()` with `debugPrint()`
- `superparty_flutter/lib/screens/admin/ai_event_override_screen.dart` - Fixed unsafe `.data()!`
- `superparty_flutter/lib/screens/admin/ai_logic_global_screen.dart` - Fixed unsafe `.data()!`
- `superparty_flutter/lib/widgets/user_display_name.dart` - Fixed unsafe casts (2 occurrences)
- `superparty_flutter/lib/models/evidence_model.dart` - Fixed unsafe cast with type guard

### CI & Tests
- `.github/workflows/flutter-ci.yml` - New CI workflow (format, analyze, test, guardrails)
- `superparty_flutter/test/app/firebase_init_gate_test.dart` - Test for bootstrap retry logic

---

## How to Verify

### Local Verification

```bash
cd superparty_flutter

# 1. Format check
dart format --set-exit-if-changed lib test

# 2. Analyze
flutter analyze

# 3. Run tests
flutter test

# 4. Manual guardrails
grep -r "\.data()!" lib/ --include="*.dart" | grep -v "test"
# Expected: No matches (or only in test files)

grep -r "MaterialApp(" lib/ --include="*.dart" | grep -v "lib/main.dart" | grep -v "test"
# Expected: No matches

grep -r "while.*isInitialized" lib/ --include="*.dart" | grep -v "test"
# Expected: No matches
```

### Expected Behavior

#### Boot Sequence
1. **App launches** → UI appears immediately (no blank screen)
2. **Firebase init starts** → Shows "Initializing Firebase..." loading UI
3. **On success** → App content appears
4. **On failure** → Shows error UI with Retry button
5. **After retry** → Waits 10s, retries (up to 3 attempts with backoff: 10s, 20s, 40s)
6. **After max retries** → Shows "Te rog repornește aplicația." (permanent failed state)

#### Error Handling
- **Uncaught errors** → Caught by `runZonedGuarded`, logged, app continues
- **Flutter errors** → Caught by `FlutterError.onError`, minimal error widget shown (no MaterialApp)
- **Zone errors** → Forwarded to zone handler, logged

#### Single MaterialApp
- Only `lib/main.dart` → `AppShell` creates MaterialApp
- All screens return `Scaffold` or other widgets (not MaterialApp)
- Error screens use existing MaterialApp context

---

## CI Verification

The CI workflow (`.github/workflows/flutter-ci.yml`) runs on:
- Pull requests (when `superparty_flutter/**` files change)
- Pushes to `main`, `feature/**`, `stability-hardening` branches
- Manual trigger (`workflow_dispatch`)

**Jobs:**
1. **format** - Fails if code is not formatted
2. **analyze** - Fails on errors or warnings
3. **test** - Runs all Flutter tests
4. **guardrails** - Grep checks for anti-patterns:
   - Unsafe `.data()!` usage
   - MaterialApp outside main.dart
   - Init polling loops

---

## Risk Removed

### Before
- ❌ App could hang on Firebase init failure (blank screen)
- ❌ No retry mechanism (single attempt, then fail)
- ❌ Uncaught errors could crash app silently
- ❌ Error screens created duplicate MaterialApp
- ❌ Unsafe null-safety patterns could crash on invalid Firestore data
- ❌ No CI guardrails to prevent regressions

### After
- ✅ UI appears immediately (no blocking init)
- ✅ Retry with exponential backoff (3 attempts: 10s, 20s, 40s)
- ✅ Global error boundaries catch all unhandled errors
- ✅ Single MaterialApp enforced (no duplicates)
- ✅ Null-safe access patterns prevent crashes
- ✅ CI prevents regressions (format, analyze, test, guardrails)

---

## Testing Scenarios

### Scenario 1: Normal Boot (Firebase Available)
1. Launch app
2. **Expected:** Loading UI → App content (within 10s)

### Scenario 2: Firebase Init Fails (Network Issue)
1. Launch app with Firebase unreachable
2. **Expected:** Loading UI → Error UI → Retry button
3. Click Retry
4. **Expected:** Waits 10s → Retries → (if still fails) Error UI again
5. After 3 attempts
6. **Expected:** "Te rog repornește aplicația." (no more retries)

### Scenario 3: Uncaught Error
1. Trigger unhandled exception (e.g., in async callback)
2. **Expected:** Error logged, minimal error widget shown, app continues

### Scenario 4: Invalid Firestore Data
1. Access Firestore document with invalid structure
2. **Expected:** Type guards prevent crash, fallback UI shown

---

## Next Steps (Optional Enhancements)

1. **Crash Reporting:** Integrate Sentry/Firebase Crashlytics in `runZonedGuarded` handler
2. **Analytics:** Track init failures, retry counts, error types
3. **Offline Mode:** Add limited functionality mode when Firebase unavailable
4. **Integration Tests:** Add Firebase emulator tests for full retry flow

---

## Commit & PR

```bash
git add superparty_flutter/ .github/workflows/flutter-ci.yml STABILITY_HARDENING.md
git commit -m "feat: Flutter stability hardening - boot robustness, error boundaries, null-safety"
git push origin stability-hardening
```

**PR:** Create PR from `stability-hardening` → `main`

---

**Status:** ✅ All DoD criteria met  
**Verification:** Run local commands above + check CI passes on PR
