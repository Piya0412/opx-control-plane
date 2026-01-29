# OPX Control Plane — System Overview

**Last Updated:** January 29, 2026  
**Version:** v1.0.0-production-core  
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

---

## What This System Is NOT

❌ NOT a chatbot or conversational UI  
❌ NOT a demo or proof-of-concept  
❌ NOT autonomous (no execution without approval)  
❌ NOT Lambda-per-agent architecture  
❌ NOT custom orchestrator with fan-out

---

## High-Level Architecture

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
│  • State Machine (deterministic)                            │
│  • Policy Enforcement (fail-closed)                         │
│  • Audit Trail (event-sourced)                              │
│  • Human Approval Gates                                     │
└──────────────────────────▲──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│           INTELLIGENCE LAYER (Advisory Only)                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         LangGraph Orchestrator                      │   │
│  │  • Stateful execution                               │   │
│  │  • Checkpointing                                    │   │
│  │  • Agent-to-agent reasoning                         │   │
│  │  • Consensus building                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────────┐   │
│  │         6 Bedrock Agents (Specialists)              │   │
│  │  • Signal Intelligence                              │   │
│  │  • Historical Pattern                               │   │
│  │  • Change Intelligence                              │   │
│  │  • Risk & Blast Radius                              │   │
│  │  • Knowledge RAG                                    │   │
│  │  • Response Strategy                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────────┐   │
│  │         9 Action Groups (Data Access)               │   │
│  │  • CloudWatch Metrics                               │   │
│  │  • CloudWatch Logs                                  │   │
│  │  • CloudWatch Traffic                               │   │
│  │  • CloudTrail Config                                │   │
│  │  • CloudTrail Deployments                           │   │
│  │  • X-Ray Traces                                     │   │
│  │  • X-Ray Service Graph                              │   │
│  │  • Knowledge Retrieval                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              OBSERVABILITY LAYER                            │
│                                                             │
│  • LLM Tracing (Phase 8.1)                                  │
│  • Guardrails (Phase 8.2)                                   │
│  • Output Validation (Phase 8.3)                            │
│  • Token Analytics (Phase 8.4)                              │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              KNOWLEDGE LAYER                                │
│                                                             │
│  • Bedrock Knowledge Base                                   │
│  • OpenSearch Serverless (vector search)                    │
│  • 5 Documents indexed (runbooks, postmortems)              │
│  • RAG with citations                                       │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              DATA LAYER                                     │
│                                                             │
│  • 7 DynamoDB Tables (event-sourced)                        │
│  • S3 Buckets (knowledge corpus)                            │
│  • CloudWatch Logs                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Control Plane
- **Purpose:** Authoritative state management
- **Technology:** DynamoDB event store
- **Guarantees:** Deterministic, replayable, auditable

### 2. Intelligence Layer
- **Purpose:** Advisory recommendations
- **Technology:** Bedrock Agents + LangGraph
- **Guarantees:** Never mutates state, always explainable

### 3. Observability Layer
- **Purpose:** Visibility, safety, quality
- **Technology:** CloudWatch + DynamoDB
- **Guarantees:** Complete trace, PII redacted, cost tracked

### 4. Knowledge Layer
- **Purpose:** Contextual information retrieval
- **Technology:** Bedrock Knowledge Base + OpenSearch
- **Guarantees:** Read-only, cited, graceful degradation

---

## Key Design Decisions

### 1. Fail-Closed by Default
- Safety over convenience
- Explicit approval required
- No silent failures

### 2. Intelligence Never Mutates State
- Agents advise, controllers decide
- Clear separation of concerns
- Audit trail integrity

### 3. Deterministic Behavior
- Replay produces identical results
- Event sourcing
- No hidden state

### 4. IAM-Only Security
- No API keys
- SigV4 everywhere
- AWS-native authentication

### 5. Human-in-the-Loop
- Approval always possible
- No autonomous execution (Phase 9 deferred)
- Transparency required

---

## System Guarantees

### Functional Guarantees
- ✅ All incidents are deterministically managed
- ✅ All agent recommendations are explainable
- ✅ All actions are auditable
- ✅ All LLM interactions are traced
- ✅ All PII is redacted
- ✅ All costs are tracked

### Safety Guarantees
- ✅ PII is blocked at guardrail level
- ✅ Invalid outputs trigger retries
- ✅ Fallback responses are explicit
- ✅ Budget alerts are configured
- ✅ Failure isolation is maintained

### Operational Guarantees
- ✅ System is replayable
- ✅ State is recoverable
- ✅ Failures are observable
- ✅ Costs are predictable
- ✅ Performance is monitored

---

## Technology Stack

### AWS Services
- **Compute:** Lambda (Python 3.12)
- **AI/ML:** Bedrock (Agents, Knowledge Base, Guardrails)
- **Storage:** DynamoDB, S3, OpenSearch Serverless
- **Observability:** CloudWatch (Logs, Metrics, Dashboards, Alarms)
- **IaC:** CDK (TypeScript)

### Languages
- **Infrastructure:** TypeScript (CDK)
- **Runtime:** Python 3.12 (Lambda, LangGraph)
- **Testing:** TypeScript (Vitest), Python (pytest)

### Key Libraries
- **LangGraph:** Stateful agent orchestration
- **Boto3:** AWS SDK for Python
- **Zod:** Schema validation (TypeScript)
- **Pydantic:** Data validation (Python)

---

## Deployment Model

### Infrastructure as Code
- **Tool:** AWS CDK (TypeScript)
- **Stacks:** Single unified stack (OpxPhase6Stack)
- **Deployment:** `cdk deploy`

### Environments
- **Production:** us-east-1
- **Testing:** Local + AWS (same stack)

### CI/CD
- Manual deployment (no automated pipeline yet)
- Validation gates before deployment
- Rollback capability via CDK

---

## Cost Structure

### Fixed Costs (~$380/month)
- DynamoDB tables: ~$50
- OpenSearch Serverless: ~$300
- CloudWatch dashboards: Free
- CloudWatch alarms: ~$2
- S3 storage: ~$5
- Lambda (base): ~$20

### Variable Costs (~$0.01-0.05 per incident)
- Bedrock Agent invocations: ~$0.005-0.02
- LLM token usage: ~$0.005-0.03
- DynamoDB reads/writes: ~$0.001

### Estimated Total (100 incidents/day)
- **Monthly:** ~$500-600

---

## Scalability

### Current Capacity
- **Incidents:** 1000/day (tested)
- **Agents:** 6 concurrent
- **Knowledge Base:** 5 documents (expandable to 10,000+)
- **Traces:** 90-day retention

### Scaling Limits
- **DynamoDB:** Auto-scaling enabled
- **Lambda:** 1000 concurrent executions
- **Bedrock:** Account quotas apply
- **OpenSearch:** Serverless auto-scales

---

## Security Model

### Authentication
- **IAM roles:** All service-to-service
- **SigV4:** All AWS API calls
- **No API keys:** Zero credential management

### Authorization
- **Least privilege:** Each Lambda has minimal IAM
- **Resource policies:** S3, DynamoDB, OpenSearch
- **VPC:** Not required (all AWS-native services)

### Data Protection
- **Encryption at rest:** All DynamoDB, S3, OpenSearch
- **Encryption in transit:** TLS everywhere
- **PII redaction:** Before storage
- **TTL:** 90 days for traces

---

## Observability

### Metrics
- **LLM traces:** All interactions logged
- **Token usage:** Per agent, per model
- **Cost tracking:** Real-time
- **Validation errors:** All failures logged

### Dashboards
- **Token Analytics:** 6 widgets
- **Knowledge Base:** 4 widgets (Phase 7.5 deferred)
- **Learning Operations:** (Phase 4)

### Alarms
- **Budget:** 80% and 95% thresholds
- **Guardrails:** PII violation rate
- **Validation:** High error rate
- **Cost:** Spike detection

---

## Production Readiness

### Status: ✅ PRODUCTION-READY (for advisory workloads)

**What's Complete:**
- Core control plane (Phases 1-6)
- Knowledge layer (Phases 7.1-7.4)
- Observability layer (Phases 8.1-8.4)

**What's Deferred:**
- Phase 7.5: Knowledge Base Monitoring
- Phase 8.5-8.6: Hallucination Detection & Trust Scoring
- Phase 9-10: Autonomous Execution & Advanced Forecasting

**Blocking Issues:** None

---

## Next Steps

### Immediate
1. Deploy to production environment
2. Configure budget thresholds
3. Set up SNS notifications
4. Train operators on runbook

### Short-Term (Phase 7.5)
1. Implement Knowledge Base monitoring
2. Add retrieval quality metrics
3. Configure KB-specific alarms

### Long-Term (Phase 9-10)
1. Prove observability with production data
2. Build trust scoring system
3. Enable autonomous execution (with approval)
4. Add advanced forecasting

---

**For detailed architecture, see:**
- `control-plane-architecture.md` - Control plane design
- `data-flow.md` - Data flow diagrams
- `failure-model.md` - Failure handling

**For deployment, see:**
- `docs/deployment/deployment-guide.md`
- `docs/deployment/runbook.md`
- `docs/deployment/troubleshooting.md`
