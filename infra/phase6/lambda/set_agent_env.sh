#!/bin/bash
#
# Phase 6 Week 4: Set Bedrock Agent Environment Variables
#
# This script exports agent IDs and alias IDs from CloudFormation
# OpxPhase6Stack deployment as environment variables for LangGraph.
#
# Usage:
#   source src/langgraph/set_agent_env.sh
#

# Signal Intelligence
export SIGNAL_INTELLIGENCE_AGENT_ID="KGROVN1CL8"
export SIGNAL_INTELLIGENCE_ALIAS_ID="DJM7NIDPKQ"

# Historical Pattern
export HISTORICAL_PATTERN_AGENT_ID="EGZCZD7H5D"
export HISTORICAL_PATTERN_ALIAS_ID="MMHZRHSU8Q"

# Change Intelligence
export CHANGE_INTELLIGENCE_AGENT_ID="6KHYUUGUCC"
export CHANGE_INTELLIGENCE_ALIAS_ID="YJHW4GBPMM"

# Risk & Blast Radius
export RISK_BLAST_RADIUS_AGENT_ID="Q18DLBI6SR"
export RISK_BLAST_RADIUS_ALIAS_ID="MFD0Q6KXBT"

# Knowledge RAG
export KNOWLEDGE_RAG_AGENT_ID="PW873XXLHQ"
export KNOWLEDGE_RAG_ALIAS_ID="3EWSQHWAU0"

# Response Strategy
export RESPONSE_STRATEGY_AGENT_ID="IKHAVTP8JI"
export RESPONSE_STRATEGY_ALIAS_ID="JXNMIXFZV7"

# AWS Region
export AWS_DEFAULT_REGION="us-east-1"

echo "✅ Bedrock Agent environment variables set:"
echo "   - SIGNAL_INTELLIGENCE_AGENT_ID=$SIGNAL_INTELLIGENCE_AGENT_ID"
echo "   - HISTORICAL_PATTERN_AGENT_ID=$HISTORICAL_PATTERN_AGENT_ID"
echo "   - CHANGE_INTELLIGENCE_AGENT_ID=$CHANGE_INTELLIGENCE_AGENT_ID"
echo "   - RISK_BLAST_RADIUS_AGENT_ID=$RISK_BLAST_RADIUS_AGENT_ID"
echo "   - KNOWLEDGE_RAG_AGENT_ID=$KNOWLEDGE_RAG_AGENT_ID"
echo "   - RESPONSE_STRATEGY_AGENT_ID=$RESPONSE_STRATEGY_AGENT_ID"
echo ""
echo "Ready for LangGraph integration testing!"
