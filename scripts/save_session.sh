#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/save_session.sh "Titlu scurt"
#   ./scripts/save_session.sh "Titlu" --no-edit   (salvează fără editor)
#
# Notes are entered in editor by default ($EDITOR or nano).

TITLE="${1:-}"
NO_EDIT="${2:-}"

if [[ -z "$TITLE" ]]; then
  echo "Usage: $0 \"Titlu scurt\" [--no-edit]"
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TS="$(date -u +"%Y-%m-%d-%H%M%S")"
DATE_HUMAN="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"

mkdir -p docs/ai/sessions
SESSION_FILE="docs/ai/sessions/SESSION-${TS}.md"

# Try to derive GitHub base URL from origin remote
ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BASE_URL=""
if [[ "$ORIGIN" =~ ^git@github\.com:(.+)\.git$ ]]; then
  BASE_URL="https://github.com/${BASH_REMATCH[1]}"
elif [[ "$ORIGIN" =~ ^https://github\.com/(.+)\.git$ ]]; then
  BASE_URL="https://github.com/${BASH_REMATCH[1]}"
elif [[ "$ORIGIN" =~ ^https://github\.com/(.+)$ ]]; then
  BASE_URL="https://github.com/${BASH_REMATCH[1]}"
fi

blob_link () {
  local path="$1"
  if [[ -n "$BASE_URL" ]]; then
    echo "${BASE_URL}/blob/${SHA}/${path}"
  else
    echo "(no-origin-url)/blob/${SHA}/${path}"
  fi
}

# Pre-fill notes
NOTES_TMP="$(mktemp)"
cat > "$NOTES_TMP" <<EOF
## Rezumat (3–10 bullet-uri)
- TODO

## Ce am decis (invariants)
- TODO

## Next (următorii pași)
1) TODO
2) TODO

## Observații / erori / pași de reproducere
- TODO
EOF

if [[ "$NO_EDIT" != "--no-edit" ]]; then
  "${EDITOR:-nano}" "$NOTES_TMP"
fi

cat > "$SESSION_FILE" <<EOF
# SESSION — ${TITLE}

- Timestamp: ${DATE_HUMAN}
- Branch: ${BRANCH}
- Commit: ${SHA}

## Linkuri permalinks (snapshot pe commit)
- CANON: $(blob_link "CANON.md")
- STATE: $(blob_link "docs/ai/STATE.md")
- DECISIONS: $(blob_link "docs/ai/DECISIONS.md")

## Cod (ancore)
- package.json: $(blob_link "package.json")
- main.jsx: $(blob_link "kyc-app/kyc-app/src/main.jsx")
- App.jsx (router): $(blob_link "kyc-app/kyc-app/src/App.jsx")
- firebase.js: $(blob_link "kyc-app/kyc-app/src/firebase.js")
- EvenimenteScreen.jsx: $(blob_link "kyc-app/kyc-app/src/screens/EvenimenteScreen.jsx")
- coqui/app.py: $(blob_link "coqui/app.py")

> Reguli: nu salva secrete (.env, creds.json, baileys_auth/*, token-uri, chei). Nu include node_modules ca ancoră.

$(cat "$NOTES_TMP")
EOF

rm -f "$NOTES_TMP"

# Optionally append a short pointer in CHATLOG.md
mkdir -p docs/ai
CHATLOG="docs/ai/CHATLOG.md"
if [[ ! -f "$CHATLOG" ]]; then
  cat > "$CHATLOG" <<'EOF'
# CHATLOG — SuperPartyByAI (append-only)

Regulă: nu lipim conversații brute; salvăm doar logică/decizii/next steps. Fără secrete.
EOF
fi

{
  echo ""
  echo "### ${DATE_HUMAN} — ${TITLE}"
  echo "- Commit: ${SHA}"
  echo "- Session file: ${SESSION_FILE}"
} >> "$CHATLOG"

echo "Saved: $SESSION_FILE"
echo "Updated: $CHATLOG"
echo ""
echo "Next:"
echo "  git add $SESSION_FILE $CHATLOG"
echo "  git commit -m \"docs(ai): save session ${TS} (${SHORT_SHA})\""
echo "  git push"
