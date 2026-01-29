#!/usr/bin/env bash
# Watch auto-reply logs in real-time

HOST="${1:-root@37.27.34.179}"
KEY_PATH="${2:-$HOME/.ssh/hetzner_whatsapp}"

echo "👀 Watching auto-reply logs on $HOST..."
echo "Press Ctrl+C to stop"
echo ""

ssh -i "$KEY_PATH" "$HOST" "sudo journalctl -u whatsapp-backend -f --no-pager" | grep --line-buffered -E "ai-autoreply|🤖|auto.*reply|GROQ|account.*autoReply" || true
