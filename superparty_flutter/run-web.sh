#!/bin/bash

echo "========================================"
echo "SuperParty Flutter Web Runner"
echo "========================================"
echo ""

# Get the directory where this script is located
cd "$(dirname "$0")"

echo "Current directory: $(pwd)"
echo ""

echo "Step 1: Cleaning previous build..."
flutter clean
if [ $? -ne 0 ]; then
    echo "ERROR: Flutter clean failed"
    exit 1
fi

echo ""
echo "Step 2: Getting dependencies..."
flutter pub get
if [ $? -ne 0 ]; then
    echo "ERROR: Flutter pub get failed"
    exit 1
fi

echo ""
echo "Step 3: Starting web server..."
echo ""
echo "========================================"
echo "Web app will be available at:"
echo "http://127.0.0.1:5051"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop the server"
echo "Press 'r' for hot reload"
echo "Press 'R' for hot restart"
echo ""

flutter run -d web-server --web-hostname=127.0.0.1 --web-port=5051
