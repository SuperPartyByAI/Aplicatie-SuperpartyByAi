#!/bin/bash
# Generate voice sample on Railway using existing API key

curl -X POST "https://web-production-f0714.up.railway.app/api/voice/generate-sample" \
  -H "Content-Type: application/json" \
  -d '{"text": "Bună, sunt Kasya de la SuperParty. Cu ce vă pot ajuta astăzi? Perfect, am notat data și locația. Vă sun înapoi cu confirmare în cel mai scurt timp. Mulțumesc și o zi bună!"}'
