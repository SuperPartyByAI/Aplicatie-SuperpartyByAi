#!/bin/bash

# Crash Capture Script
# Runs Flutter web server with verbose logging and captures errors

set -e

echo "========================================="
echo "Crash Capture Script"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "superparty_flutter" ]; then
  echo "❌ Error: superparty_flutter directory not found"
  echo "Please run this script from the repository root"
  exit 1
fi

# Check current branch
BRANCH=$(git branch --show-current)
echo "📍 Current branch: $BRANCH"
echo ""

if [ "$BRANCH" != "stability-refactor" ]; then
  echo "⚠️  WARNING: You're not on stability-refactor branch"
  echo "   The fixes are in stability-refactor branch"
  echo ""
  read -p "Switch to stability-refactor? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git checkout stability-refactor
    echo "✅ Switched to stability-refactor"
  else
    echo "Continuing on $BRANCH..."
  fi
  echo ""
fi

# Create logs directory
mkdir -p logs

# Timestamp for log file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOGFILE="logs/crash_${TIMESTAMP}.log"

echo "📝 Log file: $LOGFILE"
echo ""
echo "🚀 Starting Flutter web server..."
echo "   Port: 5051"
echo "   Verbose: enabled"
echo ""
echo "📋 Test URLs:"
echo "   http://localhost:5051/"
echo "   http://localhost:5051/#/evenimente"
echo "   http://localhost:5051/#/kyc"
echo "   http://localhost:5051/#/admin"
echo ""
echo "🔍 Watching for errors..."
echo "   Press Ctrl+C to stop"
echo ""
echo "========================================="
echo ""

# Run Flutter with verbose logging
cd superparty_flutter
flutter run -d web-server --web-port=5051 -v 2>&1 | tee "../$LOGFILE" | while IFS= read -r line; do
  # Highlight errors in red
  if echo "$line" | grep -q -E "EXCEPTION|FlutterError|Another exception|ERROR"; then
    echo -e "\033[0;31m$line\033[0m"  # Red
  elif echo "$line" | grep -q -E "lib/.*\.dart:[0-9]+"; then
    echo -e "\033[0;33m$line\033[0m"  # Yellow (our code)
  else
    echo "$line"
  fi
done

echo ""
echo "========================================="
echo "📊 Analyzing log file..."
echo "========================================="
echo ""

# Analyze log file
cd ..
if grep -q "EXCEPTION CAUGHT" "$LOGFILE"; then
  echo "❌ Found exceptions in log:"
  echo ""
  grep -A 30 "EXCEPTION CAUGHT" "$LOGFILE" | head -50
  echo ""
  echo "📍 First error location:"
  grep -A 30 "EXCEPTION CAUGHT" "$LOGFILE" | grep -m 1 "lib/.*\.dart:[0-9]+" || echo "No lib/ reference found"
else
  echo "✅ No exceptions found in log"
fi

echo ""
echo "========================================="
echo "Full log saved to: $LOGFILE"
echo "========================================="
