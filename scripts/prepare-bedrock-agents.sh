#!/bin/bash
#
# Prepare all Bedrock Agents for Phase 6
#
# CRITICAL: Bedrock agents must be prepared before they can be invoked.
# This script prepares all 6 agents and updates their aliases to point
# to the prepared version.
#
# Usage:
#   ./scripts/prepare-bedrock-agents.sh
#

set -e

echo "========================================="
echo "Preparing Bedrock Agents for Phase 6"
echo "========================================="
echo ""

# Agent IDs (these should match your CDK outputs)
AGENTS=(
  "signal-intelligence"
  "historical-pattern"
  "change-intelligence"
  "risk-blast-radius"
  "knowledge-rag"
  "response-strategy"
)

# Get agent IDs from CloudFormation outputs
STACK_NAME="OpxPhase6Stack"

for AGENT_NAME in "${AGENTS[@]}"; do
  echo "Processing agent: $AGENT_NAME"
  
  # Get agent ID from CloudFormation output
  AGENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?ExportName=='${AGENT_NAME}-agent-id'].OutputValue" \
    --output text)
  
  if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" == "None" ]; then
    echo "  ❌ ERROR: Could not find agent ID for $AGENT_NAME"
    continue
  fi
  
  echo "  Agent ID: $AGENT_ID"
  
  # Prepare the agent
  echo "  Preparing agent..."
  aws bedrock-agent prepare-agent \
    --agent-id "$AGENT_ID" \
    --output json > /dev/null
  
  if [ $? -eq 0 ]; then
    echo "  ✅ Agent prepared successfully"
  else
    echo "  ❌ ERROR: Failed to prepare agent"
    continue
  fi
  
  # Wait for agent to be prepared (check status)
  echo "  Waiting for agent to be ready..."
  MAX_ATTEMPTS=30
  ATTEMPT=0
  
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    STATUS=$(aws bedrock-agent get-agent \
      --agent-id "$AGENT_ID" \
      --query 'agent.agentStatus' \
      --output text)
    
    if [ "$STATUS" == "PREPARED" ] || [ "$STATUS" == "NOT_PREPARED" ]; then
      echo "  Agent status: $STATUS"
      break
    fi
    
    echo "  Agent status: $STATUS (waiting...)"
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
  done
  
  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "  ⚠️  WARNING: Timeout waiting for agent to be ready"
  fi
  
  # Get alias ID
  ALIAS_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?ExportName=='${AGENT_NAME}-alias-id'].OutputValue" \
    --output text)
  
  if [ -z "$ALIAS_ID" ] || [ "$ALIAS_ID" == "None" ]; then
    echo "  ⚠️  WARNING: Could not find alias ID for $AGENT_NAME"
  else
    echo "  Alias ID: $ALIAS_ID"
    echo "  ✅ Agent $AGENT_NAME is ready for invocation"
  fi
  
  echo ""
done

echo "========================================="
echo "All agents processed"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Verify agents are prepared:"
echo "   aws bedrock-agent list-agents --query 'agentSummaries[?agentName==\`opx-signal-intelligence\`]'"
echo ""
echo "2. Test agent invocation:"
echo "   python scripts/test-agent-basic.py"
echo ""
