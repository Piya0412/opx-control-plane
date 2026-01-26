# opx-control-plane — Architecture (CORRECTED)

## System Identity

| Attribute | Value |
|-----------|-------|
| Name | opx-control-plane |
| Type | Production-Grade Bedrock Multi-Agent System |
| Purpose | Demonstrate senior-level capability in Bedrock + LangGraph orchestration |

**Core Truth:** Intelligence advises. Control decides. Humans approve.

**Resume Alignment:** This system demonstrates:
- Bedrock-native multi-agent architectures
- LangGraph-based stateful orchestration
- Agent-to-agent reasoning and consensus
- Production observability and governance at scale

---

## What This System IS

- A **production-grade Bedrock multi-agent system**
- A **LangGraph-orchestrated intelligence layer**
- A **deterministic control plane** for operational incidents
- A **policy enforcement engine** that fails closed
- An **audit system** where every action is replayable
- A **human-in-the-loop system** where approval is always possible

## What This System IS NOT

- ❌ NOT a Lambda-per-agent system
- ❌ NOT a custom orchestrator with fan-out
- ❌ NOT InvokeModel wrappers treated as "agents"
- ❌ NOT a chatbot or conversational UI
- ❌ NOT a demo or proof-of-concept
- ❌ NOT autonomous

---

## Architectural Layers (CORRECTED)

```
┌──────────────────────────────────────────────────────────────┐
│                   Human Interfaces                           │
│            (API / UI / Integrations)                         │
│      Read & Approve only — Never authoritative               │
└────────────────────────▲─────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────┐
│              OPX CONTROL PLANE (Authority)                   │
│                                                              │
│  • Incident / Investigation Objects                          │
│  • Deterministic Controller                                  │
│  • State Machines                                            │
│  • Policy Engine                                             │
│  • Approval & Governance                                     │
│  • Audit & Replay                                            │
└────────────────────────▲─────────────────────────────────────┘
                         │ advisory only
┌────────────────────────┴─────────────────────────────────────┐
│         LANGGRAPH ORCHESTRATION LAYER (Phase 6)              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              LangGraph State Machine                   │ │
│  │                                                        │ │
│  │  State: {                                              │ │
│  │    incidentId, evidenceBundle, agentOutputs,          │ │
│  │    consensus, confidence, budget, retries             │ │
│  │  }                                                     │ │
│  │                                                        │ │
│  │  Nodes:                                                │ │
│  │    • Budget Check Node                                 │ │
│  │    • Parallel Analysis Nodes (4 agents)                │ │
│  │    • Knowledge RAG Node                                │ │
│  │    • Response Strategy Node                            │ │
│  │    • Consensus Node                                    │ │
│  │    • Cost Guardian Node                                │ │
│  │                                                        │ │
│  │  Edges:                                                │ │
│  │    • Conditional routing (budget, confidence)          │ │
│  │    • Retry logic (per-agent, exponential backoff)      │ │
│  │    • Fallback paths (timeout, failure)                 │ │
│  │    • Partial success handling                          │ │
│  │                                                        │ │
│  │  Checkpointing:                                        │ │
│  │    • State snapshots in DynamoDB                       │ │
│  │    • Replay determinism                                │ │
│  │    • Idempotent execution                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Deployment: Single Lambda (or ECS for complex graphs)       │
│  State Store: DynamoDB (opx-langgraph-state)                │
│  Observability: CloudWatch + X-Ray                           │
└────────────────────────▲─────────────────────────────────────┘
                         │ invokes
┌────────────────────────┴─────────────────────────────────────┐
│           BEDROCK AGENTS LAYER (Phase 6)                     │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Signal Intel     │  │ Historical       │                 │
│  │ Agent            │  │ Pattern Agent    │                 │
│  │                  │  │                  │                 │
│  │ • Bedrock Agent  │  │ • Bedrock Agent  │                 │
│  │ • Action Groups  │  │ • Action Groups  │                 │
│  │ • Read-only      │  │ • Read-only      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Change Intel     │  │ Risk & Blast     │                 │
│  │ Agent            │  │ Radius Agent     │                 │
│  │                  │  │                  │                 │
│  │ • Bedrock Agent  │  │ • Bedrock Agent  │                 │
│  │ • Action Groups  │  │ • Action Groups  │                 │
│  │ • Read-only      │  │ • Read-only      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Knowledge RAG    │  │ Response         │                 │
│  │ Agent            │  │ Strategy Agent   │                 │
│  │                  │  │                  │                 │
│  │ • Bedrock Agent  │  │ • Bedrock Agent  │                 │
│  │ • Knowledge Base │  │ • Action Groups  │                 │
│  │ • Read-only      │  │ • Ranking only   │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Consensus &      │  │ Cost & Budget    │                 │
│  │ Confidence Agent │  │ Guardian Agent   │                 │
│  │                  │  │                  │                 │
│  │ • Bedrock Agent  │  │ • Bedrock Agent  │                 │
│  │ • Aggregation    │  │ • Budget Track   │                 │
│  │ • Conflict Res   │  │ • Signaling      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  Optional:                                                   │
│  ┌──────────────────┐                                        │
│  │ Reliability /    │                                        │
│  │ Hallucination    │                                        │
│  │ Auditor Agent    │                                        │
│  │                  │                                        │
│  │ • Bedrock Agent  │                                        │
│  │ • Quality Check  │                                        │
│  │ • Validation     │                                        │
│  └──────────────────┘                                        │
│                                                              │
│  All agents:                                                 │
│    • Read-only access to incident/evidence tables           │
│    • Structured JSON output                                  │
│    • Confidence scores                                       │
│    • Cost tracking                                           │
│    • NO execution authority                                  │
│    • NO state mutation                                       │
└────────────────────────▲─────────────────────────────────────┘
                         │ reads from
┌────────────────────────┴─────────────────────────────────────┐
│              DATA & EXECUTION LAYER                          │
│                                                              │
│  • DynamoDB Tables (incidents, evidence, signals)            │
│  • EventBridge (audit events)                                │
│  • AWS APIs (read-only for agents)                           │
│  • Execution Tools (Phase 9, human-approved only)            │
└──────────────────────────────────────────────────────────────┘
```

---

## LangGraph Orchestration Flow

```
START
  ↓
[Budget Check Node]
  ├─ (budget exceeded) → [Budget Signal Node] → END
  └─ (budget ok) → [Parallel Analysis]
                     ↓
[Parallel Analysis] (fan-out to 4 agents)
  ├─→ [Signal Intelligence Agent] ──┐
  ├─→ [Historical Pattern Agent] ────┤
  ├─→ [Change Intelligence Agent] ───┤
  └─→ [Risk & Blast Radius Agent] ───┘
                     ↓ (all complete or timeout)
              [Gather Results]
                     ↓
         [Knowledge RAG Agent] (with context from above)
                     ↓
      [Response Strategy Agent] (with all inputs)
                     ↓
    [Consensus & Confidence Agent] (aggregate, resolve conflicts)
                     ↓
      [Reliability Auditor] (optional quality check)
                     ↓
         [Cost Guardian] (final budget check)
                     ↓
                   END
            (return recommendation)

Retry Logic (per node):
  • 3 attempts per agent
  • Exponential backoff (1s, 2s, 4s)
  • Timeout: 30s per agent
  • Partial success: Continue with available results

Fallback Paths:
  • Agent timeout → Use partial results
  • Agent failure → Retry or skip
  • Budget exceeded → Signal and continue
  • Consensus conflict → Flag for human review
```

---

## Agent Contracts

### Input Schema (All Agents)

```typescript
interface AgentInput {
  incidentId: string;
  evidenceBundle: {
    evidenceId: string;
    detectionIds: string[];
    signalIds: string[];
    correlationKey: string;
    severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
    service: string;
    confidence: number;
    createdAt: string;
  };
  context?: {
    priorAgentOutputs?: AgentOutput[];
    timeConstraint?: number; // ms
    budgetRemaining?: number; // USD
  };
}
```

### Output Schema (All Agents)

```typescript
interface AgentOutput {
  agentId: string; // e.g., "signal-intelligence-agent"
  agentVersion: string; // e.g., "v1.0.0"
  executionId: string; // unique execution ID
  timestamp: string; // ISO-8601
  confidence: number; // 0.0 - 1.0
  reasoning: string; // explainable reasoning
  findings: AgentSpecificFindings; // varies by agent
  citations?: Citation[]; // for RAG agent
  cost: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number; // USD
  };
  metadata: {
    duration: number; // ms
    retries: number;
    model: string; // e.g., "anthropic.claude-3-sonnet"
  };
}
```

### LangGraph State Schema

```typescript
interface LangGraphState {
  // Input
  incidentId: string;
  evidenceBundle: EvidenceBundle;
  
  // Execution tracking
  executionId: string;
  startTime: string;
  
  // Agent outputs
  agentOutputs: {
    signalIntelligence?: AgentOutput;
    historicalPattern?: AgentOutput;
    changeIntelligence?: AgentOutput;
    riskBlastRadius?: AgentOutput;
    knowledgeRAG?: AgentOutput;
    responseStrategy?: AgentOutput;
  };
  
  // Consensus
  consensus?: {
    recommendation: string;
    confidence: number;
    reasoning: string;
    conflictsResolved: number;
  };
  
  // Budget tracking
  budget: {
    limit: number; // USD
    spent: number; // USD
    remaining: number; // USD
    exceeded: boolean;
  };
  
  // Retry tracking
  retries: {
    [agentId: string]: number;
  };
  
  // Checkpointing
  checkpoint: {
    nodeId: string;
    timestamp: string;
  };
}
```

---

## Global Invariants (Never Broken)

1. **Single source of truth** = control plane
2. **Deterministic state transitions** — same input → same output
3. **Fail-closed on ambiguity** — when uncertain, deny
4. **Humans retain final authority** — always
5. **All actions auditable and replayable**
6. **Intelligence never executes** — advisory only
7. **LangGraph is sole orchestrator** — no custom fan-out
8. **Bedrock Agents are native** — not InvokeModel wrappers
9. **Agent-to-agent reasoning** — consensus required
10. **Replay determinism** — checkpointed state

---

## Hard Constraints

### Agents
- ✅ NEVER execute actions
- ✅ NEVER mutate incident state
- ✅ ALWAYS produce hypotheses with confidence
- ✅ ALWAYS include reasoning and citations
- ✅ ALWAYS track cost and tokens
- ✅ ALWAYS use Bedrock Agent constructs (not Lambda wrappers)

### LangGraph
- ✅ MUST manage retries, fallbacks, partial success
- ✅ MUST support replay determinism
- ✅ MUST enforce timeouts per agent
- ✅ MUST track state transitions
- ✅ MUST handle agent failures gracefully
- ✅ MUST checkpoint state for replay

### Bedrock
- ✅ Use Bedrock Agent constructs where possible
- ✅ Do NOT treat InvokeModel wrappers as "agents"
- ✅ Use action groups for read-only queries
- ✅ Use knowledge bases for RAG (Phase 7)

---

## Technology Decisions (CORRECTED)

### Infrastructure (AWS)
- **Compute:** 
  - Control Plane: AWS Lambda (deterministic handlers)
  - LangGraph: Single Lambda or ECS (for complex graphs)
- **State:** 
  - Control Plane: DynamoDB (incidents, evidence, signals)
  - LangGraph: DynamoDB (checkpoints, state)
- **Events:** EventBridge (audit trail, event sourcing)
- **Orchestration:** 
  - Control Plane: Step Functions (state machines)
  - Intelligence: LangGraph (agent orchestration)
- **API:** API Gateway (REST)
- **IaC:** AWS CDK (TypeScript)

### Application
- **Language:** TypeScript (strict mode) + Python (LangGraph)
- **Runtime:** Node.js 20.x (control plane), Python 3.11 (LangGraph)
- **Testing:** Vitest (TypeScript), pytest (Python)
- **Validation:** Zod schemas (TypeScript), Pydantic (Python)

### Intelligence (Phase 6)
- **Orchestration:** LangGraph (stateful DAG)
- **Agents:** Amazon Bedrock Agents (native constructs)
- **LLM:** Amazon Bedrock (Claude 3 Sonnet)
- **RAG:** Bedrock Knowledge Bases (Phase 7)
- **Observability:** CloudWatch + X-Ray

---

## Data Flow Principles (CORRECTED)

1. **Inbound signals** → Control Plane validates → State updated
2. **State changes** → Audit event emitted → Immutable log
3. **Intelligence requests** → LangGraph orchestrator → Bedrock Agents (parallel) → Consensus → Structured response
4. **Actions** → Policy check → Approval required → Human approves → Execution (Phase 9)

---

## Security Model

- All mutations require authenticated principals
- Role-based access control for approvals
- No ambient authority — explicit grants only
- Audit log is append-only and immutable
- Intelligence layer has read-only credentials
- Bedrock Agents use IAM roles with least privilege
- LangGraph state encrypted at rest

---

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Invalid state transition | Reject, log, alert |
| Policy evaluation fails | DENY (fail-closed) |
| Agent timeout | Continue with partial results |
| Agent failure | Retry (3x) or skip |
| Budget exceeded | Signal and continue (no throw) |
| Consensus conflict | Flag for human review |
| LangGraph failure | Checkpoint state, retry from last checkpoint |
| Approval timeout | Escalate, do not auto-approve |
| Unknown input | Reject, require human review |

---

## Observability

### CloudWatch Dashboard
- Agent execution metrics (duration, success rate, cost)
- LangGraph state transitions
- Budget utilization
- Confidence scores
- Retry and fallback rates

### X-Ray Tracing
- End-to-end trace (control plane → LangGraph → Bedrock Agents)
- Per-agent latency
- Retry attempts
- Failure points

### Cost Tracking
- Per-agent cost (input/output tokens)
- Per-incident cost
- Monthly budget tracking
- Budget exceeded signals

---

## Document References

- [PLAN.md](./PLAN.md) — Development phases and milestones
- [NON_GOALS.md](./NON_GOALS.md) — Explicit exclusions and boundaries

---

**Last Updated:** January 25, 2026  
**Architecture Version:** 2.0 (Bedrock + LangGraph)  
**Status:** Phase 6 Refactoring in Progress
