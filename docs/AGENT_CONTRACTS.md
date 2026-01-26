# Agent Contracts - AUTHORITATIVE SPECIFICATION

**Date:** January 25, 2026  
**Authority:** Principal Architect  
**Status:** 🔒 FROZEN - Changes require architectural review  

---

## Purpose

This document defines the **canonical contracts** for all agents in the Bedrock + LangGraph multi-agent system. These contracts are **non-negotiable** and serve as:

1. **Guardrails for LangGraph** - State schema and node interfaces
2. **Boundaries for Bedrock Agents** - Input/output specifications
3. **Prevention of agent sprawl** - Clear separation of concerns
4. **Replay determinism guarantees** - Immutable input/output contracts
5. **Interview defense** - "This is how we prevented architectural drift"

**Any deviation from these contracts requires Principal Architect approval.**

---

## Architectural Decisions (LOCKED 🔒)

| Area | Decision | Rationale |
|------|----------|-----------|
| **Orchestration** | LangGraph only | Stateful DAG, retry/fallback, checkpointing |
| **Agent Implementation** | Bedrock Agents only | Native constructs, not Lambda wrappers |
| **Agent Count** | 8 mandatory + 1 optional | Sufficient specialization, manageable complexity |
| **Consensus** | Dedicated agent | Explicit conflict resolution, not implicit |
| **Cost Governance** | Dedicated agent (signal-only) | Budget tracking, no enforcement (Phase 5 decides) |
| **Hallucination Detection** | Soft auditor (not guardrails) | Quality signal, not blocker |
| **Execution** | Never in Phase 6 | Agents recommend, Phase 5 executes |
| **Authority** | Control plane only | Agents read-only, no mutations |

---

## Canonical Agent Input Envelope

**All agents MUST accept this exact structure:**

```typescript
interface AgentInput {
  // Core context (REQUIRED)
  incidentId: string;              // Immutable incident identifier
  evidenceBundle: EvidenceBundle;  // Frozen snapshot at invocation time
  timestamp: string;               // ISO-8601, for replay determinism
  
  // Execution context (REQUIRED)
  executionId: string;             // Unique per agent invocation
  sessionId: string;               // LangGraph session identifier
  budgetRemaining: number;         // USD, for cost-aware agents
  
  // Agent-specific context (OPTIONAL)
  context?: {
    priorAgentOutputs?: Record<AgentId, AgentOutput>;  // For dependent agents (JSON-safe)
    timeConstraint?: number;                            // Max execution time (ms)
    retryAttempt?: number;                              // Current retry count (0-based)
  };
  
  // Replay metadata (REQUIRED for determinism)
  replayMetadata: {
    isReplay: boolean;              // True if replaying from checkpoint
    originalTimestamp?: string;     // Original execution timestamp
    checkpointId?: string;          // Checkpoint identifier
  };
}
```

### Immutability Guarantees

1. **`incidentId`** - NEVER changes during agent execution
2. **`evidenceBundle`** - Frozen snapshot, NEVER mutated
3. **`timestamp`** - Fixed at invocation, used for replay
4. **`executionId`** - Unique per invocation, idempotency key
5. **`priorAgentOutputs`** - Read-only, NEVER modified

### Validation Rules

- All REQUIRED fields MUST be present
- `budgetRemaining` MUST be >= 0.0
- `timestamp` MUST be valid ISO-8601
- `executionId` MUST be unique (SHA256 hash recommended)
- `evidenceBundle` MUST pass Zod schema validation

---

## Canonical Agent Output Envelope

**All agents MUST return this exact structure:**


```typescript
interface AgentOutput {
  // Agent identity (REQUIRED)
  agentId: AgentId;                // Enum: see Agent Specializations below
  agentVersion: string;            // Semantic version (e.g., "1.0.0")
  executionId: string;             // Matches input.executionId
  
  // Execution metadata (REQUIRED)
  timestamp: string;               // ISO-8601, when agent completed
  duration: number;                // Execution time in milliseconds
  status: ExecutionStatus;         // SUCCESS | PARTIAL | TIMEOUT | FAILURE
  
  // Confidence and reasoning (REQUIRED)
  confidence: number;              // 0.0 - 1.0, normalized
  reasoning: string;               // Human-readable explanation
  disclaimer: string;              // MUST include "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
  
  // Agent-specific findings (REQUIRED)
  findings: AgentSpecificFindings; // Type varies by agent (see specializations)
  
  // Citations and sources (OPTIONAL but RECOMMENDED)
  citations?: Citation[];          // Explainable sources
  
  // Cost tracking (REQUIRED)
  cost: {
    inputTokens: number;           // LLM input tokens consumed
    outputTokens: number;          // LLM output tokens generated
    estimatedCost: number;         // USD, deterministic calculation
    model: string;                 // e.g., "anthropic.claude-3-5-sonnet-20241022-v2:0"
  };
  
  // Error handling (REQUIRED if status != SUCCESS)
  error?: {
    code: ErrorCode;               // Enum: see Error Codes below
    message: string;               // Human-readable error
    retryable: boolean;            // Can this be retried?
    details?: Record<string, any>; // Additional context
  };
  
  // Replay metadata (REQUIRED for determinism)
  replayMetadata: {
    deterministicHash: string;     // SHA256(canonicalized input + findings), for replay verification
    schemaVersion: string;         // Output schema version (e.g., "1.0.0")
  };
}

### Deterministic Hash Construction

**Canonicalization Rules:**
1. **JSON serialization** - Sorted keys (alphabetical)
2. **Excluded fields** - `reasoning`, `disclaimer`, free-text explanations (non-deterministic)
3. **Included fields** - Numeric findings, enums, structured data, confidence
4. **Float precision** - Fixed to 4 decimal places (e.g., 0.8523)
5. **Hash algorithm** - SHA256 of canonicalized JSON

**Example:**
```typescript
function computeDeterministicHash(input: AgentInput, findings: AgentSpecificFindings): string {
  const canonical = {
    // From input (sorted keys)
    evidenceBundle: input.evidenceBundle,
    executionId: input.executionId,
    incidentId: input.incidentId,
    timestamp: input.timestamp,
    
    // From findings (sorted keys, numeric only)
    confidence: parseFloat(findings.confidence.toFixed(4)),
    structuredData: sortKeys(findings),  // Exclude free text
  };
  
  return sha256(JSON.stringify(canonical, Object.keys(canonical).sort()));
}
```

**Replay Verification:**
- Same input → same hash
- Different reasoning text → same hash (excluded)
- Different float precision → same hash (normalized to 4 decimals)
```

### Immutability Guarantees

1. **`agentId`** - NEVER changes, identifies agent type
2. **`executionId`** - Matches input, idempotency key
3. **`timestamp`** - Fixed at completion, for replay
4. **`deterministicHash`** - Verifies replay consistency
5. **Output structure** - NEVER add/remove fields without version bump

### Validation Rules

- All REQUIRED fields MUST be present
- `confidence` MUST be in range [0.0, 1.0]
- `disclaimer` MUST contain "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
- `status` MUST be valid enum value
- `cost.estimatedCost` MUST be >= 0.0
- If `status != SUCCESS`, `error` MUST be present

---

## Execution Status Enum

```typescript
enum ExecutionStatus {
  SUCCESS = "SUCCESS",           // Agent completed successfully
  PARTIAL = "PARTIAL",           // Agent completed with degraded results
  TIMEOUT = "TIMEOUT",           // Agent exceeded time limit
  FAILURE = "FAILURE"            // Agent failed (see error.code)
}
```

### Status Semantics

- **SUCCESS** - Agent produced complete, high-confidence output
- **PARTIAL** - Agent produced output but with limitations (e.g., missing data)
- **TIMEOUT** - Agent exceeded `timeConstraint`, returned partial results
- **FAILURE** - Agent could not produce output (see `error` field)

---

## Error Code Enum

```typescript
enum ErrorCode {
  // Input validation errors
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  SCHEMA_VALIDATION_FAILED = "SCHEMA_VALIDATION_FAILED",
  
  // Execution errors
  TIMEOUT = "TIMEOUT",
  BUDGET_EXCEEDED = "BUDGET_EXCEEDED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  
  // Bedrock errors
  BEDROCK_THROTTLING = "BEDROCK_THROTTLING",
  BEDROCK_MODEL_ERROR = "BEDROCK_MODEL_ERROR",
  BEDROCK_QUOTA_EXCEEDED = "BEDROCK_QUOTA_EXCEEDED",
  
  // Data access errors
  DATA_SOURCE_UNAVAILABLE = "DATA_SOURCE_UNAVAILABLE",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  
  // Quality errors
  LOW_CONFIDENCE = "LOW_CONFIDENCE",
  HALLUCINATION_DETECTED = "HALLUCINATION_DETECTED",
  OUTPUT_VALIDATION_FAILED = "OUTPUT_VALIDATION_FAILED",
  
  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
```

### Retryable Errors

**Retryable (LangGraph will retry):**
- `BEDROCK_THROTTLING`
- `RATE_LIMIT_EXCEEDED`
- `DATA_SOURCE_UNAVAILABLE`
- `INTERNAL_ERROR`

**Non-Retryable (fail fast):**
- `INVALID_INPUT`
- `MISSING_REQUIRED_FIELD`
- `SCHEMA_VALIDATION_FAILED`
- `BUDGET_EXCEEDED`
- `BEDROCK_QUOTA_EXCEEDED`

---

## Agent Specializations (9 Agents)

### 1. Signal Intelligence Agent

**Agent ID:** `signal-intelligence`  
**Purpose:** Analyze observability signals (metrics, logs, traces)  
**Type:** Bedrock Agent with Action Groups

**Findings Schema:**
```typescript
interface SignalIntelligenceFindings {
  rootCauseHypothesis: string;
  anomalies: Array<{
    metric: string;
    baseline: number;
    observed: number;
    deviation: number;        // Standard deviations from baseline
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }>;
  correlations: Array<{
    signal1: string;
    signal2: string;
    correlation: number;      // -1.0 to 1.0
    interpretation: string;
  }>;
  timelineAnalysis: {
    incidentStart: string;    // ISO-8601
    firstAnomalyDetected: string;
    propagationPath: string[];
  };
}
```

**Action Groups:**
- `query_metrics` - Read CloudWatch metrics (read-only, IAM-restricted)
- `search_logs` - Search CloudWatch Logs (read-only, IAM-restricted)
- `analyze_traces` - Query X-Ray traces (read-only, IAM-restricted)

**IAM Security:**  
Action groups are IAM-restricted to read-only APIs and scoped per-agent. Each action group Lambda has explicit DENY policies on write operations (PutMetricData, PutLogEvents, etc.).

**Constraints:**
- Max execution time: 30 seconds
- Read-only CloudWatch access
- No metric writes, no alarm modifications
- Must return at least 1 anomaly or correlation

---

### 2. Historical Incident Pattern Agent

**Agent ID:** `historical-pattern`  
**Purpose:** Find similar past incidents and proven resolutions  
**Type:** Bedrock Agent with Action Groups

**Findings Schema:**
```typescript
interface HistoricalPatternFindings {
  similarIncidents: Array<{
    incidentId: string;
    similarity: number;       // 0.0 - 1.0
    service: string;
    severity: string;
    resolution: {
      type: string;
      summary: string;
      timeToResolve: number;  // Minutes
      resolvedBy: string;
    };
    relevantActions: string[];
  }>;
  patterns: Array<{
    pattern: string;
    frequency: number;        // Occurrences in last 90 days
    successRate: number;      // 0.0 - 1.0
    avgTimeToResolve: number; // Minutes
  }>;
  recommendations: string[];
}
```

**Action Groups:**
- `search_incidents` - Query incident projections (read-only, IAM-restricted)
- `get_resolution_summary` - Fetch resolution details (read-only, IAM-restricted)

**IAM Security:**  
Action groups are IAM-restricted to read-only DynamoDB operations (GetItem, Query) and scoped per-agent. Explicit DENY on PutItem, UpdateItem, DeleteItem.

**Constraints:**
- Max execution time: 20 seconds
- Read-only incident store access
- Minimum similarity threshold: 0.7
- Must return at least 1 similar incident or pattern

---

### 3. Change Intelligence Agent

**Agent ID:** `change-intelligence`  
**Purpose:** Correlate incident with deployments and config changes  
**Type:** Bedrock Agent with Action Groups

**Findings Schema:**
```typescript
interface ChangeIntelligenceFindings {
  recentChanges: Array<{
    changeId: string;
    type: "DEPLOYMENT" | "CONFIG" | "INFRASTRUCTURE";
    service: string;
    timestamp: string;        // ISO-8601
    timeDelta: number;        // Minutes before incident
    suspicionScore: number;   // 0.0 - 1.0
    details: {
      version?: string;
      configKey?: string;
      oldValue?: string;
      newValue?: string;
    };
  }>;
  correlationAnalysis: {
    likelyTrigger: boolean;
    confidence: number;       // 0.0 - 1.0
    reasoning: string;
  };
  rollbackRecommendation: {
    recommended: boolean;
    targetVersion?: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    reasoning: string;
  };
}
```

**Action Groups:**
- `query_deployments` - Fetch deployment history (read-only, IAM-restricted)
- `query_config_changes` - Fetch config changes (read-only, IAM-restricted)

**IAM Security:**  
Action groups are IAM-restricted to read-only APIs and scoped per-agent. No write permissions to deployment or config stores.

**Constraints:**
- Max execution time: 25 seconds
- Read-only deployment store access
- Lookback window: 24 hours
- Must mark all changes with source (MOCK/DERIVED/AUTHORITATIVE)

---

### 4. Risk & Blast Radius Agent

**Agent ID:** `risk-blast-radius`  
**Purpose:** Estimate incident impact and propagation risk  
**Type:** Bedrock Agent with Action Groups

**Findings Schema:**
```typescript
interface RiskBlastRadiusFindings {
  blastRadius: {
    scope: "SINGLE_SERVICE" | "MULTI_SERVICE" | "INFRASTRUCTURE";
    affectedServices: string[];
    estimatedUsers: number;
    estimatedRequests: number;
    propagationPaths: Array<{
      from: string;
      to: string;
      probability: number;    // 0.0 - 1.0
      latency: number;        // Minutes
    }>;
  };
  riskAssessment: {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    businessImpact: string;
    technicalImpact: string;
  };
  mitigationPriority: Array<{
    action: string;
    priority: number;         // 1-10
    expectedImpact: string;
  }>;
}
```

**Action Groups:**
- `query_service_graph` - Fetch dependency graph (read-only, IAM-restricted)
- `query_traffic_metrics` - Fetch traffic data (read-only, IAM-restricted)

**IAM Security:**  
Action groups are IAM-restricted to read-only APIs and scoped per-agent. No write permissions to service graph or metrics stores.

**Constraints:**
- Max execution time: 20 seconds
- Read-only service graph access
- Conservative estimates (fail-safe)
- Must provide at least 1 mitigation action

---

### 5. Knowledge RAG Agent

**Agent ID:** `knowledge-rag`  
**Purpose:** Search runbooks, postmortems, documentation  
**Type:** Bedrock Agent with Knowledge Base

**Findings Schema:**
```typescript
interface KnowledgeRAGFindings {
  relevantDocuments: Array<{
    documentId: string;
    type: "RUNBOOK" | "POSTMORTEM" | "ARCHITECTURE" | "PLAYBOOK";
    title: string;
    relevanceScore: number;   // 0.0 - 1.0
    excerpt: string;
    url: string;
    lastUpdated: string;      // ISO-8601
    citations: Array<{
      section: string;
      content: string;
      relevance: number;      // 0.0 - 1.0
    }>;
  }>;
  suggestedRunbooks: string[];
  relatedPostmortems: string[];
}
```

**Knowledge Base:**
- Bedrock Knowledge Base (Phase 7)
- Vector embeddings (Titan Embeddings)
- Chunked documents with metadata

**Constraints:**
- Max execution time: 15 seconds
- Read-only knowledge base access
- Minimum relevance score: 0.6
- Must provide explainable citations
- Does NOT build vector stores (Phase 7 responsibility)

---

### 6. Response Strategy Agent

**Agent ID:** `response-strategy`  
**Purpose:** Rank potential actions and estimate effectiveness  
**Type:** Bedrock Agent (LLM-based synthesis)

**Findings Schema:**
```typescript
interface ResponseStrategyFindings {
  rankedOptions: Array<{
    optionId: string;
    description: string;
    rank: number;             // 1-N
    estimatedEffectiveness: number; // 0.0 - 1.0
    estimatedRisk: "LOW" | "MEDIUM" | "HIGH";
    estimatedDuration: number; // Minutes
    tradeoffs: string[];
  }>;
  tradeoffAnalysis: {
    speedVsRisk: string;
    impactVsComplexity: string;
    costVsBenefit: string;
  };
  // NO execution plans
  // NO step-by-step instructions
  // ONLY rankings and comparisons
}
```

**Input Dependencies:**
- Requires outputs from all 5 prior agents
- Synthesizes recommendations into ranked options

**Constraints:**
- Max execution time: 30 seconds
- NO execution authority
- NO action plans or step-by-step instructions
- ONLY rankings, comparisons, and tradeoff analysis

---

### 7. Consensus & Confidence Agent

**Agent ID:** `consensus`  
**Purpose:** Aggregate agent outputs and resolve conflicts  
**Type:** LangGraph Node (custom logic, not Bedrock Agent)

**Why LangGraph Node (Not Bedrock Agent):**
This agent operates purely on structured outputs from prior agents and does not require LLM reasoning. Implementing as a LangGraph node:
- Reduces cost (no LLM invocation)
- Improves determinism (pure computation)
- Simplifies replay (no Bedrock API calls)
- Enables faster execution (no network latency)

**Why LangGraph Node (not Bedrock Agent):**  
This agent operates purely on structured outputs from prior agents and does not require LLM reasoning. Implementing as a LangGraph node reduces cost, improves determinism, and simplifies replay. The logic is deterministic aggregation and conflict resolution, not natural language generation.

**Findings Schema:**
```typescript
interface ConsensusFindings {
  aggregatedConfidence: number; // Weighted average of all agents
  agreementLevel: number;       // 0.0 - 1.0, measures consensus
  conflictsDetected: Array<{
    agents: AgentId[];
    conflictType: string;
    resolution: string;
  }>;
  unifiedRecommendation: string;
  minorityOpinions: string[];
  qualityMetrics: {
    dataCompleteness: number;   // 0.0 - 1.0
    citationQuality: number;    // 0.0 - 1.0
    reasoningCoherence: number; // 0.0 - 1.0
  };
}
```

**Logic:**
```python
def consensus_agent(state: AgentState) -> AgentState:
    outputs = state["agent_outputs"]
    
    # Aggregate confidence (weighted by agent reliability)
    weights = get_agent_weights()  # From historical performance
    avg_confidence = weighted_mean(
        [o.confidence for o in outputs.values()],
        weights
    )
    
    # Detect conflicts
    conflicts = detect_conflicts(outputs)
    
    # Resolve conflicts (highest confidence wins)
    resolved = resolve_conflicts(conflicts, outputs)
    
    # Compute consensus
    consensus = {
        "aggregatedConfidence": avg_confidence,
        "agreementLevel": compute_agreement(outputs),
        "conflictsDetected": conflicts,
        "unifiedRecommendation": synthesize(resolved),
        "minorityOpinions": extract_minority_opinions(outputs)
    }
    
    return consensus
```

**Constraints:**
- Max execution time: 10 seconds
- Deterministic conflict resolution
- Must preserve minority opinions
- Must explain all conflict resolutions

---

### 8. Cost & Budget Guardian Agent

**Agent ID:** `cost-guardian`  
**Purpose:** Track costs and signal budget status  
**Type:** LangGraph Node (custom logic, not Bedrock Agent)

**Why LangGraph Node (Not Bedrock Agent):**
This agent performs deterministic arithmetic on cost data and does not require LLM reasoning. Implementing as a LangGraph node:
- Reduces cost (no LLM invocation)
- Guarantees determinism (pure math)
- Simplifies testing (no mocking Bedrock)
- Enables real-time budget tracking (no API latency)

**Why LangGraph Node (not Bedrock Agent):**  
This agent performs deterministic arithmetic (sum of costs, budget comparison) and does not require LLM reasoning. Implementing as a LangGraph node eliminates LLM costs, ensures exact reproducibility, and simplifies testing. The logic is pure math, not natural language generation.

**Findings Schema:**
```typescript
interface CostGuardianFindings {
  totalCost: number;            // USD, sum of all agent costs
  budgetRemaining: number;      // USD, after this incident
  budgetExceeded: boolean;      // Signal only, does NOT throw
  perAgentCost: Record<AgentId, {  // JSON-safe for checkpointing
    inputTokens: number;
    outputTokens: number;
    cost: number;               // USD
  }>;
  projections: {
    monthlyBurn: number;        // USD, projected monthly cost
    incidentsRemaining: number; // Estimated incidents before budget exhausted
  };
}
```

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
        "budgetExceeded": total_cost > state["budget_remaining"],
        "perAgentCost": {k: v.cost for k, v in outputs.items()}
    }
    
    # Signal (do NOT throw, do NOT block)
    return budget_status
```

**Constraints:**
- Max execution time: 5 seconds
- Deterministic cost calculation
- MUST NOT throw errors (signal only)
- MUST NOT block execution (Phase 5 decides)

---

### 9. Reliability / Hallucination Auditor Agent (OPTIONAL)

**Agent ID:** `reliability-auditor`  
**Purpose:** Validate agent outputs for consistency and quality  
**Type:** Bedrock Agent (validation-focused)

**Findings Schema:**
```typescript
interface ReliabilityAuditorFindings {
  qualityScore: number;         // 0.0 - 1.0, overall quality
  contradictions: Array<{
    agents: AgentId[];
    claim1: string;
    claim2: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
  unsupportedClaims: Array<{
    agent: AgentId;
    claim: string;
    reason: string;
  }>;
  citationQuality: {
    score: number;              // 0.0 - 1.0
    missingCitations: number;
    brokenLinks: number;
  };
  hallucinationRisk: "LOW" | "MEDIUM" | "HIGH";
}
```

**Logic:**
- Check for contradictions between agents
- Detect unsupported claims (no citations)
- Validate citations and references
- Flag low-quality responses

**Constraints:**
- Max execution time: 15 seconds
- Soft auditor (signals quality, does NOT block)
- Does NOT use Bedrock Guardrails (custom validation)
- Must explain all quality issues

---

## LangGraph Interaction Rules

### State Management

**LangGraph State Schema:**
```typescript
interface LangGraphState {
  // Core context
  incidentId: string;
  evidenceBundle: EvidenceBundle;
  timestamp: string;
  
  // Agent outputs (accumulated)
  agentOutputs: Record<AgentId, AgentOutput>;  // JSON-safe for checkpointing
  
  // Execution metadata
  retryCount: Record<AgentId, number>;  // JSON-safe for checkpointing
  executionPath: string[];              // For replay
  startTime: string;
  budgetRemaining: number;
  
  // Final output
  recommendation?: Recommendation;
  error?: Error;
}
```

### Node Execution Rules

1. **Immutability** - Nodes MUST NOT mutate input state
2. **Additive Updates** - Nodes return new state with additions only
3. **Deterministic Order** - Parallel nodes aggregate in sorted order (by agent ID)
4. **Checkpointing** - State checkpointed after each node
5. **Replay Safety** - Nodes MUST produce same output given same input

### Edge Routing Rules

1. **Conditional Edges** - Based on `status` field only
2. **Parallel Execution** - All core analysis agents start simultaneously
3. **Sequential Dependencies** - Knowledge RAG waits for all 4 core agents
4. **Error Handling** - Failed nodes route to error handler
5. **Timeout Handling** - Timed-out nodes return PARTIAL status

### Retry Logic

```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception_type(BedrockException),
    before_sleep=log_retry_attempt
)
async def invoke_agent(agent_id: str, input: AgentInput) -> AgentOutput:
    # Invoke Bedrock Agent
    response = await bedrock_agent_runtime.invoke_agent(...)
    return parse_agent_output(response)
```

**Retry Rules:**
- Max 3 attempts per agent
- Exponential backoff (1s, 2s, 4s)
- Only retry on retryable errors (see Error Code Enum)
- Log all retry attempts
- Increment `retryCount` in state

---

## Replay + Determinism Guarantees

### Determinism Requirements

1. **Fixed Input** - `AgentInput` MUST be immutable
2. **Fixed Timestamp** - Use original timestamp on replay
3. **Fixed Execution Order** - Nodes execute in DAG order
4. **Fixed Aggregation** - Parallel nodes aggregate in sorted order
5. **Fixed Random Seeds** - No randomness in agent logic

### Replay Verification

```python
def verify_replay_determinism(
    original: AgentOutput,
    replayed: AgentOutput
) -> bool:
    # Check deterministic hash
    if original.replayMetadata.deterministicHash != replayed.replayMetadata.deterministicHash:
        return False
    
    # Check confidence (within tolerance)
    if abs(original.confidence - replayed.confidence) > 0.01:
        return False
    
    # Check status
    if original.status != replayed.status:
        return False
    
    # Schema and bounds match (not exact text)
    return validate_schema_match(original.findings, replayed.findings)
```

**Replay Guarantees:**
- Same input → same `deterministicHash`
- Same input → same `status`
- Same input → same `confidence` (within 0.01)
- Same input → same schema structure (not exact text)

### Non-Deterministic Elements (Allowed)

- LLM response text (exact wording may vary)
- Reasoning explanations (semantics preserved, wording may vary)
- Citation excerpts (content preserved, formatting may vary)

**Rule:** Schema and bounds MUST match, exact text MAY vary.

---

## Non-Negotiable Constraints

### Agents MUST

1. ✅ Accept `AgentInput` envelope exactly as specified
2. ✅ Return `AgentOutput` envelope exactly as specified
3. ✅ Include `disclaimer` with "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
4. ✅ Track cost (input tokens, output tokens, estimated cost)
5. ✅ Provide reasoning and confidence
6. ✅ Handle errors gracefully (return error, don't throw)
7. ✅ Respect time constraints (timeout → PARTIAL status)
8. ✅ Preserve replay metadata (deterministic hash)

### Agents MUST NOT

1. ❌ Mutate incident state
2. ❌ Execute actions
3. ❌ Write to authoritative tables (incidents, evidence)
4. ❌ Call AWS APIs directly (use action groups)
5. ❌ Throw exceptions (return error in output)
6. ❌ Block on budget exceeded (signal only)
7. ❌ Add/remove fields from output envelope
8. ❌ Produce non-deterministic hashes

### LangGraph MUST

1. ✅ Checkpoint state after each node
2. ✅ Retry on retryable errors (max 3 attempts)
3. ✅ Handle timeouts gracefully (PARTIAL status)
4. ✅ Aggregate parallel nodes in sorted order
5. ✅ Preserve execution path for replay
6. ✅ Track budget remaining
7. ✅ Support replay from any checkpoint

### LangGraph MUST NOT

1. ❌ Skip checkpointing
2. ❌ Retry on non-retryable errors
3. ❌ Mutate input state
4. ❌ Execute agents out of DAG order
5. ❌ Lose execution history

---

## Failure Semantics

### Agent Failure Modes

| Failure Mode | Status | Retryable | LangGraph Action |
|--------------|--------|-----------|------------------|
| Invalid input | FAILURE | No | Fail fast, return error |
| Timeout | TIMEOUT | No | Continue with PARTIAL |
| Bedrock throttling | FAILURE | Yes | Retry (max 3) |
| Data unavailable | PARTIAL | Yes | Retry (max 3) |
| Low confidence | SUCCESS | No | Continue (flag in output) |
| Budget exceeded | SUCCESS | No | Signal only, continue |
| Hallucination detected | SUCCESS | No | Flag in auditor output |

### Graceful Degradation

**Scenario:** 1 of 4 core analysis agents fails

**LangGraph Behavior:**
1. Continue with 3 successful agents
2. Mark failed agent as FAILURE in state
3. Pass partial results to downstream agents
4. Consensus agent notes missing input
5. Final recommendation includes disclaimer

**Scenario:** All 4 core analysis agents fail

**LangGraph Behavior:**
1. Skip Knowledge RAG agent (no context)
2. Skip Response Strategy agent (no inputs)
3. Return error to control plane
4. Log failure for investigation
5. Do NOT create recommendation

---

## Interview Defense Points

**"How did you prevent agent sprawl?"**
> "We froze agent contracts in `docs/AGENT_CONTRACTS.md` with canonical input/output envelopes. Any new agent must conform to these contracts or get Principal Architect approval. This prevented the 'just add another agent' anti-pattern."

**"How did you ensure replay determinism?"**
> "Every agent output includes a `deterministicHash` computed from input + findings. On replay, we verify the hash matches. We guarantee schema and bounds match, not exact text, because LLMs are non-deterministic."

**"How did you handle agent failures?"**
> "We defined explicit failure semantics with 4 status codes (SUCCESS, PARTIAL, TIMEOUT, FAILURE) and 15 error codes. LangGraph retries on retryable errors (max 3 attempts) and gracefully degrades on non-retryable errors."

**"How did you prevent agents from executing actions?"**
> "Hard constraint: agents MUST NOT mutate incident state or execute actions. They return recommendations only. Phase 5 (automation) is the sole executor, and it requires human approval."

**"How did you manage costs?"**
> "Dedicated Cost Guardian agent tracks per-agent costs and signals budget exceeded. It does NOT throw or block—Phase 5 decides whether to proceed. Every agent output includes token counts and estimated cost."

---

## Authority & Confidence

**Authority:** Principal Architect - This is the single source of truth  
**Confidence:** ABSOLUTE - These contracts are frozen  
**Blocker Status:** NONE - Ready for implementation  

---

## Change Control

**To modify these contracts:**
1. Submit architectural review request
2. Justify why change is necessary
3. Assess impact on existing agents
4. Update schema version
5. Get Principal Architect approval

**Minor changes (non-breaking):**
- Adding optional fields to `context`
- Adding new error codes
- Adding new agent specializations

**Major changes (breaking):**
- Changing required fields
- Removing fields
- Changing field types
- Changing validation rules

---

**This document is the guardrail. Point to it in interviews. Defend it in code reviews.**

---

**Date:** January 25, 2026  
**Status:** 🔒 FROZEN  
**Next:** Week 1 Task 3 - Extract and version prompts
