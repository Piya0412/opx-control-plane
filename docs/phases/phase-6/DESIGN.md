# Phase 6: Bedrock + LangGraph Multi-Agent System

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-26  
**Version:** 1.0.0

---

## Overview

Phase 6 implements a production-grade Bedrock multi-agent system with LangGraph orchestration, demonstrating enterprise-level agent-to-agent reasoning, consensus building, and deterministic replay.

**Key Principle:** Intelligence advises. Control decides. Humans approve.

## Architecture

### Bedrock Agents (6 Total)

1. **Signal Intelligence Agent**
   - Analyzes signal patterns and anomalies
   - Correlates related signals
   - Identifies signal clusters

2. **Historical Pattern Agent**
   - Searches historical incidents
   - Identifies similar patterns
   - Provides precedent analysis

3. **Change Intelligence Agent**
   - Analyzes recent changes and deployments
   - Correlates changes with incidents
   - Identifies deployment risks

4. **Risk & Blast Radius Agent**
   - Assesses incident impact
   - Estimates blast radius
   - Identifies affected services

5. **Knowledge RAG Agent**
   - Retrieves runbooks from knowledge base
   - Searches postmortems
   - Provides citations

6. **Response Strategy Agent**
   - Recommends mitigation steps
   - Prioritizes actions
   - Builds consensus from other agents

### LangGraph Orchestration

**Executor Lambda:** `phase6-executor-lambda`

**Graph Structure:**
```
START
  ↓
Signal Intelligence (parallel)
Historical Pattern (parallel)
Change Intelligence (parallel)
Risk & Blast Radius (parallel)
Knowledge RAG (parallel)
  ↓
Response Strategy (consensus)
  ↓
Cost Guardian (budget check)
  ↓
END
```

**Features:**
- Parallel agent execution
- Consensus building
- Deterministic replay via checkpointing
- Cost tracking and budget enforcement
- Graceful degradation

### Checkpointing

**Purpose:** Enable deterministic replay and resume

**Implementation:**
- DynamoDB checkpoint store
- State saved after each node
- Replay from any checkpoint
- Resume from interruption

**Schema:**
```typescript
interface Checkpoint {
  checkpointId: string;
  executionId: string;
  nodeId: string;
  state: GraphState;
  timestamp: string;
  metadata: {
    cost: number;
    duration: number;
  };
}
```

### Cost Guardian

**Purpose:** Enforce budget limits

**Checks:**
- Per-execution budget
- Daily budget
- Monthly budget

**Behavior:**
- Warn at 80% budget
- Block at 100% budget
- Graceful degradation

## Agent Details

### Signal Intelligence Agent

**Action Group:** `analyze_signals`

**Functions:**
- `analyze_signal_patterns` - Identify patterns in signals
- `correlate_signals` - Find related signals
- `assess_signal_severity` - Evaluate severity distribution

**Prompt:** Analyzes signal patterns to identify anomalies and correlations

### Historical Pattern Agent

**Action Group:** `search_history`

**Functions:**
- `search_similar_incidents` - Find similar past incidents
- `get_incident_details` - Retrieve incident details
- `analyze_resolution_patterns` - Identify common resolutions

**Prompt:** Searches historical incidents for similar patterns and resolutions

### Change Intelligence Agent

**Action Group:** `analyze_changes`

**Functions:**
- `list_recent_changes` - Get recent deployments
- `correlate_change_with_incident` - Link changes to incidents
- `assess_change_risk` - Evaluate deployment risk

**Prompt:** Analyzes recent changes and correlates with incident timing

### Risk & Blast Radius Agent

**Action Group:** `assess_risk`

**Functions:**
- `estimate_blast_radius` - Calculate impact scope
- `identify_affected_services` - List impacted services
- `assess_business_impact` - Evaluate business risk

**Prompt:** Assesses incident impact and estimates blast radius

### Knowledge RAG Agent

**Action Group:** `retrieve_knowledge`

**Functions:**
- `search_runbooks` - Query runbook knowledge base
- `search_postmortems` - Query postmortem knowledge base
- `get_document_details` - Retrieve full document

**Prompt:** Retrieves relevant runbooks and postmortems with citations

**Knowledge Base:** Bedrock Knowledge Base (Phase 7)

### Response Strategy Agent

**Action Group:** `build_consensus`

**Functions:**
- `synthesize_recommendations` - Combine agent outputs
- `prioritize_actions` - Rank mitigation steps
- `build_response_plan` - Create structured response

**Prompt:** Synthesizes inputs from all agents into actionable recommendations

## LangGraph State

```typescript
interface GraphState {
  incidentId: string;
  signals: Signal[];
  agentOutputs: {
    signalIntelligence?: AgentOutput;
    historicalPattern?: AgentOutput;
    changeIntelligence?: AgentOutput;
    riskBlastRadius?: AgentOutput;
    knowledgeRAG?: AgentOutput;
    responseStrategy?: AgentOutput;
  };
  consensus: ConsensusOutput;
  cost: {
    total: number;
    byAgent: Record<string, number>;
  };
  metadata: {
    executionId: string;
    startTime: string;
    checkpoints: string[];
  };
}
```

## Implementation

### Agent Node Pattern

```python
async def agent_node(state: GraphState) -> GraphState:
    """Execute Bedrock agent and update state"""
    # 1. Prepare input
    agent_input = prepare_agent_input(state)
    
    # 2. Invoke Bedrock agent
    response = await invoke_bedrock_agent(
        agent_id=AGENT_ID,
        input_text=agent_input
    )
    
    # 3. Parse output
    output = parse_agent_output(response)
    
    # 4. Track cost
    cost = calculate_cost(response)
    
    # 5. Update state
    state.agentOutputs[agent_name] = output
    state.cost.byAgent[agent_name] = cost
    state.cost.total += cost
    
    return state
```

### Consensus Node

```python
async def consensus_node(state: GraphState) -> GraphState:
    """Build consensus from all agent outputs"""
    # 1. Collect all agent outputs
    outputs = state.agentOutputs
    
    # 2. Invoke Response Strategy agent
    consensus = await invoke_response_strategy_agent(outputs)
    
    # 3. Update state
    state.consensus = consensus
    
    return state
```

### Cost Guardian Node

```python
async def cost_guardian_node(state: GraphState) -> GraphState:
    """Check budget and enforce limits"""
    # 1. Check budget
    if state.cost.total > BUDGET_LIMIT:
        raise BudgetExceededError()
    
    # 2. Warn if approaching limit
    if state.cost.total > BUDGET_LIMIT * 0.8:
        logger.warning("Approaching budget limit")
    
    return state
```

## Observability

### Tracing

All agent invocations are traced (Phase 8.1):
- Prompt and response
- Cost and duration
- PII redaction
- 90-day retention

### Guardrails

Safety guardrails applied (Phase 8.2):
- PII blocking
- Content filtering
- Harmful content detection

### Validation

Output validation (Phase 8.3):
- Schema validation
- Business rule validation
- Semantic validation
- Automatic retry on failure

### Analytics

Token analytics tracked (Phase 8.4):
- Token usage by agent
- Cost by agent
- Budget tracking
- Cost optimization insights

## Testing

### Unit Tests
- Agent node execution: 30 tests
- Consensus building: 20 tests
- Cost tracking: 15 tests
- Checkpointing: 25 tests

### Integration Tests
- End-to-end graph execution: 15 tests
- Deterministic replay: 10 tests
- Resume from checkpoint: 8 tests
- Budget enforcement: 10 tests

### Smoke Tests
- All agents invocable: 6 tests
- Graph compilation: 1 test
- Checkpoint persistence: 5 tests

## Deployment

**Stack:** OpxPhase6Stack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 6 Bedrock agents
- 1 Lambda function (executor)
- 1 DynamoDB table (checkpoints)
- IAM roles and policies

## Cost

**Monthly:** ~$100-200
- Bedrock agent invocations: $80-150
- Lambda: $10-20
- DynamoDB: $5-10
- CloudWatch: $5-20

## Security

- IAM-only authentication
- Agent-to-agent via IAM roles
- No API keys or secrets
- PII redaction in traces
- Guardrails for safety

## Limitations

- **No execution authority** - Agents are advisory only
- **No state mutation** - Agents cannot modify incidents
- **No learning during execution** - No runtime model updates
- **Human approval required** - All recommendations require human review

---

**Last Updated:** 2026-01-31
