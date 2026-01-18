#!/bin/bash
###############################################################################
# Show Flutter Logs - Extract Errors from Flutter App
#
# Usage: ./show_flutter_logs.sh
###############################################################################

echo "🔍 FLUTTER LOGS - WhatsApp Connection Errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Method 1: Check if flutter run is running
echo "📱 Method 1: Check running Flutter processes..."
FLUTTER_PID=$(ps aux | grep "flutter run" | grep -v grep | awk '{print $2}' | head -1)
if [ -n "$FLUTTER_PID" ]; then
    echo "✅ Flutter run process found (PID: $FLUTTER_PID)"
    echo "   → Check terminal where 'flutter run' is running for logs"
else
    echo "❌ No Flutter run process found"
fi
echo ""

# Method 2: Check Flutter logs directory
echo "📁 Method 2: Check Flutter logs directory..."
if [ -d "$HOME/Library/Logs" ]; then
    echo "✅ Logs directory exists: ~/Library/Logs"
    find "$HOME/Library/Logs" -name "*flutter*" -o -name "*superparty*" 2>/dev/null | head -5
else
    echo "❌ Logs directory not found"
fi
echo ""

# Method 3: Check adb logs (Android emulator)
echo "📱 Method 3: Recent Android Logcat (last 50 lines)..."
if command -v adb &> /dev/null; then
    DEVICE=$(adb devices | grep "device$" | awk '{print $1}' | head -1)
    if [ -n "$DEVICE" ]; then
        echo "✅ Device found: $DEVICE"
        echo ""
        echo "--- Recent Flutter/Dart errors ---"
        adb -s "$DEVICE" logcat -d | grep -iE "flutter|dart|error|exception|whatsapp|api" | tail -30
    else
        echo "❌ No Android device connected"
    fi
else
    echo "❌ adb not found (Android SDK not in PATH)"
fi
echo ""

# Method 4: Instructions
echo "📋 Method 4: Manual Steps to See Errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  In Flutter App (on emulator/device):"
echo "   - Eroarea se afișează în app ca SnackBar (bara roșie jos)"
echo "   - Sau vezi 'Error: ...' în WhatsApp Accounts screen"
echo ""
echo "2️⃣  In Terminal where Flutter runs:"
echo "   - Look for lines with: Error, Exception, failed, timeout"
echo "   - Search for: 'whatsapp', 'addAccount', 'api/whatsapp'"
echo ""
echo "3️⃣  Check Flutter DevTools (Debug Console):"
echo "   - In VS Code/Cursor: Open Debug Console"
echo "   - Look for red error messages"
echo ""
echo "4️⃣  Run Flutter in verbose mode:"
echo "   cd superparty_flutter"
echo "   flutter run -d emulator-5554 --verbose 2>&1 | tee flutter_debug.log"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Quick Debug Commands:"
echo ""
echo "# Check backend status:"
echo "curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts"
echo ""
echo "# Check Flutter app logs in real-time (if device connected):"
echo "adb logcat -c && adb logcat | grep -iE 'flutter|error|whatsapp'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
