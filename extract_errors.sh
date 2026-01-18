#!/bin/bash
###############################################################################
# Extract Errors from Flutter App - Quick Debug
#
# Usage: ./extract_errors.sh
# 
# Saves errors to: FLUTTER_ERRORS.txt
###############################################################################

OUTPUT_FILE="FLUTTER_ERRORS.txt"

echo "🔍 Extragere erori din console..." > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 1. Flutter/Dart Errors
echo "1️⃣  FLUTTER/DART ERRORS:" >> "$OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
adb logcat -d -t 300 2>&1 | grep -iE "error|exception|failed|flutter.*error|dart.*error" | tail -n 50 >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 2. WhatsApp/API Errors
echo "2️⃣  WHATSAPP/API ERRORS:" >> "$OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
adb logcat -d -t 300 2>&1 | grep -iE "whatsapp|addAccount|api|http|network|phone|qr" | tail -n 50 >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 3. Recent Exceptions
echo "3️⃣  RECENT EXCEPTIONS:" >> "$OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
adb logcat -d -t 300 2>&1 | grep -iE "exception|stacktrace|traceback|throw" | tail -n 30 >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 4. Flutter Framework Errors
echo "4️⃣  FLUTTER FRAMEWORK ERRORS:" >> "$OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
adb logcat -d -t 300 2>&1 | grep -E "flutter :" | grep -iE "error|exception|failed" | tail -n 30 >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Summary
TOTAL_ERRORS=$(adb logcat -d -t 300 2>&1 | grep -iE "error|exception|failed" | wc -l | tr -d ' ')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$OUTPUT_FILE"
echo "📊 SUMMARY:" >> "$OUTPUT_FILE"
echo "Total errors/exceptions (last 300 lines): $TOTAL_ERRORS" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "✅ Errors saved to: $OUTPUT_FILE" >> "$OUTPUT_FILE"

# Display summary
echo "✅ Errors extracted to: $OUTPUT_FILE"
echo "📊 Total errors found: $TOTAL_ERRORS"
echo ""
echo "Pentru a vedea erorile:"
echo "  cat $OUTPUT_FILE"
echo ""
echo "Sau paste conținutul aici în chat!"
