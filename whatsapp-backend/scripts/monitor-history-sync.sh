#!/bin/bash

# Script pentru monitorizare History Sync după scanarea QR-ului
# Usage: ./scripts/monitor-history-sync.sh

echo "📊 Monitorizare History Sync..."
echo "   (Apasă Ctrl+C pentru a opri)"
echo ""
echo "Caută: messaging-history.set | history sync | history.*saved | history.*complete"
echo ""

ssh root@37.27.34.179 "journalctl -u whatsapp-backend -f | egrep -i 'messaging-history.set|history sync|history.*saved|history.*complete|app state sync'"
