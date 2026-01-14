#!/usr/bin/env bash
set -euo pipefail

# Wrapper around the Node smoke test (works on Linux/macOS).
#
# Required env vars:
# - CONNECTOR_BASE_URL
# - SUPER_ADMIN_ID_TOKEN
# - EMPLOYEE_ID_TOKEN
# - NON_OWNER_ID_TOKEN
# - FIREBASE_SERVICE_ACCOUNT_JSON
# - FIREBASE_PROJECT_ID (optional if present in service account)

echo "Running WhatsApp smoke test against ${CONNECTOR_BASE_URL:-<missing CONNECTOR_BASE_URL>}"
node "whatsapp-connector/scripts/whatsapp_smoke_test.js"

