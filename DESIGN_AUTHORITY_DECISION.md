# Design Authority Decision - Repository Cleanup

**Date:** January 25, 2026  
**Decision:** Implementation is Canonical (Option A)  
**Status:** 🔒 LOCKED  

---

## Decision Statement

**The Phase 3.4 implementation is the source of truth. Tests must adapt to match the canonical implementation.**

---

## Rationale

### What We Found

1. **Implementation reflects Phase 3.4** - The production code follows the correct, approved Phase 3.4 design
2. **Tests reflect abandoned CP-6 iteration** - Test files were written for a CP-6/Phase 4 design that was never promoted to canonical
3. **Temporal inconsistency** - Tests and implementation diverged during development iterations

### Why Implementation is Canonical

- Phase 3.4 design is **sound, correct, and non-negotiable**
- Implementation follows **deterministic timestamp rules** (DERIVED vs real-time)
- Implementation maintains **proper separation of concerns** (PromotionResult → Evidence → Incident)
- Implementation has **correct method signatures** for the architectural model

### Why Tests Must Move

- Tests expect **obsolete CP-6 method signatures** that don't match the approved design
- Tests use **wrong parameter orders** and **wrong return shapes**
- Tests assume **overloaded methods** that were never implemented
- Tests reflect **abandoned design iterations**, not canonical architecture

---

## Actions Taken

### 1. Removed Obsolete Test File

**File:** `test/incident/incident-manager.test.ts` (CP-6 version)

**Reason:** Completely misaligned with canonical Phase 3.4 implementation

**What it expected:**
```typescript
createIncidentFromPromotion(decision: PromotionDecision, currentTime: string)
openIncident(incidentId, authority, currentTime)
resolveIncident(incidentId, resolution, authority, currentTime)
```

**What canonical implementation provides:**
```typescript
createIncident(promotionResult: PromotionResult, evidence: EvidenceBundle, candidateId: string, authority: Authority)
transitionIncident(incidentId: string, targetState: IncidentState, authority: Authority, metadata?: TransitionMetadata)
```

### 2. Created Canonical Test File

**File:** `test/incident/incident-manager.test.ts` (Phase 3.4 version)

**Aligned with:**
- Correct method signatures
- Proper parameter types
- Phase 3.4 architectural model
- Deterministic timestamp rules

**Test Coverage:**
- ✅ `createIncident()` - with PromotionResult + Evidence
- ✅ `transitionIncident()` - with state machine validation
- ✅ Query methods - `getIncident()`, `listActiveIncidents()`
- ✅ Idempotency - returns existing incident
- ✅ Validation - rejects invalid inputs
- ✅ Severity derivation - max from evidence detections

---

## Remaining Test Alignment Work

### High Priority

**Incident Lifecycle Integration Tests**
- File: `test/incident/incident-lifecycle.integration.test.ts`
- Issue: Expects CP-6 style incident creation
- Action: Align with Phase 3.4 `createIncident()` signature

### Medium Priority

**Detection Rule Loader Tests**
- Files: `test/detection/rule-loader.test.ts`, `test/correlation/correlation-rule-store.test.ts`
- Issue: Path or configuration mismatches
- Action: Debug rule loading paths

**Evidence Bundle Integration**
- File: `test/evidence/evidence-bundle.integration.test.ts`
- Issue: Storage/retrieval integration failures
- Action: Debug evidence store integration

---

## Design Principles Enforced

### 1. Deterministic Timestamps

**CRITICAL RULE:** Incident creation timestamps are DERIVED, not real-time.

```typescript
// ✅ CORRECT (Phase 3.4)
createdAt: promotionResult.evaluatedAt  // DERIVED from evidence

// ❌ WRONG (CP-6 tests expected)
createdAt: currentTime  // Real-time parameter
```

**Rationale:** Incident creation is a derived fact, not a momentary event. Using `Date.now()` violates determinism and breaks replay safety.

### 2. Proper Dependency Chain

**CRITICAL RULE:** Incident creation requires full context.

```typescript
// ✅ CORRECT (Phase 3.4)
createIncident(promotionResult, evidence, candidateId, authority)
// Has all context needed for deterministic creation

// ❌ WRONG (CP-6 tests expected)
createIncidentFromPromotion(decision, currentTime)
// Missing evidence, forces non-deterministic behavior
```

### 3. State Machine Separation

**CRITICAL RULE:** State transitions are separate from creation.

```typescript
// ✅ CORRECT (Phase 3.4)
transitionIncident(incidentId, targetState, authority, metadata)
// Generic transition method, state machine validates

// ❌ WRONG (CP-6 tests expected)
openIncident(incidentId, authority, currentTime)
resolveIncident(incidentId, resolution, authority, currentTime)
closeIncident(incidentId, authority, currentTime)
// Specialized methods, duplicates state machine logic
```

---

## Impact Assessment

### Before Decision

```
Test Files: 15 failed | 83 passed (99)
Tests: 94 failed | 1,357 passed (1,464)
Success Rate: 93.6%
```

### After Incident Manager Realignment

**Expected:**
- Incident manager tests: ~50 failures → 0 failures
- Incident lifecycle tests: ~9 failures → need alignment
- Overall: ~94 failures → ~50 failures (estimated)

### Final Target

```
Test Files: 99 passed (99)
Tests: 1,464 passed (1,464)
Success Rate: 100%
```

---

## Lessons Learned

### 1. Test-Implementation Coupling

**Problem:** Tests were written for design iterations that never shipped.

**Solution:** Establish design authority checkpoints. Lock designs before writing tests.

### 2. Temporal Consistency

**Problem:** Tests and implementation diverged over multiple development phases.

**Solution:** Regular test alignment reviews. Delete obsolete tests immediately when design changes.

### 3. Signature Stability

**Problem:** Method signatures changed without updating tests.

**Solution:** Treat method signatures as contracts. Version them explicitly.

---

## Next Steps

### Immediate (This Session)

1. ✅ Remove obsolete CP-6 incident manager tests
2. ✅ Create canonical Phase 3.4 incident manager tests
3. ⏳ Align incident lifecycle integration tests
4. ⏳ Fix rule loader path issues
5. ⏳ Debug evidence bundle integration

### Follow-up (Next Session)

1. Run full test suite
2. Verify 100% pass rate
3. Document any remaining known issues
4. Prepare for first GitHub commit

---

## Approval

**Decision Made By:** Design Authority (Kiro AI + User)  
**Date:** January 25, 2026  
**Status:** 🔒 LOCKED - No further debate  
**Rationale:** Sound, correct, non-negotiable  

---

**This is not a refactor. This is removing temporal inconsistency.**
