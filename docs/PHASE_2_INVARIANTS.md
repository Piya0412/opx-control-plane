# Phase 2 Invariants 🔒

**Version:** 1.0.0  
**Date:** 2026-01-17  
**Status:** ACTIVE

---

## Purpose

These invariants define the immutable boundaries of Phase 2. They prevent erosion of Phase 1 guarantees and ensure Phase 2 remains purely observational.

**Every Phase 2 PR must justify compliance with these invariants.**

---

## Mandatory Invariants

### INV-P2.1: Phase 2 Components Are Read-Only w.r.t. Incidents

**Statement:**
Phase 2 components may read from incident-related tables but MUST NEVER write to:
- `opx-incidents`
- `opx-incident-events`
- `opx-promotion-decisions`

**Rationale:**
- CP-7 is the sole incident writer (INV-7.2)
- CP-6 is the sole promotion authority
- Phase 2 observes, does not control

**Enforcement:**
- IAM policies: Phase 2 Lambdas have read-only permissions
- Code review: Reject any DynamoDB write operations
- Integration tests: Verify no writes occur

**Violation Examples:**
```typescript
❌ FORBIDDEN:
await dynamodb.putItem({ TableName: 'opx-incidents', ... })
await incidentManager.createIncident(...)
await dynamodb.updateItem({ TableName: 'opx-incident-events', ... })

✅ ALLOWED:
await dynamodb.getItem({ TableName: 'opx-incidents', ... })
await dynamodb.query({ TableName: 'opx-incident-events', ... })
```

---

### INV-P2.2: Phase 2 May Only Create Candidates (via CP-5)

**Statement:**
Phase 2 components may create candidates through CP-5 but MUST NEVER:
- Create incidents directly
- Create promotion decisions
- Bypass CP-6

**Rationale:**
- CP-6 is the single promotion authority (INV-6.1)
- All incidents must flow through formal promotion
- Preserves determinism and auditability

**Enforcement:**
- Code review: Verify all incident creation goes through CP-5 → CP-6 → CP-7
- Integration tests: Trace signal → candidate → promotion → incident
- Architecture review: No direct paths to CP-7

**Violation Examples:**
```typescript
❌ FORBIDDEN:
await incidentManager.createIncident(...)
await promotionEngine.createDecision(...) // Bypass
const incident = { incidentId, status: 'OPEN', ... }
await dynamodb.putItem({ TableName: 'opx-incidents', Item: incident })

✅ ALLOWED:
await candidateGenerator.createCandidate(...)
// Then CP-6 decides, then CP-7 creates incident
```

**Correct Flow (MANDATORY):**
```
Signal → Correlation → CP-5.createCandidate() → CP-6.promote() → CP-7.createIncident()
```

---

### INV-P2.3: Phase 2 May Never Call CP-7 Directly

**Statement:**
Phase 2 components MUST NEVER invoke CP-7 methods directly:
- `createIncident()`
- `openIncident()`
- `startMitigation()`
- `resolveIncident()`
- `closeIncident()`

**Rationale:**
- CP-8 is the sole external interface to CP-7 (INV-8.2)
- Direct CP-7 calls bypass authority validation
- Breaks audit trail and authority enforcement

**Enforcement:**
- Code review: Reject any imports of CP-7 in Phase 2 code
- Static analysis: No direct references to `IncidentManager`
- Integration tests: Verify all mutations go through CP-8

**Violation Examples:**
```typescript
❌ FORBIDDEN:
import { IncidentManager } from '../incident/incident-manager';
const manager = new IncidentManager(...);
await manager.createIncident(...);

❌ ALSO FORBIDDEN:
// Even if you have authority context
await incidentManager.openIncident(id, authority, currentTime);

✅ ALLOWED:
// Phase 2 creates candidates only
await candidateGenerator.createCandidate(...);
// CP-6 and CP-7 handle the rest
```

**Allowed Reads:**
```typescript
✅ ALLOWED (read-only):
await incidentManager.getIncident(id);
await incidentManager.listActiveIncidents();
// For observability/correlation only
```

---

### INV-P2.4: Phase 2 Correlation Is Deterministic and Replayable

**Statement:**
Signal correlation MUST be deterministic: given the same signal stream, the same candidates must be created in the same order.

**Rationale:**
- Preserves system-wide determinism
- Enables replay and verification
- Prevents non-deterministic behavior at 3 AM

**Requirements:**
1. **Time-based only:** Correlation uses explicit timestamps, never `Date.now()`
2. **No randomness:** No random sampling, no probabilistic logic
3. **No external state:** Correlation depends only on signals + configuration
4. **Replayable:** Same signals → same candidates, always

**Enforcement:**
- Unit tests: Replay same signal stream, verify identical output
- Integration tests: Out-of-order signal handling
- Code review: Reject any non-deterministic logic

**Violation Examples:**
```typescript
❌ FORBIDDEN:
const now = Date.now(); // Non-deterministic
if (Math.random() > 0.5) { ... } // Non-deterministic
const threshold = await getThresholdFromAPI(); // External state

✅ ALLOWED:
const now = signal.timestamp; // Explicit timestamp
if (signalCount >= config.threshold) { ... } // Deterministic
const window = config.correlationWindow; // Static configuration
```

**Replay Test (MANDATORY):**
```typescript
test('correlation is deterministic', () => {
  const signals = [signal1, signal2, signal3];
  
  const candidates1 = correlate(signals);
  const candidates2 = correlate(signals);
  
  expect(candidates1).toEqual(candidates2);
});
```

---

### INV-P2.5: Phase 2 Failure Must Not Block Phase 1

**Statement:**
Phase 2 component failures MUST NOT prevent Phase 1 operations:
- Incident creation must work even if signal ingestion fails
- Incident transitions must work even if correlation fails
- CP-8 must work even if observability fails

**Rationale:**
- Phase 1 is the control plane foundation
- Observability is important but not critical path
- System must degrade gracefully

**Requirements:**
1. **Async processing:** Signals processed asynchronously
2. **No blocking calls:** Phase 1 never waits for Phase 2
3. **Fail-open for observability:** Missing metrics don't block operations
4. **Fail-closed for control:** Control plane failures still block

**Enforcement:**
- Architecture: Phase 2 consumes events, doesn't block producers
- Integration tests: Verify Phase 1 works with Phase 2 disabled
- Chaos tests: Kill Phase 2 components, verify Phase 1 continues

**Violation Examples:**
```typescript
❌ FORBIDDEN:
// In CP-7 or CP-8
await signalIngestor.ingest(signal); // Blocking
if (!correlationEngine.isHealthy()) {
  throw new Error('Cannot create incident'); // Blocking
}

✅ ALLOWED:
// In Phase 2
eventBridge.putEvents([signal]); // Fire and forget
// Phase 1 continues regardless
```

**Correct Pattern:**
```
Phase 1 (CP-7) → EventBridge → Phase 2 (async)
                     ↓
                 (Phase 2 fails)
                     ↓
              (Phase 1 unaffected)
```

---

## Invariant Enforcement Checklist

Every Phase 2 PR must answer:

- [ ] **INV-P2.1:** Does this code write to incident tables? (Must be NO)
- [ ] **INV-P2.2:** Does this code create incidents directly? (Must be NO)
- [ ] **INV-P2.3:** Does this code call CP-7 methods? (Must be NO for mutations)
- [ ] **INV-P2.4:** Is this correlation deterministic? (Must be YES)
- [ ] **INV-P2.5:** Can Phase 1 work if this fails? (Must be YES)

**If any answer is wrong, the PR must be rejected.**

---

## Violation Response

### Severity Levels

**CRITICAL (P0):**
- Writing to incident tables
- Bypassing CP-6
- Calling CP-7 mutations directly
- **Response:** Immediate rollback, incident review

**HIGH (P1):**
- Non-deterministic correlation
- Blocking Phase 1 operations
- **Response:** Rollback, fix required

**MEDIUM (P2):**
- Inefficient reads
- Missing observability
- **Response:** Fix in next sprint

---

## Testing Requirements

### Unit Tests (Per Component)
- [ ] Read-only verification (INV-P2.1)
- [ ] No direct incident creation (INV-P2.2)
- [ ] No CP-7 calls (INV-P2.3)
- [ ] Deterministic replay (INV-P2.4)
- [ ] Failure isolation (INV-P2.5)

### Integration Tests (Per Phase)
- [ ] Signal → Candidate flow (no shortcuts)
- [ ] Phase 1 works with Phase 2 disabled
- [ ] Replay produces identical results
- [ ] No writes to frozen tables

### Chaos Tests
- [ ] Kill signal ingestor → Phase 1 continues
- [ ] Kill correlator → Phase 1 continues
- [ ] Kill all Phase 2 → Phase 1 continues

---

## Invariant Evolution

These invariants may only be modified if:

1. **Justification:** Written explanation of why change is needed
2. **Impact Analysis:** How it affects Phase 1 guarantees
3. **Approval:** Explicit architectural review
4. **Documentation:** Update this file with version bump

**Default answer to "Can I weaken an invariant?" is NO.**

---

## Relationship to Phase 1 Invariants

Phase 2 invariants **extend** Phase 1 invariants, never weaken them:

| Phase 1 Invariant | Phase 2 Extension |
|-------------------|-------------------|
| INV-7.2: CP-7 is sole incident writer | INV-P2.1: Phase 2 is read-only |
| INV-6.1: Single promotion per candidate | INV-P2.2: Phase 2 creates candidates only |
| INV-8.2: All mutations via CP-7 | INV-P2.3: Phase 2 never calls CP-7 |
| INV-7.3: Deterministic identity | INV-P2.4: Deterministic correlation |
| (System reliability) | INV-P2.5: Phase 2 failure doesn't block Phase 1 |

---

## Success Criteria

Phase 2 invariants are successfully enforced when:

- ✅ All PRs reference this document
- ✅ All tests verify invariants
- ✅ No violations in production
- ✅ Phase 1 continues working if Phase 2 fails
- ✅ Correlation is deterministic and replayable

---

## Anti-Patterns (Forbidden)

### "Just This Once" Shortcut
```typescript
❌ FORBIDDEN:
// "It's just for this one alarm..."
if (signal.severity === 'SEV1') {
  await incidentManager.createIncident(...); // Bypass
}
```

### "Smart" Correlation
```typescript
❌ FORBIDDEN:
// "We could be smarter here..."
const confidence = await mlModel.predict(signals);
if (confidence > 0.8) { ... } // Phase 3 logic in Phase 2
```

### "Helpful" Defaults
```typescript
❌ FORBIDDEN:
// "Let's default to creating an incident..."
const shouldCreate = config.autoCreate ?? true; // Implicit decision
```

### Blocking Observability
```typescript
❌ FORBIDDEN:
// In CP-7
await metrics.emit('incident.created'); // Blocking
if (!metrics.success) {
  throw new Error('Metrics failed'); // Blocks control plane
}
```

---

## Appendix: Invariant Verification

### Automated Checks

```bash
# Check for forbidden imports in Phase 2 code
grep -r "from.*incident-manager" src/signal/ && echo "VIOLATION: INV-P2.3"

# Check for writes to incident tables
grep -r "putItem.*opx-incidents" src/signal/ && echo "VIOLATION: INV-P2.1"

# Check for Date.now() in correlation
grep -r "Date.now()" src/correlation/ && echo "VIOLATION: INV-P2.4"
```

### Manual Review Checklist

- [ ] No imports of CP-7 in Phase 2 code
- [ ] No DynamoDB writes to incident tables
- [ ] No direct incident creation
- [ ] All correlation uses explicit timestamps
- [ ] Phase 1 tests pass with Phase 2 disabled

---

**END OF PHASE 2 INVARIANTS**

These invariants are mandatory and immutable. Violations are critical defects.
