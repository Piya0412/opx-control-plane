"""
Quick verification script to test graph compilation.

This script verifies that:
1. All imports work
2. Graph compiles without errors
3. Entry node creates valid state
4. State schema is correct

Run with: python3 src/langgraph/test_graph_compilation.py
"""

import os
import sys
from datetime import datetime

# Set dummy environment variables for testing
os.environ["SIGNAL_INTELLIGENCE_AGENT_ID"] = "test-agent-1"
os.environ["SIGNAL_INTELLIGENCE_ALIAS_ID"] = "test-alias-1"
os.environ["HISTORICAL_PATTERN_AGENT_ID"] = "test-agent-2"
os.environ["HISTORICAL_PATTERN_ALIAS_ID"] = "test-alias-2"
os.environ["CHANGE_INTELLIGENCE_AGENT_ID"] = "test-agent-3"
os.environ["CHANGE_INTELLIGENCE_ALIAS_ID"] = "test-alias-3"
os.environ["RISK_BLAST_RADIUS_AGENT_ID"] = "test-agent-4"
os.environ["RISK_BLAST_RADIUS_ALIAS_ID"] = "test-alias-4"
os.environ["KNOWLEDGE_RAG_AGENT_ID"] = "test-agent-5"
os.environ["KNOWLEDGE_RAG_ALIAS_ID"] = "test-alias-5"
os.environ["RESPONSE_STRATEGY_AGENT_ID"] = "test-agent-6"
os.environ["RESPONSE_STRATEGY_ALIAS_ID"] = "test-alias-6"


def test_imports():
    """Test that all imports work."""
    print("Testing imports...")
    try:
        from state import (
            GraphState,
            AgentInput,
            AgentOutput,
            ConsensusResult,
            CostGuardianResult,
            StructuredError,
            ExecutionTraceEntry,
            create_initial_state,
        )
        from graph import (
            create_graph,
            entry_node,
            terminal_node,
            validate_entry_input,
            validate_terminal_state,
        )
        print("✅ All imports successful")
        return True
    except Exception as e:
        print(f"❌ Import failed: {e}")
        return False


def test_graph_compilation():
    """Test that graph compiles without errors."""
    print("\nTesting graph compilation...")
    try:
        from graph import create_graph
        graph = create_graph()
        print("✅ Graph compiled successfully")
        print(f"   Graph type: {type(graph)}")
        return True
    except Exception as e:
        print(f"❌ Graph compilation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_entry_node():
    """Test that entry node creates valid state."""
    print("\nTesting entry node...")
    try:
        from graph import entry_node, validate_entry_input
        
        # Create test input
        external_input = {
            "incident_id": "INC-TEST-001",
            "evidence_bundle": {
                "signals": ["signal1", "signal2"],
                "detections": ["detection1"],
            },
            "budget_remaining": 10.0,
            "session_id": "session-test-123",
        }
        
        # Validate input
        validate_entry_input(external_input)
        print("✅ Entry input validation passed")
        
        # Create state
        state = entry_node(external_input)
        print("✅ Entry node created state")
        
        # Check state structure
        assert "agent_input" in state
        assert "hypotheses" in state
        assert "budget_remaining" in state
        assert "retry_count" in state
        assert "execution_trace" in state
        assert "errors" in state
        assert "session_id" in state
        assert "start_timestamp" in state
        print("✅ State structure is correct")
        
        # Check values
        assert state["agent_input"].incident_id == "INC-TEST-001"
        assert state["budget_remaining"] == 10.0
        assert state["session_id"] == "session-test-123"
        assert len(state["hypotheses"]) == 0
        assert len(state["retry_count"]) == 0
        assert len(state["errors"]) == 0
        assert len(state["execution_trace"]) == 1  # ENTRY trace
        print("✅ State values are correct")
        
        return True
    except Exception as e:
        print(f"❌ Entry node test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_state_factory():
    """Test create_initial_state factory."""
    print("\nTesting state factory...")
    try:
        from state import create_initial_state
        
        state = create_initial_state(
            incident_id="INC-TEST-002",
            evidence_bundle={"test": "data"},
            budget_remaining=5.0,
            session_id="session-test-456",
            execution_id="exec-test-789",
            timestamp=datetime.utcnow().isoformat(),
        )
        
        assert state["agent_input"].incident_id == "INC-TEST-002"
        assert state["budget_remaining"] == 5.0
        assert state["session_id"] == "session-test-456"
        print("✅ State factory works correctly")
        
        return True
    except Exception as e:
        print(f"❌ State factory test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("LangGraph Compilation Verification")
    print("=" * 60)
    
    results = []
    
    results.append(("Imports", test_imports()))
    results.append(("Graph Compilation", test_graph_compilation()))
    results.append(("Entry Node", test_entry_node()))
    results.append(("State Factory", test_state_factory()))
    
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name:.<40} {status}")
    
    all_passed = all(passed for _, passed in results)
    
    print("=" * 60)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print("\nGraph is ready for integration with Bedrock Agents!")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("\nPlease fix errors before proceeding.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
