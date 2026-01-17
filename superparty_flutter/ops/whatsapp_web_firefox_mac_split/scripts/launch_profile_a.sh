#!/bin/bash
# launch_profile_a.sh - Launch Firefox with Profile A (WA-01..WA-15)
# Usage: ./launch_profile_a.sh

set -e

FIREFOX_PATH="/Applications/Firefox.app/Contents/MacOS/firefox"
PROFILE_NAME="wa-profile-a"

echo "Launching Firefox Profile A ($PROFILE_NAME)..."

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

# Launch Firefox with Profile A in new instance
$FIREFOX_PATH -P "$PROFILE_NAME" -new-instance > /dev/null 2>&1 &

# Wait a moment for Firefox to start
sleep 2

# Check if Firefox started successfully
if ps aux | grep -i "firefox.*$PROFILE_NAME" | grep -v grep > /dev/null; then
    echo "✅ Firefox Profile A launched successfully"
    echo "   Profile: $PROFILE_NAME"
    echo "   Expected: 15 pinned tabs (WA-01..WA-15)"
else
    echo "⚠️  Firefox may not have started. Check manually."
    echo "   Try: $FIREFOX_PATH -P $PROFILE_NAME -new-instance"
fi
