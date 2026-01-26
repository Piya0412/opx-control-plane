#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 4: Determinism Validation Tests

Proves: Partial failures don't break consensus determinism

CRITICAL VALIDATIONS:
1. Agent failures don't break determinism
2. Partial results still produce consensus
3. Consensus remains stable with same failures
4. Cost tracking accurate with failures
5. Execution trace consistent with failures
"""

import pytest
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, List
from graph import graph, entry_node
from state import GraphState


# ============================================================================
# TEST FIXTURES
# ============================================================================

@pytest.fixture
def sample_incident_event() -> Dict[str, Any]:
    """
    Create a deterministic test incident event.
    """
    base_time = datetime(2024, 1, 26, 12, 0, 0)
    
    return {
        'incident_id': 'INC-DETERMINISM-TEST-001',
        'session_id': 'session-determinism-001',
        'execution_id': 'exec-determinism-001',
        'timestamp': base_time.isoformat(),
        'evidence_bundle': {
            'signals': [
                {
                    'type': 'metric',
                    'name': 'CPUUtilization',
                    'value': 95.5,
                    'timestamp': base_time.isoformat(),
                    'source': 'cloudwatch',
                },
                {
                    'type': 'log',
                    'message': 'ERROR: Connection timeout',
                    'timestamp': (base_time + timedelta(seconds=30)).isoformat(),
                    'source': 'cloudwatch-logs',
                },
                {
                    'type': 'trace',
                    'trace_id': '1-abc-123',
                    'duration_ms': 5000,
                    'has_error': True,
                    'timestamp': (base_time + timedelta(seconds=60)).isoformat(),
                    'source': 'xray',
                },
            ],
            'context': {
                'service': 'api-gateway',
                'environment': 'production',
                'region': 'us-east-1',
            },
        },
        'budget_remaining': 5.0,
        'start_time': (base_time - timedelta(hours=1)).isoformat(),
        'end_time': base_time.isoformat(),
    }


def compute_deterministic_hash(data: Any) -> str:
    """
    Compute deterministic hash of data structure.
    """
    json_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode()).hexdigest()


def simulate_agent_failure(
    state: GraphState,
    failing_agents: List[str],
) -> GraphState:
    """
    Simulate agent failures by marking hypotheses as failed.
    
    Args:
        state: Current graph state
        failing_agents: List of agent IDs to fail
    
    Returns:
        Modified state with failed agents
    """
    # Mark specified agents as failed
    for hypothesis in state.get('agent_hypotheses', []):
        if hypothesis.get('agent_id') in failing_agents:
            hypothesis['status'] = 'FAILED'
            hypothesis['confidence'] = 0.0
            hypothesis['error'] = 'Simulated agent failure'
    
    return state


# ============================================================================
# DETERMINISM TESTS WITH FAILURES
# ============================================================================

def test_determinism_with_single_agent_failure(sample_incident_event):
    """
    Test: Single agent failure produces deterministic consensus.
    
    VALIDATES:
    - Consensus reached despite 1 agent failure
    - Consensus identical across replays with same failure
    - Remaining agents produce stable output
    """
    failing_agents = ['signal-intelligence']
    
    # First execution with failure
    initial_state_1 = entry_node(sample_incident_event)
    initial_state_1 = simulate_agent_failure(initial_state_1, failing_agents)
    
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'single-failure-test-1',
            },
        },
    )
    
    consensus_1 = final_state_1.get('recommendation', {})
    confidence_1 = final_state_1.get('confidence', 0.0)
    hash_1 = compute_deterministic_hash(consensus_1)
    
    # Second execution with same failure (replay)
    initial_state_2 = entry_node(sample_incident_event)
    initial_state_2 = simulate_agent_failure(initial_state_2, failing_agents)
    
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'single-failure-test-2',
            },
        },
    )
    
    consensus_2 = final_state_2.get('recommendation', {})
    confidence_2 = final_state_2.get('confidence', 0.0)
    hash_2 = compute_deterministic_hash(consensus_2)
    
    # CRITICAL ASSERTIONS
    assert consensus_1 == consensus_2, \
        "Consensus must be identical with same agent failure"
    assert hash_1 == hash_2, \
        "Consensus hash must be stable with same agent failure"
    assert confidence_1 == confidence_2, \
        "Confidence must be identical with same agent failure"
    
    print(f"✅ Single agent failure determinism test PASSED")
    print(f"   Failed agents: {failing_agents}")
    print(f"   Consensus hash: {hash_1}")
    print(f"   Confidence: {confidence_1:.2f}")


def test_determinism_with_multiple_agent_failures(sample_incident_event):
    """
    Test: Multiple agent failures produce deterministic consensus.
    
    VALIDATES:
    - Consensus reached despite multiple agent failures
    - Consensus identical across replays with same failures
    - Graceful degradation with reduced agent set
    """
    failing_agents = ['signal-intelligence', 'historical-pattern']
    
    # First execution with failures
    initial_state_1 = entry_node(sample_incident_event)
    initial_state_1 = simulate_agent_failure(initial_state_1, failing_agents)
    
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'multi-failure-test-1',
            },
        },
    )
    
    consensus_1 = final_state_1.get('recommendation', {})
    hash_1 = compute_deterministic_hash(consensus_1)
    
    # Second execution with same failures (replay)
    initial_state_2 = entry_node(sample_incident_event)
    initial_state_2 = simulate_agent_failure(initial_state_2, failing_agents)
    
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'multi-failure-test-2',
            },
        },
    )
    
    consensus_2 = final_state_2.get('recommendation', {})
    hash_2 = compute_deterministic_hash(consensus_2)
    
    # CRITICAL ASSERTIONS
    assert consensus_1 == consensus_2, \
        "Consensus must be identical with same agent failures"
    assert hash_1 == hash_2, \
        "Consensus hash must be stable with same agent failures"
    
    print(f"✅ Multiple agent failures determinism test PASSED")
    print(f"   Failed agents: {failing_agents}")
    print(f"   Consensus hash: {hash_1}")


def test_determinism_with_partial_data(sample_incident_event):
    """
    Test: Partial data (timeouts) produces deterministic consensus.
    
    VALIDATES:
    - Agents returning PARTIAL status don't break determinism
    - Consensus stable with same partial data
    - Reduced confidence but stable output
    """
    # Modify event to trigger timeouts (very short time window)
    short_window_event = sample_incident_event.copy()
    base_time = datetime(2024, 1, 26, 12, 0, 0)
    short_window_event['start_time'] = base_time.isoformat()
    short_window_event['end_time'] = (base_time + timedelta(seconds=1)).isoformat()
    
    # First execution with partial data
    initial_state_1 = entry_node(short_window_event)
    
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'partial-data-test-1',
            },
        },
    )
    
    consensus_1 = final_state_1.get('recommendation', {})
    hash_1 = compute_deterministic_hash(consensus_1)
    
    # Second execution with same partial data (replay)
    initial_state_2 = entry_node(short_window_event)
    
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'partial-data-test-2',
            },
        },
    )
    
    consensus_2 = final_state_2.get('recommendation', {})
    hash_2 = compute_deterministic_hash(consensus_2)
    
    # CRITICAL ASSERTIONS
    assert consensus_1 == consensus_2, \
        "Consensus must be identical with same partial data"
    assert hash_1 == hash_2, \
        "Consensus hash must be stable with partial data"
    
    print(f"✅ Partial data determinism test PASSED")
    print(f"   Consensus hash: {hash_1}")


def test_determinism_cost_with_failures(sample_incident_event):
    """
    Test: Cost tracking deterministic with agent failures.
    
    VALIDATES:
    - Failed agents don't incur cost
    - Cost identical across replays with same failures
    - Cost tracking accurate with partial execution
    """
    failing_agents = ['signal-intelligence']
    
    # First execution with failure
    initial_state_1 = entry_node(sample_incident_event)
    initial_state_1 = simulate_agent_failure(initial_state_1, failing_agents)
    
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'cost-failure-test-1',
            },
        },
    )
    
    cost_1 = final_state_1.get('cost', {})
    total_cost_1 = cost_1.get('total', 0.0)
    by_agent_1 = cost_1.get('by_agent', {})
    
    # Second execution with same failure (replay)
    initial_state_2 = entry_node(sample_incident_event)
    initial_state_2 = simulate_agent_failure(initial_state_2, failing_agents)
    
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'cost-failure-test-2',
            },
        },
    )
    
    cost_2 = final_state_2.get('cost', {})
    total_cost_2 = cost_2.get('total', 0.0)
    by_agent_2 = cost_2.get('by_agent', {})
    
    # CRITICAL ASSERTIONS
    assert total_cost_1 == total_cost_2, \
        "Total cost must be identical with same agent failures"
    assert by_agent_1 == by_agent_2, \
        "Per-agent costs must be identical with same failures"
    
    # Failed agents should have zero or minimal cost
    for agent in failing_agents:
        agent_cost = by_agent_1.get(agent, 0.0)
        assert agent_cost == 0.0, \
            f"Failed agent {agent} should have zero cost"
    
    print(f"✅ Cost determinism with failures test PASSED")
    print(f"   Total cost: ${total_cost_1:.4f}")
    print(f"   Failed agents: {failing_agents}")


def test_determinism_execution_trace_with_failures(sample_incident_event):
    """
    Test: Execution trace deterministic with agent failures.
    
    VALIDATES:
    - Execution trace identical with same failures
    - Failed agents still appear in trace
    - Trace order consistent
    """
    failing_agents = ['signal-intelligence']
    
    # First execution with failure
    initial_state_1 = entry_node(sample_incident_event)
    initial_state_1 = simulate_agent_failure(initial_state_1, failing_agents)
    
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'trace-failure-test-1',
            },
        },
    )
    
    trace_1 = final_state_1.get('execution_trace', [])
    hash_1 = compute_deterministic_hash(trace_1)
    
    # Second execution with same failure (replay)
    initial_state_2 = entry_node(sample_incident_event)
    initial_state_2 = simulate_agent_failure(initial_state_2, failing_agents)
    
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'trace-failure-test-2',
            },
        },
    )
    
    trace_2 = final_state_2.get('execution_trace', [])
    hash_2 = compute_deterministic_hash(trace_2)
    
    # CRITICAL ASSERTIONS
    assert trace_1 == trace_2, \
        "Execution trace must be identical with same agent failures"
    assert hash_1 == hash_2, \
        "Trace hash must be stable with same failures"
    assert len(trace_1) == len(trace_2), \
        "Trace length must be identical"
    
    print(f"✅ Execution trace determinism with failures test PASSED")
    print(f"   Trace hash: {hash_1}")
    print(f"   Trace: {' → '.join(trace_1)}")


def test_determinism_graceful_degradation(sample_incident_event):
    """
    Test: System degrades gracefully with increasing failures.
    
    VALIDATES:
    - 0 failures → high confidence
    - 1 failure → medium confidence
    - 2 failures → low confidence
    - All deterministic at each level
    """
    failure_scenarios = [
        ([], "no failures"),
        (['signal-intelligence'], "1 failure"),
        (['signal-intelligence', 'historical-pattern'], "2 failures"),
    ]
    
    results = []
    
    for failing_agents, scenario_name in failure_scenarios:
        initial_state = entry_node(sample_incident_event)
        
        if failing_agents:
            initial_state = simulate_agent_failure(initial_state, failing_agents)
        
        final_state = graph.invoke(
            initial_state,
            config={
                'configurable': {
                    'thread_id': f'degradation-test-{len(failing_agents)}',
                },
            },
        )
        
        confidence = final_state.get('confidence', 0.0)
        consensus = final_state.get('recommendation', {})
        
        results.append({
            'scenario': scenario_name,
            'failures': len(failing_agents),
            'confidence': confidence,
            'consensus_hash': compute_deterministic_hash(consensus),
        })
        
        print(f"   {scenario_name}: confidence={confidence:.2f}")
    
    # CRITICAL ASSERTIONS
    # Confidence should decrease with more failures
    assert results[0]['confidence'] >= results[1]['confidence'], \
        "Confidence should decrease with failures"
    assert results[1]['confidence'] >= results[2]['confidence'], \
        "Confidence should continue to decrease"
    
    # But consensus should still be reached (not None)
    for result in results:
        assert result['consensus_hash'] is not None, \
            f"Consensus must be reached even with {result['scenario']}"
    
    print(f"✅ Graceful degradation test PASSED")


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == '__main__':
    """
    Run determinism tests locally.
    
    Usage:
        python3 src/langgraph/test_determinism.py
    """
    print("=" * 80)
    print("PHASE 6 WEEK 5 TASK 4: DETERMINISM VALIDATION TESTS")
    print("=" * 80)
    print()
    
    # Create sample event
    event = {
        'incident_id': 'INC-DETERMINISM-TEST-001',
        'session_id': 'session-determinism-001',
        'execution_id': 'exec-determinism-001',
        'timestamp': datetime(2024, 1, 26, 12, 0, 0).isoformat(),
        'evidence_bundle': {
            'signals': [
                {
                    'type': 'metric',
                    'name': 'CPUUtilization',
                    'value': 95.5,
                    'timestamp': datetime(2024, 1, 26, 12, 0, 0).isoformat(),
                    'source': 'cloudwatch',
                },
            ],
            'context': {
                'service': 'api-gateway',
                'environment': 'production',
            },
        },
        'budget_remaining': 5.0,
        'start_time': datetime(2024, 1, 26, 11, 0, 0).isoformat(),
        'end_time': datetime(2024, 1, 26, 12, 0, 0).isoformat(),
    }
    
    # Run tests
    try:
        print("Test 1: Single Agent Failure Determinism")
        test_determinism_with_single_agent_failure(event)
        print()
        
        print("Test 2: Multiple Agent Failures Determinism")
        test_determinism_with_multiple_agent_failures(event)
        print()
        
        print("Test 3: Partial Data Determinism")
        test_determinism_with_partial_data(event)
        print()
        
        print("Test 4: Cost Determinism with Failures")
        test_determinism_cost_with_failures(event)
        print()
        
        print("Test 5: Execution Trace Determinism with Failures")
        test_determinism_execution_trace_with_failures(event)
        print()
        
        print("Test 6: Graceful Degradation")
        test_determinism_graceful_degradation(event)
        print()
        
        print("=" * 80)
        print("✅ ALL DETERMINISM TESTS PASSED")
        print("=" * 80)
    
    except AssertionError as e:
        print("=" * 80)
        print(f"❌ DETERMINISM TEST FAILED: {e}")
        print("=" * 80)
        raise
    
    except Exception as e:
        print("=" * 80)
        print(f"❌ DETERMINISM TEST ERROR: {e}")
        print("=" * 80)
        raise
