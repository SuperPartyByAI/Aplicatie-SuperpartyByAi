# Stability Refactor Plan - 4 PRs

## Overview

Refactor app for long-term stability with zero blank screens, robust routing, and comprehensive error handling.

**Timeline:** 4 PRs over 2-3 days  
**Risk Level:** Low to Medium (incremental changes)  
**Backward Compatibility:** Maintained for mobile/desktop

---

## PR1: Foundation - AppShell + Error Handling + Gates Overlay

### Scope

1. **AppShell Widget**
   - Shows Loading/Error/Success states immediately
   - Never blocks runApp()
   - Timeout + retry for Firebase init
   - Error screen with "Retry" button

2. **Global Error Handlers** (already done, verify)
   - FlutterError.onError
   - PlatformDispatcher.instance.onError
   - Consistent log tags: [BOOT], [ERROR]

3. **Gates as Overlays** (already done, verify)
   - UpdateGate uses Stack overlay
   - No nested MaterialApp
   - Preserves Directionality

### Files Changed

- `lib/main.dart` - Add AppShell
- `lib/widgets/app_shell.dart` - NEW
- `lib/services/firebase_service.dart` - Add retry logic
- `ARCHITECTURE_STABILITY_RULES.md` - NEW

### Tests

- [ ] Web: `http://localhost:5051/` shows Loading → Success
- [ ] Web: Disconnect network → shows Error screen with Retry
- [ ] Web: `/#/evenimente` works after init
- [ ] Console: `[BOOT]` logs visible

### Risks

- **Low** - Additive changes, no breaking changes
- AppShell wraps existing app
- Fallback to current behavior if AppShell fails

### Success Criteria

- ✅ No blank screen on web
- ✅ Error states have UI
- ✅ Firebase init timeout works
- ✅ All existing features work

---

## PR2: Router - Migrate to go_router

### Scope

1. **Add go_router Dependency**
   - `pubspec.yaml`: Add `go_router: ^14.0.0`

2. **Define Routes**
   - Create `lib/router/app_router.dart`
   - Define all routes: /, /home, /evenimente, /kyc, /admin, etc.
   - Add redirect guards (user null → /login)
   - Add NotFound route

3. **Replace onGenerateRoute**
   - Remove switch statement in main.dart
   - Use `MaterialApp.router` with GoRouter
   - Remove manual route normalization (go_router handles it)

4. **Update Navigation Calls**
   - Replace `Navigator.pushNamed` with `context.go`
   - Replace `Navigator.pushReplacementNamed` with `context.replace`

### Files Changed

- `pubspec.yaml` - Add go_router
- `lib/router/app_router.dart` - NEW
- `lib/main.dart` - Use MaterialApp.router
- `lib/widgets/app_drawer.dart` - Update navigation
- All screens with navigation calls

### Tests

- [ ] Web: `/#/evenimente` works
- [ ] Web: `/#/evenimente?id=123` preserves query params
- [ ] Web: `/unknown` shows NotFoundScreen
- [ ] Mobile: All navigation works
- [ ] Console: `[ROUTER]` logs visible

### Risks

- **Medium** - Changes core navigation
- Mitigation: Test all routes before merge
- Rollback plan: Revert to onGenerateRoute

### Success Criteria

- ✅ Deep-links work: `/#/path?query`
- ✅ Redirect guards work (null user → login)
- ✅ NotFound route shows 404 screen
- ✅ All existing navigation works

---

## PR3: Safety - Null Safety + Firestore Parsing + Tests

### Scope

1. **Null Safety Audit**
   - Grep for `!` operators: currentUser!, ModalRoute!, arguments!, child!
   - Replace with safe checks + fallbacks
   - Add guards: `if (user == null) return LoginScreen();`

2. **Firestore Safe Parsing**
   - Review all `fromMap` methods
   - Add default values for missing fields
   - Log warnings for invalid schema
   - Never crash on bad data

3. **Widget Tests**
   - AppShell loading/error/success states
   - Routing deep-link test
   - Gate overlay Directionality test
   - Null safety grep rule test

4. **Documentation**
   - Update STABILITY_CHECKLIST.md
   - Add test running instructions
   - Document null safety patterns

### Files Changed

- `lib/models/*.dart` - Safe parsing
- `lib/screens/**/*.dart` - Remove `!` operators
- `test/widget_test.dart` - NEW tests
- `test/router_test.dart` - NEW
- `test/null_safety_test.dart` - NEW
- `STABILITY_CHECKLIST.md` - Update

### Tests

- [ ] `flutter test` passes
- [ ] `flutter analyze` 0 errors
- [ ] Grep: `grep -r "currentUser!" lib/ | wc -l` = 0
- [ ] Web: Bad Firestore data doesn't crash
- [ ] Web: Null user shows Login screen

### Risks

- **Low** - Defensive changes
- All changes add safety, don't remove features
- Tests catch regressions

### Success Criteria

- ✅ Zero `!` operators on nullable types
- ✅ Firestore parsing never crashes
- ✅ All tests pass
- ✅ flutter analyze clean

---

## PR4: Cleanup - Remove Old Code + Documentation + Optimization

### Scope

1. **Remove Dead Code**
   - Old routing code (onGenerateRoute switch)
   - Unused imports
   - Commented code
   - Temporary workarounds

2. **Documentation**
   - Update README with new architecture
   - Add architecture diagrams
   - Document routing patterns
   - Add troubleshooting guide

3. **Performance**
   - Review rebuild triggers
   - Optimize Provider usage
   - Add const constructors where possible
   - Profile app startup time

4. **Final Tests**
   - Run full STABILITY_CHECKLIST.md
   - Test on all platforms (web, mobile, desktop)
   - Performance benchmarks

### Files Changed

- `lib/main.dart` - Remove old code
- `README.md` - Update
- `docs/ARCHITECTURE.md` - NEW
- `docs/TROUBLESHOOTING.md` - NEW
- Various files - const constructors

### Tests

- [ ] All STABILITY_CHECKLIST.md tests pass
- [ ] Web: Startup < 3 seconds
- [ ] Mobile: No regressions
- [ ] Desktop: No regressions

### Risks

- **Low** - Polish and cleanup
- No functional changes
- Easy to revert if needed

### Success Criteria

- ✅ Clean codebase
- ✅ Complete documentation
- ✅ All tests pass
- ✅ Performance benchmarks met

---

## Timeline

| PR  | Title                                 | Days | Risk   | Dependencies |
| --- | ------------------------------------- | ---- | ------ | ------------ |
| PR1 | Foundation: AppShell + Error Handling | 1    | Low    | None         |
| PR2 | Router: Migrate to go_router          | 1    | Medium | PR1          |
| PR3 | Safety: Null Safety + Tests           | 1    | Low    | PR2          |
| PR4 | Cleanup: Documentation + Optimization | 0.5  | Low    | PR3          |

**Total:** 3.5 days

---

## Review Checklist (All PRs)

### Code Quality

- [ ] `flutter analyze` passes
- [ ] No `!` operators on nullable types
- [ ] No side-effects in build()
- [ ] Consistent log tags
- [ ] Error states have UI

### Testing

- [ ] Tests added/updated
- [ ] Manual testing on web
- [ ] Manual testing on mobile (if applicable)
- [ ] STABILITY_CHECKLIST.md scenarios tested

### Documentation

- [ ] PR description explains changes
- [ ] Test steps included
- [ ] Screenshots for UI changes
- [ ] Architecture rules followed

### Backward Compatibility

- [ ] Mobile features work
- [ ] Desktop features work
- [ ] No breaking API changes

---

## Rollback Plan

Each PR is independent and can be reverted:

**PR1:** Revert AppShell, app works as before  
**PR2:** Revert go_router, use onGenerateRoute  
**PR3:** Revert null safety changes (low risk)  
**PR4:** Revert cleanup (no functional changes)

---

## Success Metrics

### Before Refactor

- ❌ Blank screen on web deep-links
- ❌ "Unexpected null value" crashes
- ❌ "No Directionality" errors
- ❌ Rebuild loops
- ❌ Silent navigation failures
- ❌ No tests

### After Refactor (All PRs Merged)

- ✅ Always shows UI (Loading/Error/Success)
- ✅ Deep-links work: `/#/evenimente?id=123`
- ✅ Zero null crashes
- ✅ Zero Directionality errors
- ✅ Deterministic navigation with go_router
- ✅ Full stack traces on errors
- ✅ Widget tests prevent regressions
- ✅ Clean architecture documented

---

## Next Steps

1. Review and approve ARCHITECTURE_STABILITY_RULES.md
2. Create PR1 branch: `git checkout -b refactor/pr1-foundation`
3. Implement AppShell
4. Test on web + mobile
5. Create PR with test results
6. Repeat for PR2, PR3, PR4

---

**Status:** 📋 Plan Ready  
**Approval Needed:** Yes  
**Start Date:** TBD
