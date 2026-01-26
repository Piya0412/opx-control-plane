# Phase 6: AI Decision Intelligence Layer — DESIGN

**Status:** ✅ COMPLETE - LangGraph + Bedrock Agents Architecture  
**Dependencies:** Phase 3 (Incident Construction) ✅, Phase 4 (Learning) ✅, Phase 5 (Automation) 🔲  
**Completed:** January 26, 2026  
**Architecture:** LangGraph orchestration with Bedrock Agents

---

## Executive Summary

Phase 6 introduces AI-powered decision intelligence to provide deep investigation and recommendations **without any execution authority**. This is where agents are implemented, but they remain strictly advisory.

**Key Principle:** Intelligence advises. Control decides. Humans approve.

---

## Objectives

### Primary
1. Provide deep incident investigation using AI agents
2. Generate structured recommendations for human review
3. Correlate signals, metrics, logs, and traces intelligently
4. Search historical incidents and knowledge base
5. Estimate blast radius and risk

### Secondary
1. Reduce mean time to understand (MTTU)
2. Improve recommendation quality over time
3. Build institutional memory through RAG
4. Enable parallel investigation workflows

### Non-Objectives
- ❌ Execute any actions
- ❌ Make decisions
- ❌ Approve incidents
- ❌ Mutate authoritative state
- ❌ Operate without human oversight

---

## Architecture Overview

**IMPLEMENTED:** LangGraph orchestration with Bedrock Agents (not Lambda-per-agent)

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE (Phase 1-3)                │
│              Deterministic, Authoritative, No AI            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Read-Only Access
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         LANGGRAPH ORCHESTRATION (Phase 6 - Advisory)        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         LangGraph State Machine (graph.py)           │  │
│  │                                                      │  │
│  │  Nodes:                                              │  │
│  │    • Budget Check Node                               │  │
│  │    • Parallel Analysis (4 Bedrock Agents)            │  │
│  │    • Knowledge RAG Node                              │  │
│  │    • Response Strategy Node                          │  │
│  │    • Consensus Node                                  │  │
│  │    • Cost Guardian Node                              │  │
│  │                                                      │  │
│  │  State: DynamoDB checkpointing                       │  │
│  │  Execution: Single Lambda (phase6-executor)          │  │
│  │  Replay: Deterministic from checkpoints              │  │
│  │  Resume: From last checkpoint on failure             │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│         ┌───────────────┼───────────────┐                   │
│         ↓               ↓               ↓                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Signal   │    │Historical│    │  Change  │              │
│  │ Intel    │    │ Pattern  │    │  Intel   │              │
│  │ Agent    │    │  Agent   │    │  Agent   │              │
│  │(Bedrock) │    │(Bedrock) │    │(Bedrock) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│         ↓               ↓               ↓                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │   Risk   │    │Knowledge │    │Response  │              │
│  │  & Blast │    │   RAG    │    │ Strategy │              │
│  │  Radius  │    │  Agent   │    │  Agent   │              │
│  │(Bedrock) │    │(Bedrock) │    │(Bedrock) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
│  All agents: Bedrock native, read-only, time-bounded       │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Recommendations Only
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    HUMAN OPERATOR                           │
│              Reviews, Approves, Executes                    │
└─────────────────────────────────────────────────────────────┘
```

---

## LangGraph Orchestration (IMPLEMENTED)

### State Machine

**File:** `src/langgraph/graph.py`

```python
# LangGraph state tracks:
- incident_id: str
- evidence_bundle: dict
- agent_outputs: dict[str, AgentOutput]
- consensus: ConsensusResult
- budget: BudgetTracking
- retries: dict[str, int]
- checkpoint: CheckpointMetadata
```

### Execution Flow

```
START
  ↓
[Budget Check] → (exceeded?) → [Signal & Continue]
  ↓
[Parallel Bedrock Agents] (fan-out to 4 agents)
  ├─→ Signal Intelligence Agent
  ├─→ Historical Pattern Agent
  ├─→ Change Intelligence Agent
  └─→ Risk & Blast Radius Agent
  ↓ (all complete or timeout)
[Gather Results]
  ↓
[Knowledge RAG Agent] (with context)
  ↓
[Response Strategy Agent] (with all inputs)
  ↓
[Consensus Node] (aggregate, resolve conflicts)
  ↓
[Cost Guardian] (final budget check)
  ↓
END (return recommendation)
```

### Retry & Fallback

- **Per-agent retries:** 3 attempts with exponential backoff
- **Timeout:** 30s per agent
- **Partial success:** Continue with available results
- **Checkpoint:** State saved to DynamoDB after each node
- **Resume:** On failure, resume from last checkpoint

### Determinism Guarantees

- Same input → same consensus output
- Same input → same cost total
- Replay from checkpoint → identical result
- Agent failures → graceful degradation (not random)

---

## Bedrock Agents (IMPLEMENTED)

All agents are **Bedrock Agent constructs** (not Lambda wrappers with InvokeModel).

### Agent Specifications

Each agent has:
- **Action Groups:** Read-only AWS SDK calls (≤2s execution)
- **Prompts:** Versioned in `prompts/` directory
- **Output:** Structured JSON with confidence scores
- **IAM:** Read-only permissions (explicit DENY on writes)

### 1. Signal Intelligence Agent

**Purpose:** Correlate metrics, logs, and traces to identify root cause

**Action Groups:**
- `query-metrics` (CloudWatch GetMetricData)
- `search-logs` (CloudWatch Logs StartQuery)
- `analyze-traces` (X-Ray GetTraceSummaries)

**Output:**
```json
{
  "agent_id": "signal-intelligence",
  "confidence": 0.85,
  "root_cause_hypothesis": "Lambda timeout due to DynamoDB throttling",
  "supporting_signals": ["sig-001", "sig-002"],
  "anomalies": [...],
  "reasoning": "..."
}
```

### 2. Historical Pattern Agent

**Purpose:** Find similar past incidents and their resolutions

**Action Groups:**
- `search-incidents` (DynamoDB Query on incident table)
- `get-resolution-summary` (DynamoDB GetItem)

**Output:**
```json
{
  "agent_id": "historical-pattern",
  "confidence": 0.78,
  "similar_incidents": [...],
  "patterns": [...],
  "recommendations": [...]
}
```

### 3. Change Intelligence Agent

**Purpose:** Correlate incident with recent deployments and config changes

**Action Groups:**
- `query-deployments` (CloudTrail LookupEvents)
- `query-config-changes` (CloudTrail LookupEvents)

**Output:**
```json
{
  "agent_id": "change-intelligence",
  "confidence": 0.92,
  "recent_changes": [...],
  "correlation_analysis": {...},
  "rollback_recommendation": {...}
}
```

### 4. Risk & Blast Radius Agent

**Purpose:** Estimate incident impact and propagation risk

**Action Groups:**
- `query-service-graph` (X-Ray GetServiceGraph)
- `query-traffic-metrics` (CloudWatch GetMetricData)

**Output:**
```json
{
  "agent_id": "risk-blast-radius",
  "confidence": 0.88,
  "blast_radius": {...},
  "risk_assessment": {...},
  "mitigation_priority": [...]
}
```

### 5. Knowledge RAG Agent

**Purpose:** Search runbooks, postmortems, and documentation

**Implementation:** Bedrock Knowledge Base (Phase 7)

**Output:**
```json
{
  "agent_id": "knowledge-rag",
  "confidence": 0.75,
  "relevant_documents": [...],
  "suggested_runbooks": [...],
  "related_postmortems": [...]
}
```

### 6. Response Strategy Agent

**Purpose:** Generate structured action recommendations

**Input:** All other agent outputs + incident context

**Output:**
```json
{
  "agent_id": "response-strategy",
  "confidence": 0.82,
  "proposed_actions": [...],
  "execution_plan": {...},
  "reasoning": "..."
}
```

---

## Responsibilities Absorbed by Bedrock + LangGraph

The following utilities from the old Lambda-per-agent architecture are now handled by the platform:

| Old Utility | Now Handled By |
|-------------|----------------|
| `token-estimator.ts` | Bedrock usage metrics |
| `output-parser.ts` | Bedrock Agent structured outputs |
| `confidence-normalizer.ts` | Consensus node in LangGraph |
| `guardrails.ts` | Bedrock Agent constraints + LangGraph validation |
| `observability-adapter.ts` | X-Ray + CloudWatch (native) |

---

## Agent Specifications

### 1. Signal Analysis Agent

**Purpose:** Correlate metrics, logs, and traces to identify root cause

**Inputs:**
- Incident ID
- Evidence bundle
- Signal IDs
- Time window

**Capabilities:**
- Query CloudWatch metrics
- Search CloudWatch Logs
- Analyze X-Ray traces
- Identify anomalies
- Correlate across services

**Output Schema:**
```typescript
{
  agentId: "signal-analysis",
  incidentId: string,
  analysis: {
    rootCauseHypothesis: string,
    confidence: number, // 0-1
    supportingSignals: string[],
    anomalies: Array<{
      metric: string,
      baseline: number,
      observed: number,
      deviation: number
    }>,
    correlations: Array<{
      signal1: string,
      signal2: string,
      correlation: number,
      interpretation: string
    }>
  },
  reasoning: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 30 seconds
- Read-only CloudWatch access
- No metric writes
- No alarm modifications

---

### 2. Historical Incident Agent

**Purpose:** Find similar past incidents and their resolutions

**Inputs:**
- Incident classification
- Service name
- Severity
- Signal patterns

**Capabilities:**
- Vector similarity search
- Incident pattern matching
- Resolution strategy lookup
- Time-to-resolution estimation

**Output Schema:**
```typescript
{
  agentId: "historical-incident",
  incidentId: string,
  similarIncidents: Array<{
    incidentId: string,
    similarity: number, // 0-1
    service: string,
    severity: string,
    resolution: {
      type: string,
      summary: string,
      timeToResolve: number, // minutes
      resolvedBy: string
    },
    relevantActions: string[]
  }>,
  patterns: Array<{
    pattern: string,
    frequency: number,
    successRate: number
  }>,
  recommendations: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 20 seconds
- Read-only incident store access
- No incident mutations
- Minimum similarity threshold: 0.7

---

### 3. Change Intelligence Agent

**Purpose:** Correlate incident with recent deployments and configuration changes

**Inputs:**
- Incident time window
- Affected services
- Evidence signals

**Capabilities:**
- Query deployment history
- Analyze configuration changes
- Identify recent releases
- Correlate change timing with incident

**Output Schema:**
```typescript
{
  agentId: "change-intelligence",
  incidentId: string,
  recentChanges: Array<{
    changeId: string,
    type: "DEPLOYMENT" | "CONFIG" | "INFRASTRUCTURE",
    service: string,
    timestamp: string,
    timeDelta: number, // minutes before incident
    suspicionScore: number, // 0-1
    details: {
      version?: string,
      configKey?: string,
      oldValue?: string,
      newValue?: string
    }
  }>,
  correlationAnalysis: {
    likelyTrigger: boolean,
    confidence: number,
    reasoning: string
  },
  rollbackRecommendation: {
    recommended: boolean,
    targetVersion?: string,
    risk: "LOW" | "MEDIUM" | "HIGH"
  },
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 25 seconds
- Read-only deployment store access
- No rollback execution
- Lookback window: 24 hours

---

### 4. Risk & Blast Radius Agent

**Purpose:** Estimate incident impact and propagation risk

**Inputs:**
- Incident service
- Evidence bundle
- Service dependency graph

**Capabilities:**
- Analyze service dependencies
- Estimate affected users
- Calculate blast radius
- Predict propagation paths

**Output Schema:**
```typescript
{
  agentId: "risk-blast-radius",
  incidentId: string,
  blastRadius: {
    scope: "SINGLE_SERVICE" | "MULTI_SERVICE" | "INFRASTRUCTURE",
    affectedServices: string[],
    estimatedUsers: number,
    estimatedRequests: number,
    propagationPaths: Array<{
      from: string,
      to: string,
      probability: number,
      latency: number // minutes
    }>
  },
  riskAssessment: {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    businessImpact: string,
    technicalImpact: string
  },
  mitigationPriority: Array<{
    action: string,
    priority: number,
    expectedImpact: string
  }>,
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 20 seconds
- Read-only service graph access
- No topology modifications
- Conservative estimates (fail-safe)

---

### 5. Knowledge (RAG) Agent

**Purpose:** Search runbooks, postmortems, and documentation

**Inputs:**
- Incident classification
- Service name
- Error patterns
- Search query

**Capabilities:**
- Vector search across documents
- Semantic similarity matching
- Citation extraction
- Relevance ranking

**Output Schema:**
```typescript
{
  agentId: "knowledge-rag",
  incidentId: string,
  relevantDocuments: Array<{
    documentId: string,
    type: "RUNBOOK" | "POSTMORTEM" | "ARCHITECTURE" | "PLAYBOOK",
    title: string,
    relevanceScore: number, // 0-1
    excerpt: string,
    url: string,
    lastUpdated: string,
    citations: Array<{
      section: string,
      content: string,
      relevance: number
    }>
  }>,
  suggestedRunbooks: string[],
  relatedPostmortems: string[],
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 15 seconds
- Read-only document store access
- No document modifications
- Minimum relevance score: 0.6

---

### 6. Execution Proposal Agent

**Purpose:** Generate structured action recommendations

**Inputs:**
- All other agent outputs
- Incident context
- Historical success rates

**Capabilities:**
- Synthesize agent recommendations
- Rank actions by priority
- Estimate success probability
- Generate execution plan

**Output Schema:**
```typescript
{
  agentId: "execution-proposal",
  incidentId: string,
  proposedActions: Array<{
    actionId: string,
    type: "ROLLBACK" | "SCALE" | "RESTART" | "CONFIG_CHANGE" | "MANUAL",
    priority: number, // 1-10
    description: string,
    targetService: string,
    estimatedImpact: {
      successProbability: number, // 0-1
      timeToEffect: number, // minutes
      risk: "LOW" | "MEDIUM" | "HIGH"
    },
    prerequisites: string[],
    rollbackPlan: string,
    approvalRequired: boolean
  }>,
  executionPlan: {
    steps: Array<{
      stepNumber: number,
      action: string,
      parallelizable: boolean,
      dependencies: number[]
    }>,
    estimatedDuration: number, // minutes
    criticalPath: number[]
  },
  reasoning: string,
  executedAt: string,
  durationMs: number
}
```

**Constraints:**
- Max execution time: 30 seconds
- No action execution
- All actions require human approval
- Conservative risk estimates

---

## Agent Orchestration

### LangGraph Workflow

```python
from langgraph.graph import StateGraph, END

# Define agent state
class AgentState(TypedDict):
    incident_id: str
    evidence: dict
    agent_results: dict
    final_recommendation: dict

# Create graph
workflow = StateGraph(AgentState)

# Add agent nodes
workflow.add_node("signal_analysis", signal_analysis_agent)
workflow.add_node("historical_incident", historical_incident_agent)
workflow.add_node("change_intelligence", change_intelligence_agent)
workflow.add_node("risk_blast_radius", risk_blast_radius_agent)
workflow.add_node("knowledge_rag", knowledge_rag_agent)
workflow.add_node("execution_proposal", execution_proposal_agent)

# Define parallel execution
workflow.add_edge("signal_analysis", "execution_proposal")
workflow.add_edge("historical_incident", "execution_proposal")
workflow.add_edge("change_intelligence", "execution_proposal")
workflow.add_edge("risk_blast_radius", "execution_proposal")
workflow.add_edge("knowledge_rag", "execution_proposal")

# Execution proposal is final
workflow.add_edge("execution_proposal", END)

# Set entry point
workflow.set_entry_point("signal_analysis")
workflow.set_entry_point("historical_incident")
workflow.set_entry_point("change_intelligence")
workflow.set_entry_point("risk_blast_radius")
workflow.set_entry_point("knowledge_rag")
```

### Execution Strategy

1. **Parallel Execution:** First 5 agents run in parallel
2. **Timeout Enforcement:** Each agent has max execution time
3. **Graceful Degradation:** If agent fails, continue with others
4. **Result Aggregation:** Execution proposal agent synthesizes all results
5. **Structured Output:** All results validated against schemas

---

## LLM Integration

### Provider Options

#### Option A: AWS Bedrock (Recommended)
- **Model:** Claude 3.5 Sonnet or Claude 3 Opus
- **Advantages:**
  - Native AWS integration
  - IAM-based security
  - No API keys needed
  - Regional deployment
  - Enterprise support
- **Cost:** ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens

#### Option B: Ollama (Self-Hosted)
- **Model:** Llama 3.1 70B or Mixtral 8x7B
- **Advantages:**
  - No external API calls
  - Full data control
  - No per-token costs
  - Customizable
- **Cost:** Infrastructure only (~$500/month for GPU instances)

#### Option C: OpenAI (Fallback)
- **Model:** GPT-4 Turbo
- **Advantages:**
  - High quality
  - Well-documented
  - Reliable
- **Disadvantages:**
  - External dependency
  - API key management
  - Data privacy concerns

**Recommendation:** Start with AWS Bedrock (Claude 3.5 Sonnet) for production, Ollama for development.

---

## Data Flow

### 1. Incident Trigger
```
Incident Created (Phase 3)
  ↓
Agent Orchestrator Invoked
  ↓
Incident Context Loaded (read-only)
```

### 2. Agent Execution
```
Parallel Agent Execution
  ├─ Signal Analysis Agent → CloudWatch
  ├─ Historical Incident Agent → Incident Store
  ├─ Change Intelligence Agent → Deployment Store
  ├─ Risk & Blast Radius Agent → Service Graph
  └─ Knowledge RAG Agent → Document Store
       ↓
All Results Collected (with timeouts)
       ↓
Execution Proposal Agent Synthesizes
```

### 3. Result Storage
```
Agent Results Stored
  ↓
Recommendation Record Created
  ↓
Human Notified (EventBridge)
```

### 4. Human Review
```
Human Reviews Recommendations
  ↓
Human Approves/Rejects Actions
  ↓
Approved Actions → Phase 5 (Automation)
```

---

## Infrastructure (IMPLEMENTED)

### Single Executor Lambda

**Name:** `phase6-executor-lambda`
- **Runtime:** Python 3.12
- **Memory:** 1024 MB
- **Timeout:** 5 minutes
- **Handler:** `src/langgraph/lambda_handler.py`
- **Triggers:** EventBridge (IncidentCreated) or API Gateway
- **Environment:**
  - Bedrock Agent IDs and Alias IDs
  - Checkpoint table name
  - Budget limits

### DynamoDB Tables

**1. opx-langgraph-checkpoints**
- **Purpose:** State checkpointing for replay and resume
- **PK:** `execution_id`
- **SK:** `checkpoint_id`
- **Attributes:** state snapshot, timestamp, node_id
- **TTL:** 7 days

**2. opx-agent-recommendations** (existing)
- **Purpose:** Final recommendations for human review
- **PK:** `INCIDENT#{incidentId}`
- **SK:** `RECOMMENDATION#{recommendationId}`
- **Attributes:** consensus, agent_outputs, proposed_actions
- **TTL:** 90 days

### Bedrock Agents

**Deployed via CDK:** `infra/phase6/stacks/phase6-bedrock-stack.ts`

- Signal Intelligence Agent (with 3 action groups)
- Historical Pattern Agent (with 2 action groups)
- Change Intelligence Agent (with 2 action groups)
- Risk & Blast Radius Agent (with 2 action groups)
- Knowledge RAG Agent (with Bedrock Knowledge Base)
- Response Strategy Agent (aggregation only)

### IAM Roles

**Phase6ExecutorRole:**
- Bedrock: `InvokeAgent` on all Phase 6 agents
- DynamoDB: Read/Write on checkpoint table
- DynamoDB: Read on incident/evidence tables
- CloudWatch: PutMetricData, CreateLogStream
- X-Ray: PutTraceSegments

**Action Group Execution Roles** (per agent):
- Read-only access to data sources (CloudWatch, X-Ray, DynamoDB, CloudTrail)
- Explicit DENY on all write operations
- Timeout enforcement: 2 seconds per tool

---

## Rollout Status

### ✅ Week 1-2: Infrastructure & Orchestration
- LangGraph state machine implemented
- DynamoDB checkpointing configured
- Single executor Lambda deployed
- Bedrock Agent constructs defined

### ✅ Week 3-4: Action Groups
- All 9 action groups implemented with real AWS SDK calls
- Read-only enforcement validated
- Timeout guards (≤2s) implemented
- Deterministic output sorting

### ✅ Week 5: Validation & Hardening
- Replay determinism tests passing (5 tests)
- Resume from checkpoint tests passing (5 tests)
- Determinism under failure tests passing (6 tests)
- Cost tracking validated
- Consensus logic validated

### ✅ Week 6: Hygiene & Unification
- Lambda-per-agent architecture removed
- ESOC-era orchestration removed
- Obsolete tests deleted
- Documentation updated
- Codebase unified

---

## Success Criteria (ALL MET ✅)

### Functional
- [x] All 6 agents implemented as Bedrock Agents
- [x] LangGraph orchestration working
- [x] Recommendations generated for incidents
- [x] Output validation passing
- [x] Timeout enforcement working
- [x] Checkpoint/resume working

### Performance
- [x] Agent execution < 120 seconds (p99)
- [x] Individual agent timeout < 30 seconds
- [x] Cost per incident trackable
- [x] Deterministic execution proven

### Quality
- [x] No agent can mutate authoritative state
- [x] All outputs structured and validated
- [x] All executions traced and logged
- [x] Human approval required for all actions
- [x] Replay determinism proven
- [x] Resume from failure proven

---

## Infrastructure

### Lambda Functions

1. **agent-orchestrator-lambda**
---

## Testing Strategy (IMPLEMENTED)

### Python Tests (pytest)

**Location:** `src/langgraph/`

- `test_graph.py` - LangGraph execution and state transitions
- `test_replay.py` - Replay determinism (5 tests)
- `test_resume.py` - Resume from checkpoint (5 tests)
- `test_determinism.py` - Determinism under failure (6 tests)
- `test_week5_integration.py` - Integration test runner

### TypeScript Tests (vitest)

**Location:** `test/`

- Control plane tests (candidate, evidence, promotion, learning)
- All passing except deployment-dependent integration tests

### Action Group Tests

**Location:** `src/langgraph/action_groups/`

- Unit tests for each action group
- Timeout validation
- Read-only enforcement
- Deterministic output sorting

---

## Next Steps

### Phase 7: Knowledge Base (RAG)
- Deploy Bedrock Knowledge Base
- Ingest runbooks and postmortems
- Connect to Knowledge RAG Agent

### Phase 8: Human Review UI
- Dashboard for recommendations
- Approval workflow
- Action execution tracking

### Phase 9: Automation (with human approval)
- Execute approved actions
- Rollback capability
- Audit trail

---

**Status:** ✅ PHASE 6 COMPLETE  
**Architecture:** LangGraph + Bedrock Agents  
**Last Updated:** January 26, 2026  
**Design Authority:** Principal Architect
