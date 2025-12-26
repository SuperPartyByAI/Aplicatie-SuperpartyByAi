#!/bin/bash

# 💾 Save Session Script
# Salvează automat contextul conversației curente

set -e

echo "💾 Salvare context conversație..."
echo ""

# 1. Actualizează CURRENT_SESSION.md cu timestamp
echo "📝 Actualizare CURRENT_SESSION.md..."
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i "s/Last Updated:.*/Last Updated: $TIMESTAMP/" CURRENT_SESSION.md
sed -i "s/Session Status: ACTIVE/Session Status: SAVED/" CURRENT_SESSION.md

# 2. Actualizează SNAPSHOT.json cu timestamp
echo "📸 Actualizare SNAPSHOT.json..."
sed -i "s/\"created_at\": \".*\"/\"created_at\": \"$TIMESTAMP\"/" SNAPSHOT.json

# 3. Git status
echo ""
echo "📊 Status Git:"
git status --short

# 4. Commit toate modificările
echo ""
echo "💾 Commit modificări..."
git add -A

# Verifică dacă sunt modificări de commit-at
if git diff --staged --quiet; then
  echo "✅ Nu sunt modificări noi de salvat"
else
  git commit -m "docs: save session context - $(date +%Y-%m-%d)

Saved session context:
- Updated CURRENT_SESSION.md
- Updated SNAPSHOT.json
- Updated DECISIONS.md (if changed)
- Updated TODO.md (if changed)
- Updated CHANGELOG.md (if changed)

Timestamp: $TIMESTAMP

Co-authored-by: Ona <no-reply@ona.com>"

  echo "✅ Commit creat cu succes"
fi

# 5. Push pe GitHub
echo ""
echo "🚀 Push pe GitHub..."
git push origin main

echo ""
echo "✅ Context salvat cu succes!"
echo ""
echo "📊 Rezumat:"
echo "  - CURRENT_SESSION.md: actualizat"
echo "  - SNAPSHOT.json: actualizat"
echo "  - Git: commit + push"
echo "  - Timestamp: $TIMESTAMP"
echo ""
echo "🎯 În conversația următoare, Ona va citi automat:"
echo "  1. START_HERE.md"
echo "  2. CURRENT_SESSION.md"
echo "  3. SNAPSHOT.json"
echo "  4. DECISIONS.md"
echo "  5. TODO.md"
echo ""
echo "✅ Totul e salvat permanent pe GitHub!"
