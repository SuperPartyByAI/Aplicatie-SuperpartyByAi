# Quick Start - Get stability-refactor Branch

## Problem

You're on `main` branch which has the old code with bugs. The fixes are in `stability-refactor` branch.

## Solution

### Step 1: Fetch the branch from remote

```bash
cd ~/Aplicatie-SuperpartyByAi
git fetch origin stability-refactor
```

### Step 2: Checkout the branch

```bash
git checkout stability-refactor
```

### Step 3: Verify you're on the correct branch

```bash
git branch
# Should show: * stability-refactor
```

### Step 4: Run verification

```bash
bash scripts/check_unsafe_patterns.sh
```

**Expected output**:

```
=========================================
Checking for unsafe patterns...
=========================================

1️⃣  Checking for multiple MaterialApp...
   ✅ Single MaterialApp found

2️⃣  Checking for currentUser!...
   ✅ No currentUser! found

3️⃣  Checking for .data()!...
   ✅ No .data()! found

5️⃣  Checking UpdateGate has Directionality wrapper...
   ✅ UpdateGate has Directionality wrapper

6️⃣  Checking MaterialApp.builder exists...
   ✅ MaterialApp.builder found

7️⃣  Checking Firebase init check in MaterialApp.builder...
   ✅ Firebase init check found in builder

=========================================
✅ All checks passed!
=========================================
```

### Step 5: Test on web (if you have Flutter installed)

```bash
cd superparty_flutter
flutter run -d web-server --web-port=5051
```

Then open in browser:

- http://localhost:5051/
- http://localhost:5051/#/evenimente
- http://localhost:5051/#/kyc
- http://localhost:5051/#/admin

**Expected**: No blank screen, no errors, UI works correctly.

## If You Don't Have Flutter Installed

You can still verify the fixes are present:

```bash
# Check for single MaterialApp
grep -rn "MaterialApp(" superparty_flutter/lib/
# Should show only 1 match: lib/main.dart:122

# Check UpdateGate has Directionality
grep -A 10 "Widget build(BuildContext context)" superparty_flutter/lib/widgets/update_gate.dart | grep "Directionality"
# Should show: return Directionality(

# Check no nested MaterialApp in UpdateGate
grep "MaterialApp" superparty_flutter/lib/widgets/update_gate.dart
# Should show: No matches
```

## Troubleshooting

### Error: "pathspec 'stability-refactor' did not match any file(s)"

**Cause**: Branch not fetched from remote yet.

**Solution**:

```bash
git fetch origin stability-refactor
git checkout stability-refactor
```

### Error: "scripts/capture_crash.sh: No such file or directory"

**Cause**: You're on `main` branch which doesn't have the scripts.

**Solution**:

```bash
git checkout stability-refactor
# Now scripts/ directory will exist
```

### Still seeing crashes after switching branches

**Possible causes**:

1. Flutter cache needs clearing
2. Dependencies need updating
3. There's a new error in a different file

**Solution**:

```bash
cd superparty_flutter
flutter clean
flutter pub get
flutter run -d web-server --web-port=5051 -v
```

**Capture the error**:

```bash
# In a different terminal
cd ~/Aplicatie-SuperpartyByAi
bash scripts/capture_crash.sh
```

Then share:

- The error message
- File and line number
- 20-30 lines of stack trace

## What's Different Between Branches

### main Branch (OLD - Has Bugs)

**Issues**:

- ❌ UpdateGate returns Stack without Directionality wrapper
- ❌ Causes "No Directionality widget found" error
- ❌ Blank screens on web
- ❌ Conditional MaterialApp (Firebase loading)

**UpdateGate code**:

```dart
return Stack(  // ❌ No Directionality
  children: [widget.child, ...overlays],
);
```

### stability-refactor Branch (NEW - Fixed)

**Improvements**:

- ✅ Single MaterialApp (no nesting)
- ✅ UpdateGate inside MaterialApp.builder
- ✅ Directionality wrapper for overlays
- ✅ Early return optimization
- ✅ No blank screens
- ✅ No Directionality errors

**UpdateGate code**:

```dart
if (!_checking && !_needsUpdate) {
  return widget.child;  // ✅ Passthrough
}

return Directionality(  // ✅ Explicit Directionality
  textDirection: TextDirection.ltr,
  child: Stack(children: [widget.child, ...overlays]),
);
```

## Next Steps

1. **Switch to stability-refactor branch** (see Step 1-2 above)
2. **Verify fixes are present** (see Step 4 above)
3. **Test on web** (see Step 5 above)
4. **If still seeing crashes**, capture logs and share:
   ```bash
   bash scripts/capture_crash.sh
   # Navigate to URL that crashes
   # Share logs/crash_*.log
   ```

## Summary

**The fixes are already done** in the `stability-refactor` branch. You just need to:

1. Fetch the branch: `git fetch origin stability-refactor`
2. Switch to it: `git checkout stability-refactor`
3. Verify: `bash scripts/check_unsafe_patterns.sh`
4. Test: `flutter run -d web-server --web-port=5051`

All the tools and fixes are in that branch. 🎯
