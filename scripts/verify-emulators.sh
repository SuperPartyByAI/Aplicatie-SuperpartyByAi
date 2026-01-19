#!/bin/bash
# verify-emulators.sh - Verificare Firebase Emulators Setup

echo "=== Verificare Firebase Emulators ==="
echo ""

# Check if emulators are running
echo "1. Verificare emulators (ports 9098, 8082, 5002)..."
AUTH_OK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9098 2>/dev/null || echo "000")
FIRESTORE_OK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8082 2>/dev/null || echo "000")
FUNCTIONS_OK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5002 2>/dev/null || echo "000")

if [ "$AUTH_OK" != "000" ]; then
  echo "✅ Auth emulator (9098): OK (HTTP $AUTH_OK)"
else
  echo "❌ Auth emulator (9098): DOWN"
fi

if [ "$FIRESTORE_OK" != "000" ]; then
  echo "✅ Firestore emulator (8082): OK (HTTP $FIRESTORE_OK)"
else
  echo "❌ Firestore emulator (8082): DOWN"
fi

if [ "$FUNCTIONS_OK" != "000" ]; then
  echo "✅ Functions emulator (5002): OK (HTTP $FUNCTIONS_OK)"
else
  echo "❌ Functions emulator (5002): DOWN"
fi

echo ""

# Check adb reverse (Android)
if command -v adb &> /dev/null; then
  echo "2. Verificare adb reverse (Android)..."
  ADB_REVERSE=$(adb reverse --list 2>/dev/null | grep -E "(9098|8082|5002)" | wc -l)
  if [ "$ADB_REVERSE" -ge 3 ]; then
    echo "✅ adb reverse configurat ($ADB_REVERSE porturi)"
    adb reverse --list | grep -E "(9098|8082|5002)"
  else
    echo "⚠️  adb reverse NU este configurat complet"
    echo "   Rulează: adb reverse tcp:9098 tcp:9098 && adb reverse tcp:8082 tcp:8082 && adb reverse tcp:5002 tcp:5002"
  fi
else
  echo "⚠️  adb nu este disponibil (nu e Android emulator sau adb nu e în PATH)"
fi

echo ""
echo "=== Rezumat ==="
if [ "$AUTH_OK" != "000" ] && [ "$FIRESTORE_OK" != "000" ] && [ "$FUNCTIONS_OK" != "000" ]; then
  echo "✅ Toate emulators sunt pornite"
  echo ""
  echo "Pentru a rula aplicația:"
  echo "  flutter run --dart-define=USE_EMULATORS=true -d emulator-5554"
else
  echo "❌ Unele emulators nu sunt pornite"
  echo ""
  echo "Pentru a porni emulators:"
  echo "  firebase emulators:start"
fi
