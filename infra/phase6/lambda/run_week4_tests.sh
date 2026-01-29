#!/bin/bash
# Phase 6 Week 4: Run Integration Tests with Environment Setup

set -e

echo "Phase 6 Week 4: LangGraph ↔ Bedrock Integration Tests"
echo "========================================================"
echo ""

# Check if phase6-outputs.json exists
if [ ! -f "phase6-outputs.json" ]; then
    echo "❌ phase6-outputs.json not found"
    echo "Run: aws cloudformation describe-stacks --stack-name OpxPhase6Stack --query 'Stacks[0].Outputs' > phase6-outputs.json"
    exit 1
fi

echo "✅ Found phase6-outputs.json"
echo ""

# Extract agent IDs and alias IDs from CloudFormation outputs
echo "Setting environment variables from CloudFormation outputs..."

export SIGNAL_INTELLIGENCE_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="SignalIntelligenceAgentId") | .OutputValue' phase6-outputs.json)
export SIGNAL_INTELLIGENCE_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="SignalIntelligenceAliasId") | .OutputValue' phase6-outputs.json)

export HISTORICAL_PATTERN_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="HistoricalPatternAgentId") | .OutputValue' phase6-outputs.json)
export HISTORICAL_PATTERN_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="HistoricalPatternAliasId") | .OutputValue' phase6-outputs.json)

export CHANGE_INTELLIGENCE_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="ChangeIntelligenceAgentId") | .OutputValue' phase6-outputs.json)
export CHANGE_INTELLIGENCE_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="ChangeIntelligenceAliasId") | .OutputValue' phase6-outputs.json)

export RISK_BLAST_RADIUS_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="RiskBlastRadiusAgentId") | .OutputValue' phase6-outputs.json)
export RISK_BLAST_RADIUS_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="RiskBlastRadiusAliasId") | .OutputValue' phase6-outputs.json)

export KNOWLEDGE_RAG_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="KnowledgeRAGAgentId") | .OutputValue' phase6-outputs.json)
export KNOWLEDGE_RAG_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="KnowledgeRAGAliasId") | .OutputValue' phase6-outputs.json)

export RESPONSE_STRATEGY_AGENT_ID=$(jq -r '.[] | select(.OutputKey=="ResponseStrategyAgentId") | .OutputValue' phase6-outputs.json)
export RESPONSE_STRATEGY_ALIAS_ID=$(jq -r '.[] | select(.OutputKey=="ResponseStrategyAliasId") | .OutputValue' phase6-outputs.json)

# Disable DynamoDB checkpointing for testing (use in-memory)
export USE_DYNAMODB_CHECKPOINTING=false

echo "✅ Environment variables set"
echo ""

# Verify all variables are set
echo "Verifying environment variables..."
if [ -z "$SIGNAL_INTELLIGENCE_AGENT_ID" ]; then
    echo "❌ SIGNAL_INTELLIGENCE_AGENT_ID not set"
    exit 1
fi

echo "✅ All agent IDs configured"
echo ""

# Run integration tests
echo "Running integration tests..."
echo ""

python3 src/langgraph/test_week4_integration.py

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
else
    echo ""
    echo "❌ Some tests failed (exit code: $exit_code)"
fi

exit $exit_code
