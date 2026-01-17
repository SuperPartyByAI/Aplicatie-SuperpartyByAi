#!/bin/bash
# status_check_b.sh - Best-effort status check for Profile B containers (WA-16..WA-30)
# Note: This is best-effort due to WhatsApp Web's dynamic content
# Manual visual check is always recommended.

PROFILE_NAME="wa-profile-b"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "Status Check: Profile B (WA-16..WA-30)"
echo "========================================="
echo ""

# Check if Firefox with Profile B is running
if ! ps aux | grep -i "firefox.*$PROFILE_NAME" | grep -v grep > /dev/null; then
    echo "⚠️  Firefox Profile B is NOT running"
    echo "   Launch it first: ./launch_profile_b.sh"
    exit 1
fi

echo "✅ Firefox Profile B is running"
echo ""

# Check profile directory exists
PROFILE_DIR=$(find ~/Library/Application\ Support/Firefox/Profiles -name "${PROFILE_NAME}*" -type d 2>/dev/null | head -1)

if [ -z "$PROFILE_DIR" ]; then
    echo "⚠️  Profile directory not found"
    exit 1
fi

echo "Profile directory: $PROFILE_DIR"
echo ""

# Check session store exists (indicates Firefox has run)
SESSION_STORE=$(find "$PROFILE_DIR" -name "sessionstore.jsonlz4" 2>/dev/null | head -1)

if [ -n "$SESSION_STORE" ]; then
    echo "✅ Session store exists"
    if [ -f "$SESSION_STORE" ]; then
        SESSION_AGE=$(stat -f %m "$SESSION_STORE" 2>/dev/null)
        NOW=$(date +%s)
        AGE_MINUTES=$(( ($NOW - $SESSION_AGE) / 60 ))
        echo "   Last updated: $AGE_MINUTES minutes ago"
    fi
else
    echo "⚠️  Session store not found (Firefox may not have saved session yet)"
fi

echo ""

# Check for container cookies (best-effort - cookies may be in different format)
COOKIES_FILE=$(find "$PROFILE_DIR" -name "cookies.sqlite" -o -name "cookies.sqlite-wal" 2>/dev/null | head -1)

if [ -n "$COOKIES_FILE" ]; then
    if [ -f "$COOKIES_FILE" ]; then
        COOKIE_SIZE=$(stat -f %z "$COOKIES_FILE" 2>/dev/null)
        if [ "$COOKIE_SIZE" -gt 0 ]; then
            echo "✅ Cookie database exists (size: $COOKIE_SIZE bytes)"
        else
            echo "⚠️  Cookie database is empty"
        fi
    fi
else
    echo "⚠️  Cookie database not found"
fi

echo ""

echo "========================================="
echo "Manual Check Recommended"
echo "========================================="
echo ""
echo "Due to WhatsApp Web's dynamic content, automated status checks"
echo "are best-effort. Please verify manually:"
echo ""
echo "1. Open Firefox Profile B window"
echo "2. Check all 15 pinned tabs (WA-16..WA-30)"
echo "3. Look for 'Please scan QR code' messages"
echo "4. Note which containers need relink"
echo ""
echo "If any container needs relink, use:"
echo "  ./notify.sh \"WA-XX needs QR re-scan\""
echo ""
