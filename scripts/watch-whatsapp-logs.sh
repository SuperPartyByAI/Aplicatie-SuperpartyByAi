#!/bin/bash
# Watch WhatsApp API logs in real-time

echo "=== WhatsApp API Logs Monitor ==="
echo ""
echo "Monitorizează log-urile Flutter pentru WhatsApp API calls"
echo "Apasă Ctrl+C pentru a opri"
echo ""
echo "Filtru: WhatsApp, 500, error, status"
echo ""

# Clear logcat buffer
adb -s emulator-5554 logcat -c

# Watch logs with filter
adb -s emulator-5554 logcat | grep -iE "WhatsApp|whatsapp|500|error|status|configuration"
