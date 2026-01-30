# Phase 2: Observability & Detection

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-21  
**Version:** 1.0.0

---

## Overview

Phase 2 implements signal ingestion, normalization, detection, and correlation - the observability foundation for incident detection.

## Sub-Phases

### Phase 2.1: Signal Ingestion
Signal normalization from CloudWatch alarms with deterministic IDs and evidence preservation.

### Phase 2.2: Signal Correlation
Time-window correlation with threshold-based detection and rule evaluation.

### Phase 2.3: Detection & Automation
Detection engine with kill switch, rate limiting, and failure playbook.

## Architecture

### Signal Flow

```
CloudWatch → SNS → Lambda → DynamoDB (signals)
                              ↓
                         Detection Engine
                              ↓
                         EventBridge (fan-out)
```

### Key Components

**Tables:**
- `opx-signals` - Normalized signals (no TTL)
- `opx-detections` - Detection results
- `opx-correlation-rules` - Correlation rules

**Lambdas:**
- `opx-signal-ingestor` - Normalizes CloudWatch alarms
- `opx-detection-engine` - Evaluates correlation rules
- `opx-correlation-executor` - Executes time-window correlation

## Design Principles

1. **Deterministic signal IDs** - Same input → same ID
2. **Evidence preservation** - Raw + interpreted data
3. **Fail-closed** - Invalid signals rejected
4. **Non-invasive** - EventBridge failures don't block ingestion
5. **Complete audit trail** - All signals and detections logged
6. **No TTL** - Signals kept indefinitely for replay

## Phase 2.1: Signal Ingestion

### Signal Schema

```typescript
interface SignalEvent {
  signalId: string;              // Deterministic hash
  service: string;               // Extracted from alarm
  severity: Severity;            // Extracted from alarm
  observedAt: string;            // Actual timestamp
  identityWindow: string;        // Rounded bucket (1-min)
  alarmName: string;
  alarmState: 'ALARM' | 'OK';
  rawCloudWatchData: any;        // Complete preservation
  metadata: {
    region: string;
    accountId: string;
    namespace: string;
  };
}
```

### Signal ID Generation

Deterministic ID based on identity window (not raw timestamp):

```typescript
signalId = hash(
  service,
  severity,
  alarmName,
  identityWindow  // 1-minute bucket
)
```

**Rationale:** Same alarm within same minute → same signalId, enabling reliable deduplication and correlation.

### Normalization Rules

**Service Extraction:**
- Pattern: `{service}-{metric}-alarm`
- Example: `api-gateway-5xx-alarm` → `api-gateway`
- Invalid: null (fail-closed)

**Severity Extraction:**
- Pattern: `{severity}-{description}`
- Mapping: CRITICAL→SEV1, HIGH→SEV2, MEDIUM→SEV3, LOW→SEV4
- Invalid: null (fail-closed)

**No Guessing:** If extraction fails, signal is rejected.

### EventBridge Emission

- **Best-effort** - Failures logged as warnings
- **Non-blocking** - DynamoDB write is source of truth
- **Fan-out only** - EventBridge never authoritative

## Phase 2.2: Signal Correlation

### Correlation Rules

Rules define how signals combine into candidates:

```typescript
interface CorrelationRule {
  ruleId: string;
  name: string;
  description: string;
  timeWindow: number;           // seconds
  threshold: {
    minSignals: number;
    minSeverity: Severity;
    services: string[];         // optional filter
  };
  enabled: boolean;
  version: string;
}
```

### Correlation Logic

**Time Window:**
- Configurable window (e.g., 5 minutes)
- Signals within window are correlated
- Window slides continuously

**Threshold Evaluation:**
- Count signals in window
- Check severity distribution
- Validate service attribution
- Apply rule-specific filters

**Candidate Generation:**
- If threshold met → create candidate
- Candidate includes all correlated signals
- Deterministic candidate ID

### Detection Engine

**Trigger:** New signal arrives  
**Process:**
1. Load active correlation rules
2. Query signals in time window
3. Evaluate each rule
4. Generate candidates if threshold met
5. Emit detection events

**Guarantees:**
- Deterministic evaluation
- No missed signals
- Complete audit trail

## Phase 2.3: Detection & Automation

### Kill Switch

**Purpose:** Emergency automation disable

**Levels:**
1. Global kill switch (all automation)
2. Per-service kill switch
3. Per-action-type kill switch

**Implementation:**
- DynamoDB configuration table
- Checked before every automated action
- Immediate effect (no caching)
- Audit trail

**Configuration:**
```typescript
interface KillSwitch {
  switchId: string;
  scope: 'global' | 'service' | 'action';
  target?: string;              // service or action type
  enabled: boolean;
  reason: string;
  setBy: string;
  setAt: string;
}
```

### Rate Limiting

**Purpose:** Prevent automation storms

**Limits:**
- Per-service: 10 actions/minute
- Per-action-type: 5 actions/minute
- Global: 50 actions/minute

**Implementation:**
- Token bucket algorithm
- DynamoDB for state
- Graceful degradation

### Failure Playbook

**Scenarios:**
1. Signal ingestion failure → Log and alert
2. Correlation rule failure → Skip rule, continue
3. Detection engine failure → Alert, manual review
4. EventBridge failure → Log warning, continue

**Principles:**
- Never block signal ingestion
- Fail gracefully
- Alert on failures
- Manual intervention for critical failures

## Invariants

### INV-P2.1: Read-only w.r.t. incidents
Phase 2 never creates incidents directly. Only writes to `opx-signals` and `opx-detections`.

### INV-P2.2: Candidates only
Phase 2 generates candidates, not incidents. Promotion is Phase 3's responsibility.

### INV-P2.3: No CP-7 calls
Phase 2 never calls incident management (CP-7) directly.

### INV-P2.4: Deterministic
Signal IDs and correlation results are deterministic and replayable.

### INV-P2.5: Non-blocking
Phase 2 never blocks Phase 1 operations. Async processing only.

## Observability

### Metrics
- Signal ingestion rate
- Signal rejection rate
- Correlation rule evaluation time
- Candidate generation rate
- Kill switch activations

### Alarms
- High signal rejection rate (>5%)
- Correlation engine failures
- Kill switch activated
- Rate limit exceeded

### Logs
- All signal ingestion (structured)
- Correlation rule evaluations
- Detection results
- Kill switch changes

## Testing

### Unit Tests
- Signal normalization: 50 tests
- Correlation logic: 40 tests
- Kill switch: 20 tests
- Rate limiting: 15 tests

### Integration Tests
- End-to-end signal flow: 25 tests
- Correlation rule evaluation: 20 tests
- Kill switch activation: 10 tests

## Deployment

**Stack:** OpxObservabilityStack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 3 DynamoDB tables
- 3 Lambda functions
- SNS topics
- EventBridge rules

## Cost

**Monthly:** ~$30-50
- DynamoDB: $20-30
- Lambda: $5-10
- SNS: $2-5
- EventBridge: $3-5

---

**Last Updated:** 2026-01-31
