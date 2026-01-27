#!/usr/bin/env bash
# Deploy Firebase Functions in buckets to avoid CPU quota and isolate failures.
# Run from repo root: ./scripts/firebase-deploy-functions-buckets.sh [bucket]
# Buckets: whatsapp-proxy | whatsapp-full | whatsapp-stub | ai | staff | all
# whatsapp-proxy: sequential deploy (one-by-one + sleep) to avoid CPU quota spike.
# whatsapp-full: whatsappV4 + processOutbox only. Does NOT deploy whatsapp (legacy stub).
# whatsapp-stub: deploy Gen2 whatsapp stub. Run ONLY after deleting Gen1:
#   1. firebase functions:delete whatsapp --region us-central1 --force
#   2. ./scripts/firebase-deploy-functions-buckets.sh whatsapp-stub

set -e
cd "$(dirname "$0")/.."

BUCKET="${1:-whatsapp-proxy}"
SLEEP_SEC="${FIREBASE_DEPLOY_SLEEP:-4}"

PROXY_FUNCTIONS=(
  whatsappProxyGetAccounts
  whatsappProxyAddAccount
  whatsappProxyRegenerateQr
  whatsappProxyGetThreads
  whatsappProxyBackfillAccount
  whatsappProxySend
  whatsappProxyDeleteAccount
)

case "$BUCKET" in
  whatsapp-proxy)
    echo "Deploying WhatsApp proxy (sequential, sleep ${SLEEP_SEC}s between)..."
    for fn in "${PROXY_FUNCTIONS[@]}"; do
      echo "  -> functions:${fn}"
      firebase deploy --only "functions:${fn}"
      sleep "$SLEEP_SEC"
    done
    echo "Done: whatsapp-proxy"
    ;;
  whatsapp-full)
    echo "Deploying whatsappV4 + processOutbox (NOT whatsapp; use whatsapp-stub after delete)..."
    firebase deploy --only "functions:whatsappV4,functions:processOutbox"
    ;;
  whatsapp-stub)
    echo "Deploying Gen2 whatsapp stub (410 deprecated)."
    echo "  If Gen1 whatsapp still exists, delete it first. firebase delete often fails; use:"
    echo "    gcloud functions delete whatsapp --region=us-central1 --project=superparty-frontend --quiet"
    echo "  Or GCP Console: Cloud Functions → 1st gen → whatsapp → Delete."
    echo "  See RUNBOOK_DEPLOY_PROD.md C'')."
    firebase deploy --only "functions:whatsapp"
    ;;
  ai)
    echo "Deploying AI functions (europe-west1)..."
    firebase deploy --only "functions:chatWithAI,functions:createEventFromAI,functions:aiEventHandler,functions:chatEventOps,functions:chatEventOpsV2,functions:clientCrmAsk,functions:whatsappExtractEventFromThread,functions:noteazaEventeAutomat,functions:getEventeAI,functions:updateEventAI,functions:manageRoleAI,functions:archiveEventAI,functions:manageEvidenceAI,functions:generateReportAI"
    ;;
  staff)
    echo "Deploying staff / firestore / scheduler..."
    firebase deploy --only "functions:setStaffCode,functions:aggregateClientStats,functions:auditEventChanges,functions:processFollowUps"
    ;;
  all)
    echo "Deploying all functions..."
    firebase deploy --only functions
    ;;
  *)
    echo "Usage: $0 <whatsapp-proxy|whatsapp-full|whatsapp-stub|ai|staff|all>"
    exit 1
    ;;
esac
