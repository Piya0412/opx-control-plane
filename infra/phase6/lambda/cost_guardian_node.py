"""
Cost Guardian Node for LangGraph Orchestration.

This module provides deterministic cost tracking and budget monitoring
using pure arithmetic computation (no LLM, no Bedrock).

CRITICAL RULES:
1. Pure math only (no boto3, no LLM calls)
2. Deterministic (no randomness)
3. Functional state updates (no mutation)
4. Single execution (no retries)
5. Signal-only behavior (never throws, never blocks)
"""

import time
from datetime import datetime
from typing import Dict

from state import (
    GraphState,
    AgentOutput,
    CostGuardianResult,
    ExecutionTraceEntry,
    JSONValue,
)


# ============================================================================
# CONSTANTS
# ============================================================================

# Projection assumptions
INCIDENTS_PER_DAY = 10  # Average incidents per day (configurable)
DAYS_PER_MONTH = 30     # Days per month for projection


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def aggregate_per_agent_costs(
    hypotheses: Dict[str, AgentOutput]
) -> Dict[str, Dict[str, JSONValue]]:
    """
    Sum costs for each agent.
    
    Cost Breakdown:
        - inputTokens: Number of input tokens
        - outputTokens: Number of output tokens
        - cost: Estimated cost in USD
        - model: Model identifier
    
    Args:
        hypotheses: All agent outputs with cost metadata
    
    Returns:
        Per-agent cost breakdown
    
    Edge Cases:
        - Agent failed (pre-invocation): cost = 0.0
        - Agent failed (post-invocation): cost = partial or full
        - Agent succeeded: cost = full
    """
    per_agent_costs = {}
    
    for agent_id, output in hypotheses.items():
        cost_metadata = output.cost
        per_agent_costs[agent_id] = {
            "inputTokens": cost_metadata.get("inputTokens", 0),
            "outputTokens": cost_metadata.get("outputTokens", 0),
            "cost": cost_metadata.get("estimatedCost", 0.0),
            "model": cost_metadata.get("model", "N/A"),
        }
    
    return per_agent_costs


def calculate_total_cost(
    per_agent_costs: Dict[str, Dict[str, JSONValue]]
) -> float:
    """
    Sum all agent costs.
    
    Formula:
        total_cost = Σ(agent_cost)
    
    Args:
        per_agent_costs: Per-agent cost breakdown
    
    Returns:
        Total cost in USD (rounded to 6 decimals)
    
    Edge Cases:
        - All agents failed (pre-invocation): total_cost = 0.0
        - Some agents failed: total_cost = sum of successful + partial
        - All agents succeeded: total_cost = sum of all
    """
    total = sum(costs["cost"] for costs in per_agent_costs.values())
    return round(total, 6)  # 6 decimal places for determinism


def calculate_budget_remaining(
    budget_remaining_before: float,
    total_cost: float
) -> float:
    """
    Calculate remaining budget after this incident.
    
    Formula:
        budget_remaining_after = budget_remaining_before - total_cost
    
    Args:
        budget_remaining_before: Budget before this incident (USD)
        total_cost: Total cost of this incident (USD)
    
    Returns:
        Budget remaining after this incident (USD, can be negative)
    
    Edge Cases:
        - budget_remaining_before < 0: Already over budget (continue calculation)
        - total_cost > budget_remaining_before: Goes negative (signal, not blocker)
        - total_cost = 0: Budget unchanged
    """
    return budget_remaining_before - total_cost


def check_budget_exceeded(
    total_cost: float,
    budget_remaining_before: float
) -> bool:
    """
    Check if this incident exceeded budget.
    
    CRITICAL: This is a SIGNAL only, NOT a blocker.
    
    Formula:
        budget_exceeded = total_cost > budget_remaining_before
    
    Args:
        total_cost: Total cost of this incident (USD)
        budget_remaining_before: Budget before this incident (USD)
    
    Returns:
        True if budget exceeded, False otherwise
    
    Edge Cases:
        - budget_remaining_before < 0: Already exceeded (return True)
        - total_cost = 0: Not exceeded (return False)
        - total_cost = budget_remaining_before: Not exceeded (return False)
    """
    # If budget already negative, it's exceeded
    if budget_remaining_before < 0:
        return True
    
    return total_cost > budget_remaining_before


def project_monthly_burn(
    total_cost: float,
    incidents_per_day: int = INCIDENTS_PER_DAY
) -> float:
    """
    Project monthly cost based on current incident cost.
    
    Formula:
        monthly_burn = total_cost * incidents_per_day * 30
    
    Assumptions:
        - Average 10 incidents per day (configurable)
        - 30 days per month
    
    Args:
        total_cost: Total cost of this incident (USD)
        incidents_per_day: Average incidents per day
    
    Returns:
        Projected monthly burn (USD)
    
    Edge Cases:
        - total_cost = 0: monthly_burn = 0
        - incidents_per_day = 0: monthly_burn = 0
    """
    return total_cost * incidents_per_day * DAYS_PER_MONTH


def estimate_incidents_remaining(
    budget_remaining_after: float,
    total_cost: float
) -> int:
    """
    Estimate how many incidents can be processed before budget exhaustion.
    
    Formula:
        incidents_remaining = floor(budget_remaining_after / avg_cost_per_incident)
        avg_cost_per_incident = total_cost (current incident as proxy)
    
    Args:
        budget_remaining_after: Budget after this incident (USD)
        total_cost: Total cost of this incident (USD, used as avg)
    
    Returns:
        Estimated incidents remaining (integer, >= 0)
    
    Edge Cases:
        - total_cost = 0: Cannot estimate (return 0)
        - budget_remaining_after < 0: Already exhausted (return 0)
        - budget_remaining_after = 0: Exhausted (return 0)
    """
    # Cannot estimate with zero cost
    if total_cost <= 0.0:
        return 0
    
    # Already exhausted
    if budget_remaining_after <= 0.0:
        return 0
    
    return int(budget_remaining_after / total_cost)


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
# COST GUARDIAN NODE
# ============================================================================

def cost_guardian_node(state: GraphState) -> GraphState:
    """
    LangGraph node for cost tracking and budget monitoring.
    
    Pure deterministic computation (no LLM, no Bedrock).
    
    Args:
        state: Current graph state with agent hypotheses
    
    Returns:
        Updated graph state with cost guardian result (functional update)
    
    GUARANTEES:
    - Deterministic (same inputs → same outputs)
    - No LLM calls
    - No mutations
    - Single execution (no retries)
    - Signal-only (never throws, never blocks)
    
    CRITICAL: Budget exceeded is a SIGNAL, not a BLOCKER.
    """
    start_time = time.time()
    
    hypotheses = state["hypotheses"]
    budget_remaining_before = state["budget_remaining"]
    
    # ========================================================================
    # STEP 1: AGGREGATE PER-AGENT COSTS
    # ========================================================================
    per_agent_costs = aggregate_per_agent_costs(hypotheses)
    
    # ========================================================================
    # STEP 2: CALCULATE TOTAL COST
    # ========================================================================
    total_cost = calculate_total_cost(per_agent_costs)
    
    # ========================================================================
    # STEP 3: CALCULATE BUDGET REMAINING
    # ========================================================================
    budget_remaining_after = calculate_budget_remaining(
        budget_remaining_before,
        total_cost
    )
    
    # ========================================================================
    # STEP 4: CHECK BUDGET EXCEEDED (SIGNAL ONLY)
    # ========================================================================
    budget_exceeded = check_budget_exceeded(total_cost, budget_remaining_before)
    
    # ========================================================================
    # STEP 5: PROJECT MONTHLY BURN
    # ========================================================================
    monthly_burn = project_monthly_burn(total_cost)
    
    # ========================================================================
    # STEP 6: ESTIMATE INCIDENTS REMAINING
    # ========================================================================
    incidents_remaining = estimate_incidents_remaining(
        budget_remaining_after,
        total_cost
    )
    
    # ========================================================================
    # STEP 7: CREATE COST GUARDIAN RESULT
    # ========================================================================
    duration_ms = int((time.time() - start_time) * 1000)
    
    cost_guardian_result = CostGuardianResult(
        total_cost=total_cost,
        budget_remaining=budget_remaining_after,
        budget_exceeded=budget_exceeded,
        per_agent_cost=per_agent_costs,
        projections={
            "monthlyBurn": monthly_burn,
            "incidentsRemaining": incidents_remaining,
        },
        timestamp=datetime.utcnow().isoformat(),
    )
    
    # ========================================================================
    # STEP 8: UPDATE STATE (FUNCTIONAL)
    # ========================================================================
    new_state = state.copy()
    new_state["cost_guardian"] = cost_guardian_result
    new_state["budget_remaining"] = budget_remaining_after  # Update budget
    new_state = add_execution_trace(
        new_state,
        "cost-guardian",
        duration_ms,
        "COMPLETED",
        {
            "total_cost": total_cost,
            "budget_remaining": budget_remaining_after,
            "budget_exceeded": budget_exceeded,
        }
    )
    
    return new_state
