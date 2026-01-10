# Stability Checklist - Flutter Web

## Pre-Merge Requirements

### ✅ Architecture

- [ ] Single MaterialApp in entire project
- [ ] All wrappers (UpdateGate, overlays) in MaterialApp.builder
- [ ] No parallel MaterialApp/Scaffold returns in wrappers
- [ ] UpdateGate uses Stack overlay, not nested MaterialApp

### ✅ Routing

- [ ] Centralized routing in onGenerateRoute
- [ ] Route normalization handles:
  - `/#/path` → `/path`
  - Query params (`?x=1`)
  - Trailing slash
- [ ] onUnknownRoute shows NotFoundScreen
- [ ] Logging: `[ROUTE] Raw:` and `[ROUTE] Normalized:`

### ✅ Null Safety

- [ ] No `!` operators on:
  - `FirebaseAuth.instance.currentUser`
  - `ModalRoute.of(context)`
  - `settings.arguments`
  - `child` in builder
- [ ] Firestore parsing uses safe defaults
- [ ] Missing user → Login/Loader with clear message

### ✅ Build() Purity

- [ ] No async calls in build()
- [ ] No setState in build()
- [ ] No notifyListeners in build()
- [ ] Side-effects moved to initState + postFrameCallback
- [ ] Guards: "once per UID/session" with reset on logout

### ✅ Error Handling

- [ ] Global error handlers:
  - `FlutterError.onError`
  - `PlatformDispatcher.instance.onError`
- [ ] ErrorScreen fallback UI
- [ ] Consistent logging: `[Main]`, `[UpdateGate]`, `[AuthWrapper]`, `[ROUTE]`

---

## Test Scenarios

### Web Deep-Link Tests

#### Test 1: Direct Navigation to Evenimente

```bash
flutter run -d web-server --web-port=5051
# Open: http://localhost:5051/#/evenimente
```

**Expected:**

- ✅ UI appears (Login or Evenimente screen)
- ✅ No "Directionality" error
- ✅ No "Unexpected null value"
- ✅ Console shows:
  ```
  [Main] Initializing Firebase...
  [Main] ✅ Firebase initialized successfully
  [ROUTE] Raw: /#/evenimente
  [ROUTE] Normalized: /evenimente
  ```

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 2: Direct Navigation to KYC

```bash
# Open: http://localhost:5051/#/kyc
```

**Expected:**

- ✅ UI appears (Login or KYC screen)
- ✅ No errors in console
- ✅ Route normalized correctly

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 3: Direct Navigation to Admin

```bash
# Open: http://localhost:5051/#/admin
```

**Expected:**

- ✅ UI appears (Login or Admin screen)
- ✅ No errors in console
- ✅ Route normalized correctly

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 4: Unknown Route

```bash
# Open: http://localhost:5051/#/unknown-page
```

**Expected:**

- ✅ NotFoundScreen appears
- ✅ Shows "404 - Pagină Negăsită"
- ✅ "Înapoi la Pagina Principală" button works
- ✅ Console shows:
  ```
  [ROUTE] Unknown path: /unknown-page - showing NotFoundScreen
  ```

**Result:** [ ] PASS / [ ] FAIL

---

### Auth Flow Tests

#### Test 5: Logout → Login

```bash
# 1. Login as user
# 2. Logout
# 3. Login again
```

**Expected:**

- ✅ Guards reset on logout
- ✅ Role loaded once per new UID
- ✅ No rebuild loop
- ✅ No stale data from previous user

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 6: User Switch

```bash
# 1. Login as User A
# 2. Logout
# 3. Login as User B
```

**Expected:**

- ✅ `_lastUid` changes
- ✅ `_roleLoaded` resets
- ✅ New role loaded for User B
- ✅ No data leakage from User A

**Result:** [ ] PASS / [ ] FAIL

---

### Error Handling Tests

#### Test 7: Firebase Init Timeout

```bash
# Simulate slow Firebase init (disconnect network briefly)
```

**Expected:**

- ✅ Timeout after 10 seconds
- ✅ App continues with limited functionality
- ✅ Error logged but app doesn't crash

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 8: Firestore Parse Error

```bash
# Create event with missing required field
```

**Expected:**

- ✅ Safe parsing with defaults
- ✅ Event skipped or shown with placeholder
- ✅ No "Unexpected null value" crash

**Result:** [ ] PASS / [ ] FAIL

---

### Performance Tests

#### Test 9: No Rebuild Loop

```bash
# Monitor console for repeated logs
```

**Expected:**

- ✅ `_loadUserRole` called once per UID
- ✅ No repeated `[AuthWrapper]` logs
- ✅ No stack overflow

**Result:** [ ] PASS / [ ] FAIL

---

#### Test 10: UpdateGate Overlay

```bash
# Start app and watch update check
```

**Expected:**

- ✅ "Verificare actualizări..." overlay appears
- ✅ Main app loads underneath
- ✅ Overlay disappears after check
- ✅ No blank screen during check

**Result:** [ ] PASS / [ ] FAIL

---

## Code Quality

### Static Analysis

```bash
flutter analyze
```

**Expected:**

- ✅ 0 errors
- ✅ 0 warnings (or documented exceptions)

**Result:** [ ] PASS / [ ] FAIL

---

### Widget Tests

```bash
flutter test
```

**Expected:**

- ✅ All tests pass
- ✅ MaterialApp.builder doesn't break Directionality
- ✅ UpdateGate overlay works correctly

**Result:** [ ] PASS / [ ] FAIL

---

## Backward Compatibility

### Mobile Tests

```bash
flutter run -d android
flutter run -d ios
```

**Expected:**

- ✅ App starts normally
- ✅ All features work
- ✅ No regressions

**Result:** [ ] PASS / [ ] FAIL

---

### Desktop Tests

```bash
flutter run -d windows
flutter run -d macos
flutter run -d linux
```

**Expected:**

- ✅ App starts normally
- ✅ All features work
- ✅ No regressions

**Result:** [ ] PASS / [ ] FAIL

---

## Sign-Off

**Tested by:** ********\_********  
**Date:** ********\_********  
**All tests passed:** [ ] YES / [ ] NO  
**Notes:**

---

## Quick Test Commands

```bash
# Clean build
flutter clean && flutter pub get

# Web test
flutter run -d web-server --web-port=5051

# Analyze
flutter analyze

# Test
flutter test

# Mobile
flutter run -d android
flutter run -d ios

# Desktop
flutter run -d windows
```

---

## Common Issues & Solutions

### Issue: Blank screen on web

**Check:**

- UpdateGate in MaterialApp.builder? ✅
- No nested MaterialApp? ✅
- Directionality available? ✅

### Issue: "Unexpected null value"

**Check:**

- No `!` operators? ✅
- Safe Firestore parsing? ✅
- User null checks? ✅

### Issue: Rebuild loop

**Check:**

- No side-effects in build()? ✅
- Guards with postFrameCallback? ✅
- Reset on logout? ✅

### Issue: Route not found

**Check:**

- Route normalization? ✅
- onUnknownRoute defined? ✅
- Logging enabled? ✅
