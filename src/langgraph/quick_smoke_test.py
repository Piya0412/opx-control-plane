#!/usr/bin/env python3
"""Quick smoke test for Bedrock Agent connectivity."""

import os
import sys
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.langgraph.bedrock_config import BEDROCK_AGENTS
from src.langgraph.graph import entry_node, graph

# Set environment variables
os.environ["SIGNAL_INTELLIGENCE_AGENT_ID"] = "KGROVN1CL8"
os.environ["SIGNAL_INTELLIGENCE_ALIAS_ID"] = "DJM7NIDPKQ"
os.environ["HISTORICAL_PATTERN_AGENT_ID"] = "EGZCZD7H5D"
os.environ["HISTORICAL_PATTERN_ALIAS_ID"] = "MMHZRHSU8Q"
os.environ["CHANGE_INTELLIGENCE_AGENT_ID"] = "6KHYUUGUCC"
os.environ["CHANGE_INTELLIGENCE_ALIAS_ID"] = "YJHW4GBPMM"
os.environ["RISK_BLAST_RADIUS_AGENT_ID"] = "Q18DLBI6SR"
os.environ["RISK_BLAST_RADIUS_ALIAS_ID"] = "MFD0Q6KXBT"
os.environ["KNOWLEDGE_RAG_AGENT_ID"] = "PW873XXLHQ"
os.environ["KNOWLEDGE_RAG_ALIAS_ID"] = "3EWSQHWAU0"
os.environ["RESPONSE_STRATEGY_AGENT_ID"] = "IKHAVTP8JI"
os.environ["RESPONSE_STRATEGY_ALIAS_ID"] = "JXNMIXFZV7"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

print("=" * 80)
print("Quick Smoke Test: Bedrock Agent Connectivity")
print("=" * 80)

# Create minimal test input
external_input = {
    "incident_id": "INC-SMOKE-001",
    "evidence_bundle": {
        "signals": [
            {
                "type": "metric",
                "name": "ErrorRate",
                "value": 15.2,
                "timestamp": datetime.now().isoformat(),
            }
        ],
    },
    "budget_remaining": 1.0,
    "session_id": f"smoke-{datetime.now().timestamp()}",
}

print(f"\n✓ Created test input for incident: {external_input['incident_id']}")

# Create initial state
print("\n✓ Creating initial GraphState...")
initial_state = entry_node(external_input)
print(f"  - Agent input frozen: {initial_state['agent_input'].incident_id}")
print(f"  - Budget: ${initial_state['budget_remaining']}")
print(f"  - Session: {initial_state['session_id']}")

# Invoke graph
print("\n✓ Invoking LangGraph (this will call all 6 Bedrock Agents)...")
print("  This may take 30-60 seconds...")

try:
    result = graph.invoke(
        initial_state,
        config={"configurable": {"thread_id": "smoke-test"}},
    )
    
    print("\n✅ SUCCESS! Graph execution completed")
    print(f"\n📊 Results:")
    print(f"  - Incident ID: {result.get('incident_id', 'N/A')}")
    
    if "recommendation" in result:
        rec = result["recommendation"]
        print(f"  - Unified Recommendation: {rec.get('unified', 'N/A')[:100]}...")
        print(f"  - Confidence: {rec.get('confidence', 0.0)}")
    
    if "cost" in result:
        cost = result["cost"]
        print(f"  - Total Cost: ${cost.get('total', 0.0)}")
    
    if "execution_summary" in result:
        summary = result["execution_summary"]
        print(f"  - Duration: {summary.get('duration_ms', 0)} ms")
        print(f"  - Agents Succeeded: {summary.get('agents_succeeded', 0)}")
        print(f"  - Agents Failed: {summary.get('agents_failed', 0)}")
    
    print("\n✅ Phase 6 Week 4 integration is working!")
    sys.exit(0)

except Exception as e:
    print(f"\n❌ FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
