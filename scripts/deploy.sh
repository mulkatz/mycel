#!/bin/bash
set -euo pipefail

PROJECT_ID="${MYCEL_GCP_PROJECT_ID:?Set MYCEL_GCP_PROJECT_ID}"
REGION="${MYCEL_GCP_REGION:-europe-west3}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/mycel/api"
TAG=$(git rev-parse --short HEAD)

echo "Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Building $IMAGE:$TAG..."
docker build --platform linux/amd64 -f packages/api/Dockerfile -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo "Pushing $IMAGE:$TAG..."
docker push "$IMAGE:$TAG"
docker push "$IMAGE:latest"

echo "Deploying to Cloud Run..."
gcloud run services update mycel-api \
  --region="$REGION" \
  --image="$IMAGE:$TAG" \
  --project="$PROJECT_ID"

echo ""
echo "Done. Service URL:"
gcloud run services describe mycel-api \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)'
