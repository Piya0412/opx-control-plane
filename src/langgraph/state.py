"""
LangGraph State Schema.

This module defines the canonical state schema for LangGraph orchestration,
including all dataclasses for agent inputs, outputs, and graph state.

CRITICAL RULES:
1. All types must be JSON-serializable (for checkpointing)
2. No mutable objects in state (functional updates only)
3. Single source of truth for budget (budget_remaining in GraphState)
4. No 'any' types (use explicit JSONValue bounds)
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, TypedDict
from typing_extensions import NotRequired


# ============================================================================
# JSON-SAFE TYPE BOUNDS
# ============================================================================

# Scalar types that are JSON-serializable
JSONScalar = str | int | float | bool | None

# Recursive JSON value type (no 'any')
JSONValue = JSONScalar | List["JSONValue"] | Dict[str, "JSONValue"]


# ============================================================================
# AGENT INPUT
# ============================================================================

@dataclass(frozen=True)
class AgentInput:
    """
    Canonical agent input envelope.
    
    IMMUTABLE - Never changes during graph execution.
    Frozen at entry node, passed to all agents.
    
    Fields:
        incident_id: Immutable incident identifier
        evidence_bundle: Frozen snapshot at invocation time
        timestamp: ISO-8601, for replay determinism
        execution_id: Unique per graph execution
        session_id: LangGraph session identifier
        context: Optional agent-specific context
        replay_metadata: Replay metadata (isReplay, originalTimestamp, etc.)
    """
    incident_id: str
    evidence_bundle: Dict[str, JSONValue]
    timestamp: str  # ISO-8601
    execution_id: str
    session_id: str
    context: Optional[Dict[str, JSONValue]] = None
    replay_metadata: Optional[Dict[str, JSONValue]] = None


# ============================================================================
# AGENT OUTPUT
# ============================================================================

@dataclass(frozen=True)
class AgentOutput:
    """
    Canonical agent output envelope.
    
    IMMUTABLE - Created once by agent node, never modified.
    
    Fields:
        agent_id: Agent identifier (e.g., "signal-intelligence")
        agent_version: Semantic version (e.g., "1.0.0")
        execution_id: Matches input.execution_id
        timestamp: ISO-8601, when agent completed
        duration: Execution time in milliseconds
        status: SUCCESS | PARTIAL | TIMEOUT | FAILURE
        confidence: 0.0 - 1.0, normalized
        reasoning: Human-readable explanation
        disclaimer: Must include "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
        findings: Agent-specific findings (structured data)
        citations: Optional citations and sources
        cost: Cost metadata (inputTokens, outputTokens, estimatedCost, model)
        error: Optional error details (if status != SUCCESS)
        replay_metadata: Deterministic hash and schema version
    """
    agent_id: str
    agent_version: str
    execution_id: str
    timestamp: str
    duration: int  # Milliseconds
    status: str  # SUCCESS | PARTIAL | TIMEOUT | FAILURE
    confidence: float  # 0.0 - 1.0
    reasoning: str
    disclaimer: str
    findings: Dict[str, JSONValue]
    citations: Optional[List[Dict[str, JSONValue]]]
    cost: Dict[str, JSONValue]
    error: Optional[Dict[str, JSONValue]]
    replay_metadata: Dict[str, JSONValue]


# ============================================================================
# CONSENSUS RESULT
# ============================================================================

@dataclass(frozen=True)
class ConsensusResult:
    """
    Consensus node output.
    
    IMMUTABLE - Pure computation result from consensus_node.
    
    Fields:
        aggregated_confidence: Weighted average of all agent confidences
        agreement_level: 0.0 - 1.0, measures consensus
        conflicts_detected: List of detected conflicts
        unified_recommendation: Synthesized recommendation
        minority_opinions: Dissenting opinions
        quality_metrics: Data completeness, citation quality, reasoning coherence
        timestamp: ISO-8601, when consensus computed
    """
    aggregated_confidence: float
    agreement_level: float
    conflicts_detected: List[Dict[str, JSONValue]]
    unified_recommendation: str
    minority_opinions: List[str]
    quality_metrics: Dict[str, float]
    timestamp: str


# ============================================================================
# COST GUARDIAN RESULT
# ============================================================================

@dataclass(frozen=True)
class CostGuardianResult:
    """
    Cost guardian node output.
    
    IMMUTABLE - Pure computation result from cost_guardian_node.
    
    Fields:
        total_cost: USD, sum of all agent costs
        budget_remaining: USD, after this incident
        budget_exceeded: Signal only (does NOT throw)
        per_agent_cost: Cost breakdown per agent
        projections: Monthly burn and incidents remaining
        timestamp: ISO-8601, when cost computed
    """
    total_cost: float
    budget_remaining: float
    budget_exceeded: bool
    per_agent_cost: Dict[str, Dict[str, JSONValue]]
    projections: Dict[str, JSONValue]
    timestamp: str


# ============================================================================
# STRUCTURED ERROR
# ============================================================================

@dataclass(frozen=True)
class StructuredError:
    """
    Structured error for failure tracking.
    
    IMMUTABLE - Created once, never modified.
    
    Fields:
        agent_id: Agent that failed
        error_code: Canonical error code (e.g., "BEDROCK_THROTTLING")
        message: Human-readable error message
        retryable: Can this be retried?
        timestamp: ISO-8601, when error occurred
        retry_attempt: Current retry attempt (0-based)
        details: Optional additional context
    """
    agent_id: str
    error_code: str
    message: str
    retryable: bool
    timestamp: str
    retry_attempt: int
    details: Optional[Dict[str, JSONValue]]


# ============================================================================
# EXECUTION TRACE ENTRY
# ============================================================================

@dataclass(frozen=True)
class ExecutionTraceEntry:
    """
    Execution trace entry for audit trail.
    
    IMMUTABLE - Created once, never modified.
    
    Fields:
        node_id: Node identifier (e.g., "signal-intelligence")
        timestamp: ISO-8601, when event occurred
        duration_ms: Execution duration in milliseconds
        status: STARTED | COMPLETED | FAILED | RETRYING
        metadata: Optional metadata (confidence, error_code, etc.)
    """
    node_id: str
    timestamp: str
    duration_ms: int
    status: str  # STARTED | COMPLETED | FAILED | RETRYING
    metadata: Optional[Dict[str, JSONValue]]


# ============================================================================
# GRAPH STATE
# ============================================================================

class GraphState(TypedDict):
    """
    LangGraph state schema.
    
    CRITICAL RULES:
    1. All fields must be JSON-serializable (for checkpointing)
    2. No mutable objects may be stored inside GraphState fields
    3. Single source of truth for budget (budget_remaining only)
    4. Functional updates only (return new state copy, never mutate)
    
    Fields:
        agent_input: Frozen agent input (immutable)
        hypotheses: Agent outputs (additive only, key = agent_id)
        consensus: Consensus result (set by consensus node)
        cost_guardian: Cost guardian result (set by cost guardian node)
        budget_remaining: USD, single source of truth
        retry_count: Retry count per agent (key = agent_id)
        execution_trace: Audit trail (additive only)
        errors: All errors encountered (additive only)
        session_id: LangGraph session identifier
        start_timestamp: ISO-8601, for replay
    """
    
    # ========================================================================
    # AGENT INPUT (IMMUTABLE)
    # ========================================================================
    agent_input: AgentInput
    
    # ========================================================================
    # AGENT OUTPUTS (ADDITIVE ONLY)
    # ========================================================================
    hypotheses: Dict[str, AgentOutput]  # Key = agent_id
    
    # ========================================================================
    # CONSENSUS & COST (DETERMINISTIC NODES)
    # ========================================================================
    consensus: NotRequired[ConsensusResult]
    cost_guardian: NotRequired[CostGuardianResult]
    
    # ========================================================================
    # EXECUTION METADATA
    # ========================================================================
    budget_remaining: float  # USD, single source of truth
    retry_count: Dict[str, int]  # Key = agent_id
    execution_trace: List[ExecutionTraceEntry]
    
    # ========================================================================
    # ERROR TRACKING
    # ========================================================================
    errors: List[StructuredError]
    
    # ========================================================================
    # REPLAY METADATA
    # ========================================================================
    session_id: str
    start_timestamp: str  # ISO-8601


# ============================================================================
# STATE FACTORY
# ============================================================================

def create_initial_state(
    incident_id: str,
    evidence_bundle: Dict[str, JSONValue],
    budget_remaining: float,
    session_id: str,
    execution_id: str,
    timestamp: str,
    context: Optional[Dict[str, JSONValue]] = None,
    replay_metadata: Optional[Dict[str, JSONValue]] = None
) -> GraphState:
    """
    Create initial GraphState from external input.
    
    Args:
        incident_id: Incident identifier
        evidence_bundle: Evidence bundle snapshot
        budget_remaining: Budget in USD
        session_id: LangGraph session identifier
        execution_id: Unique execution identifier
        timestamp: ISO-8601 timestamp
        context: Optional agent context
        replay_metadata: Optional replay metadata
    
    Returns:
        Initial GraphState with empty hypotheses and traces
    """
    agent_input = AgentInput(
        incident_id=incident_id,
        evidence_bundle=evidence_bundle,
        timestamp=timestamp,
        execution_id=execution_id,
        session_id=session_id,
        context=context,
        replay_metadata=replay_metadata,
    )
    
    return GraphState(
        agent_input=agent_input,
        hypotheses={},
        budget_remaining=budget_remaining,
        retry_count={},
        execution_trace=[],
        errors=[],
        session_id=session_id,
        start_timestamp=timestamp,
    )
