# Phase 8.7: Advisory Recommendation Persistence

**Status:** DESIGN REVIEW  
**Phase:** 8.7 (LLM Observability & Governance)  
**Date:** 2026-01-31  
**Author:** System Design

---

## Executive Summary

Phase 8.7 introduces **advisory recommendation persistence** - a read-only audit trail of agent outputs that enables CLI inspection without enabling autonomous execution or modifying authoritative incident state.

**What it IS:**
- Persistent storage of agent recommendations
- CLI-inspectable advisory outputs
- Audit trail for agent reasoning
- Non-blocking, fail-open persistence layer

**What it is NOT:**
- Autonomous execution capability
- Approval workflow system
- Trust scoring mechanism
- UI or dashboard
- Modification of incident state

---

## 1. Architectural Intent

### 1.1 Purpose

**Problem Statement:**
Currently, agent recommendations (root cause analysis, confidence scores, blast radius assessment, suggested actions) are returned at runtime but never persisted. This creates gaps in:
- Post-incident review ("What did the agents recommend?")
- Debugging agent behavior ("Why did this recommendation change?")
- Compliance auditing ("What advice was available to the operator?")
- Learning and calibration (Phase 4 integration)

**Solution:**
Persist agent outputs in a **separate, advisory-only table** that:
- Does NOT influence incident state
- Does NOT trigger automation
- Does NOT require approval workflows
- DOES enable CLI inspection
- DOES provide audit trail

### 1.2 Relationship to Phase 8

Phase 8 focuses on **LLM Observability & Governance**:

| Phase | Focus | Status |
|-------|-------|--------|
| 8.1 | LLM Tracing | ✅ COMPLETE |
| 8.2 | Bedrock Guardrails | ✅ COMPLETE |
| 8.3 | Output Validation | ✅ COMPLETE |
| 8.4 | Token Analytics | ✅ COMPLETE |
| 8.5 | Hallucination Detection | ⏸️ DEFERRED |
| 8.6 | Trust Scoring | ⏸️ DEFERRED |
| **8.7** | **Advisory Persistence** | 🔄 DESIGN |

Phase 8.7 completes the observability layer by making agent outputs **visible and auditable** without crossing into execution (Phase 9).

### 1.3 Safety Principles Preserved

**Principle 1: Intelligence never mutates state**
- ✅ Recommendations stored in separate table (`opx-agent-recommendations`)
- ✅ Incident state (`opx-incidents`, `opx-incident-events`) remains untouched
- ✅ No foreign keys or references from incidents to recommendations

**Principle 2: Agents advise, controllers decide**
- ✅ Agents produce recommendations
- ✅ Controller persists recommendations (not agents)
- ✅ Humans inspect recommendations via CLI
- ✅ No automatic execution

**Principle 3: Fail-closed by default**
- ✅ Recommendation persistence is **fail-open** (non-blocking)
- ✅ Agent execution succeeds even if persistence fails
- ✅ Missing recommendations do not block incident handling

**Principle 4: Deterministic behavior**
- ✅ Recommendations include execution metadata (session_id, checkpoint_id)
- ✅ Replay produces functionally identical outputs (same agent reasoning and recommendations)
- ✅ Each replay creates new persisted records (versioned per execution)
- ✅ Timestamps and IDs enable correlation across replay executions

**Clarification on Replay Determinism:**
- **Functional Determinism:** Replaying an execution with the same inputs produces the same agent outputs (root cause, confidence, actions).
- **Persistence Versioning:** Each replay creates new recommendation records with unique IDs and timestamps.
- **Why Both?** Functional determinism enables debugging and verification. Persistence versioning enables comparison across replays and audit of when recommendations were generated.

**Principle 5: All actions auditable**
- ✅ Complete audit trail of what agents recommended
- ✅ Queryable by incident, agent, timestamp
- ✅ Immutable records (no updates, only inserts)

---

## 2. Data Model

### 2.1 Table Design

**Table Name:** `opx-agent-recommendations`

**Purpose:** Store advisory outputs from agent executions for inspection and audit.

**Schema:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `recommendationId` (PK) | String | `rec-{incidentId}-{agentName}-{timestamp}` |
| `incidentId` (GSI PK) | String | Incident this recommendation relates to |
| `executionId` | String | LangGraph execution ID (session_id) |
| `agentName` | String | Agent that produced recommendation |
| `agentType` | String | Agent category (signal, historical, change, risk, knowledge, response, consensus) |
| `timestamp` | String | ISO 8601 timestamp |
| `recommendation` | Map | Structured agent output |
| `confidence` | Number | Confidence score (0.0-1.0) |
| `reasoning` | String | Agent's reasoning (optional) |
| `citations` | List | Knowledge base citations (if applicable) |
| `metadata` | Map | Execution context (checkpoint_id, cost, tokens, duration) |
| `status` | String | `GENERATED`, `SUPERSEDED`, `ARCHIVED` |
| `approved` | Boolean | Human approval flag (optional, for Phase 9 integration) |
| `ttl` | Number | Expiration timestamp (90 days default) |

**Primary Key Choice Rationale:**

We chose `recommendationId` as the partition key (rather than `incidentId` + `timestamp` as composite key) for the following reasons:

1. **Immutable Records:** Each recommendation is a unique, immutable document. Direct access by ID is the primary pattern.
2. **Multi-Dimensional Queries:** GSIs enable efficient queries by incident, agent type, and execution without hot partitions.
3. **Future Flexibility:** Allows recommendations to exist independently of incidents (e.g., proactive recommendations, what-if analysis).
4. **Replay Versioning:** Each replay creates new recommendations with unique IDs, enabling comparison across executions.

**Trade-off:** Querying all recommendations for an incident requires a GSI query (not a direct partition query). This is acceptable because:
- GSI queries are efficient and well-indexed
- Incident-based queries are less frequent than direct ID lookups
- Avoids hot partitions for high-volume incidents

**Alternative considered:** `PK: incidentId, SK: timestamp` would optimize for incident-based queries but would:
- Create hot partitions for high-volume incidents
- Complicate multi-dimensional queries (agent type, execution ID)
- Reduce flexibility for future use cases


### 2.2 Access Patterns

**Pattern 1: Query recommendations by incident**
```
GSI: incidentId-timestamp-index
Query: incidentId = "incident-api-gateway-123"
Sort: timestamp DESC
Use case: "Show me all recommendations for this incident"
```

**Pattern 2: Get specific recommendation**
```
GetItem: recommendationId = "rec-incident-123-signal-intelligence-2026-01-31T12:00:00Z"
Use case: "Show me what signal-intelligence recommended"
```

**Pattern 3: Query recommendations by agent type**
```
GSI: agentType-timestamp-index
Query: agentType = "consensus"
Sort: timestamp DESC
Use case: "Show me all consensus recommendations in the last 24 hours"
```

**Pattern 4: Query recommendations by execution**
```
GSI: executionId-timestamp-index
Query: executionId = "exec-incident-123-1738368000.123"
Use case: "Show me all recommendations from this specific execution"
```

### 2.3 Recommendation Structure

**Example recommendation document:**

```json
{
  "recommendationId": "rec-incident-api-gateway-123-signal-intelligence-2026-01-31T12:00:00Z",
  "incidentId": "incident-api-gateway-123",
  "executionId": "exec-incident-api-gateway-123-1738368000.123",
  "agentName": "signal-intelligence",
  "agentType": "signal",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "recommendation": {
    "rootCause": "Database connection pool exhaustion",
    "affectedServices": ["api-gateway", "user-service"],
    "blastRadius": "SINGLE_SERVICE",
    "suggestedActions": [
      "Scale RDS read replicas",
      "Increase connection pool size",
      "Enable connection pooling in application"
    ],
    "estimatedImpact": "HIGH",
    "urgency": "IMMEDIATE"
  },
  "confidence": 0.87,
  "reasoning": "High correlation between connection pool metrics and error rate spike. Historical pattern matches 2024-01-15 incident.",
  "citations": [
    {
      "source": "runbook-rds-connection-pool.md",
      "relevance": 0.92,
      "excerpt": "When connection pool utilization exceeds 90%..."
    }
  ],
  "metadata": {
    "checkpointId": "1f0fe514-48c6-6d05-bfff-2306641408c57",
    "cost": 0.0042,
    "inputTokens": 1250,
    "outputTokens": 380,
    "durationMs": 2340,
    "guardrailsPassed": true,
    "validationPassed": true
  },
  "status": "GENERATED",
  "approved": false,
  "ttl": 1746115200
}
```

**Status Field Values:**
- `GENERATED`: Initial state when recommendation is created
- `SUPERSEDED`: A newer recommendation for the same incident/agent exists
- `ARCHIVED`: Manually archived by operator (not deleted, for audit)

**Approval Field Governance (Phase 9 Integration):**

The `approved` field is reserved for future Phase 9 (Autonomous Execution) integration. **Critical governance rules:**

1. **Only humans or external approval systems may set `approved = true`**
   - Agents MUST NOT set this field
   - LangGraph executor MUST NOT set this field
   - Only explicit human action or external approval workflow

2. **Default value is `false` (or omitted)**
   - All recommendations start as unapproved
   - Approval is opt-in, not opt-out

3. **Immutability after approval**
   - Once `approved = true`, the recommendation MUST NOT be modified
   - Any changes require creating a new recommendation

4. **Audit trail required**
   - Approval events MUST be logged separately (e.g., `opx-approval-events`)
   - Must include: who approved, when, why (optional)

**Why this matters:**
- Protects Phase 9 from accidental auto-approval
- Ensures human-in-the-loop for execution decisions
- Maintains audit trail for compliance
- Prevents agents from approving their own recommendations

**Phase 8.7 Implementation:**
- Field is created but never set to `true`
- Always `false` or omitted
- Documented for future use


### 2.4 Explicit Separation from Authoritative State

**Critical Design Decision:**

The `opx-agent-recommendations` table is **completely decoupled** from incident state:

| Aspect | Incident State | Recommendations |
|--------|---------------|-----------------|
| **Tables** | `opx-incidents`, `opx-incident-events` | `opx-agent-recommendations` |
| **Authority** | Source of truth | Advisory only |
| **Mutability** | Immutable events, mutable state | Immutable recommendations |
| **Foreign Keys** | None | `incidentId` (reference only, not FK) |
| **Lifecycle** | Permanent (RETAIN) | TTL (90 days) |
| **Access** | Controller writes, UI reads | Controller writes, CLI reads |
| **Failure Mode** | Fail-closed (must succeed) | Fail-open (can fail) |

**Why this matters:**
- Deleting recommendations does NOT affect incidents
- Incident state can be rebuilt without recommendations
- Recommendations can be purged for compliance without data loss
- No circular dependencies or coupling

---

## 3. Control Flow

### 3.1 Component Ownership

**Who writes recommendations?**

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Executor Lambda                │
│                  (Phase 6 - Agent Orchestration)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌───────────────────┐                 ┌───────────────────┐
│  Agent Execution  │                 │  Recommendation   │
│   (Bedrock API)   │                 │   Persistence     │
│                   │                 │   (NEW)           │
│ - Invoke agents   │                 │                   │
│ - Collect outputs │────────────────>│ - Validate output │
│ - Build consensus │                 │ - Write to table  │
│                   │                 │ - Emit metrics    │
└───────────────────┘                 └───────────────────┘
                                                ↓
                                      ┌───────────────────┐
                                      │ opx-agent-        │
                                      │ recommendations   │
                                      └───────────────────┘
```

**Key principle:** The **LangGraph executor Lambda** (not individual agents) writes recommendations.

**Why?**
- Agents are read-only (action groups cannot write to DynamoDB)
- Controller has full context (incident ID, execution ID, metadata)
- Single point of persistence (no distributed writes)
- Easier to audit and secure


### 3.2 Persistence Flow

**Step-by-step execution:**

1. **Incident Created** → EventBridge triggers LangGraph executor
2. **Agents Execute** → 6 agents analyze incident in parallel
3. **Outputs Collected** → Executor gathers agent responses
4. **Validation** → Phase 8.3 validates outputs (schema, business, semantic)
5. **Consensus** → Consensus node synthesizes recommendations
6. **Persistence** → **NEW: Write recommendations to table**
7. **Response** → Return to caller (existing behavior)

**Pseudocode:**

```python
# In LangGraph executor Lambda (infra/phase6/lambda/graph.py)

async def execute_graph(incident_id: str, evidence_bundle: dict):
    # Existing: Execute agents
    agent_outputs = await run_agents(evidence_bundle)
    
    # Existing: Build consensus
    consensus = await consensus_node(agent_outputs)
    
    # NEW: Persist recommendations (fail-open)
    try:
        await persist_recommendations(
            incident_id=incident_id,
            execution_id=get_execution_id(),
            agent_outputs=agent_outputs,
            consensus=consensus
        )
    except Exception as e:
        # Log error but DO NOT fail execution
        logger.warning(f"Failed to persist recommendations: {e}")
        emit_metric("RecommendationPersistenceFailure", 1)
    
    # Existing: Return response
    return consensus
```

### 3.3 Persistence Logic

**New module:** `infra/phase6/lambda/recommendation_persistence.py`

**Responsibilities:**
1. Transform agent outputs into recommendation schema
2. Generate deterministic recommendation IDs
3. Write to DynamoDB (batch write for efficiency)
4. Emit CloudWatch metrics
5. Handle failures gracefully (log, metric, continue)

**Key operations:**

```python
def persist_recommendations(
    incident_id: str,
    execution_id: str,
    agent_outputs: dict,
    consensus: dict
) -> None:
    """
    Persist agent recommendations to DynamoDB.
    
    This is FAIL-OPEN: Errors are logged but do not block execution.
    """
    recommendations = []
    
    # Transform each agent output
    for agent_name, output in agent_outputs.items():
        rec = build_recommendation(
            incident_id=incident_id,
            execution_id=execution_id,
            agent_name=agent_name,
            output=output
        )
        recommendations.append(rec)
    
    # Add consensus recommendation
    consensus_rec = build_recommendation(
        incident_id=incident_id,
        execution_id=execution_id,
        agent_name="consensus",
        output=consensus
    )
    recommendations.append(consensus_rec)
    
    # Batch write (up to 25 items)
    batch_write_recommendations(recommendations)
    
    # Emit success metric
    emit_metric("RecommendationsPersisted", len(recommendations))
```


---

## 4. Failure Handling

### 4.1 Fail-Open Design

**Critical principle:** Recommendation persistence MUST be **fail-open** (non-blocking).

**Why?**
- Recommendations are advisory, not authoritative
- Agent execution must succeed even if persistence fails
- Incident handling cannot be blocked by audit trail failures
- Observability should not reduce reliability

**Failure scenarios:**

| Failure | Impact | Handling |
|---------|--------|----------|
| DynamoDB throttling | Recommendations not saved | Log warning, emit metric, continue |
| Network timeout | Recommendations not saved | Log warning, emit metric, continue |
| Validation error | Invalid recommendation | Log error, skip item, continue |
| IAM permission denied | Recommendations not saved | Log error, emit metric, continue |
| Table does not exist | Recommendations not saved | Log error, emit metric, continue |

**Implementation:**

```python
try:
    persist_recommendations(...)
except DynamoDBThrottlingException as e:
    logger.warning(f"DynamoDB throttled: {e}")
    emit_metric("RecommendationPersistenceThrottled", 1)
except Exception as e:
    logger.error(f"Failed to persist recommendations: {e}")
    emit_metric("RecommendationPersistenceFailure", 1)
# Execution continues regardless
```

### 4.2 Observability of Failures

**CloudWatch Metrics:**
- `RecommendationsPersisted` (Count) - Success count
- `RecommendationPersistenceFailure` (Count) - Failure count
- `RecommendationPersistenceThrottled` (Count) - Throttling count
- `RecommendationPersistenceDuration` (Milliseconds) - Latency

**CloudWatch Alarms:**
- High failure rate (>5% over 5 minutes)
- Persistent throttling (>10 throttles in 5 minutes)

**Logs:**
- All failures logged with full context
- Includes incident ID, execution ID, error details
- Searchable via CloudWatch Logs Insights

### 4.3 Retry Strategy

**No retries at persistence layer.**

**Why?**
- Fail-open design means failures are acceptable
- Retries increase latency (blocking agent execution)
- DynamoDB throttling is self-correcting (exponential backoff in SDK)
- Missing recommendations can be regenerated via replay

**Alternative:** If recommendations are critical for audit, implement **asynchronous retry**:
1. Persistence fails → Write to SQS dead-letter queue
2. Separate Lambda processes DLQ
3. Retries persistence with exponential backoff
4. Does not block agent execution

**Decision:** Start without async retry. Add if audit requirements demand it.

---

## 5. CLI Inspection

### 5.1 Query Patterns

**Pattern 1: View all recommendations for an incident**

```bash
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name incidentId-timestamp-index \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values '{":iid":{"S":"incident-api-gateway-123"}}' \
  --scan-index-forward false \
  --limit 10
```

**Expected output:**
- List of recommendations sorted by timestamp (newest first)
- Each recommendation shows agent name, confidence, reasoning
- Includes metadata (cost, tokens, duration)


**Pattern 2: View specific agent's recommendation**

```bash
aws dynamodb get-item \
  --table-name opx-agent-recommendations \
  --key '{"recommendationId":{"S":"rec-incident-api-gateway-123-signal-intelligence-2026-01-31T12:00:00Z"}}'
```

**Expected output:**
- Full recommendation document
- Structured output (root cause, actions, blast radius)
- Reasoning and citations
- Execution metadata

**Pattern 3: View consensus recommendation**

```bash
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name incidentId-timestamp-index \
  --key-condition-expression "incidentId = :iid" \
  --filter-expression "agentType = :type" \
  --expression-attribute-values '{":iid":{"S":"incident-api-gateway-123"},":type":{"S":"consensus"}}' \
  --scan-index-forward false \
  --limit 1
```

**Expected output:**
- Final consensus recommendation
- Synthesized from all agent outputs
- Highest confidence and most actionable

**Pattern 4: View recommendations by execution**

```bash
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name executionId-timestamp-index \
  --key-condition-expression "executionId = :eid" \
  --expression-attribute-values '{":eid":{"S":"exec-incident-api-gateway-123-1738368000.123"}}'
```

**Expected output:**
- All recommendations from a single execution
- Useful for replay debugging
- Shows agent-by-agent progression

### 5.2 Human-Readable Output

**Challenge:** DynamoDB JSON is verbose and hard to read.

**Solution:** Provide helper script for formatted output.

**Script:** `scripts/view-recommendations.sh`

```bash
#!/bin/bash
# Usage: ./scripts/view-recommendations.sh incident-api-gateway-123

INCIDENT_ID=$1

aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name incidentId-timestamp-index \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values "{\":iid\":{\"S\":\"${INCIDENT_ID}\"}}" \
  --scan-index-forward false \
  | jq -r '.Items[] | {
      agent: .agentName.S,
      confidence: .confidence.N,
      rootCause: .recommendation.M.rootCause.S,
      actions: .recommendation.M.suggestedActions.L[].S,
      timestamp: .timestamp.S
    }'
```

**Output:**
```json
{
  "agent": "signal-intelligence",
  "confidence": "0.87",
  "rootCause": "Database connection pool exhaustion",
  "actions": [
    "Scale RDS read replicas",
    "Increase connection pool size"
  ],
  "timestamp": "2026-01-31T12:00:00.000Z"
}
```


### 5.3 Integration with Demo

**Update:** `scripts/demo_incident.py`

Add inspection step after agent execution:

```python
def print_inspection_guide(incident_id: str, service: str):
    # ... existing steps ...
    
    print(f"\n8️⃣  View Agent Recommendations:")
    print(f"   aws dynamodb query \\")
    print(f"     --table-name opx-agent-recommendations \\")
    print(f"     --index-name incidentId-timestamp-index \\")
    print(f"     --key-condition-expression \"incidentId = :iid\" \\")
    print(f"     --expression-attribute-values '{{\":iid\":{{\"S\":\"{incident_id}\"}}}}' \\")
    print(f"     --scan-index-forward false")
    
    print(f"\n   Or use helper script:")
    print(f"   ./scripts/view-recommendations.sh {incident_id}")
```

---

## 6. Security & Governance

### 6.1 IAM Permissions

**LangGraph Executor Lambda Role:**

```typescript
// Grant write access to recommendations table
recommendationsTable.grantWriteData(executorLambda);

// Explicit permissions
new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'dynamodb:PutItem',
    'dynamodb:BatchWriteItem'
  ],
  resources: [recommendationsTable.tableArn]
})
```

**Read-only access for operators:**

```typescript
// Create read-only role for CLI inspection
const operatorRole = new iam.Role(this, 'RecommendationReaderRole', {
  assumedBy: new iam.AccountPrincipal(this.account),
  description: 'Read-only access to agent recommendations'
});

recommendationsTable.grantReadData(operatorRole);
```

**Key principle:** Recommendations table has **separate IAM policies** from incident tables.

### 6.2 Blast Radius Analysis

**Question:** Does Phase 8.7 increase blast radius?

**Answer:** No. Here's why:

| Risk | Mitigation |
|------|------------|
| **Unauthorized writes** | Only executor Lambda can write (IAM enforced) |
| **Data corruption** | Recommendations are advisory, not authoritative |
| **Incident state mutation** | No foreign keys, no triggers, no coupling |
| **Execution blocking** | Fail-open design, errors do not block agents |
| **Cost explosion** | TTL (90 days), batch writes, throttling alarms |
| **PII leakage** | Guardrails (8.2) already redact PII in agent outputs |

**Conclusion:** Phase 8.7 adds observability without increasing risk.


### 6.3 Auditability

**What is auditable?**

1. **Who generated recommendations?**
   - Agent name and type in every record
   - Execution ID links to LLM traces (Phase 8.1)
   - Checkpoint ID enables replay

2. **When were recommendations generated?**
   - ISO 8601 timestamps
   - Queryable by time range
   - Sortable for chronological analysis

3. **What was recommended?**
   - Full recommendation structure
   - Reasoning and citations
   - Confidence scores

4. **Why was it recommended?**
   - Agent reasoning field
   - Citations to knowledge base
   - Metadata (tokens, cost, duration)

5. **What happened to the recommendation?**
   - Status field (`GENERATED`, `SUPERSEDED`, `ARCHIVED`)
   - TTL for automatic cleanup
   - Immutable (no updates, only inserts)

**Compliance benefits:**
- Complete audit trail for regulatory review
- Demonstrates AI transparency
- Enables post-incident analysis
- Supports learning and calibration (Phase 4)

### 6.4 Data Retention

**TTL Policy:** 90 days (configurable)

**Rationale:**
- Recommendations are advisory, not authoritative
- Long enough for post-incident review (30-60 days typical)
- Short enough to avoid unbounded storage costs
- Compliance requirements vary (adjust as needed)

**Implementation:**

```typescript
recommendationsTable.addTimeToLive({
  attributeName: 'ttl',
  enabled: true
});
```

**TTL calculation:**

```python
import time

ttl = int(time.time()) + (90 * 24 * 60 * 60)  # 90 days from now
```

**Override for critical incidents:**
- Set `ttl = 0` to disable expiration
- Useful for incidents requiring long-term retention
- Operator can manually set via CLI

---

## 7. Documentation Updates

### 7.1 New Documentation

**Create:**

1. **`docs/phases/phase-8/PHASE_8.7_DESIGN.md`** (this document)
   - Complete design specification
   - Architecture, data model, control flow
   - Security, governance, CLI usage

2. **`docs/phases/phase-8/PHASE_8.7_IMPLEMENTATION.md`**
   - Implementation checklist
   - Code changes required
   - Testing strategy
   - Deployment steps

3. **`docs/deployment/RECOMMENDATION_INSPECTION.md`**
   - CLI query reference
   - Helper scripts
   - Common use cases
   - Troubleshooting

4. **`scripts/view-recommendations.sh`**
   - Human-readable output formatter
   - Usage examples
   - Integration with demo


### 7.2 Update Existing Documentation

**Update:**

1. **`PLAN.md`**
   - Add Phase 8.7 to phase status table
   - Update Phase 8 completion status
   - Add to "Completed Phases" section

2. **`docs/phases/phase-8/DESIGN.md`**
   - Add Phase 8.7 overview
   - Update Phase 8 summary
   - Link to Phase 8.7 design doc

3. **`docs/deployment/QUERY_REFERENCE.md`**
   - Add `opx-agent-recommendations` table schema
   - Add query examples
   - Add to table list

4. **`docs/demo/DEMO_WALKTHROUGH.md`**
   - Add step 8: "View Agent Recommendations"
   - Add CLI query example
   - Add to inspection guide

5. **`README.md`**
   - Update Phase 8 status
   - Add recommendation persistence to capabilities
   - Update system diagram (if applicable)

### 7.3 Documentation Structure

```
docs/
├── phases/
│   └── phase-8/
│       ├── DESIGN.md (update)
│       ├── PHASE_8.7_DESIGN.md (new)
│       └── PHASE_8.7_IMPLEMENTATION.md (new)
├── deployment/
│   ├── QUERY_REFERENCE.md (update)
│   └── RECOMMENDATION_INSPECTION.md (new)
└── demo/
    └── DEMO_WALKTHROUGH.md (update)

scripts/
└── view-recommendations.sh (new)

PLAN.md (update)
README.md (update)
```

---

## 8. Explicit Non-Goals

### 8.1 What Phase 8.7 Will NOT Do

**1. Autonomous Execution**
- ❌ Recommendations do NOT trigger actions
- ❌ No automatic remediation
- ❌ No runbook execution
- ❌ No infrastructure changes
- ✅ Human must read and decide

**2. Approval Workflows**
- ❌ No approval state machine
- ❌ No "pending approval" status
- ❌ No approval history
- ❌ No integration with ticketing systems
- ✅ Recommendations are informational only

**3. Trust Scoring**
- ❌ No trust scores calculated
- ❌ No hallucination detection
- ❌ No quality metrics
- ❌ No agent ranking
- ✅ Phase 8.6 (deferred) handles trust

**4. UI or Dashboard**
- ❌ No web interface
- ❌ No visualization
- ❌ No real-time updates
- ❌ No notification system
- ✅ CLI inspection only

**5. Incident State Modification**
- ❌ Recommendations do NOT update incidents
- ❌ No foreign keys to incident tables
- ❌ No triggers or streams
- ❌ No automatic state transitions
- ✅ Complete decoupling maintained


**6. Learning or Calibration**
- ❌ No automatic learning from recommendations
- ❌ No confidence calibration
- ❌ No pattern extraction
- ❌ No feedback loops
- ✅ Phase 4 (existing) handles learning

**7. Cost Enforcement**
- ❌ Recommendations do NOT block on budget
- ❌ No cost-based filtering
- ❌ No budget approval gates
- ❌ No cost prediction
- ✅ Phase 8.4 (existing) tracks costs

**8. Real-Time Streaming**
- ❌ No WebSocket updates
- ❌ No EventBridge notifications
- ❌ No SNS/SQS publishing
- ❌ No real-time dashboards
- ✅ Pull-based CLI inspection only

### 8.2 Why These Are Non-Goals

**Autonomous Execution (Phase 9):**
- Requires proven trust (Phase 8.5-8.6)
- Requires approval workflows
- Requires rollback mechanisms
- Out of scope for Phase 8

**Approval Workflows:**
- Adds complexity without clear value
- Requires state machine and UI
- Better handled by external systems (PagerDuty, Jira)
- Not needed for advisory-only system

**Trust Scoring (Phase 8.6):**
- Requires production data to calibrate
- Depends on hallucination detection (Phase 8.5)
- Intentionally deferred
- Phase 8.7 provides data for future trust scoring

**UI/Dashboard:**
- CLI is sufficient for L2+ engineers
- UI adds maintenance burden
- CloudWatch dashboards already exist (Phase 8.4)
- Not needed for MVP

**Incident State Modification:**
- Violates core principle: "Intelligence never mutates state"
- Increases blast radius
- Reduces auditability
- Fundamentally incompatible with advisory-only design

---

## 9. Implementation Checklist

### 9.1 Infrastructure (CDK)

**Tasks:**

- [ ] Create `opx-agent-recommendations` DynamoDB table
  - [ ] Define schema (PK, attributes)
  - [ ] Add GSI: `incidentId-timestamp-index`
  - [ ] Add GSI: `agentType-timestamp-index`
  - [ ] Add GSI: `executionId-timestamp-index`
  - [ ] Enable TTL on `ttl` attribute
  - [ ] Set billing mode (PAY_PER_REQUEST)
  - [ ] Set removal policy (RETAIN)

- [ ] Update LangGraph executor Lambda IAM role
  - [ ] Grant `dynamodb:PutItem` on recommendations table
  - [ ] Grant `dynamodb:BatchWriteItem` on recommendations table

- [ ] Create CloudWatch alarms
  - [ ] High failure rate (>5% over 5 minutes)
  - [ ] Persistent throttling (>10 throttles in 5 minutes)

- [ ] Add CloudWatch metrics
  - [ ] `RecommendationsPersisted` (Count)
  - [ ] `RecommendationPersistenceFailure` (Count)
  - [ ] `RecommendationPersistenceThrottled` (Count)
  - [ ] `RecommendationPersistenceDuration` (Milliseconds)


### 9.2 Application Code (Python)

**Tasks:**

- [ ] Create `infra/phase6/lambda/recommendation_persistence.py`
  - [ ] `build_recommendation()` - Transform agent output to schema
  - [ ] `generate_recommendation_id()` - Deterministic ID generation
  - [ ] `persist_recommendations()` - Main persistence function
  - [ ] `batch_write_recommendations()` - DynamoDB batch write
  - [ ] Error handling (fail-open)
  - [ ] CloudWatch metrics emission

- [ ] Update `infra/phase6/lambda/graph.py`
  - [ ] Import recommendation persistence module
  - [ ] Call `persist_recommendations()` after consensus
  - [ ] Wrap in try/except (fail-open)
  - [ ] Log failures without blocking

- [ ] Update `infra/phase6/lambda/lambda_handler.py`
  - [ ] Pass recommendations table name via environment variable
  - [ ] Initialize DynamoDB client

### 9.3 Testing

**Tasks:**

- [ ] Unit tests for `recommendation_persistence.py`
  - [ ] Test `build_recommendation()` with valid input
  - [ ] Test `generate_recommendation_id()` determinism
  - [ ] Test `batch_write_recommendations()` success
  - [ ] Test error handling (DynamoDB throttling)
  - [ ] Test fail-open behavior

- [ ] Integration tests
  - [ ] Test end-to-end persistence in graph execution
  - [ ] Test recommendations written to table
  - [ ] Test GSI queries work correctly
  - [ ] Test TTL is set correctly

- [ ] Failure tests
  - [ ] Test persistence failure does not block execution
  - [ ] Test metrics emitted on failure
  - [ ] Test logs contain error details

### 9.4 Scripts and Documentation

**Tasks:**

- [ ] Create `scripts/view-recommendations.sh`
  - [ ] Query recommendations by incident ID
  - [ ] Format output with jq
  - [ ] Add usage examples

- [ ] Update `scripts/demo_incident.py`
  - [ ] Add recommendation inspection to guide
  - [ ] Add CLI query examples

- [ ] Create `docs/deployment/RECOMMENDATION_INSPECTION.md`
  - [ ] CLI query reference
  - [ ] Common use cases
  - [ ] Troubleshooting guide

- [ ] Update existing documentation (see section 7.2)

### 9.5 Deployment

**Tasks:**

- [ ] Deploy infrastructure changes
  - [ ] `cdk deploy OpxPhase6Stack`
  - [ ] Verify table created
  - [ ] Verify GSIs created
  - [ ] Verify IAM permissions

- [ ] Verify Lambda deployment
  - [ ] Check environment variables
  - [ ] Check IAM role permissions
  - [ ] Check CloudWatch logs

- [ ] Run demo and verify
  - [ ] `make demo`
  - [ ] Query recommendations table
  - [ ] Verify recommendations persisted
  - [ ] Verify TTL set correctly

---

## 10. Success Criteria

### 10.1 Functional Requirements

**Must have:**

- [x] Recommendations persisted to DynamoDB after agent execution
- [x] Queryable by incident ID via CLI
- [x] Includes all agent outputs (6 agents + consensus)
- [x] Includes metadata (cost, tokens, duration, confidence)
- [x] TTL set to 90 days
- [x] Fail-open behavior (errors do not block execution)

**Should have:**

- [x] GSI for querying by agent type
- [x] GSI for querying by execution ID
- [x] CloudWatch metrics for success/failure
- [x] CloudWatch alarms for high failure rate
- [x] Helper script for human-readable output

**Nice to have:**

- [ ] Async retry via SQS DLQ (if audit requirements demand)
- [ ] Recommendation versioning (if recommendations change)
- [ ] Recommendation comparison (diff between executions)


### 10.2 Non-Functional Requirements

**Performance:**
- [ ] Persistence adds <100ms latency to agent execution
- [ ] Batch writes used for efficiency (up to 25 items)
- [ ] No blocking on DynamoDB writes

**Reliability:**
- [ ] Persistence failure rate <1% under normal load
- [ ] Fail-open behavior verified in tests
- [ ] CloudWatch alarms trigger on high failure rate

**Security:**
- [ ] Only executor Lambda can write to table (IAM enforced)
- [ ] PII redacted by guardrails (Phase 8.2) before persistence
- [ ] Read-only access for operators via IAM role

**Cost:**
- [ ] TTL prevents unbounded storage growth
- [ ] PAY_PER_REQUEST billing (no provisioned capacity)
- [ ] Estimated cost: <$5/month for 1000 incidents

**Auditability:**
- [ ] Complete audit trail of recommendations
- [ ] Queryable by incident, agent, timestamp
- [ ] Immutable records (no updates)

### 10.3 Acceptance Tests

**Test 1: Basic Persistence**
```bash
# Run demo
make demo

# Get incident ID from output
INCIDENT_ID="incident-api-gateway-123"

# Query recommendations
aws dynamodb query \
  --table-name opx-agent-recommendations \
  --index-name incidentId-timestamp-index \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values "{\":iid\":{\"S\":\"${INCIDENT_ID}\"}}"

# Verify: 7 recommendations (6 agents + consensus)
# Verify: Each has confidence, reasoning, metadata
# Verify: TTL is set (90 days from now)
```

**Test 2: Fail-Open Behavior**
```bash
# Temporarily remove DynamoDB write permission
aws iam detach-role-policy \
  --role-name OpxPhase6ExecutorLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

# Run demo
make demo

# Verify: Lambda execution succeeds (Status 200)
# Verify: CloudWatch logs show persistence error
# Verify: Metric "RecommendationPersistenceFailure" incremented

# Restore permission
aws iam attach-role-policy \
  --role-name OpxPhase6ExecutorLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
```

**Test 3: CLI Inspection**
```bash
# Query by incident
./scripts/view-recommendations.sh incident-api-gateway-123

# Verify: Human-readable output
# Verify: Shows agent name, confidence, root cause, actions
# Verify: Sorted by timestamp (newest first)
```

**Test 4: TTL Expiration**
```bash
# Create recommendation with TTL in past
aws dynamodb put-item \
  --table-name opx-agent-recommendations \
  --item '{
    "recommendationId": {"S": "rec-test-123"},
    "incidentId": {"S": "incident-test-123"},
    "timestamp": {"S": "2026-01-01T00:00:00Z"},
    "ttl": {"N": "1609459200"}
  }'

# Wait 48 hours (DynamoDB TTL delay)
# Verify: Item deleted automatically
```

---

## 11. Risks and Mitigations

### 11.1 Technical Risks

**Risk 1: DynamoDB Throttling**
- **Impact:** Recommendations not persisted
- **Likelihood:** Low (PAY_PER_REQUEST auto-scales)
- **Mitigation:** Fail-open design, CloudWatch alarms, batch writes

**Risk 2: Persistence Latency**
- **Impact:** Slower agent execution
- **Likelihood:** Low (batch writes are fast)
- **Mitigation:** Async writes (future), monitoring, <100ms target

**Risk 3: Storage Cost Growth**
- **Impact:** Unbounded DynamoDB costs
- **Likelihood:** Low (TTL enabled)
- **Mitigation:** 90-day TTL, cost alarms, monitoring

**Risk 4: Schema Evolution**
- **Impact:** Breaking changes to recommendation structure
- **Likelihood:** Medium (agent outputs may change)
- **Mitigation:** Versioned schema, backward compatibility, validation

### 11.2 Operational Risks

**Risk 1: Missing Recommendations**
- **Impact:** Incomplete audit trail
- **Likelihood:** Low (fail-open logs errors)
- **Mitigation:** CloudWatch alarms, async retry (future), replay capability

**Risk 2: PII Leakage**
- **Impact:** Compliance violation
- **Likelihood:** Very Low (guardrails already redact)
- **Mitigation:** Phase 8.2 guardrails, validation, audit

**Risk 3: Incorrect Recommendations**
- **Impact:** Misleading advice to operators
- **Likelihood:** Medium (LLMs can hallucinate)
- **Mitigation:** Phase 8.3 validation, confidence scores, citations, Phase 8.5 (future)

### 11.3 Business Risks

**Risk 1: Over-Reliance on Recommendations**
- **Impact:** Operators blindly follow bad advice
- **Likelihood:** Low (advisory-only, no auto-execution)
- **Mitigation:** Clear documentation, confidence scores, human approval required

**Risk 2: Scope Creep to Execution**
- **Impact:** Phase 8.7 becomes Phase 9 (autonomous execution)
- **Likelihood:** Medium (feature requests)
- **Mitigation:** Explicit non-goals, architectural boundaries, separate Phase 9 design

---

## 12. Future Enhancements

### 12.1 Phase 8.7.1: Async Retry (Optional)

**If audit requirements demand high reliability:**

- SQS dead-letter queue for failed writes
- Separate Lambda processes DLQ
- Exponential backoff retry
- Does not block agent execution

**Estimated effort:** 2-3 days

### 12.2 Phase 8.7.2: Recommendation Versioning (Optional)

**If recommendations change over time:**

- Track recommendation versions
- Compare recommendations across executions
- Detect drift in agent behavior

**Estimated effort:** 3-5 days

### 12.3 Phase 8.7.3: Recommendation Comparison (Optional)

**If operators need to compare recommendations:**

- Diff tool for recommendations
- Highlight changes between executions
- Useful for debugging agent behavior

**Estimated effort:** 2-3 days

### 12.4 Integration with Phase 8.5-8.6 (Future)

**When hallucination detection and trust scoring are implemented:**

- Add trust scores to recommendations
- Flag low-trust recommendations
- Filter recommendations by trust threshold

**Estimated effort:** 1 week (depends on Phase 8.5-8.6)

### 12.5 Integration with Phase 9 (Future)

**When autonomous execution is implemented:**

- Recommendations become execution proposals
- Approval workflow references recommendations
- Execution audit trail links to recommendations

**Estimated effort:** 2-3 weeks (depends on Phase 9)

---

## 13. Conclusion

### 13.1 Summary

Phase 8.7 introduces **advisory recommendation persistence** - a critical observability capability that:

✅ Makes agent outputs visible via CLI  
✅ Provides complete audit trail  
✅ Enables post-incident review  
✅ Supports learning and calibration  
✅ Maintains safety principles (fail-open, advisory-only)  
✅ Does not enable autonomous execution  
✅ Does not modify incident state  

### 13.2 Value Proposition

**For Operators:**
- Inspect agent recommendations via CLI
- Understand agent reasoning
- Review recommendations post-incident
- Debug agent behavior

**For Compliance:**
- Complete audit trail of AI recommendations
- Demonstrates AI transparency
- Supports regulatory review
- Enables accountability

**For Learning:**
- Data for confidence calibration (Phase 4)
- Input for trust scoring (Phase 8.6, future)
- Pattern extraction for improvement
- Historical analysis

### 13.3 Next Steps

1. **Review this design** with senior engineers
2. **Approve or request changes**
3. **Create implementation plan** (Phase 8.7 IMPLEMENTATION.md)
4. **Implement infrastructure** (CDK, DynamoDB table)
5. **Implement application code** (persistence module)
6. **Write tests** (unit, integration, failure)
7. **Deploy and verify** (demo, CLI inspection)
8. **Update documentation** (PLAN.md, query reference)

### 13.4 Estimated Effort

**Total:** 3-5 days

- Infrastructure (CDK): 1 day
- Application code: 1-2 days
- Testing: 1 day
- Documentation: 0.5 day
- Deployment and verification: 0.5 day

### 13.5 Dependencies

**Requires:**
- Phase 6 (LangGraph agents) - ✅ COMPLETE
- Phase 8.1 (LLM tracing) - ✅ COMPLETE
- Phase 8.2 (Guardrails) - ✅ COMPLETE
- Phase 8.3 (Output validation) - ✅ COMPLETE

**Enables:**
- Phase 8.5 (Hallucination detection) - Future
- Phase 8.6 (Trust scoring) - Future
- Phase 9 (Autonomous execution) - Future

---

**Last Updated:** 2026-01-31  
**Status:** DESIGN REVIEW  
**Reviewers:** [To be assigned]  
**Approval:** [Pending]

