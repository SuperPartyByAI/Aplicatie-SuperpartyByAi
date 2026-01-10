# Crash Debugging Guide - Systematic Fix

## Why "Fix One, Another Breaks"

### Root Cause: Cascading Errors

Errors are **in chain** - one masks the next:

1. **Before**: Crashes on Directionality → Never reaches Evenimente
2. **After fix**: Reaches Evenimente → Crashes on null/Firestore parsing
3. **Appears**: "Fixed one, another broke" but actually **discovered next obstacle**

### Why Root Changes Have Global Effect

When you change:

- MaterialApp/routing
- UpdateGate
- AuthWrapper
- Firebase initialization

...you change the **foundation**. If foundation has 1-2 problems, they manifest everywhere.

## Solution: Fix in Correct Order

### Phase 1: Root Stability (CRITICAL)

1. **Single MaterialApp** - One Navigator, one Theme, one Directionality
2. **Gates as overlays** - UpdateGate in MaterialApp.builder
3. **Fallback UI** - Clear loading/error screens (no blank)

### Phase 2: Routing Stability

1. **Deep-links** - Normalize `/#/x` → `/x`
2. **onUnknownRoute** - Fallback to NotFoundScreen
3. **No crashes** - All routes return valid widgets

### Phase 3: Auth Stability

1. **No currentUser!** - Always check null
2. **No side effects in build()** - Guards + postFrameCallback
3. **Screens only** - AuthWrapper returns screens, not MaterialApp

### Phase 4: Data Stability

1. **Safe Firestore parsing** - No `.data()!`
2. **Default values** - Handle missing fields
3. **Null checks** - Guard all external data

**When first 3 are correct, remaining errors become local and don't "jump" everywhere.**

## Step-by-Step Crash Debugging

### Step 1: Capture Exact Error

**Run with verbose logging**:

```bash
cd /workspaces/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run -d web-server --web-port=5051 -v 2>&1 | tee crash.log
```

**Open in browser**:

```
http://localhost:5051/#/evenimente
```

**In terminal, search for**:

```
"Another exception was thrown:"
"[FlutterError]"
"══╡ EXCEPTION CAUGHT"
```

**Copy 20-30 lines** after first match until you see:

```
lib/...dart:line
```

**Example output**:

```
══╡ EXCEPTION CAUGHT BY WIDGETS LIBRARY ╞═══════════════════════════════════════════════════════════
The following assertion was thrown building UpdateGate(dirty, dependencies: [_InheritedProviderScope<AppStateProvider?>], state: _UpdateGateState#12345):
No Directionality widget found.

Stack trace:
#0      debugCheckHasDirectionality.<anonymous closure> (package:flutter/src/widgets/debug.dart:234:7)
#1      debugCheckHasDirectionality (package:flutter/src/widgets/debug.dart:244:4)
#2      Stack.build (package:flutter/src/widgets/basic.dart:4567:12)
#3      _UpdateGateState.build (package:superparty_flutter/widgets/update_gate.dart:88:12)  ← THIS LINE
#4      StatefulElement.build (package:flutter/src/widgets/framework.dart:5039:27)
...
```

**Extract**:

- **Error**: "No Directionality widget found"
- **File**: `lib/widgets/update_gate.dart`
- **Line**: `88`

### Step 2: Identify Error Type

#### Error Type 1: "No Directionality widget found"

**Cause**: Widget using directional layout (Stack, Text, etc.) without Directionality context

**Fix**:

```dart
// Before (WRONG)
return Stack(
  children: [widget.child, ...overlays],
);

// After (CORRECT)
return Directionality(
  textDirection: TextDirection.ltr,
  child: Stack(
    children: [widget.child, ...overlays],
  ),
);
```

**Or**: Ensure widget is inside MaterialApp.builder (which provides Directionality)

#### Error Type 2: "Unexpected null value"

**Cause**: Using `!` operator on potentially null value

**Fix**:

```dart
// Before (WRONG)
final user = FirebaseAuth.instance.currentUser!;
final data = snapshot.data!;

// After (CORRECT)
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  return const LoginScreen();  // Fallback UI
}

final data = snapshot.data;
if (data == null) {
  return const Scaffold(
    body: Center(child: Text('No data')),
  );
}
```

#### Error Type 3: "Could not find a generator for route"

**Cause**: Route not handled in onGenerateRoute

**Fix**:

```dart
// Add to onGenerateRoute
onGenerateRoute: (settings) {
  // Normalize path
  final raw = settings.name ?? '/';
  final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw;
  final uri = Uri.tryParse(cleaned) ?? Uri(path: cleaned);
  final path = uri.path.isEmpty ? '/' : uri.path;

  switch (path) {
    case '/evenimente':
      return MaterialPageRoute(builder: (_) => const EvenimenteScreen());
    // ... other routes
    default:
      return MaterialPageRoute(builder: (_) => NotFoundScreen(routeName: path));
  }
},

// Add fallback
onUnknownRoute: (settings) {
  return MaterialPageRoute(builder: (_) => NotFoundScreen(routeName: settings.name));
},
```

#### Error Type 4: "[core/no-app]" (Firebase)

**Cause**: Accessing Firebase before initialization complete

**Fix**:

```dart
// In MaterialApp.builder
builder: (context, child) {
  if (!FirebaseService.isInitialized) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Initializing Firebase...'),
          ],
        ),
      ),
    );
  }

  return UpdateGate(child: child ?? const SizedBox.shrink());
},
```

#### Error Type 5: "RenderBox was not laid out"

**Cause**: Widget constraints not properly set

**Fix**:

```dart
// Wrap in Expanded/Flexible or set explicit size
Expanded(
  child: YourWidget(),
)

// Or
SizedBox(
  width: 200,
  height: 100,
  child: YourWidget(),
)
```

### Step 3: Apply Fix

1. **Identify file and line** from stack trace
2. **Read surrounding code** to understand context
3. **Apply appropriate fix** based on error type
4. **Test immediately** - don't fix multiple things at once

### Step 4: Verify Fix

**Re-run with same command**:

```bash
flutter run -d web-server --web-port=5051 -v
```

**Test all critical URLs**:

```
http://localhost:5051/
http://localhost:5051/#/evenimente
http://localhost:5051/#/kyc
http://localhost:5051/#/admin
http://localhost:5051/#/invalid-route
```

**Confirm**:

- ✅ No crash
- ✅ UI appears (not blank)
- ✅ No errors in terminal
- ✅ Console shows expected logs

### Step 5: Document in PR

**Include**:

1. **Stack trace** (before) with file + line
2. **Patch** with fix
3. **Test evidence** (log snippet + URLs tested)

**Example commit message**:

```
fix: add Directionality wrapper to UpdateGate

Error: "No Directionality widget found"
File: lib/widgets/update_gate.dart:88
Cause: Stack returned without Directionality context

Fix: Wrap Stack with Directionality(textDirection: ltr)

Tested:
- /#/evenimente ✅
- /#/kyc ✅
- /#/admin ✅
- No errors in console ✅
```

## Guardrails to Prevent Regression

### 1. Widget Tests (Minimum 3)

**test/smoke_test.dart**:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_flutter/main.dart';

void main() {
  testWidgets('App boots without crash', (tester) async {
    await tester.pumpWidget(const SuperPartyApp());
    await tester.pump();

    // Should not throw
    expect(tester.takeException(), isNull);
  });

  testWidgets('UpdateGate does not throw Directionality error', (tester) async {
    await tester.pumpWidget(const SuperPartyApp());
    await tester.pump();

    // Should not throw Directionality error
    expect(tester.takeException(), isNull);
  });

  testWidgets('Deep-link routing works', (tester) async {
    // Test that /#/evenimente routes correctly
    // (requires more setup with Navigator)
  });
}
```

**Run tests**:

```bash
flutter test test/smoke_test.dart
```

### 2. CI/CD (GitHub Actions)

**.github/workflows/test.yml**:

```yaml
name: Test

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.x'
      - run: cd superparty_flutter && flutter pub get
      - run: cd superparty_flutter && flutter analyze
      - run: cd superparty_flutter && flutter test
```

### 3. Lint Rules

**analysis_options.yaml**:

```yaml
linter:
  rules:
    # Prevent null-unsafe patterns
    - avoid_null_checks_in_equality_operators
    - prefer_null_aware_operators

    # Prevent side effects
    - no_logic_in_create_state

    # Best practices
    - always_declare_return_types
    - avoid_print # Use debugPrint
    - prefer_const_constructors
```

### 4. Grep Checks (Pre-commit)

**scripts/check_unsafe_patterns.sh**:

```bash
#!/bin/bash

echo "Checking for unsafe patterns..."

# Check for currentUser!
if grep -rn "currentUser!" superparty_flutter/lib/; then
  echo "❌ Found currentUser! - use null check instead"
  exit 1
fi

# Check for .data()!
if grep -rn "\.data()!" superparty_flutter/lib/; then
  echo "❌ Found .data()! - use null check instead"
  exit 1
fi

# Check for multiple MaterialApp
count=$(grep -rn "MaterialApp(" superparty_flutter/lib/ | wc -l)
if [ "$count" -gt 1 ]; then
  echo "❌ Found $count MaterialApp instances - should be only 1"
  exit 1
fi

echo "✅ All checks passed"
```

**Run before commit**:

```bash
bash scripts/check_unsafe_patterns.sh
```

## Current Status (stability-refactor branch)

### ✅ Already Fixed

1. **Single MaterialApp** - Only 1 instance in lib/main.dart:122
2. **UpdateGate Directionality** - Wrapped with Directionality(textDirection: ltr)
3. **Null-safety** - Fixed 7 instances of `.data()!`
4. **Router hardening** - Path normalization, onUnknownRoute
5. **No side effects** - Guards + postFrameCallback
6. **Widget tests** - 4 tests for UpdateGate

### 🔍 To Verify

**If you're still seeing crashes**, it means:

1. You're testing on `main` branch (not `stability-refactor`)
2. There's a new error in a different file
3. The error is in a screen/component not yet fixed

**To identify**:

```bash
# Ensure you're on stability-refactor
git checkout stability-refactor

# Run with verbose logging
cd superparty_flutter
flutter run -d web-server --web-port=5051 -v 2>&1 | tee crash.log

# Open browser
# Navigate to http://localhost:5051/#/evenimente

# Search crash.log for:
grep -A 30 "EXCEPTION CAUGHT" crash.log
grep -A 30 "FlutterError" crash.log
grep -A 30 "Another exception" crash.log

# Find first lib/...dart:line reference
# That's your next fix target
```

## Next Steps

1. **Capture exact error** using steps above
2. **Share with me**:
   - Error message
   - File and line number
   - 20-30 lines of stack trace
3. **I'll provide targeted fix** for that specific error
4. **Apply fix and verify**
5. **Add guardrails** to prevent regression

## Common Patterns

### Pattern 1: Directionality Errors

**Always wrap directional widgets**:

```dart
return Directionality(
  textDirection: TextDirection.ltr,
  child: YourWidget(),
);
```

### Pattern 2: Null Errors

**Always check null before using**:

```dart
final value = potentiallyNull;
if (value == null) {
  return FallbackWidget();
}
// Use value safely
```

### Pattern 3: Routing Errors

**Always normalize paths**:

```dart
final raw = settings.name ?? '/';
final cleaned = raw.startsWith('/#') ? raw.substring(2) : raw;
final path = Uri.tryParse(cleaned)?.path ?? '/';
```

### Pattern 4: Firebase Errors

**Always check initialization**:

```dart
if (!FirebaseService.isInitialized) {
  return LoadingScreen();
}
// Use Firebase safely
```

## Summary

**Stop "whack-a-mole"**:

1. Fix in correct order (root → routing → auth → data)
2. Add guardrails (tests + CI + lint)
3. Capture exact errors (file + line)
4. Apply targeted fixes
5. Verify immediately

**Current PR #27 has all root fixes**. If you're still seeing crashes:

1. Ensure you're on `stability-refactor` branch
2. Capture exact error with steps above
3. Share error message + file + line
4. I'll provide targeted fix

The goal is **stable foundation** where errors are local, not cascading.
