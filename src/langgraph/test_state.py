"""
Phase 6 Week 2: State Tests

Unit tests for LangGraph state management.
"""

import pytest
from datetime import datetime

from .state import (
    LangGraphState,
    AgentOutput,
    BudgetState,
    ConsensusOutput,
    create_initial_state,
    update_budget,
    increment_retry,
    add_error,
    update_checkpoint,
)


class TestCreateInitialState:
    """Tests for create_initial_state function"""
    
    def test_creates_valid_initial_state(self):
        """Should create valid initial state with all required fields"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={'test': 'data'},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        assert state['incident_id'] == 'inc-123'
        assert state['evidence_bundle'] == {'test': 'data'}
        assert state['execution_id'] == 'exec-456'
        assert state['thread_id'] == 'thread-789'
        assert state['budget']['limit'] == 10.0
        assert state['budget']['spent'] == 0.0
        assert state['budget']['remaining'] == 10.0
        assert state['budget']['exceeded'] is False
        assert state['retries'] == {}
        assert state['checkpoint_node'] == 'START'
        assert state['errors'] == []
    
    def test_sets_timestamps(self):
        """Should set start_time and checkpoint_timestamp"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        assert 'start_time' in state
        assert 'checkpoint_timestamp' in state
        assert state['start_time'].endswith('Z')
        assert state['checkpoint_timestamp'].endswith('Z')
    
    def test_initializes_agent_outputs_as_none(self):
        """Should initialize all agent outputs as None"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        assert state['signal_intelligence'] is None
        assert state['historical_pattern'] is None
        assert state['change_intelligence'] is None
        assert state['risk_blast_radius'] is None
        assert state['knowledge_rag'] is None
        assert state['response_strategy'] is None
        assert state['consensus'] is None


class TestUpdateBudget:
    """Tests for update_budget function"""
    
    def test_updates_budget_correctly(self):
        """Should update budget spent, remaining, and exceeded"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        updated = update_budget(state, 3.5)
        
        assert updated['budget']['spent'] == 3.5
        assert updated['budget']['remaining'] == 6.5
        assert updated['budget']['exceeded'] is False
    
    def test_marks_exceeded_when_over_limit(self):
        """Should mark budget as exceeded when spent >= limit"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        updated = update_budget(state, 10.5)
        
        assert updated['budget']['spent'] == 10.5
        assert updated['budget']['remaining'] == -0.5
        assert updated['budget']['exceeded'] is True
    
    def test_accumulates_costs(self):
        """Should accumulate costs across multiple updates"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        state = update_budget(state, 2.0)
        state = update_budget(state, 3.0)
        state = update_budget(state, 1.5)
        
        assert state['budget']['spent'] == 6.5
        assert state['budget']['remaining'] == 3.5
        assert state['budget']['exceeded'] is False


class TestIncrementRetry:
    """Tests for increment_retry function"""
    
    def test_increments_retry_count(self):
        """Should increment retry count for agent"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        updated = increment_retry(state, 'signal-intelligence')
        
        assert updated['retries']['signal-intelligence'] == 1
    
    def test_increments_multiple_times(self):
        """Should increment retry count multiple times"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        state = increment_retry(state, 'signal-intelligence')
        state = increment_retry(state, 'signal-intelligence')
        state = increment_retry(state, 'signal-intelligence')
        
        assert state['retries']['signal-intelligence'] == 3
    
    def test_tracks_multiple_agents(self):
        """Should track retry counts for multiple agents"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        state = increment_retry(state, 'signal-intelligence')
        state = increment_retry(state, 'historical-pattern')
        state = increment_retry(state, 'signal-intelligence')
        
        assert state['retries']['signal-intelligence'] == 2
        assert state['retries']['historical-pattern'] == 1


class TestAddError:
    """Tests for add_error function"""
    
    def test_adds_error_to_state(self):
        """Should add error to state"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        updated = add_error(state, 'signal-intelligence', 'Test error')
        
        assert len(updated['errors']) == 1
        assert updated['errors'][0]['agent_id'] == 'signal-intelligence'
        assert updated['errors'][0]['error_message'] == 'Test error'
        assert 'timestamp' in updated['errors'][0]
    
    def test_accumulates_errors(self):
        """Should accumulate multiple errors"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        state = add_error(state, 'signal-intelligence', 'Error 1')
        state = add_error(state, 'historical-pattern', 'Error 2')
        state = add_error(state, 'signal-intelligence', 'Error 3')
        
        assert len(state['errors']) == 3
        assert state['errors'][0]['agent_id'] == 'signal-intelligence'
        assert state['errors'][1]['agent_id'] == 'historical-pattern'
        assert state['errors'][2]['agent_id'] == 'signal-intelligence'


class TestUpdateCheckpoint:
    """Tests for update_checkpoint function"""
    
    def test_updates_checkpoint_node(self):
        """Should update checkpoint node and timestamp"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        updated = update_checkpoint(state, 'signal_intelligence')
        
        assert updated['checkpoint_node'] == 'signal_intelligence'
        assert 'checkpoint_timestamp' in updated
        assert updated['checkpoint_timestamp'].endswith('Z')
    
    def test_updates_timestamp_on_each_call(self):
        """Should update timestamp on each checkpoint update"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        first_timestamp = state['checkpoint_timestamp']
        
        import time
        time.sleep(0.01)  # Small delay to ensure different timestamp
        
        updated = update_checkpoint(state, 'signal_intelligence')
        
        assert updated['checkpoint_timestamp'] != first_timestamp


class TestStateImmutability:
    """Tests for state immutability"""
    
    def test_update_budget_does_not_mutate_original(self):
        """Should not mutate original state"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        original_spent = state['budget']['spent']
        updated = update_budget(state, 5.0)
        
        assert state['budget']['spent'] == original_spent
        assert updated['budget']['spent'] == 5.0
    
    def test_increment_retry_does_not_mutate_original(self):
        """Should not mutate original state"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        updated = increment_retry(state, 'signal-intelligence')
        
        assert state['retries'] == {}
        assert updated['retries']['signal-intelligence'] == 1
    
    def test_add_error_does_not_mutate_original(self):
        """Should not mutate original state"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        updated = add_error(state, 'signal-intelligence', 'Test error')
        
        assert state['errors'] == []
        assert len(updated['errors']) == 1
