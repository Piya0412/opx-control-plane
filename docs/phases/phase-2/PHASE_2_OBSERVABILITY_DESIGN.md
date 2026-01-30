# Phase 2: Observability & Detection — Design Document

**Version:** 1.0.0  
**Date:** 2026-01-17  
**Status:** 🔲 DESIGN APPROVED, NOT STARTED

---

## 🎯 Phase 2 Mission

**Phase 2 may observe, correlate, and propose — but never create incidents directly without CP-6 involvement.**

---

## 🚨 Critical Redesign

Phase 2 has been **REDESIGNED** from the original plan to align with Phase 1 reality.

### What Changed

| Aspect | Original Plan | Redesigned Phase 2 |
|--------|--------------|-------------------|
| Scope | Metrics + alarms + autocreation | Observability + candidate generation only |
| Incident Creation | Direct from alarms | Via CP-5 → CP-6 only |
| Control Logic | Some mutation allowed | Zero mutation, read-only |
| Intelligence | Some heuristics | Zero intelligence |

### Why the Redesign

Phase 1 delivered more than planned:
- Full authority enforcement (CP-6, CP-8)
- Deterministic promotion (CP-6)
- Formal candidate model (CP-5)

Phase 2 must **consume** Phase 1, not **replace** it.

---

## 🔒 Mandatory Flow

```
Signals / Alarms
    ↓
Observation Events (read-only)
    ↓
Candidate Generator (CP-5)
    ↓
Promotion Decision (CP-6)
    ↓
Incident Creation (CP-7)
    ↓
Control (CP-8)
```

**Critical Rules:**
- ⚠️ Alarms must NOT create incidents directly
- ⚠️ They must create candidates
- ⚠️ CP-6 remains the single promotion authority

---

## 📦 Phase 2 Components

### 1. Signal Event Schema

**Purpose:** Normalized representation of all observation sources

**Schema:**
```typescript
interface SignalEvent {
  signalId: string;           // Deterministic hash
  source: SignalSource;       // CloudWatch, Custom, etc.
  signalType: string;         // ALARM, METRIC_BREACH, LOG_PATTERN
  service: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
  timestamp: string;
  metadata: {
    alarmName?: string;
    metricName?: string;
    threshold?: number;
    actualValue?: number;
    logPattern?: string;
    [key: string]: unknown;
  };
  correlationWindow: string;  // ISO 8601 duration
}
```

**Rules:**
- Immutable after creation
- Deterministic signalId
- No business logic
- Pure data structure

### 2. Signal Ingestion Lambda

**Purpose:** Ingest signals from various sources and normalize

**Function:** `opx-signal-ingestor`

**Inputs:**
- CloudWatch alarms (SNS)
- Metric breaches (EventBridge)
- Log patterns (CloudWatch Logs)
- Custom signals (API)

**Outputs:**
- Normalized SignalEvent
- Stored in DynamoDB: `opx-signals`
- Emitted to EventBridge

**Forbidden:**
- ❌ Creating incidents
- ❌ Making decisions
- ❌ Mutating state
- ❌ Calling CP-7 directly

**Allowed:**
- ✅ Normalizing data
- ✅ Storing signals
- ✅ Emitting events

### 3. Correlation Engine

**Purpose:** Group related signals within time windows

**Function:** `opx-signal-correlator`

**Algorithm:**
```
1. Receive SignalEvent
2. Query signals within correlation window
3. Group by service + severity
4. If correlation threshold met:
   → Create Candidate (via CP-5)
5. Else:
   → Store signal, wait for more
```

**Correlation Rules:**
- Time-window based (e.g., 5 minutes)
- Service-scoped
- Severity-aware
- Deterministic grouping

**Forbidden:**
- ❌ Creating incidents directly
- ❌ Bypassing CP-6
- ❌ Heuristics or ML
- ❌ Confidence scoring

**Allowed:**
- ✅ Time-window grouping
- ✅ Service correlation
- ✅ Candidate creation (via CP-5)

### 4. Candidate Generator Integration

**Purpose:** Bridge from correlation to CP-5

**Function:** `opx-candidate-generator`

**Flow:**
```
Correlated Signals
    ↓
Build Candidate Request
    ↓
Call CP-5.createCandidate()
    ↓
Candidate Created
```

**Rules:**
- Deterministic candidate creation
- No decision-making
- Pure data transformation

**Forbidden:**
- ❌ Bypassing CP-5
- ❌ Creating incidents
- ❌ Making promotion decisions

### 5. CloudWatch Dashboards

**Purpose:** Operational visibility

**Dashboards:**

#### Incident Lifecycle Dashboard
- Incidents by status
- Incidents by severity
- State transition rates
- Time in each state
- Resolution rates

#### Authority Dashboard
- Actions by authority type
- Authority usage patterns
- EMERGENCY_OVERRIDE frequency
- Justification audit

#### Signal Dashboard
- Signals by source
- Signals by service
- Correlation rates
- Candidate generation rates
- Promotion rates

#### Health Dashboard
- Replay verification status
- Event log integrity
- State hash validation
- API latency
- Error rates

### 6. Static Alarms

**Purpose:** Alert on system health issues

**Alarms:**

#### Control Plane Health
- `HighIncidentCreationRate` → Create candidate
- `StuckIncidents` → Create candidate
- `ReplayVerificationFailure` → Page on-call
- `EventLogIntegrityFailure` → Page on-call

#### Authority Anomalies
- `HighEmergencyOverrideRate` → Create candidate
- `UnauthorizedAccessAttempts` → Page on-call
- `RateLimitExceeded` → Create candidate

**Critical Rule:**
- ⚠️ Alarms create candidates, NOT incidents
- ⚠️ Only integrity failures page directly

### 7. Replay Verifier

**Purpose:** Automated replay validation

**Function:** `opx-replay-verifier`

**Algorithm:**
```
1. Select random incident
2. Fetch event log
3. Replay events
4. Compute state hash
5. Compare with stored hash
6. If mismatch:
   → Emit integrity alarm
   → Page on-call
```

**Schedule:** Hourly

**Rules:**
- Read-only operation
- No state mutation
- Deterministic replay
- Hash verification

### 8. Health Probes

**Purpose:** Continuous integrity checks

**Function:** `opx-health-probe`

**Checks:**

#### Event Log Integrity
- No gaps in event sequence
- All events have valid timestamps
- All events reference valid incidents

#### State Consistency
- Incident status matches event log
- Resolution metadata present when required
- Authority context valid

#### Idempotency Integrity
- No duplicate incidents for same decisionId
- Idempotency records permanent
- No TTL on idempotency table

**Schedule:** Every 5 minutes

**Output:** CloudWatch metrics

---

## 🚫 Phase 2 Forbidden Patterns

### 1. Alarm → Incident Shortcut

```
❌ FORBIDDEN:
CloudWatch Alarm → Lambda → CP-7.createIncident()

✅ REQUIRED:
CloudWatch Alarm → Signal → Correlation → CP-5 → CP-6 → CP-7
```

### 2. Direct State Mutation

```
❌ FORBIDDEN:
Monitoring → DynamoDB (write)

✅ REQUIRED:
Monitoring → Metrics (read-only)
```

### 3. Implicit Decision-Making

```
❌ FORBIDDEN:
if (signalCount > 3) { createIncident() }

✅ REQUIRED:
if (signalCount > 3) { createCandidate() }
```

### 4. Bypassing Authority

```
❌ FORBIDDEN:
createIncident({ service, severity })

✅ REQUIRED:
createCandidate() → promote() → createIncident()
```

---

## 📊 Phase 2 Deliverables

### Infrastructure

- [ ] DynamoDB table: `opx-signals`
- [ ] Lambda: `opx-signal-ingestor`
- [ ] Lambda: `opx-signal-correlator`
- [ ] Lambda: `opx-candidate-generator`
- [ ] Lambda: `opx-replay-verifier`
- [ ] Lambda: `opx-health-probe`
- [ ] SNS topic: `opx-signal-events`
- [ ] EventBridge rules for signal routing

### Observability

- [ ] CloudWatch dashboard: Incident Lifecycle
- [ ] CloudWatch dashboard: Authority Usage
- [ ] CloudWatch dashboard: Signal Processing
- [ ] CloudWatch dashboard: System Health
- [ ] Static alarms (candidate-generating)
- [ ] Integrity alarms (paging)

### Documentation

- [ ] Signal ingestion guide
- [ ] Correlation algorithm documentation
- [ ] Alarm configuration guide
- [ ] Dashboard user guide
- [ ] Runbook: Replay verification failure
- [ ] Runbook: Integrity alarm response

---

## ✅ Phase 2 Exit Criteria

- [ ] Signals → Candidates flow operational
- [ ] No direct incident creation (verified)
- [ ] Observability dashboards deployed
- [ ] Replay verification automated
- [ ] Health probes operational
- [ ] All Phase 2 components read-only (verified)
- [ ] Integration tests passing
- [ ] Runbooks complete

---

## 🔐 Phase 2 Invariants

These invariants must be maintained:

### INV-P2.1: Read-Only Observability
Phase 2 components may read state but never write to:
- `opx-incidents`
- `opx-incident-events`
- `opx-promotion-decisions`

### INV-P2.2: Candidate-Only Creation
Phase 2 may create candidates but never:
- Incidents
- Promotion decisions
- State transitions

### INV-P2.3: No Decision Logic
Phase 2 may correlate but never:
- Make promotion decisions
- Bypass CP-6
- Implement heuristics

### INV-P2.4: Deterministic Correlation
Signal correlation must be:
- Time-window based
- Service-scoped
- Deterministic
- Replayable

---

## 🧪 Testing Strategy

### Unit Tests
- Signal normalization
- Correlation algorithm
- Candidate generation
- Health checks

### Integration Tests
- Signal → Candidate flow
- Alarm → Candidate flow
- Replay verification
- Integrity checks

### Verification Tests
- No direct incident creation
- No CP-6 bypass
- No state mutation
- Read-only compliance

---

## 📈 Success Metrics

### Operational Metrics
- Signal ingestion rate
- Correlation accuracy
- Candidate generation rate
- Promotion rate
- False positive rate

### Health Metrics
- Replay verification success rate
- Event log integrity (100%)
- State consistency (100%)
- Alarm response time

### Authority Metrics
- Authority usage distribution
- EMERGENCY_OVERRIDE frequency
- Unauthorized access attempts (0)

---

## 🚀 Implementation Plan

### Week 1: Signal Infrastructure
- [ ] Signal event schema
- [ ] Signal ingestion Lambda
- [ ] DynamoDB table setup
- [ ] Unit tests

### Week 2: Correlation Engine
- [ ] Correlation algorithm
- [ ] Time-window logic
- [ ] Candidate generation integration
- [ ] Integration tests

### Week 3: Observability
- [ ] CloudWatch dashboards
- [ ] Static alarms
- [ ] Metrics emission
- [ ] Dashboard testing

### Week 4: Health & Verification
- [ ] Replay verifier
- [ ] Health probes
- [ ] Integrity checks
- [ ] Runbooks

### Week 5: Integration & Testing
- [ ] End-to-end testing
- [ ] Verification tests
- [ ] Performance testing
- [ ] Documentation

---

## ⚠️ Critical Reminders

1. **Phase 2 is read-only**
   - No state mutation
   - No incident creation
   - No decision-making

2. **Alarms create candidates**
   - Not incidents
   - Via CP-5 → CP-6 flow
   - Preserves determinism

3. **CP-6 remains authoritative**
   - Single promotion authority
   - No bypass mechanisms
   - All decisions auditable

4. **Phase 3 is forbidden**
   - No intelligence yet
   - No ML/AI
   - No heuristics

---

## 🎉 Phase 2 Success Criteria

Phase 2 is complete when:

1. ✅ Signals flow to candidates automatically
2. ✅ No direct incident creation exists
3. ✅ Observability is comprehensive
4. ✅ Replay verification is automated
5. ✅ Health probes are operational
6. ✅ All components are read-only
7. ✅ Integration tests pass
8. ✅ Runbooks are complete

**Only then may Phase 3 begin.**

---

**END OF PHASE 2 DESIGN**

This design preserves Phase 1 integrity while adding observability.
