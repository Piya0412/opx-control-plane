# Phase 2.3 Incident Orchestration - Architecture

**Version:** 1.0.0  
**Date:** 2026-01-19  
**Status:** Partial Deployment (Blocked at Candidate Generation)

---

## System Overview

Phase 2.3 connects candidates (from Phase 2.2 correlation) to incidents through deterministic promotion and orchestration. It acts as the decision boundary where hypotheses become operational reality.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 2.1: SIGNAL INGESTION                 │
│                                                                   │
│  CloudWatch Alarm → SNS → opx-signal-ingestor → DynamoDB        │
│                                      ↓                            │
│                              SignalIngested Event                 │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                  PHASE 2.2: SIGNAL CORRELATION                   │
│                                                                   │
│  EventBridge → opx-correlator → Correlation Engine               │
│                      ↓                                            │
│              Threshold Evaluation                                 │
│                      ↓                                            │
│              Candidate Orchestrator ← ⛔ BLOCKED HERE            │
│                      ↓                                            │
│              CandidateBuilder (requires Phase 2.4)               │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│               PHASE 2.3: INCIDENT ORCHESTRATION                  │
│                                                                   │
│  EventBridge → opx-candidate-processor → Incident Orchestrator   │
│                                              ↓                    │
│                                    Promotion Engine (CP-6)       │
│                                              ↓                    │
│                                    Incident Manager (CP-7)       │
│                                              ↓                    │
│                                         Incident                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Signal Ingestor (Phase 2.1)

```
┌──────────────────┐
│  CloudWatch      │
│  Alarm           │
└────────┬─────────┘
         │ SNS
         ↓
┌──────────────────────────────────────┐
│  opx-signal-ingestor Lambda          │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Parse SNS Message              │ │
│  └──────────┬─────────────────────┘ │
│             ↓                        │
│  ┌────────────────────────────────┐ │
│  │ Normalize Signal               │ │
│  │ - Extract service              │ │
│  │ - Extract severity             │ │
│  │ - Parse timestamp              │ │
│  └──────────┬─────────────────────┘ │
│             ↓                        │
│  ┌────────────────────────────────┐ │
│  │ Compute Signal ID (Hash)       │ │
│  └──────────┬─────────────────────┘ │
│             ↓                        │
│  ┌────────────────────────────────┐ │
│  │ Store in DynamoDB              │ │
│  │ (Idempotent - PutItem)         │ │
│  └──────────┬─────────────────────┘ │
│             ↓                        │
│  ┌────────────────────────────────┐ │
│  │ Emit SignalIngested Event      │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
         │
         ↓
┌──────────────────┐
│  opx-signals     │
│  DynamoDB Table  │
└──────────────────┘
```

**Status:** ✅ OPERATIONAL

---

### 2. Correlator (Phase 2.2)

```
┌──────────────────┐
│  EventBridge     │
│  SignalIngested  │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  opx-correlator Lambda                       │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Load Enabled Correlation Rules         │ │
│  │ (Query GSI: enabled-index)             │ │
│  └──────────┬─────────────────────────────┘ │
│             ↓                                │
│  ┌────────────────────────────────────────┐ │
│  │ For Each Rule:                         │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Query Signals in Time Window     │ │ │
│  │  │ (Fixed 5-min windows)            │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Filter by Service/Severity       │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Group by Correlation Key         │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Evaluate Threshold               │ │ │
│  │  │ (2-10 signals required)          │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ If Threshold Met:                │ │ │
│  │  │   Call Candidate Orchestrator    │ │ │
│  │  └──────────────────────────────────┘ │ │
│  └────────────────────────────────────────┘ │
│             ↓                                │
│  ┌────────────────────────────────────────┐ │
│  │ Candidate Orchestrator                 │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Get Detections ⛔ BLOCKED        │ │ │
│  │  │ (Requires Phase 2.4)             │ │ │
│  │  └──────────────────────────────────┘ │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Get Evidence Graphs ⛔ BLOCKED   │ │ │
│  │  │ (Requires Phase 2.4)             │ │ │
│  │  └──────────────────────────────────┘ │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Get Normalized Signals ⛔ BLOCKED│ │ │
│  │  │ (Requires Phase 2.4)             │ │ │
│  │  └──────────────────────────────────┘ │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ CandidateBuilder                 │ │ │
│  │  │ ❌ Fails: Zero detections        │ │ │
│  │  └──────────────────────────────────┘ │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Status:** ✅ OPERATIONAL (Blocked at candidate generation)

**Known Limitation:** Cannot create candidates until Phase 2.4 Detection Engine is deployed.

---

### 3. Candidate Processor (Phase 2.3)

```
┌──────────────────┐
│  EventBridge     │
│  CandidateCreated│
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  opx-candidate-processor Lambda              │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Parse CandidateCreated Event           │ │
│  └──────────┬─────────────────────────────┘ │
│             ↓                                │
│  ┌────────────────────────────────────────┐ │
│  │ Build Authority Context                │ │
│  │ - authorityType: AUTO_ENGINE           │ │
│  │ - authorityId: opx-candidate-processor │ │
│  │ - sessionId: candidateId               │ │
│  └──────────┬─────────────────────────────┘ │
│             ↓                                │
│  ┌────────────────────────────────────────┐ │
│  │ Incident Orchestrator                  │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Load Candidate from CP-5         │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Build Promotion Request          │ │ │
│  │  │ - candidateId                    │ │ │
│  │  │ - policyId (from candidate)      │ │ │
│  │  │ - authority context              │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Promotion Engine (CP-6)          │ │ │
│  │  │ - Load policy                    │ │ │
│  │  │ - Evaluate rules                 │ │ │
│  │  │ - Return decision                │ │ │
│  │  └────────┬─────────────────────────┘ │ │
│  │           ↓                            │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Handle Decision:                 │ │ │
│  │  │                                  │ │ │
│  │  │ PROMOTE:                         │ │ │
│  │  │   → Incident Manager (CP-7)      │ │ │
│  │  │   → Create Incident              │ │ │
│  │  │   → Emit IncidentCreated         │ │ │
│  │  │                                  │ │ │
│  │  │ DEFER:                           │ │ │
│  │  │   → Log reason                   │ │ │
│  │  │   → Emit CandidateDeferred       │ │ │
│  │  │                                  │ │ │
│  │  │ SUPPRESS:                        │ │ │
│  │  │   → Log reason                   │ │ │
│  │  │   → Emit CandidateSuppressed     │ │ │
│  │  └──────────────────────────────────┘ │ │
│  └────────────────────────────────────────┘ │
│             ↓                                │
│  ┌────────────────────────────────────────┐ │
│  │ Log to Orchestration Store             │ │
│  │ (Fire-and-forget, observability only)  │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
         │
         ↓
┌──────────────────┐
│  opx-incidents   │
│  DynamoDB Table  │
└──────────────────┘
```

**Status:** ✅ DEPLOYED (Not yet tested - no candidates created)

---

## Data Flow

### Complete Pipeline (When Unblocked)

```
1. CloudWatch Alarm fires
   ↓
2. SNS publishes to opx-cloudwatch-alarms
   ↓
3. opx-signal-ingestor Lambda invoked
   ↓
4. Signal normalized and stored in opx-signals
   ↓
5. SignalIngested event emitted to EventBridge
   ↓
6. opx-correlator Lambda invoked
   ↓
7. Correlation rules loaded from opx-correlation-rules
   ↓
8. Signals queried from opx-signals (time window)
   ↓
9. Signals grouped and threshold evaluated
   ↓
10. If threshold met:
    ↓
11. Candidate Orchestrator invoked
    ↓
12. ⛔ BLOCKED: Detections/graphs/normalized signals required
    ↓
    [Phase 2.4 Detection Engine needed]
    ↓
13. Candidate created in opx-candidates
    ↓
14. CandidateCreated event emitted to EventBridge
    ↓
15. opx-candidate-processor Lambda invoked
    ↓
16. Promotion Engine (CP-6) evaluates policy
    ↓
17. If PROMOTE:
    ↓
18. Incident Manager (CP-7) creates incident
    ↓
19. Incident stored in opx-incidents
    ↓
20. IncidentCreated event emitted to EventBridge
```

### Current State (Blocked at Step 12)

```
Steps 1-11: ✅ WORKING
Step 12: ⛔ BLOCKED (requires Phase 2.4)
Steps 13-20: ⏸️ NOT REACHED
```

---

## DynamoDB Schema

### opx-signals

```
Primary Key:
  pk: "SIGNAL#<signalId>"
  sk: "METADATA"

Attributes:
  signalId: string (hash of normalized signal)
  service: string
  severity: string
  observedAt: string (ISO 8601)
  rawSignal: object (original CloudWatch Alarm)
  normalizedAt: string
  ttl: number (90 days)

GSI: service-observedAt-index
  pk: service
  sk: observedAt

GSI: severity-observedAt-index
  pk: severity
  sk: observedAt
```

### opx-correlation-rules

```
Primary Key:
  pk: "RULE#<ruleId>"
  sk: "VERSION#<version>"

Attributes:
  ruleId: string
  version: string
  enabled: string ('true' or 'false')
  filters: object
  timeWindow: string (ISO 8601 duration)
  groupBy: string[]
  threshold: object { min, max }

GSI: enabled-index
  pk: enabled ('true')
  sk: ruleId
```

### opx-candidates

```
Primary Key:
  pk: "CANDIDATE#<candidateId>"
  sk: "METADATA"

Attributes:
  candidateId: string (deterministic hash)
  correlationRuleId: string
  correlationRuleVersion: string
  signalIds: string[]
  detectionIds: string[]
  graphIds: string[]
  normalizedSignalIds: string[]
  service: string
  severity: string
  policyId: string
  policyVersion: string
  createdAt: string
  ttl: number (90 days)
```

### opx-promotion-decisions

```
Primary Key:
  pk: "DECISION#<decisionId>"
  sk: "METADATA"

Attributes:
  decisionId: string (deterministic hash)
  candidateId: string
  policyId: string
  policyVersion: string
  decision: string (PROMOTE/DEFER/SUPPRESS)
  reason: string
  authorityType: string
  authorityId: string
  decidedAt: string
  (No TTL - permanent audit trail)
```

### opx-incidents

```
Primary Key:
  pk: "INCIDENT#<incidentId>"
  sk: "METADATA"

Attributes:
  incidentId: string (deterministic hash)
  candidateId: string
  decisionId: string
  service: string
  severity: string
  status: string (OPEN/INVESTIGATING/RESOLVED/CLOSED)
  createdAt: string
  updatedAt: string
  (No TTL - permanent)
```

### opx-orchestration-log

```
Primary Key:
  pk: "CANDIDATE#<candidateId>"
  sk: "ATTEMPT#<timestamp>"

Attributes:
  candidateId: string
  attemptId: string (UUID)
  authorityType: string
  authorityId: string
  policyId: string
  policyVersion: string
  decision: string
  decisionId: string
  incidentId: string (if PROMOTE)
  reason: string
  startedAt: string
  completedAt: string
  durationMs: number
  status: string (success/error)
  error: string (if error)
  ttl: number (90 days)
```

---

## EventBridge Events

### SignalIngested

```json
{
  "source": "opx.signal",
  "detail-type": "SignalIngested",
  "detail": {
    "signalId": "abc123...",
    "service": "testapi",
    "severity": "SEV1",
    "observedAt": "2026-01-19T00:00:00Z"
  }
}
```

### CandidateCreated

```json
{
  "source": "opx.candidate",
  "detail-type": "CandidateCreated",
  "detail": {
    "candidateId": "def456...",
    "correlationRuleId": "rule-test-high-severity",
    "correlationRuleVersion": "1.0.0",
    "signalCount": 3,
    "severity": "SEV1",
    "service": "testapi",
    "createdAt": "2026-01-19T00:05:00Z"
  }
}
```

### IncidentCreated

```json
{
  "source": "opx.incident",
  "detail-type": "IncidentCreated",
  "detail": {
    "incidentId": "ghi789...",
    "candidateId": "def456...",
    "decisionId": "jkl012...",
    "severity": "SEV1",
    "service": "testapi",
    "createdAt": "2026-01-19T00:05:30Z"
  }
}
```

---

## IAM Permissions

### opx-signal-ingestor-role

```yaml
Permissions:
  - dynamodb:PutItem (opx-signals)
  - events:PutEvents (opx-audit-events)
  - xray:PutTraceSegments
  - logs:CreateLogGroup
  - logs:CreateLogStream
  - logs:PutLogEvents
```

### opx-correlator-role

```yaml
Permissions:
  - dynamodb:Query (opx-signals, opx-correlation-rules)
  - dynamodb:Scan (opx-correlation-rules)
  - dynamodb:PutItem (opx-candidates)
  - events:PutEvents (opx-audit-events)
  - xray:PutTraceSegments
  - logs:CreateLogGroup
  - logs:CreateLogStream
  - logs:PutLogEvents
```

### opx-candidate-processor-role

```yaml
Permissions:
  - dynamodb:GetItem (opx-candidates, opx-promotion-policies)
  - dynamodb:PutItem (opx-promotion-decisions, opx-incidents, opx-orchestration-log)
  - events:PutEvents (opx-audit-events)
  - xray:PutTraceSegments
  - logs:CreateLogGroup
  - logs:CreateLogStream
  - logs:PutLogEvents
```

---

## Determinism Guarantees

### Signal ID Computation

```typescript
signalId = SHA256(
  service +
  severity +
  observedAt (truncated to minute) +
  alarmName
)
```

**Properties:**
- Same signal → same ID
- Idempotent storage (PutItem with same ID)
- Replay-safe

### Candidate ID Computation

```typescript
candidateId = SHA256(
  correlationRuleId +
  correlationRuleVersion +
  sorted(signalIds) +
  timeWindow +
  groupByKey
)
```

**Properties:**
- Same signals + same rule → same candidate ID
- Idempotent candidate creation
- Replay produces same candidate

### Decision ID Computation

```typescript
decisionId = SHA256(
  candidateId +
  policyId +
  policyVersion +
  authorityType +
  authorityId
)
```

**Properties:**
- Same candidate + same policy + same authority → same decision ID
- Idempotent promotion decision
- Replay produces same decision

### Incident ID Computation

```typescript
incidentId = SHA256(
  candidateId +
  decisionId
)
```

**Properties:**
- Same candidate + same decision → same incident ID
- Idempotent incident creation
- Replay produces same incident
- **CRITICAL:** No duplicate incidents

---

## Failure Modes

### 1. Signal Ingestion Failure

**Cause:** SNS → Lambda invocation fails  
**Impact:** Signals not ingested  
**Detection:** No signals in opx-signals, SNS delivery failures  
**Mitigation:** SNS retries automatically, DLQ captures failures  
**Recovery:** Fix Lambda, replay from DLQ

### 2. Correlation Failure

**Cause:** Correlator Lambda error  
**Impact:** No candidates created  
**Detection:** Lambda errors, no candidates in opx-candidates  
**Mitigation:** Lambda retries automatically, DLQ captures failures  
**Recovery:** Fix Lambda, replay from EventBridge

### 3. Candidate Generation Blocked (CURRENT)

**Cause:** Phase 2.4 not deployed  
**Impact:** No candidates created  
**Detection:** Logs show "Cannot build candidate with zero detections"  
**Mitigation:** None (architectural dependency)  
**Recovery:** Deploy Phase 2.4 Detection Engine

### 4. Promotion Failure

**Cause:** Promotion Engine (CP-6) error  
**Impact:** Candidates not promoted  
**Detection:** Lambda errors, no decisions in opx-promotion-decisions  
**Mitigation:** Lambda retries automatically  
**Recovery:** Fix promotion logic, replay candidates

### 5. Incident Creation Failure

**Cause:** Incident Manager (CP-7) error  
**Impact:** Incidents not created  
**Detection:** Lambda errors, no incidents in opx-incidents  
**Mitigation:** Lambda retries automatically  
**Recovery:** Fix incident logic, replay candidates

### 6. Duplicate Incident (CRITICAL)

**Cause:** Non-deterministic identity computation  
**Impact:** Multiple incidents for same candidate  
**Detection:** Replay test fails, duplicate incident IDs  
**Mitigation:** KILL SWITCH - disable EventBridge rules immediately  
**Recovery:** Fix identity computation, verify with replay tests, redeploy

---

## Monitoring & Observability

### Key Metrics

**Signal Ingestion:**
- Signals ingested per minute
- Ingestion latency (p50, p99)
- Ingestion error rate

**Correlation:**
- Rules evaluated per invocation
- Rules matched per invocation
- Thresholds met per invocation
- Candidates generated per minute

**Orchestration:**
- Candidates processed per minute
- Promotion rate (PROMOTE/DEFER/SUPPRESS)
- Incidents created per minute
- Orchestration latency (p50, p99)

**Errors:**
- Lambda error rate (must be < 1%)
- DynamoDB throttling (must be 0%)
- DLQ message count (must be 0)

### CloudWatch Dashboards

**Pipeline Health:**
- Signal ingestion rate
- Candidate creation rate
- Incident creation rate
- Error rates across all Lambdas

**Performance:**
- Lambda duration (p50, p99)
- DynamoDB latency
- End-to-end latency (signal → incident)

**Capacity:**
- Lambda concurrent executions
- DynamoDB consumed capacity
- EventBridge invocations

---

## Security

### Encryption

- **At Rest:** All DynamoDB tables encrypted with AWS managed keys
- **In Transit:** All API calls use TLS 1.2+
- **Logs:** CloudWatch Logs encrypted

### Access Control

- **Principle of Least Privilege:** Each Lambda has minimal IAM permissions
- **No Cross-Account Access:** All resources in same AWS account
- **No Admin Permissions:** No Lambda has admin or delete permissions

### Audit Trail

- **CloudTrail:** All API calls logged
- **CloudWatch Logs:** All Lambda invocations logged
- **Orchestration Log:** All promotion attempts logged (90 days)
- **Promotion Decisions:** Permanent audit trail (no TTL)
- **Incidents:** Permanent audit trail (no TTL)

---

## Deployment

### Infrastructure as Code

All infrastructure defined in CDK:
- `infra/stacks/opx-control-plane-stack.ts`
- `infra/constructs/signal-store-table.ts`
- `infra/constructs/iam-roles.ts`

### Deployment Process

```bash
# Review changes
cdk diff

# Deploy to AWS
cdk deploy

# Verify deployment
aws cloudformation describe-stacks \
  --stack-name OpxControlPlaneStack \
  --query "Stacks[0].StackStatus"
```

### Rollback

```bash
# Disable EventBridge rules (kill switch)
aws events disable-rule --event-bus-name opx-audit-events --name opx-signal-ingested-to-correlator
aws events disable-rule --event-bus-name opx-audit-events --name opx-candidate-created-to-processor

# Rollback CDK stack
cdk deploy --previous-parameters

# Re-enable rules after verification
aws events enable-rule --event-bus-name opx-audit-events --name opx-signal-ingested-to-correlator
aws events enable-rule --event-bus-name opx-audit-events --name opx-candidate-created-to-processor
```

---

## Future Enhancements (Post-Phase 2.4)

### Phase 2.4: Detection Engine
- Implement detection rules
- Store detections in DynamoDB
- Unblock candidate generation

### Phase 2.5: Evidence Graphs
- Build evidence graphs from detections
- Store graphs in DynamoDB
- Enrich candidates with graph data

### Phase 3: Agents & Remediation
- Automated remediation actions
- Agent orchestration
- Feedback loops

### Phase 4: Machine Learning
- Anomaly detection
- Predictive incident creation
- Auto-tuning correlation rules

---

**Last Updated:** 2026-01-19  
**Next Review:** After Phase 2.4 deployment
