#!/bin/bash
echo "🔍 Testing Railway Health Endpoint..."
echo ""
SERVICE_URL="whats-upp-production.up.railway.app"

echo "1. Health endpoint:"
curl -s "https://$SERVICE_URL/health" | jq . 2>/dev/null || curl -s "https://$SERVICE_URL/health"

echo ""
echo ""
echo "2. Status dashboard:"
curl -s "https://$SERVICE_URL/api/status/dashboard" | jq . 2>/dev/null || curl -s "https://$SERVICE_URL/api/status/dashboard"
