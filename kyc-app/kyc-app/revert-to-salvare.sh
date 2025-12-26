#!/bin/bash

# Script pentru revenire la o versiune Salvare
# Utilizare: ./revert-to-salvare.sh <numar>
# Exemplu: ./revert-to-salvare.sh 1

set -e

if [ -z "$1" ]; then
  echo "❌ Eroare: Trebuie să specifici numărul salvării"
  echo ""
  echo "Utilizare: ./revert-to-salvare.sh <numar>"
  echo ""
  echo "Salvări disponibile:"
  git tag | grep "Salvare-" | sort -V
  exit 1
fi

SALVARE_NUM=$1
TAG_NAME="Salvare-${SALVARE_NUM}"

# Verifică dacă tag-ul există
if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  echo "❌ Eroare: Tag-ul '$TAG_NAME' nu există"
  echo ""
  echo "Salvări disponibile:"
  git tag | grep "Salvare-" | sort -V
  exit 1
fi

# Verifică dacă există modificări nesalvate
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  Ai modificări nesalvate!"
  echo ""
  git status --short
  echo ""
  read -p "Vrei să continui? Modificările vor fi pierdute! (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Anulat"
    exit 1
  fi
fi

echo "🔄 Revin la $TAG_NAME..."

# Salvează branch-ul curent
CURRENT_BRANCH=$(git branch --show-current)

# Creează backup branch
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "✅ Backup creat: $BACKUP_BRANCH"

# Resetează la tag
git reset --hard "$TAG_NAME"

echo ""
echo "✅ Revenire completă la $TAG_NAME!"
echo ""
echo "📋 Info:"
git log -1 --oneline --decorate
echo ""
echo "💡 Pentru a reveni la versiunea anterioară:"
echo "   git reset --hard $BACKUP_BRANCH"
echo ""
echo "💡 Pentru a șterge backup-ul:"
echo "   git branch -D $BACKUP_BRANCH"
