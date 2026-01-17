#!/bin/bash
# launch_profile_b.sh - Launch Firefox with Profile B (WA-16..WA-30)
# Usage: ./launch_profile_b.sh

set -e

FIREFOX_PATH="/Applications/Firefox.app/Contents/MacOS/firefox"
PROFILE_NAME="wa-profile-b"

echo "Launching Firefox Profile B ($PROFILE_NAME)..."

# Check if Firefox is installed
if [ ! -f "$FIREFOX_PATH" ]; then
    echo "Error: Firefox not found at $FIREFOX_PATH"
    echo "Please install Firefox first (see README.md)"
    exit 1
fi

# Check if profile exists (check for variations like .default-release)
PROFILE_DIR=$(find ~/Library/Application\ Support/Firefox/Profiles -name "${PROFILE_NAME}*" -type d 2>/dev/null | head -1)

if [ -z "$PROFILE_DIR" ]; then
    echo "Warning: Profile '$PROFILE_NAME' not found."
    echo "Attempting to launch with profile name anyway..."
    PROFILE_FLAG="-P $PROFILE_NAME"
else
    echo "Found profile directory: $PROFILE_DIR"
    PROFILE_FLAG="-profile \"$PROFILE_DIR\""
fi

# Launch Firefox with Profile B in new instance
$FIREFOX_PATH -P "$PROFILE_NAME" -new-instance > /dev/null 2>&1 &

# Wait a moment for Firefox to start
sleep 2

# Check if Firefox started successfully
if ps aux | grep -i "firefox.*$PROFILE_NAME" | grep -v grep > /dev/null; then
    echo "✅ Firefox Profile B launched successfully"
    echo "   Profile: $PROFILE_NAME"
    echo "   Expected: 15 pinned tabs (WA-16..WA-30)"
else
    echo "⚠️  Firefox may not have started. Check manually."
    echo "   Try: $FIREFOX_PATH -P $PROFILE_NAME -new-instance"
fi
