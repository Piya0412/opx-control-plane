# Phase 2.3: Incident Orchestration — APPROVED AND LOCKED

**Version:** 1.0.0  
**Date:** 2026-01-19  
**Status:** 🔒 FROZEN — IMPLEMENTATION APPROVED

---

## ✅ APPROVAL VERDICT

**Overall Assessment:** APPROVED

- Orchestrator scope: correctly thin ✅
- Boundaries with CP-6 / CP-7: clean and enforced ✅
- Determinism + idempotency: explicit and testable ✅
- Fail-closed discipline: correct ✅
- Replay model: sound ✅
- Frozen components respected: verified ✅

**This is exactly the right next phase after Phase 2.2.**

---

## 🔒 MANDATORY DECISIONS — NOW LOCKED

These are no longer "open questions". They are resolved and frozen as part of approval.

### ✅ Decision 1: Policy Selection
**LOCKED:** Option B — Policy ID in candidate metadata

**Reasoning:**
- Correlation rules know intent
- Orchestrator remains policy-agnostic
- Replay correctness preserved

**Invariant Added:**
```
INV-P2.3.7: Policy Selection Immutability
Orchestrator MUST NOT derive or override policy selection.
Policy ID comes from candidate metadata only.
```

---

### ✅ Decision 2: Deferred Candidate Handling
**LOCKED:** Option D — Store indefinitely, manual promotion only

**Reasoning:**
- Deferral is a decision, not a failure
- No implicit retries (policy authority respected)
- Clean human-in-the-loop boundary

**Invariant Added:**
```
INV-P2.3.8: No Automatic Retry
Deferred candidates MUST NOT be automatically retried.
Manual promotion only.
```

---

### ✅ Decision 3: Authority Context
**LOCKED:** AUTO_ENGINE

**Reasoning:**
- Matches CP-8 authority matrix
- Explicit audit semantics
- Clean separation from human / automation actors

**Implementation:**
```typescript
const authority: AuthorityContext = {
  authorityType: 'AUTO_ENGINE',
  authorityId: 'opx-candidate-processor',
  sessionId: candidateId,
  justification: 'Auto-promotion from correlation'
};
```

---

### ✅ Decision 4: Orchestration Log Retention
**LOCKED:** 90 days TTL

**Reasoning:**
- Observability only
- CP-6 / CP-7 remain authoritative
- Cost-bounded, sufficient for audits

**Implementation:**
```typescript
ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
```

---

### ✅ Decision 5: Event Emission Failures
**LOCKED:** Log warning and continue

**Reasoning:**
- Matches INV-P2.3.5
- Events are observability, not authority
- Prevents false negatives in incident creation

**Implementation:**
```typescript
try {
  await eventEmitter.emit(event);
} catch (error) {
  console.warn('Event emission failed but orchestration succeeded', { error });
  // Continue - do not throw
}
```

---

## ⚠️ MANDATORY IMPLEMENTATION CONSTRAINTS (NON-NEGOTIABLE)

These are approval conditions, not suggestions.

### 1️⃣ Orchestrator MUST Remain Glue-Only

**FORBIDDEN:**
- ❌ No policy branching
- ❌ No severity logic
- ❌ No retries inside orchestrator

**REQUIRED:**
- ✅ Exactly one call to CP-6
- ✅ At most one call to CP-7

**Rule:** If logic grows → design violation

**Code Pattern:**
```typescript
// CORRECT - Glue only
async processCandidate(candidateId: string, authority: AuthorityContext, currentTime: string) {
  const candidate = await this.candidateStore.get(candidateId);
  const request = this.buildPromotionRequest(candidate, authority, currentTime);
  const decision = await this.promotionEngine.processPromotionRequest(request, currentTime);
  
  if (decision.decision === 'PROMOTE') {
    const incident = await this.incidentManager.createIncidentFromPromotion(decision, currentTime);
    return { success: true, incidentId: incident.incidentId };
  }
  
  return { success: true, decision: decision.decision };
}

// FORBIDDEN - Logic creep
async processCandidate(candidateId: string, authority: AuthorityContext, currentTime: string) {
  const candidate = await this.candidateStore.get(candidateId);
  
  // ❌ FORBIDDEN - Severity logic
  if (candidate.severity === 'SEV1') {
    // Special handling
  }
  
  // ❌ FORBIDDEN - Retry logic
  let decision;
  for (let i = 0; i < 3; i++) {
    try {
      decision = await this.promotionEngine.processPromotionRequest(...);
      break;
    } catch (error) {
      // Retry
    }
  }
}
```

---

### 2️⃣ Orchestration Store is WRITE-ONLY

**FORBIDDEN:**
- ❌ No reads on hot path
- ❌ No dependency for correctness

**REQUIRED:**
- ✅ Observability + debugging only

**Code Pattern:**
```typescript
// CORRECT - Write-only, fire-and-forget
await this.orchestrationStore.logAttempt({
  candidateId,
  decision,
  incidentId,
  // ...
}).catch(error => {
  console.warn('Failed to log orchestration attempt', { error });
  // Do not throw - this is observability only
});

// FORBIDDEN - Read on hot path
const previousAttempts = await this.orchestrationStore.getAttempts(candidateId);
if (previousAttempts.length > 0) {
  // ❌ FORBIDDEN - Correctness depends on store
}
```

---

### 3️⃣ Candidate Event Handler is FAIL-FAST

**REQUIRED:**
- Any error → throw
- Lambda retry is the only retry mechanism
- No partial handling

**Code Pattern:**
```typescript
// CORRECT - Fail-fast
export async function handleCandidateCreated(event: CandidateCreatedEvent) {
  const authority = buildAuthority(event);
  const result = await orchestrator.processCandidate(
    event.candidateId,
    authority,
    new Date().toISOString()
  );
  
  if (!result.success) {
    throw new Error(`Orchestration failed: ${result.error}`);
  }
  
  // Success - Lambda will not retry
}

// FORBIDDEN - Partial handling
export async function handleCandidateCreated(event: CandidateCreatedEvent) {
  try {
    const result = await orchestrator.processCandidate(...);
    // ❌ FORBIDDEN - Swallowing errors
  } catch (error) {
    console.error('Failed but continuing', { error });
    // ❌ FORBIDDEN - Not throwing
  }
}
```

---

### 4️⃣ Replay Tests Are GATING

**Phase 2.3 cannot be declared complete unless:**

- ✅ Replay tests pass 100%
- ✅ No duplicate incidents under replay
- ✅ Incident IDs match historical output

**Test Requirements:**
```typescript
describe('Replay Determinism', () => {
  it('same candidate + same policy → same decision', async () => {
    // Run orchestration twice with same inputs
    const result1 = await orchestrator.processCandidate(candidateId, authority, time);
    const result2 = await orchestrator.processCandidate(candidateId, authority, time);
    
    expect(result1.decisionId).toBe(result2.decisionId);
    expect(result1.incidentId).toBe(result2.incidentId);
  });
  
  it('replay produces identical incidents', async () => {
    // Historical run
    const historicalIncident = await runHistoricalOrchestration();
    
    // Replay
    const replayIncident = await replayOrchestration();
    
    expect(replayIncident.incidentId).toBe(historicalIncident.incidentId);
    expect(replayIncident).toEqual(historicalIncident);
  });
  
  it('no duplicate incidents on replay', async () => {
    // First run
    await orchestrator.processCandidate(candidateId, authority, time);
    
    // Replay (should be idempotent)
    await orchestrator.processCandidate(candidateId, authority, time);
    
    // Verify only one incident exists
    const incidents = await incidentStore.listActiveIncidents();
    const matchingIncidents = incidents.filter(i => i.candidateId === candidateId);
    expect(matchingIncidents).toHaveLength(1);
  });
});
```

---

## 🔒 FROZEN INVARIANTS

### INV-P2.3.1: Deterministic Promotion
Orchestration must be deterministic:
- Same candidate + same policy + same authority → same decision
- Same decision → same incident (via CP-7 idempotency)
- Replay produces identical results

### INV-P2.3.2: No Promotion Bypass
All incidents MUST go through CP-6:
- No direct incident creation from candidates
- No automatic promotion without policy evaluation
- No state machine bypass

### INV-P2.3.3: Frozen Component Respect
Orchestration must not modify:
- CP-5 (candidate schema/logic)
- CP-6 (promotion logic/policy)
- CP-7 (incident schema/state machine)
- Phase 2.2 (correlation logic)

### INV-P2.3.4: Idempotent Orchestration
Orchestration must be replay-safe:
- Duplicate CandidateCreated events → same result
- Retries → same incident (or no-op)
- No side effects on replay

### INV-P2.3.5: Event Decoupling
Event emission failures must not block:
- Promotion decision (CP-6)
- Incident creation (CP-7)
- Orchestration success

### INV-P2.3.6: Authority Preservation
Authority context must be preserved:
- From candidate event → promotion request
- From promotion decision → incident creation
- For audit trail

### INV-P2.3.7: Policy Selection Immutability (NEW)
Orchestrator MUST NOT derive or override policy selection.
Policy ID comes from candidate metadata only.

### INV-P2.3.8: No Automatic Retry (NEW)
Deferred candidates MUST NOT be automatically retried.
Manual promotion only.

---

## 📦 LOCKED IMPLEMENTATION SPECIFICATION

### Component 1: Incident Orchestrator

**File:** `src/orchestration/incident-orchestrator.ts`

**Interface (FROZEN):**
```typescript
export interface IncidentOrchestratorConfig {
  promotionEngine: PromotionEngine;
  incidentManager: IncidentManager;
  candidateStore: CandidateStore;
  eventEmitter: EventEmitter;
  orchestrationStore: OrchestrationStore;
}

export interface OrchestrationResult {
  success: boolean;
  decision: 'PROMOTE' | 'DEFER' | 'SUPPRESS';
  incidentId?: string;
  decisionId: string;
  reason: string;
  error?: string;
}

export class IncidentOrchestrator {
  async processCandidate(
    candidateId: string,
    authority: AuthorityContext,
    currentTime: string
  ): Promise<OrchestrationResult>;
}
```

**Algorithm (FROZEN):**
```
1. Load candidate from CP-5
   - If not found → throw (fail-closed)
2. Extract policy ID from candidate.policyId
   - If missing → throw (fail-closed)
3. Build promotion request:
   - candidateId
   - policyId (from candidate)
   - policyVersion (from candidate)
   - authority context
   - request context hash
4. Call CP-6: promotionEngine.processPromotionRequest()
   - If error → throw (Lambda will retry)
5. Handle decision:
   - PROMOTE:
     → Call CP-7: incidentManager.createIncidentFromPromotion()
     → Emit IncidentCreated event (fire-and-forget)
     → Log to orchestration store (fire-and-forget)
     → Return success with incidentId
   - DEFER:
     → Emit CandidateDeferred event (fire-and-forget)
     → Log to orchestration store (fire-and-forget)
     → Return success (no incident)
   - SUPPRESS:
     → Emit CandidateSuppressed event (fire-and-forget)
     → Log to orchestration store (fire-and-forget)
     → Return success (no incident)
6. Return orchestration result
```

---

### Component 2: Candidate Event Handler

**File:** `src/orchestration/candidate-event-handler.ts`

**Interface (FROZEN):**
```typescript
export interface CandidateCreatedEvent {
  eventType: 'CandidateCreated';
  candidateId: string;
  correlationRuleId: string;
  correlationRuleVersion: string;
  signalCount: number;
  severity: string;
  service: string;
  createdAt: string;
}

export async function handleCandidateCreated(
  event: CandidateCreatedEvent,
  context: LambdaContext
): Promise<void>;
```

**Algorithm (FROZEN):**
```
1. Parse CandidateCreated event
2. Validate event schema
   - If invalid → throw (fail-closed)
3. Build authority context:
   - authorityType: 'AUTO_ENGINE'
   - authorityId: 'opx-candidate-processor'
   - sessionId: event.candidateId
   - justification: 'Auto-promotion from correlation'
4. Call orchestrator.processCandidate()
   - If error → throw (Lambda will retry)
5. If result.success === false → throw
6. Return (success)
```

---

### Component 3: Orchestration Event Schema

**File:** `src/orchestration/orchestration-event.schema.ts`

**Schemas (FROZEN):**
```typescript
export interface IncidentCreatedEvent {
  eventType: 'IncidentCreated';
  incidentId: string;
  candidateId: string;
  decisionId: string;
  severity: string;
  service: string;
  createdAt: string;
}

export interface CandidateDeferredEvent {
  eventType: 'CandidateDeferred';
  candidateId: string;
  decisionId: string;
  reason: string;
  deferredAt: string;
}

export interface CandidateSuppressedEvent {
  eventType: 'CandidateSuppressed';
  candidateId: string;
  decisionId: string;
  reason: string;
  suppressedAt: string;
}

export interface OrchestrationFailedEvent {
  eventType: 'OrchestrationFailed';
  candidateId: string;
  error: string;
  failedAt: string;
}
```

---

### Component 4: Orchestration Store

**File:** `src/orchestration/orchestration-store.ts`

**Interface (FROZEN):**
```typescript
export interface OrchestrationAttempt {
  candidateId: string;
  attemptId: string;
  authorityType: string;
  authorityId: string;
  policyId: string;
  policyVersion: string;
  decision: 'PROMOTE' | 'DEFER' | 'SUPPRESS';
  decisionId: string;
  incidentId?: string;
  reason: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
  ttl: number; // 90 days
}

export class OrchestrationStore {
  async logAttempt(attempt: OrchestrationAttempt): Promise<void>;
  async getAttempts(candidateId: string): Promise<OrchestrationAttempt[]>; // Debug only
}
```

**DynamoDB Schema (FROZEN):**
```typescript
{
  pk: "CANDIDATE#<candidateId>",
  sk: "ATTEMPT#<timestamp>",
  ...OrchestrationAttempt fields...,
  ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
}
```

---

## 📅 LOCKED TIMELINE

**Total Duration:** 11 days

| Step | Duration | Status |
|------|----------|--------|
| 1. Event Schema | 1 day | 🔲 Not Started |
| 2. Orchestration Store | 1 day | 🔲 Not Started |
| 3. Incident Orchestrator | 2 days | 🔲 Not Started |
| 4. Event Handler | 1 day | 🔲 Not Started |
| 5. Integration Tests | 2 days | 🔲 Not Started |
| 6. Replay Tests | 1 day | 🔲 Not Started |
| 7. Infrastructure | 1 day | 🔲 Not Started |
| 8. End-to-End Validation | 1 day | 🔲 Not Started |
| 9. Documentation | 1 day | 🔲 Not Started |

---

## ✅ EXIT CRITERIA (GATING)

Phase 2.3 is complete when:

- [ ] All 4 components implemented
- [ ] All 32 tests passing
- [ ] Replay tests pass 100% ← GATING
- [ ] No duplicate incidents under replay ← GATING
- [ ] Incident IDs match historical output ← GATING
- [ ] Infrastructure deployed
- [ ] End-to-end flow validated: Signal → Correlation → Candidate → Promotion → Incident
- [ ] All invariants verified
- [ ] All mandatory constraints verified
- [ ] Documentation complete

---

## 🚀 IMPLEMENTATION BEGINS NOW

**Status:** APPROVED AND LOCKED

**Next Action:** Begin Step 1 (Event Schema)

**Reference:** [PHASE_2.3_INCIDENT_ORCHESTRATION_PLAN.md](./PHASE_2.3_INCIDENT_ORCHESTRATION_PLAN.md)

---

**END OF APPROVAL DOCUMENT**
