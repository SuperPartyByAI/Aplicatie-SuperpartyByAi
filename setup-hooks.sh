#!/bin/bash

# Script pentru instalare Git Hooks
# Rulează: bash setup-hooks.sh

echo "🔧 Instalare Git Hooks..."

# Configurează Git să folosească directorul .githooks
git config core.hooksPath .githooks

echo "✅ Git Hooks instalate cu succes!"
echo ""
echo "📋 Hooks active:"
echo "   - pre-commit: Verifică cod înainte de commit"
echo "   - pre-push: Rulează teste înainte de push"
echo ""
echo "💡 Pentru a dezactiva temporar:"
echo "   git commit --no-verify"
echo "   git push --no-verify"
echo ""
