# Phase 8.7: Advisory Recommendation Persistence - Architecture

**Date:** 2026-01-31  
**Status:** DESIGN REVIEW

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EventBridge Event Bus                       │
│                    (IncidentCreated, StateChanged)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   LangGraph Executor Lambda                         │
│                   (Phase 6 - Agent Orchestration)                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                    Agent Execution                        │    │
│  │                                                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │    │
│  │  │   Signal     │  │ Historical   │  │   Change     │  │    │
│  │  │Intelligence  │  │   Pattern    │  │Intelligence  │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │    │
│  │                                                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │    │
│  │  │  Risk &      │  │  Knowledge   │  │  Response    │  │    │
│  │  │ Blast Radius │  │     RAG      │  │  Strategy    │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │    │
│  │                                                           │    │
│  │                    ┌──────────────┐                      │    │
│  │                    │  Consensus   │                      │    │
│  │                    │     Node     │                      │    │
│  │                    └──────────────┘                      │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │          Recommendation Persistence (NEW - Phase 8.7)     │    │
│  │                                                           │    │
│  │  1. Collect agent outputs                                │    │
│  │  2. Transform to recommendation schema                   │    │
│  │  3. Generate deterministic IDs                           │    │
│  │  4. Batch write to DynamoDB (FAIL-OPEN)                  │    │
│  │  5. Emit CloudWatch metrics                              │    │
│  │                                                           │    │
│  │  try:                                                     │    │
│  │    persist_recommendations(...)                          │    │
│  │  except Exception as e:                                  │    │
│  │    logger.warning(f"Failed: {e}")  # Non-blocking        │    │
│  │    emit_metric("Failure", 1)                             │    │
│  └───────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  opx-agent-recommendations  │   │   CloudWatch Metrics        │
│         (NEW TABLE)         │   │                             │
│                             │   │ - RecommendationsPersisted  │
│ PK: recommendationId        │   │ - PersistenceFailure        │
│ GSI: incidentId-timestamp   │   │ - PersistenceThrottled      │
│ GSI: agentType-timestamp    │   │ - PersistenceDuration       │
│ GSI: executionId-timestamp  │   │                             │
│                             │   │ Alarms:                     │
│ Attributes:                 │   │ - High failure rate (>5%)   │
│ - recommendation (Map)      │   │ - Persistent throttling     │
│ - confidence (Number)       │   └─────────────────────────────┘
│ - reasoning (String)        │
│ - citations (List)          │
│ - metadata (Map)            │
│ - ttl (90 days)             │
└─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI Inspection                              │
│                                                                     │
│  aws dynamodb query \                                               │
│    --table-name opx-agent-recommendations \                         │
│    --index-name incidentId-timestamp-index \                        │
│    --key-condition-expression "incidentId = :iid"                   │
│                                                                     │
│  OR                                                                 │
│                                                                     │
│  ./scripts/view-recommendations.sh incident-api-gateway-123         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Agent Execution (Existing)

```
EventBridge → LangGraph Executor → Bedrock Agents → Consensus
```

### 2. Recommendation Persistence (NEW)

```
Consensus Output
    ↓
Transform to Schema
    ↓
Generate IDs (deterministic)
    ↓
Batch Write to DynamoDB (fail-open)
    ↓
Emit Metrics
    ↓
Continue Execution (regardless of success/failure)
```

### 3. CLI Inspection (NEW)

```
Operator runs CLI query
    ↓
DynamoDB Query (GSI: incidentId-timestamp)
    ↓
Return recommendations (sorted by timestamp)
    ↓
Optional: Format with jq (view-recommendations.sh)
```

---

## Table Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Authoritative State                              │
│                   (Fail-Closed, Permanent)                          │
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐                │
│  │  opx-incidents   │         │ opx-incident-    │                │
│  │                  │         │     events       │                │
│  │ Current state    │◄────────│                  │                │
│  │ (materialized)   │ rebuilt │ Event store      │                │
│  │                  │  from   │ (source of truth)│                │
│  └──────────────────┘         └──────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↑
                                  │ NO FOREIGN KEYS
                                  │ NO TRIGGERS
                                  │ NO COUPLING
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      Advisory State                                 │
│                   (Fail-Open, TTL 90 days)                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │         opx-agent-recommendations (NEW)                  │     │
│  │                                                          │     │
│  │  - Advisory outputs only                                │     │
│  │  - Reference incidentId (not FK)                        │     │
│  │  - Can be deleted without affecting incidents           │     │
│  │  - Persistence failures do not block execution          │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Recommendations are **completely decoupled** from incident state.

---

## Access Patterns

### Pattern 1: Query by Incident

```
GSI: incidentId-timestamp-index
Query: incidentId = "incident-api-gateway-123"
Sort: timestamp DESC
Result: All recommendations for this incident (newest first)
```

**Use Case:** "Show me what agents recommended for this incident"

### Pattern 2: Query by Agent Type

```
GSI: agentType-timestamp-index
Query: agentType = "consensus"
Sort: timestamp DESC
Result: All consensus recommendations (newest first)
```

**Use Case:** "Show me all consensus recommendations in the last 24 hours"

### Pattern 3: Query by Execution

```
GSI: executionId-timestamp-index
Query: executionId = "exec-incident-123-1738368000.123"
Sort: timestamp DESC
Result: All recommendations from this specific execution
```

**Use Case:** "Show me all recommendations from this replay"

### Pattern 4: Get Specific Recommendation

```
GetItem: recommendationId = "rec-incident-123-signal-intelligence-2026-01-31T12:00:00Z"
Result: Single recommendation document
```

**Use Case:** "Show me what signal-intelligence recommended"

---

## Security Model

### IAM Permissions

```
┌─────────────────────────────────────────────────────────────────────┐
│                   LangGraph Executor Lambda                         │
│                                                                     │
│  IAM Role: OpxPhase6ExecutorLambdaRole                             │
│                                                                     │
│  Permissions:                                                       │
│  - dynamodb:PutItem (opx-agent-recommendations)                     │
│  - dynamodb:BatchWriteItem (opx-agent-recommendations)              │
│  - cloudwatch:PutMetricData                                         │
│  - logs:CreateLogStream, logs:PutLogEvents                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Operator CLI Access                            │
│                                                                     │
│  IAM Role: RecommendationReaderRole                                │
│                                                                     │
│  Permissions:                                                       │
│  - dynamodb:GetItem (opx-agent-recommendations)                     │
│  - dynamodb:Query (opx-agent-recommendations)                       │
│  - dynamodb:Scan (opx-agent-recommendations) [optional]             │
└─────────────────────────────────────────────────────────────────────┘
```

**Principle:** Separate write (Lambda) and read (operators) permissions.

---

## Failure Modes

### Scenario 1: DynamoDB Throttling

```
Agent Execution → Consensus → Persist Recommendations
                                      ↓
                              DynamoDB Throttled
                                      ↓
                              Log Warning
                                      ↓
                              Emit Metric (Throttled)
                                      ↓
                              Continue Execution ✅
```

**Impact:** Recommendations not saved, but execution succeeds.

### Scenario 2: Network Timeout

```
Agent Execution → Consensus → Persist Recommendations
                                      ↓
                              Network Timeout
                                      ↓
                              Log Warning
                                      ↓
                              Emit Metric (Failure)
                                      ↓
                              Continue Execution ✅
```

**Impact:** Recommendations not saved, but execution succeeds.

### Scenario 3: IAM Permission Denied

```
Agent Execution → Consensus → Persist Recommendations
                                      ↓
                              IAM AccessDenied
                                      ↓
                              Log Error
                                      ↓
                              Emit Metric (Failure)
                                      ↓
                              Continue Execution ✅
```

**Impact:** Recommendations not saved, but execution succeeds.

**Key:** All failures are **fail-open** (non-blocking).

---

## Observability

### CloudWatch Metrics

```
Namespace: OPX/Recommendations

Metrics:
- RecommendationsPersisted (Count)
  - Dimensions: AgentType, IncidentId
  - Success count per agent

- RecommendationPersistenceFailure (Count)
  - Dimensions: ErrorType
  - Failure count by error type

- RecommendationPersistenceThrottled (Count)
  - DynamoDB throttling events

- RecommendationPersistenceDuration (Milliseconds)
  - Latency of persistence operation
```

### CloudWatch Alarms

```
Alarm 1: HighRecommendationPersistenceFailureRate
- Metric: RecommendationPersistenceFailure
- Threshold: >5% over 5 minutes
- Action: SNS notification (optional)

Alarm 2: PersistentRecommendationThrottling
- Metric: RecommendationPersistenceThrottled
- Threshold: >10 throttles in 5 minutes
- Action: SNS notification (optional)
```

### CloudWatch Logs

```
Log Group: /aws/lambda/OpxPhase6Stack-Phase6ExecutorLambdaFunction...

Log Events:
- [INFO] Persisting 7 recommendations for incident-api-gateway-123
- [INFO] Successfully persisted 7 recommendations
- [WARNING] Failed to persist recommendations: DynamoDB throttled
- [ERROR] Failed to persist recommendations: IAM AccessDenied
```

---

## Cost Analysis

### DynamoDB Costs

**Table:** `opx-agent-recommendations`

**Billing Mode:** PAY_PER_REQUEST

**Estimated Usage:**
- 1000 incidents/month
- 7 recommendations per incident (6 agents + consensus)
- 7000 writes/month
- 10,000 reads/month (CLI inspection)

**Cost Calculation:**
- Writes: 7000 × $1.25/million = $0.009
- Reads: 10,000 × $0.25/million = $0.003
- Storage: 7000 items × 5KB × $0.25/GB = $0.009
- **Total: ~$0.02/month**

**With TTL (90 days):**
- Average items: 7000 × 3 months = 21,000 items
- Storage: 21,000 × 5KB × $0.25/GB = $0.026
- **Total: ~$0.05/month**

**Conclusion:** Negligible cost (<$1/month even at 10x scale).

---

## Comparison with Alternatives

### Alternative 1: Store in S3

**Pros:**
- Lower storage cost
- Unlimited retention

**Cons:**
- No queryable indexes
- Slower access (no GSI)
- More complex CLI queries
- No TTL support

**Decision:** DynamoDB preferred for queryability.

### Alternative 2: Store in CloudWatch Logs

**Pros:**
- Already used for tracing
- Integrated with existing logs

**Cons:**
- Not structured (hard to query)
- No indexes
- Expensive for long retention
- Not designed for structured data

**Decision:** DynamoDB preferred for structure.

### Alternative 3: Store in RDS

**Pros:**
- Relational queries
- Complex joins

**Cons:**
- Overkill for simple key-value access
- Higher cost
- More operational overhead
- Not serverless

**Decision:** DynamoDB preferred for simplicity.

### Alternative 4: Don't Persist (Status Quo)

**Pros:**
- No additional cost
- No additional complexity

**Cons:**
- No audit trail
- No post-incident review
- No compliance support
- No learning data

**Decision:** Persistence required for observability.

---

**Last Updated:** 2026-01-31  
**Status:** DESIGN REVIEW  
**Related:** `PHASE_8.7_DESIGN.md`, `PHASE_8.7_DESIGN_SUMMARY.md`

