#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT:-superparty-frontend}"
REGION="${GCP_REGION:-us-central1}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT" >/dev/null

SERVICE="$(gcloud run services list --platform managed --region "$REGION" --format="value(metadata.name)" | grep -i -E 'whatsapp|backend' | grep -vi -E 'proxy|function|gcf' | head -n1 || true)"

if [ -n "$SERVICE" ]; then
  set +e
  gcloud run services update "$SERVICE" --region "$REGION" --update-labels "restartnonce=$(date +%s)" --quiet
  UPDATE_STATUS=$?
  set -e
  if [ $UPDATE_STATUS -eq 0 ]; then
    for _ in {1..20}; do
      READY="$(gcloud run services describe "$SERVICE" --region "$REGION" --format="value(status.conditions[?(@.type==\"Ready\")].status)")"
      if [ "$READY" = "True" ]; then
        break
      fi
      sleep 5
    done
    if [ "${READY:-}" != "True" ]; then
      echo "cloud_run_not_ready"
      exit 2
    fi
  else
    SERVICE=""
  fi
fi

if [ -z "$SERVICE" ]; then
  if ! gcloud services enable compute.googleapis.com --quiet; then
    echo "compute_api_enable_failed"
    exit 2
  fi
  INSTANCE_LINE="$(gcloud compute instances list --format="value(name,zone)" --quiet | grep -i -E 'whatsapp|backend' | head -n1 || true)"
  if [ -z "$INSTANCE_LINE" ]; then
    echo "cannot_find_backend_target"
    exit 2
  fi
  INSTANCE="$(echo "$INSTANCE_LINE" | awk '{print $1}')"
  ZONE="$(echo "$INSTANCE_LINE" | awk '{print $2}')"
  gcloud compute instances reset "$INSTANCE" --zone "$ZONE" --quiet
fi

node "$ROOT_DIR/scripts/test-health.js"
