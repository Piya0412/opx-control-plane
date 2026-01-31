# Phase 8.7 Design Refinements Applied

**Date:** 2026-01-31  
**Status:** ✅ COMPLETE

---

## Summary

Three minor refinements have been applied to the Phase 8.7 design based on review feedback. These are **not blockers** but improve clarity and future-proofing.

---

## Refinement 1: PK Choice Rationale

### Feedback
> Consider documenting why you didn't choose `PK: incidentId, SK: timestamp`

### Applied Changes

**Location:** `docs/phases/phase-8/PHASE_8.7_DESIGN.md` (Section 2.1)

**Added:**
- Explicit rationale for choosing `recommendationId` as PK
- Trade-off analysis (immutability, multi-dimensional queries, future flexibility)
- Explanation of why `incidentId` + `timestamp` was not chosen (hot partitions, reduced flexibility)

**Key Points:**
1. **Immutable Records:** Each recommendation is unique and independently addressable
2. **Multi-Dimensional Queries:** GSIs enable efficient queries without hot partitions
3. **Future Flexibility:** Allows recommendations to exist independently (proactive, what-if)
4. **Replay Versioning:** Each replay creates new recommendations with unique IDs

**Trade-off Acknowledged:**
- Querying by incident requires GSI (not direct partition query)
- Acceptable because GSI queries are efficient and incident queries are less frequent

### Why This Matters

Prevents future reviewers from questioning the PK choice. Documents the architectural decision for long-term maintainability.

---

## Refinement 2: Determinism Wording Clarification

### Feedback
> "Replay produces same recommendations" is ambiguous. Clarify functional vs persistence determinism.

### Applied Changes

**Locations:**
- `docs/phases/phase-8/PHASE_8.7_DESIGN.md` (Section 1.3)
- `PHASE_8.7_DESIGN_SUMMARY.md` (Safety Principles)
- `PHASE_8.7_DESIGN_COMPLETE.md` (Safety Principles)

**Old Wording:**
> "Replay produces same recommendations (stored separately each time)"

**New Wording:**
> **Functional Determinism:** Replays produce the same agent outputs (same reasoning, same recommendations)
> 
> **Persistence Versioning:** Each replay creates new records with unique IDs and timestamps
> 
> **Why Both?** Functional determinism enables debugging and verification. Persistence versioning enables comparison across replays and audit of when recommendations were generated.

### Why This Matters

Avoids philosophical debates in L2+ reviews. Clearly separates:
- **Functional determinism** (agent behavior is deterministic)
- **Persistence versioning** (each execution creates new records)

Both are intentional and serve different purposes.

---

## Refinement 3: Approval Flag Governance

### Feedback
> Add explicit rule: Only humans or external systems may change `approved`

### Applied Changes

**Location:** `docs/phases/phase-8/PHASE_8.7_DESIGN.md` (Section 2.3)

**Added:**
1. **`approved` field** to table schema (Boolean, optional)
2. **Approval Field Governance** section with 4 critical rules:
   - Only humans or external approval systems may set `approved = true`
   - Default value is `false` (approval is opt-in)
   - Immutable after approval (no modifications allowed)
   - Audit trail required (separate approval events table)

**Phase 8.7 Implementation:**
- Field is created but never set to `true`
- Always `false` or omitted
- Documented for future Phase 9 integration

**Example in Schema:**
```json
{
  "recommendationId": "rec-...",
  "status": "GENERATED",
  "approved": false,  // NEW: Reserved for Phase 9
  "ttl": 1746115200
}
```

### Why This Matters

**Protects Phase 9 from accidental auto-approval:**
- Prevents agents from approving their own recommendations
- Ensures human-in-the-loop for execution decisions
- Maintains audit trail for compliance
- Documents governance rules before implementation

**Future-proofing:**
- Phase 9 will need approval workflows
- This prevents architectural mistakes early
- Clear boundaries between advisory (Phase 8) and execution (Phase 9)

---

## Summary of Changes

| Refinement | Files Updated | Lines Added | Impact |
|------------|---------------|-------------|--------|
| PK Choice Rationale | 3 files | ~25 lines | Prevents future questions |
| Determinism Wording | 3 files | ~15 lines | Avoids philosophical debates |
| Approval Governance | 3 files | ~40 lines | Protects Phase 9 |
| **Total** | **3 files** | **~80 lines** | **High clarity, low effort** |

---

## Files Updated

1. **`docs/phases/phase-8/PHASE_8.7_DESIGN.md`**
   - Added PK choice rationale (Section 2.1)
   - Clarified determinism wording (Section 1.3)
   - Added approval field and governance (Section 2.3)

2. **`PHASE_8.7_DESIGN_SUMMARY.md`**
   - Added PK choice note (Table Schema)
   - Clarified determinism (Safety Principles)
   - Added approval governance summary

3. **`PHASE_8.7_DESIGN_COMPLETE.md`**
   - Added PK choice note (Table Schema)
   - Clarified determinism (Safety Principles)
   - Added approval governance to auditability

---

## Review Status

### Before Refinements
- ✅ Design was complete and production-ready
- ⚠️ Minor ambiguities could cause future questions

### After Refinements
- ✅ Design is complete and production-ready
- ✅ All ambiguities resolved
- ✅ Future-proofed for Phase 9
- ✅ Architectural decisions documented

---

## Next Steps

1. **Final Review** - Review refinements with senior engineers
2. **Approval** - Sign off on design
3. **Implementation** - Proceed with 3-5 day implementation
4. **Testing** - Unit, integration, failure tests
5. **Deployment** - CDK deploy and demo verification

---

## Conclusion

All three refinements have been applied successfully. The design is now:

✅ **Clear** - No ambiguities about PK choice or determinism  
✅ **Future-Proof** - Approval governance protects Phase 9  
✅ **Production-Ready** - All architectural decisions documented  
✅ **Review-Ready** - Prevents common review questions  

**Status:** READY FOR FINAL APPROVAL

---

**Last Updated:** 2026-01-31  
**Refinements Applied:** 3/3  
**Files Updated:** 3  
**Lines Added:** ~80  
**Effort:** ~30 minutes

