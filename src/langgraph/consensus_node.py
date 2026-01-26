"""
Consensus Node for LangGraph Orchestration.

This module provides deterministic consensus aggregation across agent outputs
using pure mathematical computation (no LLM, no Bedrock).

CRITICAL RULES:
1. Pure math only (no boto3, no LLM calls)
2. Deterministic (no randomness)
3. Functional state updates (no mutation)
4. Single execution (no retries)
5. Structured outputs only (no free text reasoning)
"""

import time
from datetime import datetime
from typing import Dict, List, Tuple
from collections import defaultdict

from .state import (
    GraphState,
    AgentOutput,
    ConsensusResult,
    ExecutionTraceEntry,
    JSONValue,
)


# ============================================================================
# CONSTANTS
# ============================================================================

# Agent weights (historical performance)
AGENT_WEIGHTS = {
    "signal-intelligence": 1.0,      # Highest priority - direct evidence
    "historical-pattern": 0.9,       # Proven patterns
    "change-intelligence": 0.9,      # Temporal correlation
    "risk-blast-radius": 0.8,        # Impact estimation
    "knowledge-rag": 0.7,            # Document relevance
    "response-strategy": 0.6,        # Meta-analysis
}

# Conflict detection threshold
CONFIDENCE_DIVERGENCE_THRESHOLD = 0.3


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def aggregate_confidence(
    hypotheses: Dict[str, AgentOutput],
    agent_weights: Dict[str, float]
) -> float:
    """
    Compute weighted average confidence across all agents.
    
    Formula:
        aggregated_confidence = Σ(agent_confidence * agent_weight) / Σ(agent_weight)
    
    Args:
        hypotheses: All agent outputs with confidence scores
        agent_weights: Historical performance weights (0.0-1.0)
    
    Returns:
        Aggregated confidence (0.0-1.0)
    
    Edge Cases:
        - Agent failed (confidence = 0.0): Include with weight (signals failure)
        - No agents succeeded: Return 0.0
        - Single agent: Return that agent's confidence
    """
    if not hypotheses:
        return 0.0
    
    total_weighted_confidence = 0.0
    total_weight = 0.0
    
    for agent_id, output in hypotheses.items():
        weight = agent_weights.get(agent_id, 0.5)  # Default weight 0.5
        total_weighted_confidence += output.confidence * weight
        total_weight += weight
    
    if total_weight == 0.0:
        return 0.0
    
    return total_weighted_confidence / total_weight


def compute_max_possible_std_dev(n_agents: int) -> float:
    """
    Compute maximum possible standard deviation for N agents.
    
    For binary extremes (0.0 and 1.0), max std dev is always 0.5
    regardless of N (for N >= 2).
    
    Mathematical proof:
        For even split at 0.0 and 1.0:
        mean = 0.5
        variance = (N/2 * (0.0 - 0.5)^2 + N/2 * (1.0 - 0.5)^2) / N
                 = (N/2 * 0.25 + N/2 * 0.25) / N
                 = 0.25
        std_dev = sqrt(0.25) = 0.5
    
    Args:
        n_agents: Number of agents
    
    Returns:
        Maximum possible standard deviation
    """
    if n_agents < 2:
        return 0.0  # Single agent, no variance
    
    # For binary extremes, max std dev is always 0.5
    return 0.5


def compute_agreement_level(hypotheses: Dict[str, AgentOutput]) -> float:
    """
    Measure consensus across agents using confidence variance.
    
    Formula:
        agreement_level = 1.0 - (std_dev(confidences) / max_possible_std_dev)
    
    Interpretation:
        1.0 = Perfect agreement (all same confidence)
        0.5 = Moderate agreement
        0.0 = Maximum disagreement (confidences at extremes)
    
    Args:
        hypotheses: All agent outputs with confidence scores
    
    Returns:
        Agreement level (0.0-1.0), clamped to valid range
    
    Edge Cases:
        - Single agent: Return 1.0 (perfect agreement)
        - All agents same confidence: Return 1.0 (std_dev = 0)
        - All agents failed (confidence = 0.0): Return 1.0 (agreement on failure)
    """
    confidences = [output.confidence for output in hypotheses.values()]
    
    # Edge case: Single agent
    if len(confidences) < 2:
        return 1.0
    
    # Calculate standard deviation
    mean_confidence = sum(confidences) / len(confidences)
    variance = sum((c - mean_confidence) ** 2 for c in confidences) / len(confidences)
    std_dev = variance ** 0.5
    
    # Edge case: All same confidence (std_dev = 0)
    if std_dev == 0.0:
        return 1.0
    
    # Compute max possible std dev
    max_std_dev = compute_max_possible_std_dev(len(confidences))
    
    # Compute agreement level
    agreement_level = 1.0 - (std_dev / max_std_dev)
    
    # Clamp to valid range [0.0, 1.0]
    return max(0.0, min(1.0, agreement_level))


def detect_conflicts(
    hypotheses: Dict[str, AgentOutput],
    confidence_threshold: float = CONFIDENCE_DIVERGENCE_THRESHOLD
) -> List[Dict[str, JSONValue]]:
    """
    Identify conflicting recommendations across agents.
    
    Conflict Criteria:
        1. Agents recommend different action types (INVESTIGATION vs ROLLBACK)
        2. Confidence difference > threshold (0.3)
    
    Args:
        hypotheses: All agent outputs
        confidence_threshold: Min confidence difference to flag conflict
    
    Returns:
        List of conflict dicts with agents, type, description, resolution
    
    Edge Cases:
        - No recommendations: No conflicts
        - All agents failed: No conflicts (agreement on failure)
        - Single agent: No conflicts
    """
    conflicts = []
    
    # Group recommendations by type
    recommendations_by_type = defaultdict(list)
    for agent_id, output in hypotheses.items():
        if output.status == "FAILURE":
            continue  # Skip failed agents
        
        # Extract recommendation types from findings
        findings = output.findings
        if "recommendations" in findings and isinstance(findings["recommendations"], list):
            for rec in findings["recommendations"]:
                if isinstance(rec, dict) and "type" in rec:
                    recommendations_by_type[rec["type"]].append((agent_id, output.confidence, rec))
    
    # Detect conflicts: different types with high confidence difference
    recommendation_types = list(recommendations_by_type.keys())
    for i, type1 in enumerate(recommendation_types):
        for type2 in recommendation_types[i+1:]:
            agents1 = recommendations_by_type[type1]
            agents2 = recommendations_by_type[type2]
            
            # Find highest confidence for each type
            max_conf1 = max((conf for _, conf, _ in agents1), default=0.0)
            max_conf2 = max((conf for _, conf, _ in agents2), default=0.0)
            
            confidence_diff = abs(max_conf1 - max_conf2)
            
            if confidence_diff > confidence_threshold:
                agent_id1 = next((aid for aid, conf, _ in agents1 if conf == max_conf1), "unknown")
                agent_id2 = next((aid for aid, conf, _ in agents2 if conf == max_conf2), "unknown")
                
                conflicts.append({
                    "agents": [agent_id1, agent_id2],
                    "conflict_type": "ACTION_TYPE_DIVERGENCE",
                    "description": f"{agent_id1} recommends {type1} ({max_conf1:.2f}), {agent_id2} recommends {type2} ({max_conf2:.2f})",
                    "resolution": f"Highest confidence wins: {agent_id1 if max_conf1 > max_conf2 else agent_id2} ({max(max_conf1, max_conf2):.2f})"
                })
    
    # Detect confidence divergence (same type, different confidence)
    for rec_type, agents in recommendations_by_type.items():
        if len(agents) < 2:
            continue
        
        confidences = [conf for _, conf, _ in agents]
        max_conf = max(confidences)
        min_conf = min(confidences)
        
        if max_conf - min_conf > confidence_threshold:
            max_agent = next((aid for aid, conf, _ in agents if conf == max_conf), "unknown")
            min_agent = next((aid for aid, conf, _ in agents if conf == min_conf), "unknown")
            
            conflicts.append({
                "agents": [max_agent, min_agent],
                "conflict_type": "CONFIDENCE_DIVERGENCE",
                "description": f"Confidence difference: {max_conf - min_conf:.2f} ({max_conf:.2f} vs {min_conf:.2f})",
                "resolution": f"Highest confidence wins: {max_agent} ({max_conf:.2f})"
            })
    
    return conflicts


def synthesize_unified_recommendation(
    hypotheses: Dict[str, AgentOutput],
    conflicts: List[Dict[str, JSONValue]]
) -> str:
    """
    Create unified recommendation from all agent outputs.
    
    Synthesis Rules:
        1. Group recommendations by type
        2. Sort by confidence (descending)
        3. Take highest confidence per type
        4. Note consensus level
    
    Args:
        hypotheses: All agent outputs
        conflicts: Detected conflicts
    
    Returns:
        Unified recommendation string (max 500 chars)
    
    Edge Cases:
        - All agents failed: "Insufficient data for recommendation"
        - No recommendations: "No actionable recommendations"
        - Single recommendation type: "Unanimous: <recommendation>"
    """
    # Check if all agents failed
    all_failed = all(output.status == "FAILURE" for output in hypotheses.values())
    if all_failed:
        return "Insufficient data for recommendation. All agents failed."
    
    # Extract recommendations
    recommendations_by_type = defaultdict(list)
    for agent_id, output in hypotheses.items():
        if output.status == "FAILURE":
            continue
        
        findings = output.findings
        if "recommendations" in findings and isinstance(findings["recommendations"], list):
            for rec in findings["recommendations"]:
                if isinstance(rec, dict) and "type" in rec and "description" in rec:
                    recommendations_by_type[rec["type"]].append((
                        agent_id,
                        output.confidence,
                        rec["description"]
                    ))
    
    if not recommendations_by_type:
        return "No actionable recommendations."
    
    # Build unified recommendation
    parts = []
    
    # Sort types by highest confidence
    sorted_types = sorted(
        recommendations_by_type.items(),
        key=lambda x: max(conf for _, conf, _ in x[1]),
        reverse=True
    )
    
    for i, (rec_type, recs) in enumerate(sorted_types[:2]):  # Top 2 types
        # Get highest confidence recommendation
        recs_sorted = sorted(recs, key=lambda x: x[1], reverse=True)
        agent_id, confidence, description = recs_sorted[0]
        
        # Count agreeing agents
        n_agree = len(recs)
        n_total = len([o for o in hypotheses.values() if o.status != "FAILURE"])
        
        label = "PRIMARY" if i == 0 else "ALTERNATIVE"
        parts.append(f"{label}: {description[:100]} (confidence: {confidence:.2f}, agents: {n_agree}/{n_total} agree)")
    
    # Add conflicts if any
    if conflicts:
        parts.append(f"CONFLICTS: {len(conflicts)} detected")
    else:
        parts.append("CONFLICTS: None detected")
    
    unified = ". ".join(parts)
    
    # Truncate to 500 chars
    if len(unified) > 500:
        unified = unified[:497] + "..."
    
    return unified


def extract_minority_opinions(
    hypotheses: Dict[str, AgentOutput],
    unified_recommendation: str
) -> List[str]:
    """
    Extract recommendations that differ from unified recommendation.
    
    Minority Criteria:
        - Recommendation type differs from primary
        - Confidence > 0.5 (not noise)
        - Not included in unified recommendation
    
    Args:
        hypotheses: All agent outputs
        unified_recommendation: Unified recommendation string
    
    Returns:
        List of minority opinion strings
    
    Edge Cases:
        - All agents agree: Empty list
        - All agents failed: Empty list
        - Single dissenting agent: Include if confidence > 0.5
    """
    minority_opinions = []
    
    for agent_id, output in hypotheses.items():
        if output.status == "FAILURE" or output.confidence <= 0.5:
            continue
        
        findings = output.findings
        if "recommendations" in findings and isinstance(findings["recommendations"], list):
            for rec in findings["recommendations"]:
                if isinstance(rec, dict) and "description" in rec:
                    description = rec["description"]
                    
                    # Check if this recommendation is in unified
                    if description[:50] not in unified_recommendation:
                        minority_opinions.append(
                            f"{agent_id} suggests {description[:100]} (confidence: {output.confidence:.2f})"
                        )
    
    return minority_opinions


def compute_quality_metrics(hypotheses: Dict[str, AgentOutput]) -> Dict[str, float]:
    """
    Assess overall quality of agent outputs.
    
    Metrics:
        - data_completeness: % of agents that returned SUCCESS status
        - citation_quality: % of agents with citations
        - reasoning_coherence: Agreement level
    
    Args:
        hypotheses: All agent outputs
    
    Returns:
        Quality metrics dict (all values 0.0-1.0)
    
    Edge Cases:
        - All agents failed: data_completeness = 0.0
        - No citations: citation_quality = 0.0
        - Single agent: All metrics based on that agent
    """
    if not hypotheses:
        return {
            "data_completeness": 0.0,
            "citation_quality": 0.0,
            "reasoning_coherence": 0.0,
        }
    
    total_agents = len(hypotheses)
    
    # Data completeness
    success_count = sum(1 for output in hypotheses.values() if output.status == "SUCCESS")
    data_completeness = success_count / total_agents if total_agents > 0 else 0.0
    
    # Citation quality
    citation_count = sum(
        1 for output in hypotheses.values()
        if output.citations and len(output.citations) > 0
    )
    citation_quality = citation_count / total_agents if total_agents > 0 else 0.0
    
    # Reasoning coherence (use agreement level)
    reasoning_coherence = compute_agreement_level(hypotheses)
    
    return {
        "data_completeness": data_completeness,
        "citation_quality": citation_quality,
        "reasoning_coherence": reasoning_coherence,
    }


def add_execution_trace(
    state: GraphState,
    node_id: str,
    duration_ms: int,
    status: str,
    metadata: Dict[str, JSONValue] = None
) -> GraphState:
    """
    Add execution trace entry.
    
    CRITICAL: Uses functional-style updates - returns new state copy.
    
    Args:
        state: Current graph state
        node_id: Node identifier
        duration_ms: Execution duration
        status: Execution status
        metadata: Optional metadata
    
    Returns:
        NEW state with trace entry (original state unchanged)
    """
    trace_entry = ExecutionTraceEntry(
        node_id=node_id,
        timestamp=datetime.utcnow().isoformat(),
        duration_ms=duration_ms,
        status=status,
        metadata=metadata or {},
    )
    
    # Functional-style update
    new_state = state.copy()
    new_state["execution_trace"] = state["execution_trace"] + [trace_entry]
    
    return new_state


# ============================================================================
# CONSENSUS NODE
# ============================================================================

def consensus_node(state: GraphState) -> GraphState:
    """
    LangGraph node for consensus and confidence aggregation.
    
    Pure deterministic computation (no LLM, no Bedrock).
    
    Args:
        state: Current graph state with agent hypotheses
    
    Returns:
        Updated graph state with consensus result (functional update)
    
    GUARANTEES:
    - Deterministic (same inputs → same outputs)
    - No LLM calls
    - No mutations
    - Single execution (no retries)
    """
    start_time = time.time()
    
    hypotheses = state["hypotheses"]
    agent_weights = AGENT_WEIGHTS
    
    # ========================================================================
    # STEP 1: AGGREGATE CONFIDENCE
    # ========================================================================
    aggregated_confidence = aggregate_confidence(hypotheses, agent_weights)
    
    # ========================================================================
    # STEP 2: COMPUTE AGREEMENT LEVEL
    # ========================================================================
    agreement_level = compute_agreement_level(hypotheses)
    
    # ========================================================================
    # STEP 3: DETECT CONFLICTS
    # ========================================================================
    conflicts = detect_conflicts(hypotheses)
    
    # ========================================================================
    # STEP 4: SYNTHESIZE UNIFIED RECOMMENDATION
    # ========================================================================
    unified_recommendation = synthesize_unified_recommendation(hypotheses, conflicts)
    
    # ========================================================================
    # STEP 5: EXTRACT MINORITY OPINIONS
    # ========================================================================
    minority_opinions = extract_minority_opinions(hypotheses, unified_recommendation)
    
    # ========================================================================
    # STEP 6: COMPUTE QUALITY METRICS
    # ========================================================================
    quality_metrics = compute_quality_metrics(hypotheses)
    
    # ========================================================================
    # STEP 7: CREATE CONSENSUS RESULT
    # ========================================================================
    duration_ms = int((time.time() - start_time) * 1000)
    
    consensus_result = ConsensusResult(
        aggregated_confidence=aggregated_confidence,
        agreement_level=agreement_level,
        conflicts_detected=conflicts,
        unified_recommendation=unified_recommendation,
        minority_opinions=minority_opinions,
        quality_metrics=quality_metrics,
        timestamp=datetime.utcnow().isoformat(),
    )
    
    # ========================================================================
    # STEP 8: UPDATE STATE (FUNCTIONAL)
    # ========================================================================
    new_state = state.copy()
    new_state["consensus"] = consensus_result
    new_state = add_execution_trace(
        new_state,
        "consensus",
        duration_ms,
        "COMPLETED",
        {
            "aggregated_confidence": aggregated_confidence,
            "agreement_level": agreement_level,
            "conflicts_count": len(conflicts),
        }
    )
    
    return new_state
