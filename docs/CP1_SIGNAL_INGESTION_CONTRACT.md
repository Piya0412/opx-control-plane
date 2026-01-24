# CP-1: Signal Ingestion Contract

**Status:** CHECKPOINT 1 - READY FOR REVIEW  
**Phase:** Phase 2 - Step 1  
**Date:** 2026-01-15

---

## Overview

This document defines the **Signal Ingestion Contract** for Phase 2 observability. All signals (CloudWatch metrics, alarms, structured logs, EventBridge events) normalize into a canonical schema that preserves determinism, traceability, and replayability.

---

## Core Principles

### 1. Determinism
- **Same input → Same signal ID**
- Signal IDs are computed as `SHA256(source + key_components + timestamp)`
- No randomness, no UUIDs, no timestamps as IDs

### 2. Immutability
- Signals are **append-only** once ingested
- No updates, no deletions (except TTL for operational data)
- Raw source data is **always preserved**

### 3. Traceability
- Every signal has a **checksum** of raw data
- Evidence chain links signal → raw source
- Integrity verification is always possible

### 4. Non-Invasive
- Ingestion failures **MUST NOT block** source operations
- All ingestion errors are **swallowed and logged**
- Metrics emission is **non-blocking**

---

## Canonical Signal Schema

All signals normalize to this structure:

```typescript
interface Signal {
  // Identity
  signalId: string;           // Deterministic SHA256 hash
  signalType: string;         // e.g., "alarm/opx-lambda-error-rate"
  source: SignalSource;       // Enum: cloudwatch-metric, cloudwatch-alarm, etc.
  
  // Temporal
  timestamp: string;          // ISO 8601 - signal occurrence time
  ingestedAt: string;         // ISO 8601 - ingestion time
  
  // Classification
  severity: SignalSeverity;   // CRITICAL, HIGH, MEDIUM, LOW, INFO
  confidence: SignalConfidence; // DEFINITIVE, HIGH, MEDIUM, LOW
  
  // Content
  title: string;              // Human-readable title
  description?: string;       // Detailed description
  
  // Evidence Chain
  evidence: EvidenceItem[];   // At least one evidence item
  
  // Traceability
  raw: Record<string, unknown>; // Complete raw source data
  rawChecksum: string;        // SHA256 of raw data
  
  // Metadata
  dimensions?: Record<string, string>; // Low-cardinality only
  tags?: Record<string, string>;
}
```

---

## Signal Sources

### 1. CloudWatch Metrics

**Ingestion Contract:**
```typescript
interface CloudWatchMetricSignal {
  namespace: string;          // e.g., "OPX/ControlPlane"
  metricName: string;         // e.g., "IncidentCreated"
  dimensions: Record<string, string>; // Low-cardinality only
  timestamp: string;          // ISO 8601
  value: number;
  unit: string;               // e.g., "Count", "Milliseconds"
  statistic: 'Sum' | 'Average' | 'Minimum' | 'Maximum' | 'SampleCount';
}
```

**Signal ID Formula:**
```
signalId = SHA256(
  "cloudwatch-metric" + 
  namespace + 
  metricName + 
  timestamp
)
```

**Severity Classification:**
- Metrics default to `INFO` severity
- Alarms escalate severity based on thresholds

**Confidence:** `DEFINITIVE` (metrics are authoritative)

**Example:**
```json
{
  "signalId": "a1b2c3...",
  "signalType": "OPX/ControlPlane/IncidentCreated",
  "source": "cloudwatch-metric",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "ingestedAt": "2026-01-15T10:30:01.234Z",
  "severity": "INFO",
  "confidence": "DEFINITIVE",
  "title": "IncidentCreated: 1 Count",
  "description": "CloudWatch metric IncidentCreated in namespace OPX/ControlPlane",
  "evidence": [{
    "type": "metric-datapoint",
    "timestamp": "2026-01-15T10:30:00.000Z",
    "raw": { /* full metric data */ },
    "interpreted": {
      "value": 1,
      "unit": "Count",
      "statistic": "Sum"
    },
    "checksum": "d4e5f6..."
  }],
  "raw": { /* full metric data */ },
  "rawChecksum": "d4e5f6...",
  "dimensions": {
    "service": "payment-service",
    "severity": "SEV2"
  }
}
```

---

### 2. CloudWatch Alarms

**Ingestion Contract:**
```typescript
interface CloudWatchAlarmSignal {
  alarmName: string;
  alarmArn: string;
  alarmDescription?: string;
  newState: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  oldState: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  stateChangeTime: string;    // ISO 8601
  stateReason: string;
  stateReasonData?: Record<string, unknown>;
  metricNamespace?: string;
  metricName?: string;
  threshold?: number;
  evaluationPeriods?: number;
}
```

**Signal ID Formula:**
```
signalId = SHA256(
  "cloudwatch-alarm" + 
  alarmName + 
  stateChangeTime + 
  newState
)
```

**Ingestion Rules:**
- **Only ingest `ALARM` state** (not OK or INSUFFICIENT_DATA)
- Severity mapped from alarm name (see mapping table)
- Confidence is `DEFINITIVE`

**Severity Mapping:**
| Alarm Name | Severity |
|------------|----------|
| `opx-eventstore-write-failure` | CRITICAL |
| `opx-replay-integrity-failure` | CRITICAL |
| `opx-lambda-error-rate` | HIGH |
| `opx-dynamodb-throttle` | HIGH |
| `opx-api-latency-p99` | MEDIUM |
| Others | MEDIUM (default) |

**Example:**
```json
{
  "signalId": "b2c3d4...",
  "signalType": "alarm/opx-lambda-error-rate",
  "source": "cloudwatch-alarm",
  "timestamp": "2026-01-15T10:35:00.000Z",
  "ingestedAt": "2026-01-15T10:35:01.456Z",
  "severity": "HIGH",
  "confidence": "DEFINITIVE",
  "title": "Alarm: opx-lambda-error-rate",
  "description": "Threshold Crossed: 1 datapoint [5.2 (15/01/26 10:35:00)] was greater than the threshold (5.0).",
  "evidence": [{
    "type": "alarm-state-change",
    "timestamp": "2026-01-15T10:35:00.000Z",
    "raw": { /* full alarm data */ },
    "interpreted": {
      "alarmName": "opx-lambda-error-rate",
      "newState": "ALARM",
      "oldState": "OK",
      "reason": "Threshold Crossed..."
    },
    "checksum": "e5f6g7..."
  }],
  "raw": { /* full alarm data */ },
  "rawChecksum": "e5f6g7...",
  "tags": {
    "alarmArn": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:opx-lambda-error-rate",
    "metricNamespace": "AWS/Lambda",
    "metricName": "Errors"
  }
}
```

---

### 3. Structured Logs (JSON Only)

**Ingestion Contract:**
```typescript
interface StructuredLogSignal {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  timestamp: string;          // ISO 8601
  message: string;
  requestId?: string;         // High-cardinality - logs only
  correlationId?: string;     // High-cardinality - logs only
  operation?: string;
  service?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}
```

**Signal ID Formula:**
```
signalId = SHA256(
  "cloudwatch-log" + 
  operation + 
  timestamp + 
  level
)
```

**Ingestion Rules:**
- **Only ingest ERROR and FATAL logs** (not DEBUG, INFO, WARN)
- **HARD RULE:** No text parsing without schema validation
- Must be valid JSON with required fields
- Severity: FATAL → CRITICAL, ERROR → HIGH
- Confidence: `HIGH` (structured logs are validated)

**Example:**
```json
{
  "signalId": "c3d4e5...",
  "signalType": "log/ERROR",
  "source": "cloudwatch-log",
  "timestamp": "2026-01-15T10:40:00.000Z",
  "ingestedAt": "2026-01-15T10:40:01.789Z",
  "severity": "HIGH",
  "confidence": "HIGH",
  "title": "Failed to write to event store",
  "description": "DynamoDB write failed: ConditionalCheckFailedException",
  "evidence": [{
    "type": "log-entry",
    "timestamp": "2026-01-15T10:40:00.000Z",
    "raw": { /* full log entry */ },
    "interpreted": {
      "level": "ERROR",
      "message": "Failed to write to event store",
      "operation": "writeEvent",
      "error": {
        "name": "ConditionalCheckFailedException",
        "message": "The conditional request failed"
      }
    },
    "checksum": "f6g7h8..."
  }],
  "raw": { /* full log entry */ },
  "rawChecksum": "f6g7h8...",
  "dimensions": {
    "service": "opx-control-plane",
    "operation": "writeEvent"
  }
}
```

---

### 4. EventBridge Events

**Ingestion Contract:**
```typescript
interface EventBridgeEventSignal {
  id: string;
  source: string;             // e.g., "opx.control-plane"
  detailType: string;         // e.g., "Incident State Changed"
  time: string;               // ISO 8601
  region: string;
  account: string;
  detail: Record<string, unknown>;
}
```

**Signal ID Formula:**
```
signalId = SHA256(
  "eventbridge-event" + 
  source + 
  detailType + 
  time
)
```

**Severity Classification:**
- Extract from `detail.severity` if present
- Map: SEV1 → CRITICAL, SEV2 → HIGH, SEV3 → MEDIUM, SEV4 → LOW
- Default: INFO

**Confidence:** `HIGH` (EventBridge events are validated)

---

## Evidence Chain

Every signal contains an **evidence chain** that links the signal to its raw source:

```typescript
interface EvidenceItem {
  type: 'metric-datapoint' | 'log-entry' | 'alarm-state-change' | 
        'event-payload' | 'api-response' | 'probe-result';
  timestamp: string;          // ISO 8601
  raw: Record<string, unknown>; // Raw source data
  interpreted?: Record<string, unknown>; // Typed interpretation
  checksum: string;           // SHA256 of raw data
}
```

**Rules:**
- Every signal has **at least one** evidence item
- Evidence items are **immutable**
- Evidence items preserve **complete raw data**
- Checksums enable **integrity verification**

---

## Dimension Cardinality Rules

**CRITICAL:** CloudWatch has strict dimension cardinality limits.

### Low-Cardinality Dimensions (Metrics)
✅ **Allowed in metric dimensions:**
- `service` (bounded set of services)
- `severity` (SEV1-4)
- `operation` (bounded set of operations)
- `state` (5 states)
- `method` (GET/POST/PUT/DELETE)
- `path` (fixed routes)
- `statusCode` (200/400/409/500)
- `errorCode` (fixed error codes)

### High-Cardinality Fields (Logs Only)
❌ **NOT allowed in metric dimensions:**
- `requestId` (unbounded)
- `correlationId` (unbounded)
- `incidentId` (unbounded)
- `userId` (unbounded)
- `timestamp` (unbounded)

**Rule:** High-cardinality identifiers go in **structured logs only**, never in metric dimensions.

---

## Failure Handling

### Ingestion Failures

**HARD RULE:** Ingestion failures **MUST NOT block** source operations.

```typescript
async function ingestSignal(source: unknown): Promise<SignalIngestionResult> {
  try {
    // Validate, normalize, store
    return { success: true, signal };
  } catch (error) {
    // SWALLOW - log and emit metric
    console.warn('Signal ingestion failed (swallowed)', { error });
    emitMetric('signal.ingestion.failed', { source, errorCode });
    return { success: false, error };
  }
}
```

**Failure Modes:**
| Failure | Action | Rationale |
|---------|--------|-----------|
| Schema validation fails | Swallow, log, emit metric | Invalid signals don't block operations |
| Checksum computation fails | Swallow, log, emit metric | Integrity check failure is non-fatal |
| DynamoDB write fails | Swallow, log, emit metric | Storage failure doesn't block source |
| Metric emission fails | Swallow, log | Metrics are observational only |

### Metric Emission Failures

**HARD RULE:** Metric emission failures **MUST be swallowed**.

```typescript
function emitMetric(name: string, dimensions: Record<string, string>): void {
  try {
    // Emit metric
  } catch (error) {
    // SWALLOW - metrics are observational only
    console.warn('Metric emission failed (swallowed)', { name, error });
  }
}
```

---

## Storage Schema

Signals are stored in DynamoDB with the following schema:

### Primary Key
- **PK:** `SIGNAL#{signalId}`
- **SK:** `{timestamp}` (ISO 8601)

### GSI1 (Query by Source/Type)
- **GSI1PK:** `SOURCE#{source}#TYPE#{signalType}`
- **GSI1SK:** `{timestamp}`

### Attributes
- All signal fields (see canonical schema)
- `entityType: "SIGNAL"`
- `version: 1`

### Access Patterns
1. **Get signal by ID:** `GetItem(PK, SK)`
2. **Query by source/type:** `Query(GSI1, GSI1PK, GSI1SK BETWEEN start AND end)`
3. **Verify integrity:** Recompute checksum, compare

---

## Observability

### Ingestion Metrics

All ingestion operations emit metrics:

| Metric | Dimensions | Purpose |
|--------|------------|---------|
| `signal.ingested` | source, signalType, severity | Track ingestion volume |
| `signal.ingestion.failed` | source, errorCode | Track ingestion failures |
| `signal.ingestion.latency` | source | Track ingestion performance |
| `signal.validation.failed` | source, validationType | Track validation failures |

**Namespace:** `OPX/ControlPlane/Signals`  
**Resolution:** 1 minute

---

## Testing Requirements

### Unit Tests
- [ ] Signal ID computation is deterministic
- [ ] Checksum computation is correct
- [ ] Schema validation rejects invalid inputs
- [ ] Severity mapping is correct
- [ ] Confidence classification is correct
- [ ] Evidence chain is preserved
- [ ] Ingestion failures are swallowed

### Integration Tests
- [ ] CloudWatch metric ingestion end-to-end
- [ ] CloudWatch alarm ingestion end-to-end
- [ ] Structured log ingestion end-to-end
- [ ] EventBridge event ingestion end-to-end
- [ ] DynamoDB storage and retrieval
- [ ] Integrity verification works

### Chaos Tests
- [ ] Invalid schema doesn't block operations
- [ ] DynamoDB write failure doesn't block operations
- [ ] Metric emission failure doesn't block operations
- [ ] High-cardinality dimensions are rejected

---

## Acceptance Criteria

CP-1 is complete when:

- [x] **Schema Defined:** Canonical signal schema is defined
- [x] **Contracts Defined:** All source ingestion contracts are defined
- [x] **Determinism:** Signal IDs are deterministic
- [x] **Immutability:** Signals are append-only
- [x] **Traceability:** Evidence chain preserves raw data
- [x] **Non-Invasive:** Ingestion failures don't block operations
- [x] **Cardinality:** Dimension cardinality rules are enforced
- [ ] **Implementation:** Code is implemented and tested
- [ ] **Documentation:** This document is reviewed and approved

---

## Next Steps

After CP-1 approval:
1. **CP-2:** Signal Normalization Engine (real data examples)
2. **CP-3:** Deterministic Detection Engine (rule specs)
3. **CP-4:** Evidence Graph Builder (chain samples)
4. **CP-5:** Incident Candidate Generator (candidate objects)

---

## Approval

**Checkpoint:** CP-1  
**Status:** READY FOR REVIEW  
**Reviewer:** [Your Name]  
**Date:** 2026-01-15

**Questions for Review:**
1. Is the signal schema deterministic and replayable?
2. Are dimension cardinality rules sufficient?
3. Is failure handling fail-safe (non-blocking)?
4. Are all source contracts complete?
5. Is the evidence chain traceable?

**Sign-off:** [ ] APPROVED / [ ] CHANGES REQUESTED
