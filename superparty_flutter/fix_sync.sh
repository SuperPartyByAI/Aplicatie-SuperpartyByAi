#!/bin/bash

echo "========================================="
echo "FIX COMPILATION ERROR - SYNC WITH REMOTE"
echo "========================================="
echo ""

# Check current directory
if [ ! -f "lib/main.dart" ]; then
  echo "❌ Error: Must run from superparty_flutter directory"
  echo "Run: cd ~/Aplicatie-SuperpartyByAi/superparty_flutter"
  exit 1
fi

echo "📍 Current directory: $(pwd)"
echo ""

# Show current git status
echo "📊 Git status:"
git status --short
echo ""

# Check if there are local changes
if ! git diff --quiet lib/main.dart; then
  echo "⚠️  WARNING: You have local changes in lib/main.dart"
  echo ""
  echo "Showing diff:"
  git diff lib/main.dart | head -50
  echo ""
  echo "These changes will be DISCARDED when you sync with remote."
  echo ""
  read -p "Continue? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "🔄 Fetching latest changes from remote..."
cd ..
git fetch origin stability-refactor

echo ""
echo "🔄 Resetting to remote version..."
git reset --hard origin/stability-refactor

echo ""
echo "✅ Synced with remote!"
echo ""

# Verify the fix
echo "📋 Verifying lines 218-222:"
cd superparty_flutter
sed -n '218,222p' lib/main.dart
echo ""

# Check if correct
if sed -n '220p' lib/main.dart | grep -q "^      ),$" && sed -n '221p' lib/main.dart | grep -q "^    );$"; then
  echo "✅ File structure is CORRECT!"
else
  echo "❌ File structure is WRONG!"
  echo "Expected:"
  echo "  Line 220:       ),"
  echo "  Line 221:     );"
  exit 1
fi

echo ""
echo "🧹 Cleaning build..."
flutter clean

echo ""
echo "📦 Getting dependencies..."
flutter pub get

echo ""
echo "========================================="
echo "✅ READY TO COMPILE"
echo "========================================="
echo ""
echo "Run: flutter run -d web-server --web-port=5051"
echo ""
