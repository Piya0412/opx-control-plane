# OPX Control Plane - System Architecture Diagram

**Version:** 1.0.0  
**Last Updated:** 2026-01-31

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPX CONTROL PLANE                                   │
│                    AI-Powered Incident Management                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1-2: SIGNAL INGESTION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CloudWatch Alarms → SNS → Lambda (Ingestor) → DynamoDB (opx-signals)     │
│                                      ↓                                      │
│                              Detection Engine                               │
│                                      ↓                                      │
│                          Correlation Rules (5-min window)                   │
│                                      ↓                                      │
│                          DynamoDB (opx-detections)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: INCIDENT CONSTRUCTION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Detections → Evidence Builder → Confidence Scoring (5 factors)            │
│                       ↓                                                     │
│               Promotion Gate (Policy Evaluation)                            │
│                       ↓                                                     │
│           DynamoDB (opx-incidents, opx-incident-events)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                  PHASE 6: MULTI-AGENT INVESTIGATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    LangGraph Executor Lambda                                │
│                              ↓                                              │
│         ┌────────────────────┴────────────────────┐                        │
│         ↓                    ↓                    ↓                        │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐               │
│  │   Signal    │      │ Historical  │      │   Change    │               │
│  │Intelligence │      │   Pattern   │      │Intelligence │               │
│  │   Agent     │      │    Agent    │      │    Agent    │               │
│  └─────────────┘      └─────────────┘      └─────────────┘               │
│         ↓                    ↓                    ↓                        │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐               │
│  │ Risk & Blast│      │  Knowledge  │      │  Response   │               │
│  │   Radius    │      │     RAG     │      │  Strategy   │               │
│  │   Agent     │      │    Agent    │      │    Agent    │               │
│  └─────────────┘      └─────────────┘      └─────────────┘               │
│         ↓                    ↓                    ↓                        │
│         └────────────────────┴────────────────────┘                        │
│                              ↓                                              │
│                      Consensus Building                                     │
│                              ↓                                              │
│                  Structured Recommendations                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                   PHASE 7: KNOWLEDGE BASE & RAG                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  S3 (Knowledge Corpus) → Deterministic Chunking → Bedrock Knowledge Base   │
│                                                            ↓                │
│                                                  OpenSearch Serverless      │
│                                                            ↓                │
│                                                   Semantic Search           │
│                                                            ↓                │
│                                              Knowledge RAG Agent            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 8: OBSERVABILITY, SAFETY & GOVERNANCE                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 8.1: LLM Tracing (Deferred)                                         │  │
│  │   - Prompt/Response logging with PII redaction                      │  │
│  │   - 90-day retention                                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 8.2: Bedrock Guardrails ✅                                          │  │
│  │   - PII Blocking (BLOCK mode)                                       │  │
│  │   - Content Filtering (WARN mode)                                   │  │
│  │   - Violations → opx-guardrail-violations                           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 8.3: Output Validation ✅                                           │  │
│  │   - Schema Validation                                               │  │
│  │   - Business Rules                                                  │  │
│  │   - Semantic Validation                                             │  │
│  │   - Automatic Retry (3x)                                            │  │
│  │   - Errors → opx-validation-errors                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 8.4: Token Analytics ✅                                             │  │
│  │   - Token usage per agent                                           │  │
│  │   - Cost calculation                                                │  │
│  │   - Budget alerts (80%, 95%)                                        │  │
│  │   - CloudWatch Dashboard                                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE STORES (DynamoDB)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Core Tables:                                                               │
│    • opx-incidents              - Current incident state                    │
│    • opx-incident-events        - Event store (authoritative)              │
│    • opx-idempotency            - Permanent idempotency keys               │
│    • opx-signals                - Normalized signals                        │
│    • opx-detections             - Detection results                         │
│                                                                             │
│  Agent Tables:                                                              │
│    • opx-langgraph-checkpoints-dev  - LangGraph state                      │
│    • opx-knowledge-documents        - Knowledge metadata                    │
│                                                                             │
│  Observability Tables:                                                      │
│    • opx-guardrail-violations   - Guardrail events                          │
│    • opx-validation-errors      - Validation failures                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY & MONITORING                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CloudWatch Dashboards:                                                     │
│    • OPX-Token-Analytics        - Token usage and costs                     │
│                                                                             │
│  CloudWatch Alarms:                                                         │
│    • OPX-Guardrails-HighContentViolationRate                                │
│    • OPX-Guardrails-HighPIIViolationRate                                    │
│    • OPX-TokenAnalytics-BudgetWarning-80pct                                 │
│    • OPX-TokenAnalytics-BudgetCritical-95pct                                │
│    • OPX-TokenAnalytics-CostSpike                                           │
│    • OPX-Validation-HighFailureRate                                         │
│    • OPX-Validation-HighRetryRate                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Signal Ingestion → Incident Creation

```
CloudWatch Alarm
    ↓
SNS Topic
    ↓
Signal Ingestor Lambda
    ↓
Normalize & Validate
    ↓
opx-signals (DynamoDB)
    ↓
Detection Engine
    ↓
Correlation Rules (5-min window)
    ↓
opx-detections (DynamoDB)
    ↓
Evidence Builder
    ↓
Confidence Scoring (5 factors)
    ↓
Promotion Gate
    ↓
opx-incidents (DynamoDB)
```

### 2. Agent Investigation Flow

```
Incident Created
    ↓
LangGraph Executor Lambda Invoked
    ↓
┌─────────────────────────────────────┐
│  Parallel Agent Execution (6 agents)│
│  • Signal Intelligence              │
│  • Historical Pattern               │
│  • Change Intelligence              │
│  • Risk & Blast Radius              │
│  • Knowledge RAG                    │
│  • Response Strategy                │
└─────────────────────────────────────┘
    ↓
Checkpoints Saved (after each agent)
    ↓
opx-langgraph-checkpoints-dev
    ↓
Consensus Building
    ↓
Structured Recommendations
    ↓
Return to Caller
```

### 3. Observability Flow

```
Agent Invocation
    ↓
┌─────────────────────────────────────┐
│  Guardrails (Sync)                  │
│  • PII Check → Block if detected    │
│  • Content Filter → Warn if harmful │
└─────────────────────────────────────┘
    ↓
Agent Execution
    ↓
┌─────────────────────────────────────┐
│  Output Validation (Sync)           │
│  • Schema Validation                │
│  • Business Rules                   │
│  • Semantic Validation              │
│  • Retry if failed (3x)             │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Token Tracking (Async)             │
│  • Count input/output tokens        │
│  • Calculate cost                   │
│  • Emit CloudWatch metrics          │
└─────────────────────────────────────┘
    ↓
CloudWatch Dashboard
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: IAM-Only Authentication                                           │
│    • No API keys                                                            │
│    • SigV4 request signing                                                  │
│    • Service-to-service via IAM roles                                       │
│                                                                             │
│  Layer 2: Least-Privilege IAM Policies                                      │
│    • Action groups: Read-only AWS SDK access                                │
│    • Agents: Cannot mutate incident state                                   │
│    • Executor: Write to checkpoints and observability tables only           │
│                                                                             │
│  Layer 3: Bedrock Guardrails                                                │
│    • PII blocking (email, phone, SSN, credit cards, AWS keys)               │
│    • Content filtering (hate, violence, sexual, self-harm)                  │
│    • Applied to all agent inputs/outputs                                    │
│                                                                             │
│  Layer 4: PII Redaction                                                     │
│    • All traces redacted before storage                                     │
│    • Regex-based pattern matching                                           │
│    • Multiple PII types covered                                             │
│                                                                             │
│  Layer 5: Encryption                                                        │
│    • DynamoDB: Encryption at rest (AWS-managed keys)                        │
│    • S3: Encryption at rest                                                 │
│    • Transit: TLS 1.2+                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COST BREAKDOWN                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Bedrock Agents (6 agents):                    $80-150/month                │
│    • Claude 3 Sonnet: $0.003/1K input, $0.015/1K output                    │
│    • ~1000 invocations/month                                                │
│    • ~500K tokens/month                                                     │
│                                                                             │
│  Lambda Functions (11 functions):              $10-20/month                 │
│    • Executor: $5-10                                                        │
│    • Action groups: $5-10                                                   │
│                                                                             │
│  DynamoDB Tables (15 tables):                  $30-50/month                 │
│    • On-demand pricing                                                      │
│    • ~1M reads, ~100K writes/month                                          │
│                                                                             │
│  OpenSearch Serverless:                        $30-50/month                 │
│    • Knowledge base indexing                                                │
│    • Semantic search                                                        │
│                                                                             │
│  CloudWatch:                                   $10-20/month                 │
│    • Logs, metrics, dashboards, alarms                                      │
│                                                                             │
│  ────────────────────────────────────────────────────────────              │
│  TOTAL:                                        $160-290/month                │
│                                                                             │
│  Per Investigation:                            <$0.50                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CDK STACKS                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OpxPhase6Stack (DEPLOYED):                                                 │
│    • 6 Bedrock Agents                                                       │
│    • 10 Action Group Lambdas                                                │
│    • 1 LangGraph Executor Lambda                                            │
│    • 1 Checkpoint Table                                                     │
│    • 1 Bedrock Guardrail                                                    │
│    • 2 Observability Tables (guardrails, validation)                        │
│    • 1 CloudWatch Dashboard                                                 │
│    • 7 CloudWatch Alarms                                                    │
│                                                                             │
│  OpxPhase7Stack (DEPLOYED):                                                 │
│    • 1 Bedrock Knowledge Base                                               │
│    • 1 OpenSearch Serverless Collection                                     │
│    • 1 S3 Bucket (knowledge corpus)                                         │
│    • 1 DynamoDB Table (knowledge documents)                                 │
│                                                                             │
│  OpxControlPlaneStack (DEPRECATED - NEVER DEPLOYED):                        │
│    • Architecture reference only                                            │
│    • Resources managed by Phase 6/7 stacks                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**Legend:**
- ✅ = Deployed and operational
- ⏸️ = Deferred (not critical for core functionality)
- ❌ = Not deployed

**Last Updated:** 2026-01-31  
**Architecture Version:** 1.0.0
