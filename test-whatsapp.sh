#!/bin/bash

echo "📱 WhatsApp Notification Test"
echo "=============================="
echo ""

# Verifică dacă WhatsApp e configurat
echo "1️⃣ Checking WhatsApp configuration..."
WHATSAPP_ENABLED=$(curl -s https://web-production-f0714.up.railway.app/ | jq -r '.whatsappEnabled')

if [ "$WHATSAPP_ENABLED" = "true" ]; then
    echo "✅ WhatsApp is ENABLED"
else
    echo "❌ WhatsApp is NOT configured"
    echo ""
    echo "To enable WhatsApp:"
    echo "1. Join Twilio Sandbox: Send 'join <code>' to +1 415 523 8886"
    echo "2. Add to Railway: TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886"
    echo ""
    exit 1
fi

echo ""
echo "2️⃣ Sending test message to +40792864811..."

RESPONSE=$(curl -s -X POST https://web-production-f0714.up.railway.app/api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+40792864811"}')

echo "$RESPONSE" | jq '.'

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
    echo ""
    echo "✅ WhatsApp message sent successfully!"
    echo "📱 Check your phone for the test message"
else
    echo ""
    echo "❌ Failed to send WhatsApp message"
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    echo "Error: $ERROR"
    echo ""
    echo "Common issues:"
    echo "- Not registered in Twilio Sandbox (send 'join <code>' to +1 415 523 8886)"
    echo "- Phone number not in E.164 format"
    echo "- Twilio credentials incorrect"
fi
