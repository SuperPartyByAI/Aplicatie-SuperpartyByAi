#!/bin/bash

echo "🎯 Voice AI System - Test Script"
echo "================================"
echo ""

echo "1️⃣ Backend Status:"
curl -s https://web-production-f0714.up.railway.app/ | jq '.'
echo ""

echo "2️⃣ Call Statistics:"
curl -s https://web-production-f0714.up.railway.app/api/voice/calls/stats | jq '.'
echo ""

echo "3️⃣ Recent Reservations:"
curl -s https://web-production-f0714.up.railway.app/api/reservations | jq '.'
echo ""

echo "4️⃣ Reservation Statistics:"
curl -s https://web-production-f0714.up.railway.app/api/reservations/stats/summary | jq '.'
echo ""

echo "✅ Test complete!"
echo ""
echo "📞 Pentru test apel: +1 218 220 4425"
echo "   - Apasă 1 pentru Voice AI"
echo "   - Apasă 2 pentru Operator"
