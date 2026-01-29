#!/bin/bash
#
# Test Knowledge Base Retrieval
#
# Validates that the Knowledge Base returns relevant results with citations.
#
# Usage:
#   ./scripts/test-knowledge-retrieval.sh <knowledge-base-id> <query>
#
# Example:
#   ./scripts/test-knowledge-retrieval.sh KB123 "How to diagnose RDS high latency?"

set -e

# Check arguments
if [ $# -lt 2 ]; then
  echo "Usage: $0 <knowledge-base-id> <query>"
  echo ""
  echo "Example:"
  echo "  $0 KB123 \"How to diagnose RDS high latency?\""
  exit 1
fi

KNOWLEDGE_BASE_ID=$1
QUERY="${@:2}"

echo "Testing Knowledge Base retrieval..."
echo "Knowledge Base: $KNOWLEDGE_BASE_ID"
echo "Query: $QUERY"
echo ""

# Retrieve from Knowledge Base
RESULT=$(aws bedrock-agent-runtime retrieve \
  --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
  --retrieval-query "$QUERY" \
  --retrieval-configuration '{
    "vectorSearchConfiguration": {
      "numberOfResults": 5,
      "overrideSearchType": "VECTOR"
    }
  }' \
  --output json)

# Check if results were returned
RESULT_COUNT=$(echo "$RESULT" | jq '.retrievalResults | length')

if [ "$RESULT_COUNT" -eq 0 ]; then
  echo "❌ No results returned"
  exit 1
fi

echo "✓ Retrieved $RESULT_COUNT results"
echo ""

# Display results
echo "Results:"
echo "========================================"
echo ""

echo "$RESULT" | jq -r '.retrievalResults[] | 
  "Score: \(.score)\n" +
  "Source: \(.metadata.source_file)\n" +
  "Lines: \(.metadata.start_line)-\(.metadata.end_line)\n" +
  "Section: \(.metadata.section_header)\n" +
  "Content:\n\(.content.text)\n" +
  "----------------------------------------\n"'

echo ""
echo "✓ Retrieval test successful"
echo ""
echo "Validation checklist:"
echo "  [x] Results returned (count: $RESULT_COUNT)"
echo "  [ ] Results are relevant to query"
echo "  [ ] Citation metadata present (source_file, start_line, end_line)"
echo "  [ ] Content is readable and complete"
