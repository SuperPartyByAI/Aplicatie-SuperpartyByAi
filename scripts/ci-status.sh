#!/bin/bash
# CI Status Check - Shows only HEAD status on main branch
# Usage: ./scripts/ci-status.sh

set -e

REPO="SuperPartyByAI/Aplicatie-SuperpartyByAi"
BRANCH="main"
LIMIT=10

# Try to get GH_TOKEN from git credentials if not set
if [ -z "$GH_TOKEN" ] && [ -z "$GITHUB_TOKEN" ]; then
    if [ -f "/usr/local/gitpod/shared/git-secrets/"* ]; then
        TOKEN_FILE=$(ls /usr/local/gitpod/shared/git-secrets/* 2>/dev/null | head -1)
        if [ -f "$TOKEN_FILE" ]; then
            export GH_TOKEN=$(grep "^password=" "$TOKEN_FILE" | cut -d= -f2)
        fi
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 CI STATUS - HEAD on branch: $BRANCH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get latest commit on main
LATEST_COMMIT=$(git rev-parse HEAD | cut -c1-7)
echo "🔍 Latest commit: $LATEST_COMMIT"
echo ""

# Get runs for latest commit
if command -v gh &> /dev/null; then
    echo "📋 Workflow runs for HEAD:"
    echo ""
    
    RUNS=$(gh run list --repo "$REPO" --branch "$BRANCH" --limit "$LIMIT" --json databaseId,name,status,conclusion,headSha,createdAt)
    
    # Filter runs for HEAD commit
    HEAD_RUNS=$(echo "$RUNS" | jq -r --arg commit "$LATEST_COMMIT" '.[] | select(.headSha | startswith($commit)) | "\(.conclusion // .status)\t\(.name)"')
    
    if [ -z "$HEAD_RUNS" ]; then
        echo "⚠️  No runs found for HEAD commit"
        exit 1
    fi
    
    # Check if all are success
    FAILED=$(echo "$HEAD_RUNS" | grep -v "success" || true)
    
    if [ -z "$FAILED" ]; then
        echo "✅ ALL WORKFLOWS PASSED"
        echo ""
        echo "$HEAD_RUNS" | while IFS=$'\t' read -r status name; do
            echo "  ✅ $name"
        done
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🎉 REPO STATUS: CLEAN"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        exit 0
    else
        echo "❌ SOME WORKFLOWS FAILED"
        echo ""
        echo "$HEAD_RUNS" | while IFS=$'\t' read -r status name; do
            if [ "$status" = "success" ]; then
                echo "  ✅ $name"
            else
                echo "  ❌ $name ($status)"
            fi
        done
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "⚠️  REPO STATUS: FAILING"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        exit 1
    fi
else
    echo "❌ GitHub CLI (gh) not installed"
    echo "   Install: https://cli.github.com/"
    exit 1
fi
