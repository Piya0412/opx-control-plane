#!/bin/bash
set -e

# Create OpenSearch Serverless vector index for Bedrock Knowledge Base
# Usage: ./scripts/create-opensearch-index.sh

COLLECTION_ENDPOINT="https://8tkajw0xkk4p8jlqnfrg.us-east-1.aoss.amazonaws.com"
INDEX_NAME="opx-knowledge-index"
REGION="us-east-1"

echo "Creating vector index: $INDEX_NAME"
echo "Collection endpoint: $COLLECTION_ENDPOINT"
echo ""

# Create index with proper mappings
aws opensearchserverless batch-get-collection \
  --names opx-knowledge \
  --region $REGION \
  --query 'collectionDetails[0].id' \
  --output text

# Use AWS CLI to create the index via OpenSearch API
# The index must exist before Bedrock Knowledge Base can be created

cat > /tmp/index-mapping.json <<EOF
{
  "settings": {
    "index": {
      "knn": true,
      "number_of_shards": 2,
      "number_of_replicas": 0
    }
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
        "type": "object"
      }
    }
  }
}
EOF

echo "Index mapping created in /tmp/index-mapping.json"
echo ""
echo "To create the index, you need to use curl with AWS SigV4 authentication:"
echo ""
echo "curl -X PUT \"$COLLECTION_ENDPOINT/$INDEX_NAME\" \\"
echo "  --aws-sigv4 \"aws:amz:$REGION:aoss\" \\"
echo "  --user \"\$AWS_ACCESS_KEY_ID:\$AWS_SECRET_ACCESS_KEY\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d @/tmp/index-mapping.json"
echo ""
echo "Or use the AWS SDK for Python (boto3) with proper authentication."
