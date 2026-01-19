#!/bin/bash

# Test LID Contact Migration Endpoint
# Usage: ./test-migration.sh [dry-run|live] [ADMIN_TOKEN]

MODE=${1:-dry-run}
ADMIN_TOKEN=${2:-"your-admin-token"}

if [ "$MODE" = "live" ]; then
  DRY_RUN="false"
  echo "🔴 LIVE MODE - Will update Firestore"
else
  DRY_RUN="true"
  echo "🧪 DRY RUN MODE - No changes will be made"
fi

echo "Calling migration endpoint..."
echo ""

curl -X POST "https://whats-upp-production.up.railway.app/admin/migrate-lid-contacts" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\": ${DRY_RUN}}" \
  | jq .

echo ""
echo "Done!"
