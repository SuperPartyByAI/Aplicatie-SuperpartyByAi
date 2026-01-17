#!/bin/bash
# launch_all.sh - Launch both Firefox profiles (Profile A and Profile B)
# Usage: ./launch_all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "Launching Both Firefox Profiles"
echo "========================================="
echo ""

# Launch Profile A
echo "Launching Profile A..."
"$SCRIPT_DIR/launch_profile_a.sh"
echo ""

# Wait a moment before launching Profile B
sleep 1

# Launch Profile B
echo "Launching Profile B..."
"$SCRIPT_DIR/launch_profile_b.sh"
echo ""

echo "========================================="
echo "Launch Complete"
echo "========================================="
echo ""
echo "Both profiles should be running:"
echo "  - Profile A: WA-01..WA-15 (15 tabs)"
echo "  - Profile B: WA-16..WA-30 (15 tabs)"
echo ""
echo "To verify, check for two Firefox windows with pinned tabs."
echo ""
