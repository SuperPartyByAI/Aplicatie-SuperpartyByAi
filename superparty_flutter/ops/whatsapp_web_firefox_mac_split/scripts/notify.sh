#!/bin/bash
# notify.sh - Send macOS notification
# Usage: ./notify.sh "Message text"

MESSAGE="${1:-WhatsApp Web status check}"

# Use osascript to send macOS notification
osascript -e "display notification \"$MESSAGE\" with title \"WhatsApp Web\" sound name \"Glass\""

echo "Notification sent: $MESSAGE"
