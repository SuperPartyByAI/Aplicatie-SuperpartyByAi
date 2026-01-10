#!/bin/bash

# Check for unsafe patterns that cause crashes

echo "========================================="
echo "Checking for unsafe patterns..."
echo "========================================="
echo ""

cd "$(dirname "$0")/.."

ERRORS=0

# Check 1: Multiple MaterialApp
echo "1️⃣  Checking for multiple MaterialApp..."
COUNT=$(grep -rn "MaterialApp(" superparty_flutter/lib/ 2>/dev/null | wc -l)
if [ "$COUNT" -gt 1 ]; then
  echo "   ❌ Found $COUNT MaterialApp instances (should be 1)"
  grep -rn "MaterialApp(" superparty_flutter/lib/
  ERRORS=$((ERRORS + 1))
else
  echo "   ✅ Single MaterialApp found"
fi
echo ""

# Check 2: currentUser!
echo "2️⃣  Checking for currentUser!..."
if grep -rn "currentUser!" superparty_flutter/lib/ 2>/dev/null; then
  echo "   ❌ Found currentUser! - use null check instead"
  ERRORS=$((ERRORS + 1))
else
  echo "   ✅ No currentUser! found"
fi
echo ""

# Check 3: .data()!
echo "3️⃣  Checking for .data()!..."
if grep -rn "\.data()!" superparty_flutter/lib/ 2>/dev/null; then
  echo "   ❌ Found .data()! - use null check instead"
  ERRORS=$((ERRORS + 1))
else
  echo "   ✅ No .data()! found"
fi
echo ""

# Check 4: snapshot.data!
echo "4️⃣  Checking for snapshot.data! without hasData guard..."
if grep -rn "snapshot\.data!" superparty_flutter/lib/ 2>/dev/null | grep -v "hasData"; then
  echo "   ⚠️  Found snapshot.data! - verify hasData guard exists"
  # This is a warning, not an error (might be guarded in parent scope)
else
  echo "   ✅ No unguarded snapshot.data! found"
fi
echo ""

# Check 5: UpdateGate has Directionality
echo "5️⃣  Checking UpdateGate has Directionality wrapper..."
if grep -A 15 "Widget build(BuildContext context)" superparty_flutter/lib/widgets/update_gate.dart 2>/dev/null | grep -q "Directionality"; then
  echo "   ✅ UpdateGate has Directionality wrapper"
else
  echo "   ❌ UpdateGate missing Directionality wrapper"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 6: MaterialApp.builder exists
echo "6️⃣  Checking MaterialApp.builder exists..."
if grep -q "builder: (context, child)" superparty_flutter/lib/main.dart 2>/dev/null; then
  echo "   ✅ MaterialApp.builder found"
else
  echo "   ❌ MaterialApp.builder not found"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 7: Firebase init check in builder
echo "7️⃣  Checking Firebase init check in MaterialApp.builder..."
if grep -A 10 "builder: (context, child)" superparty_flutter/lib/main.dart 2>/dev/null | grep -q "FirebaseService.isInitialized"; then
  echo "   ✅ Firebase init check found in builder"
else
  echo "   ⚠️  Firebase init check not found in builder"
fi
echo ""

# Summary
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed!"
  echo "========================================="
  exit 0
else
  echo "❌ Found $ERRORS error(s)"
  echo "========================================="
  exit 1
fi
