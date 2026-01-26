# Phase 6: LangGraph + Bedrock Multi-Agent Architecture

**Date:** January 25, 2026  
**Authority:** Principal Architect  
**Status:** 📋 DESIGN - AUTHORITATIVE  

---

## Executive Summary

This document defines the **authoritative architecture** for Phase 6: a production-grade Bedrock + LangGraph multi-agent system with 8+ specialized agents, stateful orchestration, agent-to-agent reasoning, and consensus mechanisms.

**This replaces the Lambda-per-agent prototype.**

---

## Architecture Principles

1. **LangGraph is the sole orchestrator** - No custom fan-out logic
2. **Bedrock Agents where applicable** - Use native constructs, not wrappers
3. **Stateful execution** - Checkpointing, replay, partial success
4. **Agent-to-agent reasoning** - Agents can communicate and reach consensus
5. **Fail-safe by default** - Graceful degradation, no cascading failures

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     EventBridge (IncidentCreated)               │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              LangGraph Orchestrator Lambda                      │
│              (Single Lambda, 2GB RAM, 180s timeout)             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  LangGraph State Machine                  │ │
│  │                                                           │ │
│  │  State: {                                                 │ │
│  │    incidentId: string                                     │ │
│  │    evidenceBundle: EvidenceBundle                         │ │
│  │    agentOutputs: Map<AgentId, AgentOutput>                │ │
│  │    consensus: ConsensusResult                             │ │
│  │    budgetStatus: BudgetStatus                             │ │
│  │    retryCount: Map<AgentId, number>                       │ │
│  │    executionPath: string[]                                │ │
│  │  }                                                         │ │
│  │                                                           │ │
│  │  Graph: (see detailed DAG below)                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Checkpointing: DynamoDB (opx-langgraph-state)                 │
│  Replay: Deterministic node execution                          │
│  Observability: X-Ray + CloudWatch                             │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Bedrock Agents (8+)                          │
│                                                                 │
│  Each agent:                                                    │
│  • Bedrock Agent resource (native construct)                   │
│  • Action groups (read-only operations)                        │
│  • IAM role (least privilege)                                  │
│  • Foundation model (Claude 3.5 Sonnet)                        │
│  • Prompt templates (versioned)                                │
│  • Output validation (Zod schemas)                             │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Data Stores                                  │
│  • opx-agent-recommendations (final output)                    │
│  • opx-agent-executions (execution logs)                       │
│  • opx-langgraph-state (checkpoints)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## LangGraph State Machine (Detailed DAG)

### State Schema

```typescript
interface LangGraphState {
  // Core context
  incidentId: string;
  evidenceBundle: EvidenceBundle;
  timestamp: string;
  
  // Agent outputs
  agentOutputs: {
    signalIntelligence?: AgentOutput;
    historicalPattern?: AgentOutput;
    changeIntelligence?: AgentOutput;
    riskBlastRadius?: AgentOutput;
    knowledgeRAG?: AgentOutput;
    responseStrategy?: AgentOutput;
    consensus?: ConsensusOutput;
    costGuardian?: BudgetStatus;
    reliabilityAuditor?: QualityAssessment;
  };
  
  // Execution metadata
  retryCount: Map<string, number>;
  executionPath: string[]; // For replay
  startTime: string;
  budgetRemaining: number;
  
  // Final output
  recommendation?: Recommendation;
  error?: Error;
}
```

### Graph Definition

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    incident_id: str
    evidence_bundle: dict
    agent_outputs: Annotated[dict, operator.add]
    retry_count: dict
    execution_path: Annotated[list, operator.add]
    budget_remaining: float
    recommendation: dict
    error: dict

# Create graph
workflow = StateGraph(AgentState)

# ============================================================
# NODES (Agents)
# ============================================================

# Budget check (entry point)
workflow.add_node("budget_check", budget_check_node)

# Core analysis agents (parallel)
workflow.add_node("signal_intelligence", signal_intelligence_agent)
workflow.add_node("historical_pattern", historical_pattern_agent)
workflow.add_node("change_intelligence", change_intelligence_agent)
workflow.add_node("risk_blast_radius", risk_blast_radius_agent)

# Knowledge agent (depends on core analysis)
workflow.add_node("knowledge_rag", knowledge_rag_agent)

# Strategy agent (depends on all analysis)
workflow.add_node("response_strategy", response_strategy_agent)

# Governance agents
workflow.add_node("consensus", consensus_agent)
workflow.add_node("cost_guardian", cost_guardian_agent)
workflow.add_node("reliability_auditor", reliability_auditor_agent)

# Error handling
workflow.add_node("handle_error", error_handler_node)

# ============================================================
# EDGES (Transitions)
# ============================================================

# Entry point
workflow.set_entry_point("budget_check")

# Budget check routing
workflow.add_conditional_edges(
    "budget_check",
    budget_check_router,
    {
        "proceed": "signal_intelligence",  # Start parallel execution
        "exceeded": "cost_guardian"        # Skip to cost guardian
    }
)

# Parallel execution (all 4 core agents start simultaneously)
workflow.add_edge("signal_intelligence", "knowledge_rag")
workflow.add_edge("historical_pattern", "knowledge_rag")
workflow.add_edge("change_intelligence", "knowledge_rag")
workflow.add_edge("risk_blast_radius", "knowledge_rag")

# Knowledge RAG waits for all 4 core agents
workflow.add_edge("knowledge_rag", "response_strategy")

# Response strategy waits for knowledge RAG
workflow.add_edge("response_strategy", "consensus")

# Consensus aggregates all agent outputs
workflow.add_edge("consensus", "reliability_auditor")

# Reliability auditor validates quality
workflow.add_conditional_edges(
    "reliability_auditor",
    quality_check_router,
    {
        "pass": "cost_guardian",
        "fail": "handle_error"
    }
)

# Cost guardian final check
workflow.add_edge("cost_guardian", END)

# Error handler
workflow.add_edge("handle_error", END)

# ============================================================
# RETRY LOGIC
# ============================================================

# Each node has built-in retry logic:
# - Max 3 retries per agent
# - Exponential backoff (1s, 2s, 4s)
# - Partial success handling (continue with available outputs)
# - Timeout fallback (return partial results)

# ============================================================
# CHECKPOINTING
# ============================================================

# State is checkpointed after each node execution
# Enables replay from any point
# Stored in DynamoDB (opx-langgraph-state)

# Compile graph
app = workflow.compile(
    checkpointer=DynamoDBCheckpointer(table_name="opx-langgraph-state")
)
```

### Execution Flow

```
START
  ↓
[Budget Check]
  ├─ (budget ok) ──→ [Parallel Analysis]
  └─ (budget exceeded) ──→ [Cost Guardian] ──→ END
  
[Parallel Analysis] (all execute simultaneously)
  ├─ [Signal Intelligence Agent]
  ├─ [Historical Pattern Agent]
  ├─ [Change Intelligence Agent]
  └─ [Risk & Blast Radius Agent]
  ↓ (all complete or timeout)
  
[Knowledge RAG Agent]
  ↓ (with context from all 4 core agents)
  
[Response Strategy Agent]
  ↓ (synthesizes all agent outputs)
  
[Consensus & Confidence Agent]
  ↓ (aggregates, resolves conflicts)
  
[Reliability Auditor Agent]
  ├─ (quality pass) ──→ [Cost Guardian] ──→ END
  └─ (quality fail) ──→ [Error Handler] ──→ END
```

---

## Agent Specifications

### 1. Signal Intelligence Agent

**Type:** Bedrock Agent with Action Groups  
**Purpose:** Analyze observability signals (metrics, logs, traces)

**Action Groups:**
- `query_metrics` - Read CloudWatch metrics (read-only)
- `search_logs` - Search CloudWatch Logs (read-only)
- `analyze_traces` - Query X-Ray traces (read-only)

**Input:**
```typescript
{
  incidentId: string;
  evidenceBundle: {
    signals: Signal[];
    timeWindow: { start: string; end: string };
  };
}
```

**Output:**
```typescript
{
  agentId: "signal-intelligence";
  confidence: number; // 0.0 - 1.0
  findings: {
    anomalies: Anomaly[];
    correlations: Correlation[];
    rootCauseHypothesis: string;
  };
  reasoning: string;
  citations: Citation[];
}
```

**Constraints:**
- Max execution time: 30s
- Read-only CloudWatch access
- No metric writes
- No alarm modifications

---

### 2. Historical Incident Pattern Agent

**Type:** Bedrock Agent with Action Groups  
**Purpose:** Find similar past incidents and resolutions

**Action Groups:**
- `search_incidents` - Query incident projections (read-only)
- `get_resolution_summary` - Fetch resolution details (read-only)

**Input:**
```typescript
{
  incidentId: string;
  classification: string;
  service: string;
  severity: string;
  signalPatterns: string[];
}
```

**Output:**
```typescript
{
  agentId: "historical-pattern";
  confidence: number;
  findings: {
    similarIncidents: SimilarIncident[];
    patterns: Pattern[];
    suggestedResolutions: Resolution[];
  };
  reasoning: string;
}
```

**Constraints:**
- Max execution time: 20s
- Read-only incident store access
- Minimum similarity threshold: 0.7

---

### 3. Change Intelligence Agent

**Type:** Bedrock Agent with Action Groups  
**Purpose:** Correlate incident with deployments and config changes

**Action Groups:**
- `query_deployments` - Fetch deployment history (read-only)
- `query_config_changes` - Fetch config changes (read-only)

**Input:**
```typescript
{
  incidentId: string;
  timeWindow: { start: string; end: string };
  affectedServices: string[];
}
```

**Output:**
```typescript
{
  agentId: "change-intelligence";
  confidence: number;
  findings: {
    recentChanges: Change[];
    correlationAnalysis: CorrelationAnalysis;
    rollbackRecommendation: RollbackRecommendation;
  };
  reasoning: string;
}
```

**Constraints:**
- Max execution time: 25s
- Read-only deployment store access
- Lookback window: 24 hours

---

### 4. Risk & Blast Radius Agent

**Type:** Bedrock Agent with Action Groups  
**Purpose:** Estimate incident impact and propagation risk

**Action Groups:**
- `query_service_graph` - Fetch dependency graph (read-only)
- `query_traffic_metrics` - Fetch traffic data (read-only)

**Input:**
```typescript
{
  incidentId: string;
  affectedService: string;
  evidenceBundle: EvidenceBundle;
}
```

**Output:**
```typescript
{
  agentId: "risk-blast-radius";
  confidence: number;
  findings: {
    blastRadius: BlastRadius;
    riskAssessment: RiskAssessment;
    mitigationPriority: MitigationAction[];
  };
  reasoning: string;
}
```

**Constraints:**
- Max execution time: 20s
- Read-only service graph access
- Conservative estimates (fail-safe)

---

### 5. Knowledge RAG Agent

**Type:** Bedrock Agent with Knowledge Base  
**Purpose:** Search runbooks, postmortems, documentation

**Knowledge Base:**
- Bedrock Knowledge Base (Phase 7)
- Vector embeddings (Titan Embeddings)
- Chunked documents with metadata

**Input:**
```typescript
{
  incidentId: string;
  context: {
    signalAnalysis: AgentOutput;
    historicalPatterns: AgentOutput;
    changeIntelligence: AgentOutput;
    riskAssessment: AgentOutput;
  };
}
```

**Output:**
```typescript
{
  agentId: "knowledge-rag";
  confidence: number;
  findings: {
    relevantDocuments: Document[];
    suggestedRunbooks: string[];
    relatedPostmortems: string[];
  };
  reasoning: string;
  citations: Citation[];
}
```

**Constraints:**
- Max execution time: 15s
- Read-only knowledge base access
- Minimum relevance score: 0.6

---

### 6. Response Strategy Agent

**Type:** Bedrock Agent (LLM-based synthesis)  
**Purpose:** Rank potential actions and estimate effectiveness

**Input:**
```typescript
{
  incidentId: string;
  allAgentOutputs: {
    signalIntelligence: AgentOutput;
    historicalPattern: AgentOutput;
    changeIntelligence: AgentOutput;
    riskBlastRadius: AgentOutput;
    knowledgeRAG: AgentOutput;
  };
}
```

**Output:**
```typescript
{
  agentId: "response-strategy";
  confidence: number;
  findings: {
    rankedOptions: RankedOption[];
    tradeoffAnalysis: TradeoffAnalysis;
    // NO execution plans
    // NO step-by-step instructions
    // ONLY rankings and comparisons
  };
  reasoning: string;
}
```

**Constraints:**
- Max execution time: 30s
- NO execution authority
- NO action plans
- ONLY rankings and recommendations

---

### 7. Consensus & Confidence Agent

**Type:** LangGraph Node (custom logic)  
**Purpose:** Aggregate agent outputs and resolve conflicts

**Logic:**
```python
def consensus_agent(state: AgentState) -> AgentState:
    outputs = state["agent_outputs"]
    
    # Aggregate confidence scores
    avg_confidence = mean([o.confidence for o in outputs.values()])
    
    # Detect conflicts
    conflicts = detect_conflicts(outputs)
    
    # Resolve conflicts (weighted by confidence)
    resolved = resolve_conflicts(conflicts, outputs)
    
    # Compute consensus
    consensus = {
        "confidence": avg_confidence,
        "agreement_level": compute_agreement(outputs),
        "conflicts_resolved": len(conflicts),
        "unified_recommendation": synthesize(resolved)
    }
    
    state["agent_outputs"]["consensus"] = consensus
    return state
```

**Output:**
```typescript
{
  agentId: "consensus";
  confidence: number; // Aggregated
  findings: {
    agreementLevel: number; // 0.0 - 1.0
    conflictsResolved: number;
    unifiedRecommendation: string;
    minorityOpinions: string[];
  };
  reasoning: string;
}
```

---

### 8. Cost & Budget Guardian Agent

**Type:** LangGraph Node (custom logic)  
**Purpose:** Track costs and enforce budget limits

**Logic:**
```python
def cost_guardian_agent(state: AgentState) -> AgentState:
    outputs = state["agent_outputs"]
    
    # Sum all agent costs
    total_cost = sum([o.cost.estimatedCost for o in outputs.values()])
    
    # Check budget
    budget_status = {
        "totalCost": total_cost,
        "budgetRemaining": state["budget_remaining"] - total_cost,
        "exceeded": total_cost > state["budget_remaining"],
        "perAgentCost": {k: v.cost for k, v in outputs.items()}
    }
    
    # Signal (do NOT throw)
    state["agent_outputs"]["cost_guardian"] = budget_status
    return state
```

**Output:**
```typescript
{
  agentId: "cost-guardian";
  findings: {
    totalCost: number; // USD
    budgetRemaining: number; // USD
    exceeded: boolean;
    perAgentCost: Map<AgentId, Cost>;
  };
}
```

---

### 9. Reliability / Hallucination Auditor Agent (Optional)

**Type:** Bedrock Agent (validation-focused)  
**Purpose:** Validate agent outputs for consistency and quality

**Logic:**
- Check for contradictions between agents
- Detect hallucinations (unsupported claims)
- Validate citations and references
- Flag low-quality responses

**Output:**
```typescript
{
  agentId: "reliability-auditor";
  confidence: number;
  findings: {
    qualityScore: number; // 0.0 - 1.0
    contradictions: Contradiction[];
    unsupportedClaims: string[];
    citationQuality: number;
  };
  reasoning: string;
}
```

---

## Retry and Fallback Strategies

### Per-Agent Retry Logic

```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception_type(BedrockException)
)
async def invoke_agent(agent_id: str, input: dict) -> dict:
    # Invoke Bedrock Agent
    response = await bedrock_agent_runtime.invoke_agent(
        agentId=agent_id,
        agentAliasId="PROD",
        sessionId=generate_session_id(),
        inputText=json.dumps(input)
    )
    return parse_agent_output(response)
```

### Timeout Handling

```python
async def execute_agent_with_timeout(
    agent_id: str,
    input: dict,
    timeout: int = 30
) -> dict:
    try:
        return await asyncio.wait_for(
            invoke_agent(agent_id, input),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        logger.warning(f"Agent {agent_id} timed out after {timeout}s")
        return {
            "agentId": agent_id,
            "error": "TIMEOUT",
            "confidence": 0.0,
            "findings": {}
        }
```

### Partial Success Handling

```python
async def execute_parallel_agents(
    agent_ids: list[str],
    input: dict
) -> dict:
    # Execute all agents in parallel
    tasks = [
        execute_agent_with_timeout(agent_id, input)
        for agent_id in agent_ids
    ]
    
    # Wait for all (or timeout)
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter successful results
    successful = [
        r for r in results
        if not isinstance(r, Exception) and r.get("error") is None
    ]
    
    # Continue with partial results
    logger.info(f"Completed {len(successful)}/{len(agent_ids)} agents")
    return {agent_id: result for agent_id, result in zip(agent_ids, successful)}
```

---

## Replay Determinism

### Checkpointing Strategy

```python
# After each node execution, checkpoint state
async def execute_node_with_checkpoint(
    node_name: str,
    state: AgentState,
    checkpointer: DynamoDBCheckpointer
) -> AgentState:
    # Execute node
    new_state = await node_function(state)
    
    # Checkpoint
    await checkpointer.save(
        incident_id=state["incident_id"],
        node_name=node_name,
        state=new_state,
        timestamp=datetime.utcnow().isoformat()
    )
    
    return new_state
```

### Replay from Checkpoint

```python
async def replay_from_checkpoint(
    incident_id: str,
    checkpoint_node: str,
    checkpointer: DynamoDBCheckpointer
) -> AgentState:
    # Load checkpoint
    state = await checkpointer.load(
        incident_id=incident_id,
        node_name=checkpoint_node
    )
    
    # Resume execution from next node
    return await workflow.invoke(
        state,
        config={"start_node": get_next_node(checkpoint_node)}
    )
```

### Deterministic Execution Order

- Nodes execute in deterministic order (defined by DAG)
- Parallel nodes have deterministic aggregation (sorted by agent ID)
- Timestamps are preserved from original execution
- Random seeds are fixed per incident

---

## Infrastructure

### LangGraph Orchestrator Lambda

```typescript
// infra/constructs/langgraph-orchestrator.ts

export class LangGraphOrchestrator extends Construct {
  public readonly function: lambda.Function;
  
  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    this.function = new lambda.Function(this, 'LangGraphFunction', {
      functionName: 'opx-langgraph-orchestrator',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'orchestrator.handler',
      code: lambda.Code.fromAsset('src/langgraph'),
      memorySize: 2048, // 2GB for LangGraph
      timeout: cdk.Duration.seconds(180), // 3 minutes
      environment: {
        BEDROCK_REGION: cdk.Stack.of(this).region,
        STATE_TABLE_NAME: 'opx-langgraph-state',
        RECOMMENDATIONS_TABLE_NAME: 'opx-agent-recommendations',
        EXECUTIONS_TABLE_NAME: 'opx-agent-executions',
      },
      tracing: lambda.Tracing.ACTIVE,
    });
  }
}
```

### Bedrock Agent Resources

```typescript
// infra/constructs/bedrock-agents.ts

export class BedrockAgents extends Construct {
  public readonly agents: Map<string, bedrock.CfnAgent>;
  
  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    this.agents = new Map();
    
    // Create 8+ Bedrock Agents
    const agentConfigs = [
      { id: 'signal-intelligence', actionGroups: ['query_metrics', 'search_logs'] },
      { id: 'historical-pattern', actionGroups: ['search_incidents'] },
      { id: 'change-intelligence', actionGroups: ['query_deployments'] },
      { id: 'risk-blast-radius', actionGroups: ['query_service_graph'] },
      { id: 'knowledge-rag', knowledgeBase: true },
      { id: 'response-strategy', actionGroups: [] },
      { id: 'reliability-auditor', actionGroups: [] },
    ];
    
    agentConfigs.forEach(config => {
      const agent = new bedrock.CfnAgent(this, `Agent-${config.id}`, {
        agentName: `opx-${config.id}`,
        foundationModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        instruction: loadPromptTemplate(config.id),
        actionGroups: config.actionGroups.map(ag => ({
          actionGroupName: ag,
          actionGroupExecutor: {
            lambda: createActionGroupLambda(ag)
          }
        })),
        // ... additional config
      });
      
      this.agents.set(config.id, agent);
    });
  }
}
```

---

## Observability

### CloudWatch Dashboard

- Agent execution duration (per agent)
- Agent success rate (per agent)
- Agent timeout rate (per agent)
- Agent cost (per agent, per incident)
- Consensus confidence (average)
- Budget utilization (%)
- Hallucination rate (%)

### X-Ray Tracing

- End-to-end trace (EventBridge → LangGraph → Bedrock Agents → DynamoDB)
- Per-agent trace segments
- Retry attempts visible
- Timeout events visible

### Cost Tracking

- Per-agent cost (input tokens + output tokens)
- Per-incident total cost
- Monthly budget tracking
- Budget alerts at 80%, 95%

---

## Migration Plan

### Phase 1: Preserve Logic (Week 1)
- [ ] Extract agent logic from Lambda functions
- [ ] Convert prompts to Bedrock Agent instruction format
- [ ] Preserve validation and guardrails
- [ ] Document agent contracts

### Phase 2: Build LangGraph (Week 2)
- [ ] Implement LangGraph state schema
- [ ] Build DAG with nodes and edges
- [ ] Implement retry and fallback logic
- [ ] Add consensus node
- [ ] Add cost guardian node
- [ ] Test graph execution locally

### Phase 3: Deploy Bedrock Agents (Week 3)
- [ ] Create Bedrock Agent resources (CDK)
- [ ] Define action groups with Lambda functions
- [ ] Configure IAM roles (read-only)
- [ ] Test agent invocation
- [ ] Validate output schemas

### Phase 4: Integration (Week 4)
- [ ] Connect LangGraph to Bedrock Agents
- [ ] Wire up DynamoDB checkpointing
- [ ] Add observability (X-Ray, CloudWatch)
- [ ] Test end-to-end flow
- [ ] Verify replay determinism

### Phase 5: Cleanup (Week 5)
- [ ] Remove Lambda-per-agent infrastructure
- [ ] Remove custom orchestrator
- [ ] Update documentation
- [ ] Update tests
- [ ] Deploy to production

---

## Success Criteria

- [ ] 8+ Bedrock Agents deployed
- [ ] LangGraph orchestrator deployed
- [ ] Agent-to-agent reasoning working
- [ ] Consensus mechanism validated
- [ ] Retry and fallback logic tested
- [ ] Replay determinism verified
- [ ] Cost tracking operational
- [ ] Observability dashboard live
- [ ] All agents fail safely
- [ ] Recommendations auditable
- [ ] Structured output validated

---

## Authority & Confidence

**Authority:** Principal Architect - This is the authoritative design  
**Confidence:** ABSOLUTE - This is the correct architecture  
**Blocker Status:** NONE - Ready to begin implementation  

---

**This is not a demo. This is a resume-defining, production-grade Bedrock + LangGraph multi-agent platform.**

---

**Date:** January 25, 2026  
**Status:** 📋 DESIGN COMPLETE - READY FOR IMPLEMENTATION
