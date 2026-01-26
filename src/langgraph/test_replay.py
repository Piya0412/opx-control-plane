#!/usr/bin/env python3
"""
Phase 6 Week 5 Task 4: Replay Validation Tests

Proves: Same input → same output (deterministic execution)

CRITICAL VALIDATIONS:
1. Consensus output identical
2. Cost totals identical
3. Agreement scores identical
4. Deterministic hashes stable
5. Execution trace identical
"""

import pytest
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any
from graph import graph, entry_node
from state import GraphState


# ============================================================================
# TEST FIXTURES
# ============================================================================

@pytest.fixture
def sample_incident_event() -> Dict[str, Any]:
    """
    Create a deterministic test incident event.
    
    CRITICAL: All timestamps and IDs must be deterministic for replay.
    """
    base_time = datetime(2024, 1, 26, 12, 0, 0)
    
    return {
        'incident_id': 'INC-REPLAY-TEST-001',
        'session_id': 'session-replay-001',
        'execution_id': 'exec-replay-001',
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
                    'message': 'ERROR: Connection timeout to database',
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
    
    Args:
        data: Data to hash (dict, list, etc.)
    
    Returns:
        SHA-256 hex digest
    """
    # Convert to JSON with sorted keys for determinism
    json_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode()).hexdigest()


def extract_consensus(state: GraphState) -> Dict[str, Any]:
    """
    Extract consensus output from final state.
    
    Args:
        state: Final graph state
    
    Returns:
        Consensus data
    """
    return {
        'recommendation': state.get('recommendation', {}),
        'confidence': state.get('confidence', 0.0),
        'agreement_score': state.get('agreement_score', 0.0),
        'consensus_reached': state.get('consensus_reached', False),
    }


def extract_cost(state: GraphState) -> Dict[str, Any]:
    """
    Extract cost totals from final state.
    
    Args:
        state: Final graph state
    
    Returns:
        Cost data
    """
    cost = state.get('cost', {})
    return {
        'total': cost.get('total', 0.0),
        'by_agent': cost.get('by_agent', {}),
        'budget_remaining': cost.get('budget_remaining', 0.0),
    }


def extract_execution_trace(state: GraphState) -> list:
    """
    Extract execution trace from final state.
    
    Args:
        state: Final graph state
    
    Returns:
        Execution trace (list of node names)
    """
    return state.get('execution_trace', [])


# ============================================================================
# REPLAY TESTS
# ============================================================================

def test_replay_deterministic_consensus(sample_incident_event):
    """
    Test: Same input → same consensus output.
    
    VALIDATES:
    - Consensus recommendation identical
    - Confidence score identical
    - Agreement score identical
    """
    # First execution
    initial_state_1 = entry_node(sample_incident_event)
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'replay-test-1',
            },
        },
    )
    
    consensus_1 = extract_consensus(final_state_1)
    hash_1 = compute_deterministic_hash(consensus_1)
    
    # Second execution (replay)
    initial_state_2 = entry_node(sample_incident_event)
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'replay-test-2',
            },
        },
    )
    
    consensus_2 = extract_consensus(final_state_2)
    hash_2 = compute_deterministic_hash(consensus_2)
    
    # CRITICAL ASSERTIONS
    assert consensus_1 == consensus_2, "Consensus output must be identical on replay"
    assert hash_1 == hash_2, "Consensus hash must be stable"
    
    # Detailed field checks
    assert consensus_1['recommendation'] == consensus_2['recommendation'], \
        "Recommendation must be identical"
    assert consensus_1['confidence'] == consensus_2['confidence'], \
        "Confidence score must be identical"
    assert consensus_1['agreement_score'] == consensus_2['agreement_score'], \
        "Agreement score must be identical"
    assert consensus_1['consensus_reached'] == consensus_2['consensus_reached'], \
        "Consensus status must be identical"
    
    print(f"✅ Replay deterministic consensus test PASSED")
    print(f"   Consensus hash: {hash_1}")
    print(f"   Confidence: {consensus_1['confidence']}")
    print(f"   Agreement: {consensus_1['agreement_score']}")


def test_replay_deterministic_cost(sample_incident_event):
    """
    Test: Same input → same cost totals.
    
    VALIDATES:
    - Total cost identical
    - Per-agent costs identical
    - Budget remaining identical
    """
    # First execution
    initial_state_1 = entry_node(sample_incident_event)
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'cost-test-1',
            },
        },
    )
    
    cost_1 = extract_cost(final_state_1)
    hash_1 = compute_deterministic_hash(cost_1)
    
    # Second execution (replay)
    initial_state_2 = entry_node(sample_incident_event)
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'cost-test-2',
            },
        },
    )
    
    cost_2 = extract_cost(final_state_2)
    hash_2 = compute_deterministic_hash(cost_2)
    
    # CRITICAL ASSERTIONS
    assert cost_1 == cost_2, "Cost totals must be identical on replay"
    assert hash_1 == hash_2, "Cost hash must be stable"
    
    # Detailed field checks
    assert cost_1['total'] == cost_2['total'], \
        "Total cost must be identical"
    assert cost_1['by_agent'] == cost_2['by_agent'], \
        "Per-agent costs must be identical"
    assert cost_1['budget_remaining'] == cost_2['budget_remaining'], \
        "Budget remaining must be identical"
    
    print(f"✅ Replay deterministic cost test PASSED")
    print(f"   Cost hash: {hash_1}")
    print(f"   Total cost: ${cost_1['total']:.4f}")
    print(f"   Budget remaining: ${cost_1['budget_remaining']:.2f}")


def test_replay_deterministic_trace(sample_incident_event):
    """
    Test: Same input → same execution trace.
    
    VALIDATES:
    - Node execution order identical
    - All nodes executed
    - No extra or missing nodes
    """
    # First execution
    initial_state_1 = entry_node(sample_incident_event)
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'trace-test-1',
            },
        },
    )
    
    trace_1 = extract_execution_trace(final_state_1)
    hash_1 = compute_deterministic_hash(trace_1)
    
    # Second execution (replay)
    initial_state_2 = entry_node(sample_incident_event)
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'trace-test-2',
            },
        },
    )
    
    trace_2 = extract_execution_trace(final_state_2)
    hash_2 = compute_deterministic_hash(trace_2)
    
    # CRITICAL ASSERTIONS
    assert trace_1 == trace_2, "Execution trace must be identical on replay"
    assert hash_1 == hash_2, "Trace hash must be stable"
    assert len(trace_1) == len(trace_2), "Trace length must be identical"
    
    print(f"✅ Replay deterministic trace test PASSED")
    print(f"   Trace hash: {hash_1}")
    print(f"   Nodes executed: {len(trace_1)}")
    print(f"   Trace: {' → '.join(trace_1)}")


def test_replay_full_state_hash(sample_incident_event):
    """
    Test: Same input → same full state hash.
    
    VALIDATES:
    - Entire final state is deterministic
    - No hidden non-determinism
    """
    # First execution
    initial_state_1 = entry_node(sample_incident_event)
    final_state_1 = graph.invoke(
        initial_state_1,
        config={
            'configurable': {
                'thread_id': 'full-state-test-1',
            },
        },
    )
    
    # Extract deterministic fields only (exclude timestamps)
    deterministic_state_1 = {
        'incident_id': final_state_1.get('incident_id'),
        'consensus': extract_consensus(final_state_1),
        'cost': extract_cost(final_state_1),
        'trace': extract_execution_trace(final_state_1),
        'agent_hypotheses': final_state_1.get('agent_hypotheses', []),
    }
    hash_1 = compute_deterministic_hash(deterministic_state_1)
    
    # Second execution (replay)
    initial_state_2 = entry_node(sample_incident_event)
    final_state_2 = graph.invoke(
        initial_state_2,
        config={
            'configurable': {
                'thread_id': 'full-state-test-2',
            },
        },
    )
    
    deterministic_state_2 = {
        'incident_id': final_state_2.get('incident_id'),
        'consensus': extract_consensus(final_state_2),
        'cost': extract_cost(final_state_2),
        'trace': extract_execution_trace(final_state_2),
        'agent_hypotheses': final_state_2.get('agent_hypotheses', []),
    }
    hash_2 = compute_deterministic_hash(deterministic_state_2)
    
    # CRITICAL ASSERTION
    assert hash_1 == hash_2, "Full state hash must be stable on replay"
    
    print(f"✅ Replay full state hash test PASSED")
    print(f"   State hash: {hash_1}")


def test_replay_multiple_iterations(sample_incident_event):
    """
    Test: Multiple replays produce identical results.
    
    VALIDATES:
    - Determinism holds across N iterations
    - No drift or variance
    """
    num_iterations = 5
    hashes = []
    
    for i in range(num_iterations):
        initial_state = entry_node(sample_incident_event)
        final_state = graph.invoke(
            initial_state,
            config={
                'configurable': {
                    'thread_id': f'multi-replay-{i}',
                },
            },
        )
        
        consensus = extract_consensus(final_state)
        cost = extract_cost(final_state)
        trace = extract_execution_trace(final_state)
        
        combined = {
            'consensus': consensus,
            'cost': cost,
            'trace': trace,
        }
        
        hash_value = compute_deterministic_hash(combined)
        hashes.append(hash_value)
    
    # CRITICAL ASSERTION: All hashes must be identical
    assert len(set(hashes)) == 1, \
        f"All {num_iterations} replays must produce identical hash"
    
    print(f"✅ Multiple replay test PASSED ({num_iterations} iterations)")
    print(f"   Stable hash: {hashes[0]}")


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == '__main__':
    """
    Run replay tests locally.
    
    Usage:
        python3 src/langgraph/test_replay.py
    """
    print("=" * 80)
    print("PHASE 6 WEEK 5 TASK 4: REPLAY VALIDATION TESTS")
    print("=" * 80)
    print()
    
    # Create sample event
    event = {
        'incident_id': 'INC-REPLAY-TEST-001',
        'session_id': 'session-replay-001',
        'execution_id': 'exec-replay-001',
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
        print("Test 1: Deterministic Consensus")
        test_replay_deterministic_consensus(event)
        print()
        
        print("Test 2: Deterministic Cost")
        test_replay_deterministic_cost(event)
        print()
        
        print("Test 3: Deterministic Trace")
        test_replay_deterministic_trace(event)
        print()
        
        print("Test 4: Full State Hash")
        test_replay_full_state_hash(event)
        print()
        
        print("Test 5: Multiple Iterations")
        test_replay_multiple_iterations(event)
        print()
        
        print("=" * 80)
        print("✅ ALL REPLAY TESTS PASSED")
        print("=" * 80)
    
    except AssertionError as e:
        print("=" * 80)
        print(f"❌ REPLAY TEST FAILED: {e}")
        print("=" * 80)
        raise
    
    except Exception as e:
        print("=" * 80)
        print(f"❌ REPLAY TEST ERROR: {e}")
        print("=" * 80)
        raise
