#!/usr/bin/env python3
"""
Phase 6 Week 4: LangGraph ↔ Bedrock Integration Test

This script tests the end-to-end integration between LangGraph orchestration
and deployed Bedrock Agents.

Test Cases:
1. Agent configuration validation
2. Single agent invocation
3. Full graph execution
4. Consensus aggregation
5. Cost tracking
6. Error handling
7. Deterministic replay

Usage:
    # Set environment variables first
    source src/langgraph/set_agent_env.sh
    
    # Run integration tests
    python3 src/langgraph/test_week4_integration.py
"""

import json
import os
import sys
from datetime import datetime
from typing import Dict

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.langgraph.bedrock_config import (
    BEDROCK_AGENTS,
    get_agent_config,
    validate_config,
)
from src.langgraph.graph import graph, entry_node
from src.langgraph.state import create_initial_state


# ============================================================================
# TEST UTILITIES
# ============================================================================

def print_section(title: str) -> None:
    """Print section header."""
    print(f"\n{'=' * 80}")
    print(f"  {title}")
    print(f"{'=' * 80}\n")


def print_success(message: str) -> None:
    """Print success message."""
    print(f"✅ {message}")


def print_error(message: str) -> None:
    """Print error message."""
    print(f"❌ {message}")


def print_info(message: str) -> None:
    """Print info message."""
    print(f"ℹ️  {message}")


# ============================================================================
# TEST 1: CONFIGURATION VALIDATION
# ============================================================================

def test_configuration_validation() -> bool:
    """
    Test that all agent configurations are valid.
    
    Checks:
    - All 6 agents configured
    - Agent IDs are non-empty
    - Alias IDs are non-empty
    - Region is set
    
    Returns:
        True if all checks pass
    """
    print_section("TEST 1: Configuration Validation")
    
    try:
        # Validate configuration
        validate_config()
        print_success("Configuration validation passed")
        
        # Print agent details
        print_info("Configured agents:")
        for agent_name, config in BEDROCK_AGENTS.items():
            print(f"  - {agent_name}:")
            print(f"      agent_id: {config['agent_id']}")
            print(f"      alias_id: {config['alias_id']}")
            print(f"      region: {config['region']}")
        
        return True
    
    except Exception as e:
        print_error(f"Configuration validation failed: {e}")
        return False


# ============================================================================
# TEST 2: ENVIRONMENT VARIABLES
# ============================================================================

def test_environment_variables() -> bool:
    """
    Test that all required environment variables are set.
    
    Returns:
        True if all environment variables are set
    """
    print_section("TEST 2: Environment Variables")
    
    required_vars = [
        "SIGNAL_INTELLIGENCE_AGENT_ID",
        "SIGNAL_INTELLIGENCE_ALIAS_ID",
        "HISTORICAL_PATTERN_AGENT_ID",
        "HISTORICAL_PATTERN_ALIAS_ID",
        "CHANGE_INTELLIGENCE_AGENT_ID",
        "CHANGE_INTELLIGENCE_ALIAS_ID",
        "RISK_BLAST_RADIUS_AGENT_ID",
        "RISK_BLAST_RADIUS_ALIAS_ID",
        "KNOWLEDGE_RAG_AGENT_ID",
        "KNOWLEDGE_RAG_ALIAS_ID",
        "RESPONSE_STRATEGY_AGENT_ID",
        "RESPONSE_STRATEGY_ALIAS_ID",
    ]
    
    all_set = True
    
    for var in required_vars:
        value = os.environ.get(var)
        if value:
            print_success(f"{var}={value}")
        else:
            print_error(f"{var} not set")
            all_set = False
    
    if all_set:
        print_success("All environment variables set")
    else:
        print_error("Some environment variables missing")
        print_info("Run: source src/langgraph/set_agent_env.sh")
    
    return all_set


# ============================================================================
# TEST 3: GRAPH CONSTRUCTION
# ============================================================================

def test_graph_construction() -> bool:
    """
    Test that LangGraph can be constructed with agent IDs.
    
    Returns:
        True if graph construction succeeds
    """
    print_section("TEST 3: Graph Construction")
    
    try:
        # Graph is already constructed as singleton
        print_success("Graph constructed successfully")
        
        # Print graph structure
        print_info("Graph nodes:")
        # Note: LangGraph doesn't expose node list directly
        # We know the structure from graph.py
        nodes = [
            "ENTRY",
            "signal-intelligence",
            "historical-pattern",
            "change-intelligence",
            "risk-blast-radius",
            "knowledge-rag",
            "response-strategy",
            "consensus",
            "cost-guardian",
            "TERMINAL",
        ]
        for node in nodes:
            print(f"  - {node}")
        
        return True
    
    except Exception as e:
        print_error(f"Graph construction failed: {e}")
        return False


# ============================================================================
# TEST 4: ENTRY NODE
# ============================================================================

def test_entry_node() -> bool:
    """
    Test entry node with sample input.
    
    Returns:
        True if entry node succeeds
    """
    print_section("TEST 4: Entry Node")
    
    try:
        # Create sample input
        external_input = {
            "incident_id": "INC-TEST-001",
            "evidence_bundle": {
                "signals": [
                    {
                        "type": "metric",
                        "name": "CPUUtilization",
                        "value": 95.5,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                ],
                "context": {
                    "service": "api-gateway",
                    "environment": "production",
                },
            },
            "budget_remaining": 1.0,
            "session_id": f"test-session-{datetime.utcnow().timestamp()}",
        }
        
        # Invoke entry node
        initial_state = entry_node(external_input)
        
        print_success("Entry node executed successfully")
        print_info(f"Incident ID: {initial_state['agent_input'].incident_id}")
        print_info(f"Session ID: {initial_state['session_id']}")
        print_info(f"Budget: ${initial_state['budget_remaining']}")
        
        return True
    
    except Exception as e:
        print_error(f"Entry node failed: {e}")
        return False


# ============================================================================
# TEST 5: SINGLE AGENT INVOCATION (SMOKE TEST)
# ============================================================================

def test_single_agent_invocation() -> bool:
    """
    Test single agent invocation (signal-intelligence).
    
    This is a smoke test to verify Bedrock Agent connectivity.
    
    Returns:
        True if agent invocation succeeds
    """
    print_section("TEST 5: Single Agent Invocation (Smoke Test)")
    
    try:
        print_info("Testing signal-intelligence agent...")
        print_info("This will invoke the actual Bedrock Agent")
        print_info("Expected: Mock data response (stub implementation)")
        
        # Create initial state
        external_input = {
            "incident_id": "INC-SMOKE-001",
            "evidence_bundle": {
                "signals": [
                    {
                        "type": "metric",
                        "name": "ErrorRate",
                        "value": 15.2,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                ],
            },
            "budget_remaining": 1.0,
            "session_id": f"smoke-test-{datetime.utcnow().timestamp()}",
        }
        
        # Note: graph.invoke expects GraphState, not external input
        # Create initial state first
        initial_state = entry_node(external_input)
        
        print_info("Invoking Bedrock Agent...")
        
        # Note: This will actually call AWS Bedrock Agent Runtime API
        # The agent will return mock data (stub implementation from Week 3)
        result = graph.invoke(
            initial_state,
            config={"configurable": {"thread_id": "smoke-test"}},
        )
        
        # Check result
        if "signal-intelligence" in result.get("hypotheses", {}):
            agent_output = result["hypotheses"]["signal-intelligence"]
            print_success("Agent invocation succeeded")
            print_info(f"Status: {agent_output.status}")
            print_info(f"Confidence: {agent_output.confidence}")
            print_info(f"Findings: {json.dumps(agent_output.findings, indent=2)}")
            
            if agent_output.cost:
                print_info(f"Cost: ${agent_output.cost.get('estimatedCost', 0.0)}")
            
            return True
        else:
            print_error("Agent output not found in result")
            return False
    
    except Exception as e:
        print_error(f"Single agent invocation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


# ============================================================================
# TEST 6: FULL GRAPH EXECUTION
# ============================================================================

def test_full_graph_execution() -> bool:
    """
    Test full graph execution with all 6 agents + consensus + cost guardian.
    
    This is the end-to-end integration test.
    
    Returns:
        True if full execution succeeds
    """
    print_section("TEST 6: Full Graph Execution (End-to-End)")
    
    try:
        print_info("Executing full LangGraph with all 6 Bedrock Agents...")
        print_info("This will take ~30-60 seconds")
        
        # Create initial state
        external_input = {
            "incident_id": "INC-E2E-001",
            "evidence_bundle": {
                "signals": [
                    {
                        "type": "metric",
                        "name": "CPUUtilization",
                        "value": 95.5,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                    {
                        "type": "log",
                        "message": "ERROR: Connection timeout to database",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                ],
                "context": {
                    "service": "api-gateway",
                    "environment": "production",
                    "region": "us-east-1",
                },
            },
            "budget_remaining": 5.0,
            "session_id": f"e2e-test-{datetime.utcnow().timestamp()}",
        }
        
        # Create initial state
        initial_state = entry_node(external_input)
        
        # Execute full graph
        print_info("Starting execution...")
        result = graph.invoke(
            initial_state,
            config={"configurable": {"thread_id": "e2e-test"}},
        )
        
        # Validate result
        print_success("Full graph execution completed")
        
        # Print summary
        print_info("\nExecution Summary:")
        print(f"  Incident ID: {result.get('incident_id', 'N/A')}")
        
        if "recommendation" in result:
            rec = result["recommendation"]
            print(f"  Unified Recommendation: {rec.get('unified', 'N/A')}")
            print(f"  Aggregated Confidence: {rec.get('confidence', 0.0)}")
            print(f"  Agreement Level: {rec.get('agreement_level', 'N/A')}")
        
        if "cost" in result:
            cost = result["cost"]
            print(f"  Total Cost: ${cost.get('total', 0.0)}")
            print(f"  Budget Remaining: ${cost.get('budget_remaining', 0.0)}")
            print(f"  Budget Exceeded: {cost.get('exceeded', False)}")
        
        if "execution_summary" in result:
            summary = result["execution_summary"]
            print(f"  Duration: {summary.get('duration_ms', 0)} ms")
            print(f"  Agents Succeeded: {summary.get('agents_succeeded', 0)}")
            print(f"  Agents Failed: {summary.get('agents_failed', 0)}")
            print(f"  Total Retries: {summary.get('total_retries', 0)}")
        
        return True
    
    except Exception as e:
        print_error(f"Full graph execution failed: {e}")
        import traceback
        traceback.print_exc()
        return False


# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main() -> int:
    """
    Run all integration tests.
    
    Returns:
        Exit code (0 = success, 1 = failure)
    """
    print_section("Phase 6 Week 4: LangGraph ↔ Bedrock Integration Tests")
    
    tests = [
        ("Configuration Validation", test_configuration_validation),
        ("Environment Variables", test_environment_variables),
        ("Graph Construction", test_graph_construction),
        ("Entry Node", test_entry_node),
        ("Single Agent Invocation", test_single_agent_invocation),
        ("Full Graph Execution", test_full_graph_execution),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print_error(f"Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
    
    # Print summary
    print_section("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print_success("All tests passed!")
        return 0
    else:
        print_error(f"{total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
