"""
Phase 6 Week 2: LangGraph Multi-Agent Orchestrator

This package implements the Bedrock + LangGraph multi-agent system.
"""

__version__ = "1.0.0"

# Public API
from state import (
    GraphState,
    AgentInput,
    AgentOutput,
    ConsensusResult,
    CostGuardianResult,
    StructuredError,
    ExecutionTraceEntry,
    JSONValue,
    JSONScalar,
    create_initial_state,
)

from graph import (
    create_graph,
    entry_node,
    terminal_node,
    validate_entry_input,
    validate_terminal_state,
    graph,
)

from agent_node import create_agent_node
from consensus_node import consensus_node
from cost_guardian_node import cost_guardian_node

__all__ = [
    # State types
    "GraphState",
    "AgentInput",
    "AgentOutput",
    "ConsensusResult",
    "CostGuardianResult",
    "StructuredError",
    "ExecutionTraceEntry",
    "JSONValue",
    "JSONScalar",
    "create_initial_state",
    
    # Graph functions
    "create_graph",
    "entry_node",
    "terminal_node",
    "validate_entry_input",
    "validate_terminal_state",
    "graph",
    
    # Node functions
    "create_agent_node",
    "consensus_node",
    "cost_guardian_node",
]
