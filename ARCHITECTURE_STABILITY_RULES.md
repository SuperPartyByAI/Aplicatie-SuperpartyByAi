# Architecture & Stability Rules

## Core Principles

### 1. Single Source of Truth

- **ONE MaterialApp** in entire application
- **ONE Router** (go_router) for all navigation
- **ONE GateController** for all gates (update/migration/maintenance)

### 2. Boot Stability

- `runApp()` NEVER blocks on async operations
- AppShell shows Loading/Error/Success states
- All init operations have timeout + retry
- Blank screen = BUG (always show UI)

### 3. Build Purity

```dart
// ❌ FORBIDDEN in build()
- async/await
- setState()
- notifyListeners()
- HTTP calls
- Firebase queries
- File I/O

// ✅ ALLOWED in build()
- Read state (Provider.of, context.watch)
- Return widgets
- Pure computations
```

### 4. Null Safety

```dart
// ❌ FORBIDDEN
currentUser!
ModalRoute.of(context)!
settings.arguments!
child!
data['field'] as String  // without guard

// ✅ REQUIRED
final user = currentUser;
if (user == null) return LoginScreen();

final args = settings.arguments as Map?;
final value = args?['key'] ?? defaultValue;
```

### 5. Gates as Overlays

```dart
// ❌ WRONG - Nested MaterialApp
class UpdateGate extends StatelessWidget {
  Widget build(context) {
    if (checking) return MaterialApp(home: Loading());
    return child;
  }
}

// ✅ CORRECT - Overlay
class UpdateGate extends StatelessWidget {
  Widget build(context) {
    return Stack(
      children: [
        child,
        if (checking) Positioned.fill(child: Loading()),
      ],
    );
  }
}
```

### 6. Routing

```dart
// ❌ WRONG - Manual switch
onGenerateRoute: (settings) {
  switch (settings.name) {
    case '/home': return MaterialPageRoute(...);
  }
}

// ✅ CORRECT - go_router
final router = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (context, state) => HomeScreen()),
    GoRoute(path: '/evenimente', builder: (context, state) => Evenimente()),
  ],
  redirect: (context, state) {
    if (user == null) return '/login';
    return null;
  },
);
```

### 7. Observability

```dart
// Log tags (consistent)
[BOOT]      - App initialization
[ROUTER]    - Navigation events
[AUTH]      - Authentication state
[GATE]      - Update/migration gates
[FIRESTORE] - Database operations
[ERROR]     - Errors and exceptions

// Example
debugPrint('[BOOT] Initializing Firebase...');
debugPrint('[ROUTER] Navigating to: /evenimente');
debugPrint('[AUTH] User logged in: ${user.uid}');
```

---

## Architecture Layers

```
┌─────────────────────────────────────┐
│         runApp(AppShell)            │  ← Never blocks
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  AppShell (Loading/Error/Success)   │  ← Shows UI immediately
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    ChangeNotifierProvider           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    MaterialApp.router               │  ← Single MaterialApp
│    (go_router)                      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    MaterialApp.builder              │
│    └─ GateController (overlay)     │  ← All gates here
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    Screens (via go_router)          │
└─────────────────────────────────────┘
```

---

## Rules Enforcement

### Pre-Commit Checks

```bash
# No null-unsafe operators
grep -r "currentUser!" lib/ && exit 1
grep -r "ModalRoute.of(context)!" lib/ && exit 1
grep -r "arguments!" lib/ && exit 1

# No side-effects in build
# (manual review - look for async/setState in build methods)

# Static analysis
flutter analyze
```

### Code Review Checklist

- [ ] No MaterialApp outside main.dart
- [ ] No async/setState in build()
- [ ] No `!` operators on nullable types
- [ ] All gates use overlay pattern
- [ ] Logs use consistent tags
- [ ] Error states have UI (not just throw)

---

## Migration Strategy

### Phase 1: Foundation (PR1)

- AppShell with Loading/Error/Success
- Global error handlers
- Gates as overlays (UpdateGate refactor)
- **Risk:** Low - additive changes

### Phase 2: Router (PR2)

- Migrate to go_router
- Remove onGenerateRoute switch
- Add redirect guards
- **Risk:** Medium - changes navigation

### Phase 3: Safety (PR3)

- Remove all `!` operators
- Safe Firestore parsing
- Widget tests
- **Risk:** Low - defensive changes

### Phase 4: Cleanup (PR4)

- Remove old code
- Update documentation
- Performance optimization
- **Risk:** Low - polish

---

## Testing Requirements

### Minimum Tests

1. **AppShell Test**

   ```dart
   testWidgets('AppShell shows loading state', (tester) async {
     await tester.pumpWidget(AppShell(initFuture: Future.delayed(...)));
     expect(find.byType(CircularProgressIndicator), findsOneWidget);
   });
   ```

2. **Routing Test**

   ```dart
   testWidgets('Deep-link to /evenimente works', (tester) async {
     // Test /#/evenimente navigation
   });
   ```

3. **Gate Test**

   ```dart
   testWidgets('UpdateGate overlay preserves Directionality', (tester) async {
     // Test gate doesn't break MaterialApp
   });
   ```

4. **Null Safety Test**
   ```bash
   # Grep rule - no ! operators
   grep -r "currentUser!" lib/ | wc -l  # Must be 0
   ```

---

## Common Pitfalls

### ❌ Pitfall 1: Blocking runApp

```dart
void main() async {
  await Firebase.initializeApp();  // ❌ Blocks UI
  runApp(MyApp());
}
```

### ✅ Solution

```dart
void main() {
  runApp(AppShell());  // ✅ Shows UI immediately
}

class AppShell extends StatefulWidget {
  @override
  void initState() {
    _init();  // Async init in background
  }
}
```

### ❌ Pitfall 2: Side-effects in build

```dart
Widget build(context) {
  _loadUserRole();  // ❌ Called every rebuild
  return HomeScreen();
}
```

### ✅ Solution

```dart
@override
void initState() {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    _loadUserRole();  // ✅ Called once
  });
}
```

### ❌ Pitfall 3: Nested MaterialApp

```dart
if (needsUpdate) {
  return MaterialApp(home: UpdateScreen());  // ❌ Breaks routing
}
```

### ✅ Solution

```dart
return Stack(
  children: [
    child,
    if (needsUpdate) Positioned.fill(child: UpdateScreen()),  // ✅ Overlay
  ],
);
```

---

## Success Metrics

### Before Refactor

- ❌ Blank screen on web deep-links
- ❌ "Unexpected null value" crashes
- ❌ "No Directionality" errors
- ❌ Rebuild loops
- ❌ Silent navigation failures

### After Refactor

- ✅ Always shows UI (Loading/Error/Success)
- ✅ Deep-links work: `/#/evenimente?id=123`
- ✅ Zero null crashes
- ✅ Zero Directionality errors
- ✅ Deterministic navigation
- ✅ Full stack traces on errors
- ✅ Tests prevent regressions

---

## References

- [Flutter Best Practices](https://docs.flutter.dev/development/data-and-backend/state-mgmt/options)
- [go_router Documentation](https://pub.dev/packages/go_router)
- [Error Handling](https://docs.flutter.dev/testing/errors)

---

**Last Updated:** 2026-01-10  
**Status:** ✅ Active Rules  
**Review:** Every PR must follow these rules
