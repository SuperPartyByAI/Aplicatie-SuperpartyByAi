#!/bin/bash
# Forbid Navigator named route calls in Flutter app using GoRouter
# 
# This app uses MaterialApp.router with GoRouter, not MaterialApp with named routes.
# Navigator.pushNamed/pushReplacementNamed/pushNamedAndRemoveUntil will crash because
# onGenerateRoute is null when using MaterialApp.router.
#
# Use GoRouter navigation instead:
# - context.go('/path') for navigation/tabs/drawer
# - context.push('/path') for pushing details screens

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

LIB_DIR="superparty_flutter/lib"

if [ ! -d "$LIB_DIR" ]; then
    echo -e "${RED}Error: $LIB_DIR directory not found${NC}"
    exit 1
fi

ERRORS=0

echo "Checking for forbidden Navigator named route calls..."

# Check for Navigator.pushNamed (exclude comments)
PUSHNAMED_MATCHES=$(grep -rn "Navigator\.pushNamed" "$LIB_DIR" --include="*.dart" | grep -v "^\s*//" | grep -v "//.*Navigator.pushNamed" || true)
if [ -n "$PUSHNAMED_MATCHES" ]; then
    echo -e "${RED}❌ Found Navigator.pushNamed calls:${NC}"
    echo "$PUSHNAMED_MATCHES"
    ERRORS=$((ERRORS + 1))
fi

# Check for Navigator.pushReplacementNamed (exclude comments)
PUSHREPLACEMENT_MATCHES=$(grep -rn "Navigator\.pushReplacementNamed" "$LIB_DIR" --include="*.dart" | grep -v "^\s*//" | grep -v "//.*Navigator.pushReplacementNamed" || true)
if [ -n "$PUSHREPLACEMENT_MATCHES" ]; then
    echo -e "${RED}❌ Found Navigator.pushReplacementNamed calls:${NC}"
    echo "$PUSHREPLACEMENT_MATCHES"
    ERRORS=$((ERRORS + 1))
fi

# Check for Navigator.pushNamedAndRemoveUntil (exclude comments)
PUSHNAMEDANDREMOVE_MATCHES=$(grep -rn "Navigator\.pushNamedAndRemoveUntil" "$LIB_DIR" --include="*.dart" | grep -v "^\s*//" | grep -v "//.*Navigator.pushNamedAndRemoveUntil" || true)
if [ -n "$PUSHNAMEDANDREMOVE_MATCHES" ]; then
    echo -e "${RED}❌ Found Navigator.pushNamedAndRemoveUntil calls:${NC}"
    echo "$PUSHNAMEDANDREMOVE_MATCHES"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ No forbidden Navigator named route calls found${NC}"
    echo -e "${GREEN}   All navigation uses GoRouter (context.go/context.push)${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Found $ERRORS error(s).${NC}"
    echo -e "${YELLOW}Fix: Replace with GoRouter navigation:${NC}"
    echo "  - Navigator.pushNamed(context, '/route') → context.go('/route')"
    echo "  - Navigator.pushReplacementNamed(...) → context.go(...)"
    echo "  - Navigator.pushNamedAndRemoveUntil(...) → context.go(...) or context.push(...)"
    echo ""
    echo "See: lib/router/app_router.dart for available routes"
    exit 1
fi
