# opx-control-plane — Development Plan (CORRECTED)

## Program Identity

| Attribute | Value |
|-----------|-------|
| Project | opx-control-plane |
| Type | Enterprise Operational Control Plane |
| Goal | Production-grade Bedrock multi-agent system with LangGraph orchestration |

**This system demonstrates senior-level capability in:**
- Bedrock-native multi-agent architectures
- LangGraph-based stateful orchestration
- Agent-to-agent reasoning and consensus
- Cost, reliability, and governance at scale

---

## Global Rules (Apply to ALL Phases)

1. **Fail-closed by default**
2. **Human approval is always possible**
3. **No execution without explicit approval**
4. **Intelligence never mutates authoritative state**
5. **Single authoritative control plane**
6. **Deterministic behavior only**
7. **All actions auditable and replayable**
8. **Chat / UI is never authoritative**
9. **If a phase is incomplete, STOP**

---

## Phase 0 — Program & Repo Foundation

**Status:** ✅ COMPLETE

### Objective
Lock scope and prevent AI-demo drift.

### Deliverables
- [x] Repository initialized
- [x] ARCHITECTURE.md
- [x] PLAN.md
- [x] NON_GOALS.md
- [x] Project structure established
- [x] Infrastructure scaffolded
- [x] Domain models defined
- [x] Tests passing

---

## Phase 1 — Incident Control Plane (FOUNDATION)

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-15

### Objective
Make incidents first-class, deterministic, replayable system objects.

### Key Invariants (FROZEN)
1. **DynamoDB event store is replay source** - EventBridge is fan-out only
2. **Permanent idempotency (no TTL)** - Audit trail forever
3. **IAM-only security** - No API keys, no secrets, SigV4 everywhere
4. **No AI / heuristics** - Deterministic state machine only
5. **Deterministic state transitions** - Rule-based only

### Data Model
- `opx-incidents` (current state)
- `opx-incident-events` (authoritative event store)
- `opx-idempotency` (permanent, no TTL)

### Lifecycle (FIXED)
```
CREATED → ANALYZING → DECIDED → WAITING_FOR_HUMAN → CLOSED
```

### Exit Criteria
- ✅ Incidents persist across time
- ✅ Full audit & replay works
- ✅ No intelligence present
- ✅ IAM-only enforcement
- ✅ 71 tests passing

---

## Phase 2 — Observability & Autonomous Detection

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-21

### Objective
Detect problems deterministically without deciding outcomes.

### Capabilities
- ✅ Signal ingestion with normalization
- ✅ Detection engine with rule evaluation
- ✅ Correlation threshold logic
- ✅ Fail-closed behavior
- ✅ Deterministic processing
- ✅ Complete audit trail

---

## Phase 3 — Incident Construction & Promotion

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-23

### Objective
Convert correlated evidence into authoritative incidents via explicit promotion.

### Deliverables
- ✅ Evidence model with deterministic identity
- ✅ Confidence scoring (5 factors, deterministic)
- ✅ Promotion gate (binary decision logic)
- ✅ Incident lifecycle state machine
- ✅ Idempotency & replay verification

---

## Phase 4 — Post-Incident Learning & Evaluation

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-24

### Objective
Build institutional memory after incidents are CLOSED.

### Capabilities
- ✅ Outcome recording (CLOSED incidents only)
- ✅ Human-validated feedback
- ✅ Pattern extraction (offline)
- ✅ Confidence calibration
- ✅ Resolution summaries

---

## Phase 5 — Limited Automation Infrastructure

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-24

### Objective
Infrastructure for human-approved automation with kill switch.

### Capabilities
- ✅ Automation audit trail
- ✅ Pattern extraction handlers
- ✅ Calibration handlers
- ✅ Snapshot handlers
- ✅ Kill switch mechanism
- ✅ Rate limiting
- ✅ Retry logic

---

## Phase 6 — Bedrock Multi-Agent Intelligence with LangGraph

**Status:** 🔄 REFACTORING (Lambda agents → LangGraph + Bedrock)  
**Started:** January 25, 2026

### ARCHITECTURAL CORRECTION

**Previous Implementation (REJECTED):**
- ❌ Lambda-per-agent architecture
- ❌ Custom fan-out orchestrator
- ❌ Direct `InvokeModel` wrappers treated as "agents"
- ❌ Not aligned with Bedrock + LangGraph architecture

**Why Lambda Agents Were Rejected:**
1. **Not Bedrock-native** - Wrapping InvokeModel != Bedrock Agent
2. **No stateful orchestration** - Custom fan-out lacks LangGraph capabilities
3. **Not resume-aligned** - Doesn't demonstrate LangGraph expertise
4. **Limited agent-to-agent reasoning** - No consensus, no retries, no fallbacks
5. **Not production-grade multi-agent** - Missing key orchestration patterns

**Correct Implementation (IN PROGRESS):**
- ✅ Bedrock Agents (native constructs with action groups)
- ✅ LangGraph orchestration (stateful DAG)
- ✅ Agent-to-agent reasoning and consensus
- ✅ Retry, fallback, and partial success handling
- ✅ Replay determinism preserved

### Objective
Provide deep investigation and recommendations through a production-grade multi-agent system.

### Agent System Requirements

**CORE ANALYSIS AGENTS (4)**
1. **Signal Intelligence Agent**
   - Analyzes metrics, logs, traces
   - Correlates observability signals
   - Identifies anomaly patterns
   - Output: Signal analysis with confidence

2. **Historical Incident Pattern Agent**
   - Searches similar past incidents
   - Identifies recurring patterns
   - Suggests proven resolutions
   - Output: Historical matches with similarity scores

3. **Change Intelligence Agent**
   - Correlates deployments, config changes
   - Identifies change-related causation
   - Tracks deployment timelines
   - Output: Change correlation with confidence

4. **Risk & Blast Radius Agent**
   - Estimates incident impact
   - Identifies affected services/users
   - Calculates blast radius
   - Output: Risk assessment with scope

**KNOWLEDGE & STRATEGY AGENTS (2)**
5. **Knowledge RAG Agent**
   - Searches runbooks, postmortems, docs
   - Consumes projections only (no vector store building)
   - Provides explainable citations
   - Output: Relevant knowledge with citations

6. **Response Strategy Agent**
   - Ranks potential actions
   - Estimates action effectiveness
   - NO execution authority
   - Output: Ranked recommendations only

**GOVERNANCE & QUALITY AGENTS (2)**
7. **Consensus & Confidence Agent**
   - Aggregates agent outputs
   - Resolves conflicts
   - Computes consensus confidence
   - Output: Unified recommendation with confidence

8. **Cost & Budget Guardian Agent**
   - Tracks LLM token usage
   - Enforces budget limits
   - Signals budget exceeded (does NOT throw)
   - Output: Budget status and cost tracking

**OPTIONAL (RECOMMENDED)**
9. **Reliability / Hallucination Auditor Agent**
   - Validates agent outputs for consistency
   - Detects hallucinations
   - Flags low-quality responses
   - Output: Quality assessment

### LangGraph Orchestration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  LangGraph Orchestrator                 │
│                  (Single Lambda / ECS)                  │
│                                                         │
│  State: {                                               │
│    incidentId, evidenceBundle, agentOutputs,            │
│    consensus, confidence, budget, retries               │
│  }                                                      │
│                                                         │
│  Graph:                                                 │
│    START                                                │
│      ↓                                                  │
│    [Budget Check] ──(exceeded)──→ [Budget Signal]       │
│      ↓ (ok)                                             │
│    [Parallel Analysis]                                  │
│      ├─→ [Signal Intelligence Agent]                    │
│      ├─→ [Historical Pattern Agent]                     │
│      ├─→ [Change Intelligence Agent]                    │
│      └─→ [Risk & Blast Radius Agent]                    │
│      ↓ (all complete or timeout)                        │
│    [Knowledge RAG Agent] ──(with context)──→            │
│      ↓                                                  │
│    [Response Strategy Agent] ──(with all inputs)──→     │
│      ↓                                                  │
│    [Consensus & Confidence Agent]                       │
│      ↓                                                  │
│    [Reliability Auditor] (optional)                     │
│      ↓                                                  │
│    [Cost Guardian] ──(final budget check)──→            │
│      ↓                                                  │
│    END (return recommendation)                          │
│                                                         │
│  Retry Logic:                                           │
│    - Per-agent retry (3 attempts)                       │
│    - Exponential backoff                                │
│    - Partial success handling                           │
│    - Timeout fallbacks                                  │
│                                                         │
│  Replay Determinism:                                    │
│    - Deterministic node execution order                 │
│    - Timestamped state snapshots                        │
│    - Idempotent agent calls                             │
└─────────────────────────────────────────────────────────┘
```

### Agent Contracts

**Input (All Agents):**
```typescript
{
  incidentId: string;
  evidenceBundle: EvidenceBundle;
  context?: {
    priorAgentOutputs?: AgentOutput[];
    timeConstraint?: number; // ms
    budgetRemaining?: number; // USD
  };
}
```

**Output (All Agents):**
```typescript
{
  agentId: string;
  agentVersion: string;
  executionId: string;
  timestamp: string;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  findings: AgentSpecificFindings;
  citations?: Citation[];
  cost: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number; // USD
  };
  metadata: {
    duration: number; // ms
    retries: number;
    model: string;
  };
}
```

### Hard Constraints

**Agents:**
- ✅ NEVER execute actions
- ✅ NEVER mutate incident state
- ✅ ALWAYS produce hypotheses with confidence
- ✅ ALWAYS include reasoning and citations
- ✅ ALWAYS track cost and tokens

**LangGraph:**
- ✅ MUST manage retries, fallbacks, partial success
- ✅ MUST support replay determinism
- ✅ MUST enforce timeouts per agent
- ✅ MUST track state transitions
- ✅ MUST handle agent failures gracefully

**Bedrock:**
- ✅ Use Bedrock Agent constructs where possible
- ✅ Do NOT treat InvokeModel wrappers as "agents"
- ✅ Use action groups for read-only queries
- ✅ Use knowledge bases for RAG (Phase 7)

### Infrastructure

**LangGraph Deployment:**
- Single Lambda function (or ECS for complex graphs)
- State persistence in DynamoDB
- Checkpointing for replay
- CloudWatch metrics and X-Ray tracing

**Bedrock Agents:**
- 8+ Bedrock Agent resources
- Action groups for read-only operations
- IAM roles with least privilege
- Cost tracking per agent

**Observability:**
- CloudWatch dashboard (agent performance)
- X-Ray tracing (end-to-end)
- Cost tracking (per agent, per incident)
- Quality metrics (confidence, hallucination rate)

### Data Model

**Tables:**
- `opx-agent-recommendations` - Final recommendations
- `opx-agent-executions` - Execution logs (redacted LLM I/O)
- `opx-langgraph-state` - LangGraph checkpoints

**Schemas:**
- Agent input/output contracts
- LangGraph state schema
- Recommendation schema

### Exit Criteria

- [ ] 8+ Bedrock Agents deployed
- [ ] LangGraph orchestrator deployed
- [ ] Agent-to-agent reasoning working
- [ ] Consensus mechanism validated
- [ ] Retry and fallback logic tested
- [ ] Replay determinism verified
- [ ] Cost tracking operational
- [ ] Observability dashboard live
- [ ] All agents fail safely
- [ ] Controller remains deterministic
- [ ] Recommendations auditable
- [ ] Structured output validated

### Migration Plan

**Phase 1: Preserve Logic**
- Extract agent logic from Lambda functions
- Convert to LangGraph node functions
- Preserve prompts, reasoning, validation

**Phase 2: Build LangGraph**
- Define state schema
- Build DAG with nodes and edges
- Implement retry and fallback logic
- Add consensus node

**Phase 3: Deploy Bedrock Agents**
- Create Bedrock Agent resources
- Define action groups (read-only)
- Configure IAM roles
- Test agent invocation

**Phase 4: Integration**
- Connect LangGraph to Bedrock Agents
- Wire up state persistence
- Add observability
- Test end-to-end

**Phase 5: Cleanup**
- Remove Lambda-per-agent infrastructure
- Remove custom orchestrator
- Update documentation
- Verify tests

---

## Phase 7 — RAG & Knowledge Intelligence Layer

**Status:** 🔲 NOT STARTED

### Objective
Augment agents with institutional knowledge through vector search.

### Capabilities
- Vector embeddings (Bedrock Titan Embeddings)
- Knowledge base (Bedrock Knowledge Bases)
- Deterministic chunking & versioning
- Explainable citations

### Rules
- Read-only
- Explainable citations
- Deterministic retrieval
- No mid-incident embedding updates

---

## Phase 8 — LLM Observability, Safety & Governance

**Status:** 🔲 NOT STARTED

### Objective
Make AI behavior observable, auditable, and governable.

### Includes
- Prompt/response tracing
- Cost & latency metrics
- Guardrails enforcement
- Structured output validation
- Token usage tracking
- Hallucination detection

---

## Phase 9 — Human-Approved Autonomous Execution

**Status:** 🔲 NOT STARTED

### Objective
Allow tightly scoped execution only after trust is proven.

### Rules
- Explicit human approval
- Idempotent actions
- Instant rollback
- Global kill switch

---

## Milestone Summary

| Phase | Name | AI Allowed | Authority | Status |
|-------|------|------------|-----------|--------|
| 0 | Foundation | ❌ | Deterministic | ✅ COMPLETE |
| 1 | Incident Control Plane | ❌ | Deterministic | ✅ COMPLETE |
| 2 | Observability & Detection | ❌ | Deterministic | ✅ COMPLETE |
| 3 | Incident Construction | ❌ | Deterministic | ✅ COMPLETE |
| 4 | Post-Incident Learning | ✅ Offline | Read-only | ✅ COMPLETE |
| 5 | Automation Infrastructure | ✅ Gated | Human-approved | ✅ COMPLETE |
| 6 | Bedrock + LangGraph Agents | ✅ Advisory | None | 🔄 REFACTORING |
| 7 | RAG Knowledge Layer | ✅ Advisory | None | 🔲 NOT STARTED |
| 8 | AI Governance | ✅ | Governed | 🔲 NOT STARTED |
| 9 | Human-Approved Automation | ✅ | Gated | 🔲 NOT STARTED |

---

## Final Note

This project is a **production-grade Bedrock multi-agent system** demonstrating:
- Senior-level Bedrock architecture
- LangGraph stateful orchestration
- Agent-to-agent reasoning and consensus
- Production observability and governance

**This is not a demo. This is a resume-defining platform.**

---

**Last Updated:** January 25, 2026  
**Current Phase:** 6 (Bedrock + LangGraph Refactor)  
**Overall Progress:** 5.2 / 10 phases (52%)
