# DynamoDB Query Reference

Quick reference for querying OPX Control Plane tables.

## Table Schemas

### opx-incidents
**Purpose:** Current incident state (materialized view)

**Schema:**
- Partition Key: `pk` (String) - Format: `INCIDENT#{incidentId}`
- Sort Key: `sk` (String) - Format: `v1`

**Query Example:**
```bash
aws dynamodb get-item \
  --table-name opx-incidents \
  --key '{"pk":{"S":"INCIDENT#incident-api-gateway-1234567890"},"sk":{"S":"v1"}}'
```

---

### opx-incident-events
**Purpose:** Authoritative event store (immutable)

**Schema:**
- Partition Key: `incidentId` (String) - Format: `incident-api-gateway-1234567890`
- Sort Key: `eventSeq` (Number) - Monotonically increasing

**Query Example:**
```bash
aws dynamodb query \
  --table-name opx-incident-events \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values '{":iid":{"S":"incident-api-gateway-1234567890"}}'
```

---

### opx-signals
**Purpose:** Signal storage

**Schema:**
- Partition Key: `signalId` (String)

**Query Example:**
```bash
aws dynamodb get-item \
  --table-name opx-signals \
  --key '{"signalId":{"S":"signal-api-gateway-high-error-rate-1234567890"}}'
```

**Query by Service (GSI):**
```bash
aws dynamodb query \
  --table-name opx-signals \
  --index-name service-observedAt-index \
  --key-condition-expression "service = :svc" \
  --expression-attribute-values '{":svc":{"S":"api-gateway"}}'
```

---

### opx-langgraph-checkpoints
**Purpose:** LangGraph execution state

**Schema:**
- Partition Key: `session_id` (String) - Format: `incident-{id}-{timestamp}`
- Sort Key: `checkpoint_id` (String) - UUID

**Query Example:**
```bash
aws dynamodb query \
  --table-name opx-langgraph-checkpoints-dev \
  --key-condition-expression "session_id = :sid" \
  --expression-attribute-values '{":sid":{"S":"incident-api-gateway-1234567890-1234567890.123"}}'
```

---

### opx-guardrail-violations
**Purpose:** Guardrail violation tracking

**Schema:**
- Partition Key: `violationId` (String)

**Scan Example:**
```bash
aws dynamodb scan \
  --table-name opx-guardrail-violations \
  --limit 10
```

---

### opx-validation-errors
**Purpose:** Output validation error tracking

**Schema:**
- Partition Key: `errorId` (String)

**Scan Example:**
```bash
aws dynamodb scan \
  --table-name opx-validation-errors \
  --limit 10
```

---

### opx-llm-traces
**Purpose:** LLM execution traces

**Schema:**
- Partition Key: `traceId` (String)

**Scan Example:**
```bash
aws dynamodb scan \
  --table-name opx-llm-traces \
  --limit 10
```

---

## Common Mistakes

### ❌ Wrong: Using `pk` for opx-incident-events
```bash
# This will fail with "Query condition missed key schema element"
aws dynamodb query \
  --table-name opx-incident-events \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"INCIDENT#incident-123"}}'
```

### ✅ Correct: Using `incidentId` for opx-incident-events
```bash
aws dynamodb query \
  --table-name opx-incident-events \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values '{":iid":{"S":"incident-123"}}'
```

---

### ❌ Wrong: Using `incidentId` for opx-incidents
```bash
# This will fail - opx-incidents uses pk/sk pattern
aws dynamodb get-item \
  --table-name opx-incidents \
  --key '{"incidentId":{"S":"incident-123"}}'
```

### ✅ Correct: Using `pk`/`sk` for opx-incidents
```bash
aws dynamodb get-item \
  --table-name opx-incidents \
  --key '{"pk":{"S":"INCIDENT#incident-123"},"sk":{"S":"v1"}}'
```

---

## Why Two Incident Tables?

**opx-incidents** (Materialized View)
- Current state only
- Fast lookups by incident ID
- Used by UI/API for display
- Can be rebuilt from events

**opx-incident-events** (Event Store)
- Complete history
- Immutable audit trail
- Source of truth
- Used for replay and compliance

This is **Event Sourcing** - the event store is authoritative, the incidents table is a projection.

---

## Quick Demo Verification

After running `make demo`, verify the system:

```bash
# 1. Get the incident ID from demo output
INCIDENT_ID="incident-api-gateway-1234567890"

# 2. Check incident state
aws dynamodb get-item \
  --table-name opx-incidents \
  --key "{\"pk\":{\"S\":\"INCIDENT#${INCIDENT_ID}\"},\"sk\":{\"S\":\"v1\"}}"

# 3. Check incident events
aws dynamodb query \
  --table-name opx-incident-events \
  --key-condition-expression "incidentId = :iid" \
  --expression-attribute-values "{\":iid\":{\"S\":\"${INCIDENT_ID}\"}}"

# 4. Check checkpoints
aws dynamodb query \
  --table-name opx-langgraph-checkpoints-dev \
  --key-condition-expression "session_id = :sid" \
  --expression-attribute-values "{\":sid\":{\"S\":\"${INCIDENT_ID}\"}}" \
  --query 'Count'

# 5. Check Lambda logs
aws logs tail /aws/lambda/OpxPhase6Stack-Phase6ExecutorLambdaFunction82D7505-Qfic0Ptp2Ypa \
  --since 5m
```

---

**Last Updated:** 2026-01-31  
**Related:** `scripts/demo_incident.py`, `docs/deployment/deployment-guide.md`
