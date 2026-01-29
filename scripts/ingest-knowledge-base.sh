#!/bin/bash
#
# Ingest Knowledge Base
#
# Uploads chunked documents to S3 and triggers Bedrock ingestion job.
# This is a MANUAL process - no automatic triggers.
#
# Usage:
#   ./scripts/ingest-knowledge-base.sh
#
# Prerequisites:
#   - Chunks generated (npm run chunk-corpus)
#   - AWS credentials configured
#   - Knowledge Base deployed

set -e

# Configuration
BUCKET_NAME="opx-knowledge-corpus"
CHUNKS_DIR="chunks"
KNOWLEDGE_BASE_ID="${KNOWLEDGE_BASE_ID:-}"
DATA_SOURCE_ID="${DATA_SOURCE_ID:-}"

echo "========================================="
echo "Knowledge Base Ingestion"
echo "========================================="
echo ""

# Check prerequisites
if [ ! -d "$CHUNKS_DIR" ]; then
  echo "❌ Error: Chunks directory not found: $CHUNKS_DIR"
  echo ""
  echo "Run chunking first:"
  echo "  npm run chunk-corpus"
  exit 1
fi

if [ -z "$KNOWLEDGE_BASE_ID" ]; then
  echo "❌ Error: KNOWLEDGE_BASE_ID not set"
  echo ""
  echo "Export the Knowledge Base ID:"
  echo "  export KNOWLEDGE_BASE_ID=<your-kb-id>"
  exit 1
fi

if [ -z "$DATA_SOURCE_ID" ]; then
  echo "❌ Error: DATA_SOURCE_ID not set"
  echo ""
  echo "Export the Data Source ID:"
  echo "  export DATA_SOURCE_ID=<your-ds-id>"
  exit 1
fi

# Count chunks
CHUNK_COUNT=$(find "$CHUNKS_DIR" -name "*.jsonl" | wc -l)
echo "Found $CHUNK_COUNT chunk files"
echo ""

# Confirm ingestion
read -p "Upload chunks to S3 and trigger ingestion? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Ingestion cancelled"
  exit 0
fi

echo ""
echo "Step 1: Uploading chunks to S3..."
echo "Bucket: s3://$BUCKET_NAME"
echo ""

# Upload to S3 with metadata
aws s3 sync "$CHUNKS_DIR/" "s3://$BUCKET_NAME/chunks/" \
  --delete \
  --metadata "ingestion_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --metadata "chunk_count=$CHUNK_COUNT"

echo ""
echo "✓ Chunks uploaded successfully"
echo ""

echo "Step 2: Triggering ingestion job..."
echo "Knowledge Base: $KNOWLEDGE_BASE_ID"
echo "Data Source: $DATA_SOURCE_ID"
echo ""

# Start ingestion job
INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
  --data-source-id "$DATA_SOURCE_ID" \
  --output json)

INGESTION_JOB_ID=$(echo "$INGESTION_JOB" | jq -r '.ingestionJob.ingestionJobId')

echo "✓ Ingestion job started"
echo "Job ID: $INGESTION_JOB_ID"
echo ""

echo "Step 3: Monitoring ingestion job..."
echo ""

# Monitor ingestion job
while true; do
  JOB_STATUS=$(aws bedrock-agent get-ingestion-job \
    --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
    --data-source-id "$DATA_SOURCE_ID" \
    --ingestion-job-id "$INGESTION_JOB_ID" \
    --output json)
  
  STATUS=$(echo "$JOB_STATUS" | jq -r '.ingestionJob.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "COMPLETE" ]; then
    echo ""
    echo "✓ Ingestion completed successfully"
    
    # Show statistics
    STATS=$(echo "$JOB_STATUS" | jq -r '.ingestionJob.statistics')
    echo ""
    echo "Statistics:"
    echo "$STATS" | jq '.'
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo "❌ Ingestion failed"
    
    # Show failure reasons
    FAILURE_REASONS=$(echo "$JOB_STATUS" | jq -r '.ingestionJob.failureReasons')
    echo ""
    echo "Failure reasons:"
    echo "$FAILURE_REASONS" | jq '.'
    exit 1
  fi
  
  sleep 10
done

echo ""
echo "========================================="
echo "Ingestion Complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Validate embeddings:"
echo "     aws bedrock-agent-runtime retrieve \\"
echo "       --knowledge-base-id $KNOWLEDGE_BASE_ID \\"
echo "       --retrieval-query \"How to handle RDS failover?\" \\"
echo "       --retrieval-configuration '{\"vectorSearchConfiguration\":{\"numberOfResults\":5,\"overrideSearchType\":\"VECTOR\"}}'"
echo ""
echo "  2. Test with Knowledge RAG Agent (Phase 7.4)"
