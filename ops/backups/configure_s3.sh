#!/usr/bin/env bash
set -euo pipefail

# Configure an S3 bucket with versioning and lifecycle rules for database backups.
#
# Usage: BUCKET_NAME=asso-backups REGION=eu-west-3 ./configure_s3.sh
# Requires AWS CLI v2 with credentials granting s3:PutBucketVersioning and
# s3:PutLifecycleConfiguration permissions.

BUCKET_NAME="${BUCKET_NAME:?Set BUCKET_NAME to the target bucket name}"
REGION="${REGION:-eu-west-3}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found in PATH" >&2
  exit 1
fi

aws s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}" \
  --create-bucket-configuration LocationConstraint="${REGION}" \
  >/dev/null 2>&1 || true

echo "Enabling versioning on s3://${BUCKET_NAME}"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled

echo "Applying lifecycle policy (90 days current, 365 days glacier deep archive)"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${BUCKET_NAME}" \
  --lifecycle-configuration ' {
    "Rules": [
      {
        "ID": "DatabaseBackupsRetention",
        "Status": "Enabled",
        "Filter": { "Prefix": "" },
        "Transitions": [
          {
            "Days": 90,
            "StorageClass": "STANDARD_IA"
          },
          {
            "Days": 365,
            "StorageClass": "DEEP_ARCHIVE"
          }
        ],
        "NoncurrentVersionTransitions": [
          {
            "NoncurrentDays": 90,
            "StorageClass": "DEEP_ARCHIVE"
          }
        ],
        "Expiration": { "ExpiredObjectDeleteMarker": true }
      }
    ]
  }'

echo "Lifecycle configuration applied."
