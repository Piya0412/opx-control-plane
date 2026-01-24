# Phase 4: Learning System - Safety Guarantees

## Core Guarantees

### 1. Append-Only Storage

**Guarantee:** Once written, learning data cannot be modified or deleted.

**Implementation:**
- DynamoDB conditional writes with `attribute_not_exists(PK)`
- No update methods in stores
- No delete methods in stores

**Verification:**
- Integration tests verify no update/delete methods exist
- Duplicate writes return existing data unchanged

**Exception:** GDPR soft delete (legal overlay, not core behavior)

---

### 2. Human Validation Required

**Guarantee:** Only human authorities can record outcomes.

**Allowed Authorities:**
- `HUMAN_OPERATOR`
- `ON_CALL_SRE`
- `EMERGENCY_OVERRIDE`

**Forbidden:**
- `AUTO_ENGINE` (explicitly rejected)

**Implementation:**
- ValidationGate enforces authority check
- Throws ValidationError if AUTO_ENGINE

**Verification:**
- Integration tests verify AUTO_ENGINE rejection
- Integration tests verify human authorities accepted

---

### 3. CLOSED Incidents Only

**Guarantee:** Outcomes can only be recorded for CLOSED incidents.

**Implementation:**
- ValidationGate checks `incident.state === 'CLOSED'`
- Throws ValidationError if not CLOSED

**Rationale:** Learning from completed incidents only, never mid-incident.

**Verification:**
- Integration tests verify non-CLOSED rejection
- Integration tests verify CLOSED acceptance

---

### 4. Offline Processing

**Guarantee:** Learning operations do not modify live system state.

**Protected State:**
- Incidents (no modifications)
- Promotions (no modifications)
- Evidence (no modifications)
- Candidates (no modifications)

**Implementation:**
- Read-only access to incident/promotion stores
- No write operations to live tables
- Pattern extraction is pure computation
- Calibration is pure computation

**Verification:**
- Integration tests snapshot state before/after
- Integration tests verify no changes

---

### 5. No Live System Mutation

**Guarantee:** Learning results do not automatically change system behavior.

**What Learning Does:**
- Records outcomes
- Generates summaries
- Calculates calibration
- Creates snapshots
- Produces recommendations

**What Learning Does NOT Do:**
- Modify confidence factors
- Change promotion policies
- Update detection rules
- Alter incident state
- Trigger automated actions

**Rationale:** Human review required before any system changes.

---

### 6. Full Audit Trail

**Guarantee:** All learning operations are fully auditable.

**Audit Data:**
- Who recorded outcome (authority)
- When recorded (recordedAt, validatedAt)
- What was recorded (full outcome)
- Why (root cause, assessment)

**Implementation:**
- All records include authority
- All records include timestamps
- All records immutable (append-only)

**Verification:**
- All schemas include audit fields
- Integration tests verify audit data present

---

### 7. Replay Safety

**Guarantee:** Learning operations can be replayed without side effects.

**Properties:**
- Idempotent outcome recording
- Deterministic outcome IDs
- Deterministic pattern extraction
- Deterministic calibration

**Implementation:**
- Outcome ID = SHA256(incidentId + closedAt)
- Summary ID = SHA256(service + startDate + endDate + version)
- Calibration ID = SHA256(startDate + endDate + version)
- Snapshot ID = SHA256(snapshotType + startDate + endDate + version)
- Duplicate writes return existing

**Verification:**
- Integration tests verify idempotency
- Integration tests verify determinism

---

## GDPR Compliance

### Soft Delete (Legal Overlay)

**Approach:** Separate redaction table, not core behavior.

**Implementation:**
```
Table: opx-learning-redactions

PK: OUTCOME#{outcomeId}
SK: REDACTION#{redactionId}

Attributes:
- outcomeId (string)
- redactionId (string, UUID)
- redactedAt (string, ISO-8601)
- redactedBy (Authority)
- reason (string)
```

**Query Behavior:**
- Check redactions table before returning outcomes
- Filter redacted outcomes from results
- Preserve original data (audit trail)

**Rationale:**
- Preserves append-only invariant
- Maintains audit trail
- Complies with GDPR right to erasure
- Separates legal compliance from core behavior

---

## Failure Modes

### 1. DynamoDB Write Failure

**Impact:** Outcome not recorded

**Mitigation:** Retry with exponential backoff

**Recovery:** Re-record outcome (idempotent)

---

### 2. Validation Failure

**Impact:** Outcome rejected

**Mitigation:** Clear error messages

**Recovery:** Fix validation errors, retry

---

### 3. Pattern Extraction Failure

**Impact:** Summary not created

**Mitigation:** Retry extraction

**Recovery:** Re-run extraction (creates new summary)

---

### 4. Calibration Failure

**Impact:** Calibration not created

**Mitigation:** Retry calibration

**Recovery:** Re-run calibration (creates new calibration)

---

## Security

### Authorization

- All operations require valid AWS credentials
- IAM policies control access to learning tables
- Authority principal must match AWS principal

### Data Protection

- All data encrypted at rest (DynamoDB encryption)
- All data encrypted in transit (TLS)
- No PII in learning data (service names, metrics only)

### Audit Logging

- All operations logged to CloudWatch
- All DynamoDB operations logged to CloudTrail
- All authority actions auditable

---

## Monitoring

### Metrics

- Outcome recording rate
- Pattern extraction latency
- Calibration drift
- Snapshot creation success rate

### Alerts

- Outcome recording failures
- High false positive rate (>30%)
- Significant calibration drift (|drift| > 0.15)
- Snapshot creation failures

---

## Compliance

### SOC 2

- Append-only storage (audit trail)
- Full auditability (who, when, what, why)
- No unauthorized modifications

### GDPR

- Soft delete mechanism (right to erasure)
- Data minimization (no PII)
- Purpose limitation (learning only)

### HIPAA

- Not applicable (no PHI in learning data)

---

## Testing

### Unit Tests

- Schema validation
- Store operations
- Validation logic
- Pattern extraction
- Calibration calculations

### Integration Tests

- Complete learning flow
- Human validation enforcement
- Append-only verification
- Offline processing verification
- Idempotency verification

### Coverage

- Unit tests: >95%
- Integration tests: >90%

---

## Operational Procedures

### Daily

- Review outcome recording rate
- Check for validation errors
- Monitor false positive rate

### Weekly

- Run pattern extraction
- Review common root causes
- Identify detection gaps

### Monthly

- Run confidence calibration
- Review drift analysis
- Create monthly snapshot
- Review recommendations

---

## Support

### Questions

- Slack: #opx-learning
- Email: opx-team@example.com

### Issues

- GitHub: https://github.com/example/opx-control-plane/issues
- Label: `phase-4-learning`

---

**Last Updated:** January 22, 2026  
**Version:** 1.0.0
