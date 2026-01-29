# OPX Control Plane — System Architecture

**Last Updated:** January 29, 2026  
**Version:** Production-Grade Core Complete  
**Status:** Production-Ready

---

## System Identity

**Name:** opx-control-plane  
**Type:** Enterprise Operational Control Plane  
**Purpose:** Production-grade Bedrock multi-agent system with LangGraph orchestration

**Core Principle:** Intelligence advises. Control decides. Humans approve.

---

## What This System Is

✅ Production-grade Bedrock multi-agent system  
✅ LangGraph-orchestrated intelligence layer  
✅ Deterministic control plane for operational incidents  
✅ Policy enforcement engine (fail-closed)  
✅ Complete audit system (replayable)  
✅ Human-in-the-loop (approval always possible)

## What This System Is NOT

❌ NOT a chatbot or conversational UI  
❌ NOT a demo or proof-of-concept  
❌ NOT autonomous (no execution without approval)  
❌ NOT Lambda-per-agent architecture  
❌ NOT custom orchestrator with fan-out

---

## Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    HUMAN INTERFACES                         │
│              (API / UI / Integrations)                      │
│         Read & Approve only — Never authoritative           │
└──────────────────────────▲──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              OPX CONTROL PLANE (Authority)                  │
│                                                             │
│  • Incident / Investigation Objects                         │
│  • Deterministic Controller                                 │
│  • State Machines (7 states)                                │
│  • Policy Engine                                            │
│  • Approval & Governance                                    │
│  • Audit & Replay                                           │
└──────────────────────────▲──────────────────────────────────┘
                           │ advisory only
┌──────────────────────────┴──────────────────────────────────┐
│         LANGGRAPH ORCHESTRATION LAYER                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           LangGraph State Machine                     │ │
│  │                                                       │ │
│  │  State: {                                             │ │
│  │    incidentId, evidenceBundle, agentOutputs,         │ │
│  │    consensus, confidence, budget, retries            │ │
│  │  }                                                    │ │
│  │                                                       │ │
│  │  Nodes:                                               │ │
│  │    • Budget Check                                     │ │
│  │    • Parallel Analysis (4 agents)                     │ │
│  │    • Knowledge RAG                                    │ │
│  │    • Response Strategy                                │ │
│  │    • Consensus                                        │ │
│  │    • Cost Guardian                                    │ │
│  │                                                       │ │
│  │  Features:                                            │ │
│  │    • Retry logic (max 3, exponential backoff)         │ │
│  │    • Fallback paths (timeout, failure)                │ │
│  │    • Partial success handling                         │ │
│  │    • DynamoDB checkpointing                           │ │
│  │    • Replay determinism                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Deployment: phase6-executor-lambda                         │
│  State Store: opx-langgraph-checkpoints                     │
└──────────────────────────▲──────────────────────────────────┘
                           │ invokes
┌──────────────────────────┴──────────────────────────────────┐
│              BEDROCK AGENTS LAYER                           │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Signal Intel    │  │ Historical      │                  │
│  │ Agent           │  │ Pattern Agent   │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Change Intel    │  │ Risk & Blast    │                  │
│  │ Agent           │  │ Radius Agent    │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Knowledge RAG   │  │ Response        │                  │
│  │ Agent           │  │ Strategy Agent  │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  Each agent has:                                            │
│    • Action groups (read-only AWS SDK calls)                │
│    • IAM roles (least privilege)                            │
│    • Bedrock Agent construct (native)                       │
└──────────────────────────▲──────────────────────────────────┘
                           │ retrieves
┌──────────────────────────┴──────────────────────────────────┐
│           KNOWLEDGE BASE LAYER                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Bedrock Knowledge Base                        │ │
│  │         (ID: HJPLE9IOEU)                               │ │
│  │                                                       │ │
│  │  • OpenSearch Serverless (opx-knowledge)              │ │
│  │  • SEMANTIC search (vector-only)                      │ │
│  │  • 5 documents indexed                                │ │
│  │  • Titan Embeddings G1                                │ │
│  │  • Read-only access                                   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Documents:                                                 │
│    • 3 runbooks (API Gateway, Lambda, RDS)                  │
│    • 2 postmortems (RDS incident, Lambda cold start)        │
└──────────────────────────▲──────────────────────────────────┘
                           │ observes
┌──────────────────────────┴──────────────────────────────────┐
│           OBSERVABILITY LAYER                               │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              LLM Tracing (Phase 8.1)                  │ │
│  │  • opx-llm-traces table                               │ │
│  │  • PII redaction                                      │ │
│  │  • Complete execution logs                            │ │
│  │  • CloudWatch metrics                                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           Bedrock Guardrails (Phase 8.2)              │ │
│  │  • Guardrail ID: xeoztij22wed                         │ │
│  │  • PII blocking (email, phone, SSN, AWS keys)         │ │
│  │  • Content filtering (WARN mode)                      │ │
│  │  • opx-guardrail-violations table                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Output Validation (Phase 8.3)                 │ │
│  │  • 3-layer validation (schema, business, semantic)    │ │
│  │  • Bounded retries (max 3)                            │ │
│  │  • Honest fallbacks (confidence: 0.0)                 │ │
│  │  • opx-validation-errors table                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │          Token Analytics (Phase 8.4)                  │ │
│  │  • OPX-Token-Analytics dashboard                      │ │
│  │  • 5 metrics (tokens, cost, efficiency)               │ │
│  │  • Budget alerts (80%, 95%, spike)                    │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### DynamoDB Tables (7 total)

1. **opx-incidents** - Current incident state
2. **opx-incident-events** - Event store (authoritative)
3. **opx-idempotency** - Permanent idempotency keys
4. **opx-langgraph-checkpoints** - LangGraph state
5. **opx-llm-traces** - LLM execution traces
6. **opx-guardrail-violations** - Guardrail violations
7. **opx-validation-errors** - Validation failures

### S3 Buckets

1. **opx-knowledge-corpus** - Knowledge Base documents

### OpenSearch Collections

1. **opx-knowledge** - Vector search for RAG

---

## Control Flow

### 1. Incident Creation
```
Signal Detected → Detection Engine → Correlation → Promotion Gate → Incident Created
```

### 2. Agent Analysis
```
Incident → LangGraph Orchestrator → Bedrock Agents → Consensus → Recommendation
```

### 3. Knowledge Retrieval
```
Agent Query → Knowledge RAG Agent → Bedrock KB → OpenSearch → Documents → Citations
```

### 4. Observability
```
Agent Invocation → Trace Emitter → opx-llm-traces → CloudWatch Metrics → Dashboard
```

---

## Key Design Decisions

### 1. Deterministic Control Plane
**Decision:** Event-sourced, replayable state machine  
**Rationale:** Audit trail, debugging, compliance  
**Trade-off:** More complex than stateless

### 2. Bedrock-Native Agents
**Decision:** Use Bedrock Agent constructs, not Lambda-per-agent  
**Rationale:** Production-grade, managed service, action groups  
**Trade-off:** Less control, AWS-specific

### 3. LangGraph Orchestration
**Decision:** Single executor Lambda with LangGraph DAG  
**Rationale:** Stateful, checkpointed, retry/fallback built-in  
**Trade-off:** Python dependency, learning curve

### 4. No IncidentId in CloudWatch Dimensions
**Decision:** IncidentId only in DynamoDB, not CloudWatch  
**Rationale:** Prevents metric explosion, cost control  
**Trade-off:** Less granular metrics

### 5. Fail-Closed by Default
**Decision:** System fails safely, no execution without approval  
**Rationale:** Safety over convenience  
**Trade-off:** Requires human intervention

### 6. Observability-First
**Decision:** Comprehensive tracing, guardrails, validation, analytics  
**Rationale:** Production readiness, debugging, governance  
**Trade-off:** Additional infrastructure cost (~$10/month)

---

## Phase Boundaries

### Phases 1-5: Foundation ✅
- Deterministic control plane
- Event sourcing
- State machines
- Policy engine

### Phase 6: Intelligence ✅
- 6 Bedrock Agents
- LangGraph orchestration
- Agent-to-agent reasoning
- Consensus mechanism

### Phase 7: Knowledge ✅
- Bedrock Knowledge Base
- RAG with citations
- 5 documents indexed
- Read-only access

### Phase 8: Observability ✅
- LLM tracing (8.1)
- Guardrails (8.2)
- Output validation (8.3)
- Token analytics (8.4)

### Phases 9-10: Deferred ⏸️
- Autonomous execution (9)
- Advanced forecasting (10)

---

## Security Model

### Authentication
- **IAM-only** - No API keys, no secrets
- **SigV4** - All AWS service calls signed

### Authorization
- **Least privilege** - Read-only where possible
- **Explicit permissions** - No wildcards

### Data Protection
- **PII redaction** - Traces redacted before storage
- **Guardrails** - PII blocking operational
- **Encryption** - At rest (DynamoDB, S3) and in transit (TLS)

### Audit
- **Complete trail** - All actions logged
- **Replay capability** - Deterministic execution
- **Permanent idempotency** - No TTL on keys

---

## Observability

### CloudWatch Dashboards (2)
1. **OPX-LLM-Tracing** - Trace metrics, latency, errors
2. **OPX-Token-Analytics** - Token usage, cost, efficiency

### CloudWatch Alarms (8)
1. High trace error rate
2. High trace latency
3. High PII violation rate
4. High content violation rate
5. High validation failure rate
6. High retry rate
7. Budget warning (80%)
8. Budget critical (95%)

### X-Ray Tracing
- End-to-end request tracing
- Service map visualization
- Performance analysis

---

## Cost Structure

### Fixed Costs (~$380/month)
- OpenSearch Serverless: $350
- DynamoDB: $5-10
- Lambda: $5-10
- CloudWatch: $10-15

### Variable Costs
- Bedrock Agent invocations: ~$0.001 per invocation
- Bedrock Model usage: ~$0.01-0.05 per incident
- Knowledge Base retrieval: ~$0.000005 per query

**Estimated Total (100 incidents/day):** ~$500-600/month

---

## Scalability

### Current Limits
- **Lambda:** 1000 concurrent executions
- **DynamoDB:** On-demand (auto-scales)
- **Bedrock:** 25 TPS per agent
- **OpenSearch:** 2 OCU (sufficient for 1000s queries/day)

### Scaling Path
- **100 incidents/day:** ✅ Current config sufficient
- **1000 incidents/day:** Increase Lambda concurrency, request Bedrock quotas
- **10,000 incidents/day:** Move to ECS, add caching, multi-region

---

## Production Readiness

### ✅ Production-Ready
- Deterministic behavior
- Complete audit trail
- IAM-only security
- Comprehensive observability
- PII protection
- Output validation
- Cost tracking
- Graceful degradation

### ⏸️ Deferred (Not Blocking)
- Load testing
- Disaster recovery procedures
- Multi-region failover
- SLO/SLI definitions

### ❌ Not Implemented (Intentional)
- Autonomous execution
- Advanced forecasting
- Hallucination detection
- Trust scoring

---

## Technology Stack

### Infrastructure
- **AWS CDK** - Infrastructure as code
- **CloudFormation** - Deployment
- **DynamoDB** - Data store
- **S3** - Object storage
- **OpenSearch Serverless** - Vector search
- **Lambda** - Compute
- **CloudWatch** - Observability

### AI/ML
- **Bedrock Agents** - Agent framework
- **Bedrock Models** - Claude 3.5 Sonnet, Claude 3 Haiku
- **Bedrock Knowledge Base** - RAG
- **Bedrock Guardrails** - Safety
- **Titan Embeddings** - Vector embeddings

### Orchestration
- **LangGraph** - State machine
- **Python 3.12** - Runtime

### Languages
- **TypeScript** - Infrastructure (CDK)
- **Python** - Application logic
- **Node.js** - Utilities

---

## References

- **PLAN.md** - Execution log
- **docs/phases/** - Phase documents
- **docs/deployment/** - Deployment guides
- **PRODUCTION_READINESS_REVIEW.md** - Production assessment

---

**Last Updated:** January 29, 2026  
**Version:** Production-Grade Core Complete  
**Status:** ✅ Production-Ready
