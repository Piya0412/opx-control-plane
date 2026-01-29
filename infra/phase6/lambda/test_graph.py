"""
Phase 6 Week 2: Graph Tests

Unit tests for LangGraph graph structure and execution.
"""

import pytest

from .graph import (
    budget_check_node,
    signal_intelligence_node,
    consensus_node,
    should_continue_after_budget_check,
    build_graph,
    create_graph_with_memory,
)
from .state import create_initial_state


class TestBudgetCheckNode:
    """Tests for budget_check_node"""
    
    def test_allows_execution_when_budget_ok(self):
        """Should allow execution when budget not exceeded"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        result = budget_check_node(state)
        
        assert result['checkpoint_node'] == 'budget_check'
        assert result['budget']['exceeded'] is False
    
    def test_signals_when_budget_exceeded(self):
        """Should signal when budget exceeded"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        # Manually set budget as exceeded
        state['budget']['exceeded'] = True
        
        result = budget_check_node(state)
        
        assert result['checkpoint_node'] == 'budget_exceeded'


class TestAgentNodes:
    """Tests for agent node stubs"""
    
    def test_signal_intelligence_node_returns_stub_output(self):
        """Should return stub output for signal intelligence"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        result = signal_intelligence_node(state)
        
        assert result['signal_intelligence'] is not None
        assert result['signal_intelligence']['agent_id'] == 'signal-intelligence'
        assert result['signal_intelligence']['confidence'] == 0.75
        assert result['checkpoint_node'] == 'signal_intelligence'
    
    def test_agent_nodes_update_checkpoint(self):
        """Should update checkpoint after execution"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        result = signal_intelligence_node(state)
        
        assert result['checkpoint_node'] == 'signal_intelligence'
        assert 'checkpoint_timestamp' in result


class TestConsensusNode:
    """Tests for consensus_node"""
    
    def test_aggregates_agent_outputs(self):
        """Should aggregate agent outputs into consensus"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        # Add some agent outputs
        state['signal_intelligence'] = {
            'agent_id': 'signal-intelligence',
            'confidence': 0.8,
        }
        state['historical_pattern'] = {
            'agent_id': 'historical-pattern',
            'confidence': 0.7,
        }
        
        result = consensus_node(state)
        
        assert result['consensus'] is not None
        assert result['consensus']['agents_agreeing'] == 2
        assert result['consensus']['confidence'] == 0.75  # Average of 0.8 and 0.7
    
    def test_handles_no_agent_outputs(self):
        """Should handle case with no agent outputs"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
        )
        
        result = consensus_node(state)
        
        assert result['checkpoint_node'] == 'consensus'


class TestConditionalRouting:
    """Tests for conditional routing functions"""
    
    def test_should_continue_returns_ok_when_budget_ok(self):
        """Should return 'ok' when budget not exceeded"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        result = should_continue_after_budget_check(state)
        
        assert result == "ok"
    
    def test_should_continue_returns_exceeded_when_budget_exceeded(self):
        """Should return 'exceeded' when budget exceeded"""
        state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        state['budget']['exceeded'] = True
        
        result = should_continue_after_budget_check(state)
        
        assert result == "exceeded"


class TestGraphBuilder:
    """Tests for graph builder"""
    
    def test_build_graph_creates_valid_graph(self):
        """Should create valid graph with all nodes"""
        graph = build_graph()
        
        assert graph is not None
    
    def test_create_graph_with_memory_includes_checkpointer(self):
        """Should create graph with memory checkpointer"""
        graph = create_graph_with_memory()
        
        assert graph is not None


class TestGraphExecution:
    """Integration tests for graph execution"""
    
    def test_executes_full_graph_with_budget_ok(self):
        """Should execute full graph when budget OK"""
        graph = create_graph_with_memory()
        
        initial_state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={'test': 'data'},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        config = {'configurable': {'thread_id': 'thread-789'}}
        
        # Execute graph
        result = graph.invoke(initial_state, config)
        
        # Should have executed all nodes
        assert result['checkpoint_node'] == 'cost_guardian'
        assert result['signal_intelligence'] is not None
        assert result['historical_pattern'] is not None
        assert result['change_intelligence'] is not None
        assert result['risk_blast_radius'] is not None
        assert result['knowledge_rag'] is not None
        assert result['response_strategy'] is not None
        assert result['consensus'] is not None
    
    def test_stops_execution_when_budget_exceeded(self):
        """Should stop execution when budget exceeded"""
        graph = create_graph_with_memory()
        
        initial_state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={'test': 'data'},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        # Set budget as exceeded
        initial_state['budget']['exceeded'] = True
        
        config = {'configurable': {'thread_id': 'thread-789'}}
        
        # Execute graph
        result = graph.invoke(initial_state, config)
        
        # Should have stopped at budget check
        assert result['checkpoint_node'] == 'budget_exceeded'
        assert result['signal_intelligence'] is None
    
    def test_maintains_state_across_nodes(self):
        """Should maintain state across node executions"""
        graph = create_graph_with_memory()
        
        initial_state = create_initial_state(
            incident_id='inc-123',
            evidence_bundle={'test': 'data'},
            execution_id='exec-456',
            thread_id='thread-789',
            budget_limit=10.0,
        )
        
        config = {'configurable': {'thread_id': 'thread-789'}}
        
        # Execute graph
        result = graph.invoke(initial_state, config)
        
        # Should maintain incident_id throughout
        assert result['incident_id'] == 'inc-123'
        assert result['execution_id'] == 'exec-456'
        assert result['thread_id'] == 'thread-789'
