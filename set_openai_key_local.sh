#!/bin/bash

# Script to set OPENAI_API_KEY in Google Cloud Secret Manager
# Run this on your LOCAL machine (not in Gitpod)

PROJECT_ID="superparty-frontend"
SECRET_NAME="OPENAI_API_KEY"
KEY_VALUE="${OPENAI_API_KEY:-<OPENAI_API_KEY>}"

echo "🔧 Setting OPENAI_API_KEY in Google Cloud Secret Manager"
echo "Project: $PROJECT_ID"
echo "Secret: $SECRET_NAME"
echo "Key length: ${#KEY_VALUE} characters"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found!"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Not authenticated with gcloud"
    echo "Run: gcloud auth login"
    exit 1
fi

# Set project
echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Add new secret version
echo "Adding new secret version..."
echo -n "$KEY_VALUE" | gcloud secrets versions add "$SECRET_NAME" \
  --data-file=- \
  --project="$PROJECT_ID"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Secret version added successfully!"
  echo ""
  echo "Verifying latest versions:"
  gcloud secrets versions list "$SECRET_NAME" --project="$PROJECT_ID" --limit=3
  echo ""
  echo "✅ Done! Functions will pick up new key on next deploy."
else
  echo ""
  echo "❌ Failed to add secret version"
  exit 1
fi
