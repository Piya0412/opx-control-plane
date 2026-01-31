"""
LangGraph Graph Definition and Wiring.

This module defines the canonical LangGraph DAG with linear topology,
entry/terminal nodes, and deterministic execution order.

CRITICAL RULES:
1. Linear topology only (no branching, no conditional edges)
2. Fixed execution order (same input → same path)
3. Functional state updates (no mutation)
4. Checkpointing after each node
5. Replay-safe (deterministic execution)
"""

import os
from datetime import datetime
from typing import Dict

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import (
    GraphState,
    AgentInput,
    ExecutionTraceEntry,
    JSONValue,
    create_initial_state,
)
from agent_node import create_agent_node
from consensus_node import consensus_node
from cost_guardian_node import cost_guardian_node
from checkpointing import create_dynamodb_checkpointer


# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

def validate_entry_input(external_input: Dict[str, JSONValue]) -> None:
    """
    Validate external input before creating GraphState.
    
    Checks:
    1. incident_id is non-empty string
    2. evidence_bundle is non-empty dict
    3. budget_remaining >= 0.0
    4. session_id is non-empty string
    
    Args:
        external_input: EventBridge event payload
    
    Raises:
        ValueError: If validation fails
    """
    if not external_input.get("incident_id"):
        raise ValueError("incident_id is required")
    
    if not isinstance(external_input.get("incident_id"), str):
        raise ValueError("incident_id must be a string")
    
    if not external_input.get("evidence_bundle"):
        raise ValueError("evidence_bundle is required")
    
    if not isinstance(external_input.get("evidence_bundle"), dict):
        raise ValueError("evidence_bundle must be a dict")
    
    budget = external_input.get("budget_remaining", 0.0)
    if not isinstance(budget, (int, float)) or budget < 0.0:
        raise ValueError("budget_remaining must be >= 0.0")
    
    if not external_input.get("session_id"):
        raise ValueError("session_id is required")
    
    if not isinstance(external_input.get("session_id"), str):
        raise ValueError("session_id must be a string")


def validate_terminal_state(state: GraphState) -> None:
    """
    Validate GraphState before extracting output.
    
    Checks:
    1. All 6 Bedrock agents have outputs (or failures)
    2. Consensus result exists
    3. Cost guardian result exists
    
    Args:
        state: Final GraphState
    
    Raises:
        ValueError: If validation fails
    """
    required_agents = [
        "signal-intelligence",
        "historical-pattern",
        "change-intelligence",
        "risk-blast-radius",
        "knowledge-rag",
        "response-strategy",
    ]
    
    for agent_id in required_agents:
        if agent_id not in state["hypotheses"]:
            raise ValueError(f"Missing output for agent: {agent_id}")
    
    if "consensus" not in state:
        raise ValueError("Consensus result missing")
    
    if "cost_guardian" not in state:
        raise ValueError("Cost guardian result missing")


# ============================================================================
# ENTRY NODE
# ============================================================================

def entry_node(external_input: Dict[str, JSONValue]) -> GraphState:
    """
    Create initial GraphState from external input.
    
    This function transforms external EventBridge input into the initial
    GraphState that can be passed to graph.invoke().
    
    Args:
        external_input: EventBridge event payload with:
            - incident_id: str
            - evidence_bundle: dict
            - budget_remaining: float
            - session_id: str
            - execution_id: str (optional, generated if missing)
            - timestamp: str (optional, generated if missing)
            - context: dict (optional)
            - replay_metadata: dict (optional)
    
    Returns:
        Initial GraphState with:
            - agent_input: Frozen AgentInput
            - hypotheses: {} (empty)
            - consensus: None
            - cost_guardian: None
            - budget_remaining: float
            - retry_count: {}
            - execution_trace: [ENTRY trace]
            - errors: []
            - session_id: str
            - start_timestamp: str
    
    Raises:
        ValueError: If validation fails
    """
    # Validate input
    validate_entry_input(external_input)
    
    # Extract fields
    incident_id = external_input["incident_id"]
    evidence_bundle = external_input["evidence_bundle"]
    budget_remaining = external_input.get("budget_remaining", 0.0)
    session_id = external_input["session_id"]
    
    # Generate execution_id if missing
    execution_id = external_input.get("execution_id")
    if not execution_id:
        execution_id = f"exec-{incident_id}-{datetime.utcnow().timestamp()}"
    
    # Generate timestamp if missing
    timestamp = external_input.get("timestamp")
    if not timestamp:
        timestamp = datetime.utcnow().isoformat()
    
    # Optional fields
    context = external_input.get("context")
    replay_metadata = external_input.get("replay_metadata")
    
    # Create initial state
    initial_state = create_initial_state(
        incident_id=incident_id,
        evidence_bundle=evidence_bundle,
        budget_remaining=budget_remaining,
        session_id=session_id,
        execution_id=execution_id,
        timestamp=timestamp,
        context=context,
        replay_metadata=replay_metadata,
    )
    
    # Add ENTRY trace
    entry_trace = ExecutionTraceEntry(
        node_id="ENTRY",
        timestamp=datetime.utcnow().isoformat(),
        duration_ms=0,
        status="COMPLETED",
        metadata={
            "incident_id": incident_id,
            "budget_remaining": budget_remaining,
        },
    )
    
    # Functional update
    new_state = initial_state.copy()
    new_state["execution_trace"] = [entry_trace]
    
    return new_state


# ============================================================================
# TERMINAL NODE
# ============================================================================

def terminal_node(state: GraphState) -> Dict[str, JSONValue]:
    """
    Extract final output from GraphState.
    
    This is the terminal node for the LangGraph DAG. It validates the final
    state and extracts a formatted output for storage.
    
    Args:
        state: Final GraphState with all agent outputs, consensus, and cost
    
    Returns:
        Formatted output dict with:
            - incident_id: str
            - recommendation: dict (unified, confidence, agreement_level)
            - agent_outputs: dict (all agent outputs)
            - cost: dict (total, budget_remaining, exceeded, per_agent)
            - execution_summary: dict (duration_ms, agents_succeeded, etc.)
            - timestamp: str
    
    Raises:
        ValueError: If validation fails
    """
    # Validate state
    validate_terminal_state(state)
    
    # Extract fields
    agent_input = state["agent_input"]
    hypotheses = state["hypotheses"]
    consensus = state["consensus"]
    cost_guardian = state["cost_guardian"]
    execution_trace = state["execution_trace"]
    errors = state["errors"]
    
    # Compute execution summary
    start_time = datetime.fromisoformat(state["start_timestamp"])
    end_time = datetime.utcnow()
    duration_ms = int((end_time - start_time).total_seconds() * 1000)
    
    agents_succeeded = sum(
        1 for output in hypotheses.values()
        if output.status == "SUCCESS"
    )
    
    agents_failed = sum(
        1 for output in hypotheses.values()
        if output.status == "FAILURE"
    )
    
    total_retries = sum(state["retry_count"].values())
    
    # Format output
    output = {
        "incident_id": agent_input.incident_id,
        "recommendation": {
            "unified": consensus.unified_recommendation,
            "confidence": consensus.aggregated_confidence,
            "agreement_level": consensus.agreement_level,
            "conflicts_detected": len(consensus.conflicts_detected),
            "minority_opinions": consensus.minority_opinions,
        },
        "agent_outputs": {
            agent_id: {
                "agent_id": output.agent_id,
                "agent_version": output.agent_version,
                "status": output.status,
                "confidence": output.confidence,
                "findings": output.findings,
                "reasoning": output.reasoning,
                "citations": output.citations,
                "cost": output.cost,
                "error": output.error,
                "replay_metadata": output.replay_metadata,
            }
            for agent_id, output in hypotheses.items()
        },
        "consensus": {
            "aggregated_confidence": consensus.aggregated_confidence,
            "agreement_level": consensus.agreement_level,
            "conflicts_detected": consensus.conflicts_detected,
            "unified_recommendation": consensus.unified_recommendation,
            "minority_opinions": consensus.minority_opinions,
            "quality_metrics": consensus.quality_metrics,
        },
        "cost": {
            "total": cost_guardian.total_cost,
            "budget_remaining": cost_guardian.budget_remaining,
            "exceeded": cost_guardian.budget_exceeded,
            "per_agent": cost_guardian.per_agent_cost,
            "projections": cost_guardian.projections,
        },
        "execution_summary": {
            "duration_ms": duration_ms,
            "agents_succeeded": agents_succeeded,
            "agents_failed": agents_failed,
            "total_retries": total_retries,
            "errors_count": len(errors),
        },
        "execution_trace": [
            {
                "node_id": entry.node_id,
                "timestamp": entry.timestamp,
                "duration_ms": entry.duration_ms,
                "status": entry.status,
                "metadata": entry.metadata,
            }
            for entry in execution_trace
        ],
        "errors": [
            {
                "agent_id": error.agent_id,
                "error_code": error.error_code,
                "message": error.message,
                "retryable": error.retryable,
                "timestamp": error.timestamp,
                "retry_attempt": error.retry_attempt,
            }
            for error in errors
        ],
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    return output


# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================

def create_graph() -> StateGraph:
    """
    Create and wire LangGraph DAG.
    
    Topology (LINEAR):
        signal-intelligence → historical-pattern → 
        change-intelligence → risk-blast-radius → knowledge-rag → 
        response-strategy → consensus-node → cost-guardian-node → TERMINAL → END
    
    Features:
        - Linear execution (no branching, no conditional edges)
        - Checkpointing after each node (MemorySaver)
        - Deterministic execution order
        - Entry and terminal validation
        - 9 edges total (one between each consecutive node)
    
    Returns:
        Compiled StateGraph with checkpointing
    
    Environment Variables Required:
        - SIGNAL_INTELLIGENCE_AGENT_ID
        - SIGNAL_INTELLIGENCE_ALIAS_ID
        - HISTORICAL_PATTERN_AGENT_ID
        - HISTORICAL_PATTERN_ALIAS_ID
        - CHANGE_INTELLIGENCE_AGENT_ID
        - CHANGE_INTELLIGENCE_ALIAS_ID
        - RISK_BLAST_RADIUS_AGENT_ID
        - RISK_BLAST_RADIUS_ALIAS_ID
        - KNOWLEDGE_RAG_AGENT_ID
        - KNOWLEDGE_RAG_ALIAS_ID
        - RESPONSE_STRATEGY_AGENT_ID
        - RESPONSE_STRATEGY_ALIAS_ID
    """
    # Create graph
    graph = StateGraph(GraphState)
    
    # ========================================================================
    # ADD NODES
    # ========================================================================
    
    # Bedrock Agent nodes (6)
    graph.add_node(
        "signal-intelligence",
        create_agent_node(
            agent_id="signal-intelligence",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("SIGNAL_INTELLIGENCE_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("SIGNAL_INTELLIGENCE_ALIAS_ID", ""),
        )
    )
    
    graph.add_node(
        "historical-pattern",
        create_agent_node(
            agent_id="historical-pattern",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("HISTORICAL_PATTERN_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("HISTORICAL_PATTERN_ALIAS_ID", ""),
        )
    )
    
    graph.add_node(
        "change-intelligence",
        create_agent_node(
            agent_id="change-intelligence",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("CHANGE_INTELLIGENCE_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("CHANGE_INTELLIGENCE_ALIAS_ID", ""),
        )
    )
    
    graph.add_node(
        "risk-blast-radius",
        create_agent_node(
            agent_id="risk-blast-radius",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("RISK_BLAST_RADIUS_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("RISK_BLAST_RADIUS_ALIAS_ID", ""),
        )
    )
    
    graph.add_node(
        "knowledge-rag",
        create_agent_node(
            agent_id="knowledge-rag",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("KNOWLEDGE_RAG_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("KNOWLEDGE_RAG_ALIAS_ID", ""),
        )
    )
    
    graph.add_node(
        "response-strategy",
        create_agent_node(
            agent_id="response-strategy",
            agent_version="1.0.0",
            bedrock_agent_id=os.environ.get("RESPONSE_STRATEGY_AGENT_ID", ""),
            bedrock_agent_alias_id=os.environ.get("RESPONSE_STRATEGY_ALIAS_ID", ""),
        )
    )
    
    # Deterministic nodes (2)
    # Note: Cannot use "consensus" or "cost_guardian" as node names (state key conflict)
    graph.add_node("consensus-node", consensus_node)
    graph.add_node("cost-guardian-node", cost_guardian_node)
    
    # Terminal node
    graph.add_node("TERMINAL", terminal_node)
    
    # ========================================================================
    # ADD EDGES (LINEAR - 8 EDGES TOTAL)
    # ========================================================================
    
    # Set entry point (first agent node)
    graph.set_entry_point("signal-intelligence")
    
    # Linear edges (no branching, no conditional edges)
    graph.add_edge("signal-intelligence", "historical-pattern")
    graph.add_edge("historical-pattern", "change-intelligence")
    graph.add_edge("change-intelligence", "risk-blast-radius")
    graph.add_edge("risk-blast-radius", "knowledge-rag")
    graph.add_edge("knowledge-rag", "response-strategy")
    graph.add_edge("response-strategy", "consensus-node")
    graph.add_edge("consensus-node", "cost-guardian-node")
    graph.add_edge("cost-guardian-node", "TERMINAL")
    
    # Terminal to END
    graph.add_edge("TERMINAL", END)
    
    # ========================================================================
    # COMPILE WITH CHECKPOINTING
    # ========================================================================
    
    # Create DynamoDB checkpointer (unconditional)
    checkpointer = create_dynamodb_checkpointer(
        table_name=os.environ.get('LANGGRAPH_CHECKPOINT_TABLE'),
        region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'),
    )
    
    # Compile graph
    compiled_graph = graph.compile(checkpointer=checkpointer)
    
    return compiled_graph


# ============================================================================
# GRAPH INSTANCE (SINGLETON)
# ============================================================================

# Create graph instance (compiled once, reused)
# This is the canonical graph for all executions
graph = create_graph()
