#!/bin/bash
#
# Initialize OpenSearch Serverless Index
#
# Creates the vector index with proper mapping for Bedrock Knowledge Base.
# Must be run after OpenSearch collection is created.
#
# Usage:
#   ./scripts/init-opensearch-index.sh <collection-endpoint> <index-name>
#
# Example:
#   ./scripts/init-opensearch-index.sh \
#     https://abc123.us-east-1.aoss.amazonaws.com \
#     opx-knowledge-index

set -e

# Check arguments
if [ $# -ne 2 ]; then
  echo "Usage: $0 <collection-endpoint> <index-name>"
  echo ""
  echo "Example:"
  echo "  $0 https://abc123.us-east-1.aoss.amazonaws.com opx-knowledge-index"
  exit 1
fi

COLLECTION_ENDPOINT=$1
INDEX_NAME=$2

echo "Initializing OpenSearch index..."
echo "Collection: $COLLECTION_ENDPOINT"
echo "Index: $INDEX_NAME"
echo ""

# Create index with vector mapping
curl -X PUT "$COLLECTION_ENDPOINT/$INDEX_NAME" \
  --aws-sigv4 "aws:amz:us-east-1:aoss" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "index.knn": true
    },
    "mappings": {
      "properties": {
        "embedding": {
          "type": "knn_vector",
          "dimension": 1536,
          "method": {
            "name": "hnsw",
            "engine": "faiss",
            "parameters": {
              "ef_construction": 512,
              "m": 16
            }
          }
        },
        "content": {
          "type": "text"
        },
        "metadata": {
          "type": "object",
          "properties": {
            "chunk_id": { "type": "keyword" },
            "document_id": { "type": "keyword" },
            "document_version": { "type": "keyword" },
            "source_file": { "type": "keyword" },
            "start_line": { "type": "integer" },
            "end_line": { "type": "integer" },
            "section_header": { "type": "text" },
            "chunk_type": { "type": "keyword" },
            "tokens": { "type": "integer" }
          }
        }
      }
    }
  }'

echo ""
echo "✓ Index created successfully"
echo ""
echo "Verify index:"
echo "  curl -X GET \"$COLLECTION_ENDPOINT/$INDEX_NAME\" --aws-sigv4 \"aws:amz:us-east-1:aoss\""
