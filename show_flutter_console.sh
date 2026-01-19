#!/bin/bash
# Script pentru a vedea log-urile Flutter în consolă

echo "🔍 Verific dacă emulatorul rulează..."
flutter devices

echo ""
echo "📱 Selectează opțiunea:"
echo "1. Rulează app + vezi logs (flutter run)"
echo "2. Vezi doar logs fără să rulezi (flutter logs)"
echo "3. Android logcat (doar pentru Android emulator)"
read -p "Alege (1/2/3): " choice

case $choice in
  1)
    echo "🚀 Rulez aplicația cu logs..."
    flutter run --verbose
    ;;
  2)
    echo "📋 Afișez logs din device/emulator..."
    flutter logs
    ;;
  3)
    echo "📋 Android logcat..."
    adb logcat | grep -E "flutter|com.example|ERROR|FATAL"
    ;;
  *)
    echo "❌ Opțiune invalidă"
    ;;
esac
