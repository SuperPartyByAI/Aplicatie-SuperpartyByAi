# Stability Refactor - Test Checklist

## Changes Summary

### 1. Single MaterialApp ✅

- **Before**: 3 MaterialApp instances (main.dart x2, error_screen.dart x1)
- **After**: 1 MaterialApp at top-level in SuperPartyApp
- **Impact**: No more Directionality/Navigator errors from nested MaterialApp

### 2. UpdateGate as Overlay ✅

- **Implementation**: UpdateGate returns Stack with child + overlays
- **Location**: MaterialApp.builder
- **Impact**: Update checks don't block routing, preserve Navigator context

### 3. Side-Effects Removed ✅

- **Before**: `_loadUserRole()` and `BackgroundService.startService()` called in build()
- **After**: Guarded with flags + postFrameCallback
- **Impact**: No rebuild loops, predictable state management

### 4. Null-Safety Audit ✅

- **Fixed patterns**:
  - `.data()!` → `.data()` with null check (7 instances)
  - `as Map<String, dynamic>` → `as Map<String, dynamic>?` with null-safe access
- **Impact**: No null crashes from Firestore data

### 5. Router Hardening ✅

- **Features**:
  - Path normalization: `/#/evenimente` → `/evenimente`
  - Query param stripping
  - Trailing slash handling
  - onUnknownRoute fallback → NotFoundScreen
- **Impact**: Robust deep-link handling on web

## Test Plan

### A. Web Server Test (CRITICAL)

```bash
cd /workspaces/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run -d web-server --web-port=5051 -v
```

**Test URLs:**

1. `http://localhost:5051/` → Should show Login/Home
2. `http://localhost:5051/#/evenimente` → Should route to Evenimente
3. `http://localhost:5051/#/kyc` → Should route to KYC
4. `http://localhost:5051/#/admin` → Should route to Admin
5. `http://localhost:5051/#/invalid-route` → Should show NotFoundScreen
6. `http://localhost:5051/#/evenimente?query=test` → Should route to Evenimente (query ignored)
7. `http://localhost:5051/#/evenimente/` → Should route to Evenimente (trailing slash handled)

**Expected Results:**

- ✅ No "No Directionality widget found" errors
- ✅ No "Unexpected null value" errors
- ✅ No blank white screen
- ✅ All routes load correctly
- ✅ Console shows `[ROUTE] Raw:` and `[ROUTE] Normalized:` logs

### B. Firebase Initialization Test

**Scenario 1: Normal Boot**

- Expected: Loading screen → Firebase init → App loads
- Console: `[Main] ✅ Firebase initialized successfully`

**Scenario 2: Slow Network**

- Expected: Loading screen for up to 10s → Timeout → App continues with limited functionality
- Console: `[Main] ❌ Firebase initialization failed` + `[Main] ⚠️ App will continue with limited functionality`

**Scenario 3: Offline**

- Expected: Same as Scenario 2
- App should not crash, should show appropriate error UI

### C. UpdateGate Test

**Test**: Simulate force update required

1. Set `forceUpdate.enabled = true` in Firestore config
2. Set `forceUpdate.minBuildNumber` higher than current build
3. Restart app

**Expected**:

- ✅ UpdateGate overlay appears
- ✅ Main app is still mounted (no routing errors)
- ✅ ForceUpdateScreen shows with download button
- ✅ No nested MaterialApp errors

### D. Null-Safety Test

**Test**: Access Firestore documents with missing fields

1. Create event with missing `roles` field
2. Access event in Evenimente screen

**Expected**:

- ✅ No null pointer exceptions
- ✅ Graceful fallback to empty array
- ✅ Console shows error but app doesn't crash

### E. Side-Effects Test

**Test**: Login → Logout → Login with different user

1. Login as User A
2. Wait for role to load
3. Logout
4. Login as User B

**Expected**:

- ✅ Role loads only once per user
- ✅ Background service starts only once per user
- ✅ No rebuild loops
- ✅ Console shows guards working: `_roleLoaded = false` on user change

### F. Mobile Test (Android)

```bash
flutter run -d <device-id>
```

**Test**:

1. Cold start → Background service should start
2. Force update flow → Download → Install
3. Deep link: `adb shell am start -a android.intent.action.VIEW -d "superparty://evenimente"`

**Expected**:

- ✅ Background service starts without errors
- ✅ Push notifications initialize
- ✅ Deep links route correctly

## Verification Commands

### Check for nested MaterialApp

```bash
grep -rn "MaterialApp(" superparty_flutter/lib/
# Expected: Only 1 match in main.dart
```

### Check for null-unsafe patterns

```bash
grep -rn "\.data()!" superparty_flutter/lib/
# Expected: No matches
```

### Check for side-effects in build

```bash
grep -rn "setState\|notifyListeners" superparty_flutter/lib/ | grep "build(BuildContext" -A 5
# Expected: No matches (all should be in postFrameCallback or initState)
```

### Run analyzer

```bash
flutter analyze
# Expected: No errors, only acceptable warnings
```

## Success Criteria

- [ ] Single MaterialApp confirmed (grep shows only 1)
- [ ] Web deep-links work (/#/evenimente, /#/kyc, /#/admin)
- [ ] No Directionality errors in console
- [ ] No null pointer exceptions
- [ ] UpdateGate overlay works without blocking routing
- [ ] Side-effects properly guarded (no rebuild loops)
- [ ] flutter analyze is clean
- [ ] Mobile build succeeds
- [ ] Background service starts on mobile
- [ ] Force update flow works on Android

## Known Limitations

1. **Flutter not in PATH**: Need to install Flutter SDK or use existing installation
2. **Firebase config**: Requires valid Firebase project setup
3. **Mobile testing**: Requires physical device or emulator

## Rollback Plan

If critical issues found:

```bash
git checkout main
git branch -D stability-refactor
```

All changes are in a single branch, easy to revert.
