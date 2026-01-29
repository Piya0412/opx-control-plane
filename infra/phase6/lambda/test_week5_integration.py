#!/usr/bin/env python3
"""
Phase 6 Week 5: Comprehensive Integration Test

Runs all Task 4 validations in sequence:
1. Replay tests (determinism)
2. Resume tests (crash recovery)
3. Determinism tests (partial failures)

This is the FINAL BOSS test - if this passes, Phase 6 is complete.
"""

import sys
import traceback
from datetime import datetime

# Import test modules
from test_replay import (
    test_replay_deterministic_consensus,
    test_replay_deterministic_cost,
    test_replay_deterministic_trace,
    test_replay_full_state_hash,
    test_replay_multiple_iterations,
)

from test_resume import (
    test_resume_checkpoint_persisted,
    test_resume_from_interruption,
    test_resume_no_duplicate_work,
    test_resume_cost_tracking_accurate,
    test_resume_output_identical_to_complete_run,
)

from test_determinism import (
    test_determinism_with_single_agent_failure,
    test_determinism_with_multiple_agent_failures,
    test_determinism_with_partial_data,
    test_determinism_cost_with_failures,
    test_determinism_execution_trace_with_failures,
    test_determinism_graceful_degradation,
)


# ============================================================================
# TEST SUITE
# ============================================================================

def create_test_event():
    """Create standard test event for all tests."""
    base_time = datetime(2024, 1, 26, 12, 0, 0)
    
    return {
        'incident_id': 'INC-INTEGRATION-TEST-001',
        'session_id': 'session-integration-001',
        'execution_id': 'exec-integration-001',
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
                    'timestamp': base_time.isoformat(),
                    'source': 'cloudwatch-logs',
                },
                {
                    'type': 'trace',
                    'trace_id': '1-abc-123',
                    'duration_ms': 5000,
                    'has_error': True,
                    'timestamp': base_time.isoformat(),
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
        'start_time': datetime(2024, 1, 26, 11, 0, 0).isoformat(),
        'end_time': base_time.isoformat(),
    }


def run_test_suite():
    """
    Run complete Phase 6 Week 5 Task 4 test suite.
    
    Returns:
        bool: True if all tests pass, False otherwise
    """
    event = create_test_event()
    
    test_suites = [
        {
            'name': 'REPLAY VALIDATION',
            'tests': [
                ('Deterministic Consensus', test_replay_deterministic_consensus),
                ('Deterministic Cost', test_replay_deterministic_cost),
                ('Deterministic Trace', test_replay_deterministic_trace),
                ('Full State Hash', test_replay_full_state_hash),
                ('Multiple Iterations', test_replay_multiple_iterations),
            ],
        },
        {
            'name': 'RESUME VALIDATION',
            'tests': [
                ('Checkpoint Persisted', test_resume_checkpoint_persisted),
                ('Resume from Interruption', test_resume_from_interruption),
                ('No Duplicate Work', test_resume_no_duplicate_work),
                ('Cost Tracking Accurate', test_resume_cost_tracking_accurate),
                ('Output Identical to Complete Run', test_resume_output_identical_to_complete_run),
            ],
        },
        {
            'name': 'DETERMINISM WITH FAILURES',
            'tests': [
                ('Single Agent Failure', test_determinism_with_single_agent_failure),
                ('Multiple Agent Failures', test_determinism_with_multiple_agent_failures),
                ('Partial Data', test_determinism_with_partial_data),
                ('Cost with Failures', test_determinism_cost_with_failures),
                ('Execution Trace with Failures', test_determinism_execution_trace_with_failures),
                ('Graceful Degradation', test_determinism_graceful_degradation),
            ],
        },
    ]
    
    total_tests = sum(len(suite['tests']) for suite in test_suites)
    passed_tests = 0
    failed_tests = []
    
    print("=" * 80)
    print("PHASE 6 WEEK 5 TASK 4: COMPREHENSIVE INTEGRATION TEST")
    print("=" * 80)
    print(f"Total tests: {total_tests}")
    print("=" * 80)
    print()
    
    for suite in test_suites:
        print(f"{'=' * 80}")
        print(f"TEST SUITE: {suite['name']}")
        print(f"{'=' * 80}")
        print()
        
        for test_name, test_func in suite['tests']:
            try:
                print(f"Running: {test_name}...")
                test_func(event)
                passed_tests += 1
                print(f"✅ PASSED: {test_name}")
                print()
            
            except AssertionError as e:
                failed_tests.append({
                    'suite': suite['name'],
                    'test': test_name,
                    'error': str(e),
                    'type': 'AssertionError',
                })
                print(f"❌ FAILED: {test_name}")
                print(f"   Error: {e}")
                print()
            
            except Exception as e:
                failed_tests.append({
                    'suite': suite['name'],
                    'test': test_name,
                    'error': str(e),
                    'type': type(e).__name__,
                    'traceback': traceback.format_exc(),
                })
                print(f"❌ ERROR: {test_name}")
                print(f"   {type(e).__name__}: {e}")
                print()
    
    # Print summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {len(failed_tests)}")
    print(f"Success rate: {passed_tests / total_tests * 100:.1f}%")
    print("=" * 80)
    
    if failed_tests:
        print()
        print("FAILED TESTS:")
        print("=" * 80)
        for failure in failed_tests:
            print(f"Suite: {failure['suite']}")
            print(f"Test: {failure['test']}")
            print(f"Error: {failure['error']}")
            if 'traceback' in failure:
                print(f"Traceback:\n{failure['traceback']}")
            print("-" * 80)
        print()
        print("=" * 80)
        print("❌ PHASE 6 WEEK 5 TASK 4: FAILED")
        print("=" * 80)
        return False
    
    else:
        print()
        print("=" * 80)
        print("✅ PHASE 6 WEEK 5 TASK 4: COMPLETE")
        print("=" * 80)
        print()
        print("VALIDATION SUMMARY:")
        print("  ✅ Replay works (deterministic execution)")
        print("  ✅ Resume works (crash recovery)")
        print("  ✅ Partial failures don't break consensus")
        print("  ✅ Deterministic hashes remain stable")
        print()
        print("Phase 6 is architecturally complete and production-ready.")
        print("=" * 80)
        return True


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    """
    Run comprehensive integration test.
    
    Usage:
        python3 src/langgraph/test_week5_integration.py
    
    Exit codes:
        0: All tests passed
        1: One or more tests failed
    """
    success = run_test_suite()
    sys.exit(0 if success else 1)
