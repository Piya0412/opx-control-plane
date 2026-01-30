# Phase 8.3: Required Corrections Acknowledged

**Date:** January 29, 2026  
**Status:** ✅ APPROVED WITH CORRECTIONS  
**Action:** Ready to implement with mandatory adjustments

---

## Approval Summary

Phase 8.3 (Structured Output Validation) is **APPROVED** with 4 required corrections to be applied during implementation.

**Core Design:** ✅ Correct  
**Architecture:** ✅ Aligned  
**Corrections:** 4 mandatory (acknowledged below)

---

## Required Corrections (Acknowledged)

### 1️⃣ Zod Validation Must Be Non-Throwing Only

**Issue:** `throw new ValidationError(...)` violates non-blocking principle

**Correction Acknowledged:** ✅
```typescript
// ❌ WRONG - Throws exception
const result = AgentOutputSchema.parse(parsed);

// ✅ CORRECT - Returns data
const schemaResult = AgentOutputSchema.safeParse(parsed);
if (!schemaResult.success) {
  return { ok: false, error: schemaResult.error };
}
```

**Implementation Rule:**
- Validation errors are data, not exceptions
- Use return values, not throws
- Exceptions absorbed internally, never leak upward

**Status:** ✅ Will implement correctly

---

### 2️⃣ Semantic Validation Must Be Best-Effort Only

**Issue:** `await verifyDocumentExists(citation.source)` could cascade retries on infra failures

**Correction Acknowledged:** ✅
```typescript
// ❌ WRONG - Blocks on infra failure
await verifyDocumentExists(citation.source);
if (!exists) throw new ValidationError();

// ✅ CORRECT - Best-effort, never blocks
try {
  const exists = await verifyDocumentExists(citation.source);
  if (!exists) {
    logger.warn('Citation document not found', { source });
    // Continue anyway - log only
  }
} catch (error) {
  logger.warn('Semantic validation skipped', { error });
  // Skip check on infra failure
}
```

**Implementation Rules:**
- Semantic validation never blocks agent responses
- Missing document → log + WARN (don't fail)
- Broken lookup → skip semantic check
- Never trigger retry only due to infra failure

**Status:** ✅ Will implement correctly

---

### 3️⃣ Retry Prompt Must Not Echo Raw Validation Details

**Issue:** `Previous attempt failed validation: [specific errors]` risks prompt injection

**Correction Acknowledged:** ✅
```typescript
// ❌ WRONG - Echoes raw errors
const retryPrompt = `Previous attempt failed validation: ${JSON.stringify(errors)}`;

// ✅ CORRECT - Summarizes only
const retryPrompt = `Previous response did not meet required format. Please strictly follow the schema.`;
```

**Implementation Rules:**
- Summarize, don't echo
- Keep raw errors in logs only
- Prevent schema overfitting
- Prevent prompt injection

**Status:** ✅ Will implement correctly

---

### 4️⃣ CloudWatch Dimensions - Bucket Attempts

**Issue:** `RetrySuccessRate (AgentId, Attempt)` with numeric Attempt is risky long-term

**Correction Acknowledged:** ✅
```typescript
// ❌ RISKY - Numeric attempt
dimensions: {
  AgentId: 'signal-intelligence',
  Attempt: '1' // or '2', '3'
}

// ✅ CORRECT - Bucketed attempt
dimensions: {
  AgentId: 'signal-intelligence',
  Attempt: attempt === 0 ? 'first' : 
           attempt === 1 ? 'second' : 
           'fallback'
}
```

**Implementation Rules:**
- Bucket attempts: `first`, `second`, `fallback`
- Keep metrics stable
- Low cardinality guaranteed

**Status:** ✅ Will implement correctly

---

## What Was Approved (No Changes Needed)

### ✅ Core Principle
"Validation failures should not break agents"
- Aligned with Phase 6, 8.1, 8.2
- Consistent system design

### ✅ Three-Layer Validation Model
1. **Schema (Zod):** Structural correctness
2. **Business Logic:** Domain invariants
3. **Semantic:** Logical & contextual sanity

### ✅ Retry Strategy
- Max 3 retries (bounded)
- Prompt clarification → simplification → fallback
- No infinite loops
- Clear degraded response semantics

### ✅ Observability & Metrics
- Separate `opx-validation-errors` table
- TTL applied (90 days)
- Low-cardinality CloudWatch metrics
- Alarms on rates, not raw counts

### ✅ Fallback Response Design
```typescript
{
  confidence: 0.0,
  reasoning: "Unable to generate valid response after 3 attempts",
  // ... minimal safe defaults
}
```
- Honest, non-misleading, safe for downstream

---

## System Guarantees (Now Canon)

With Phase 8.3, OPX guarantees:

1. ✅ No agent emits malformed output
2. ✅ No caller sees schema garbage
3. ✅ Retries are bounded and observable
4. ✅ Fallbacks are explicit and honest
5. ✅ Validation failures are auditable
6. ✅ No validation logic can crash the system

**This is enterprise-grade correctness control.**

---

## Implementation Checklist

### Pre-Implementation
- ✅ Corrections acknowledged
- ✅ Design approved
- ✅ Architecture aligned
- ⏳ Implementation plan ready

### During Implementation
- [ ] Apply Correction 1: Non-throwing Zod validation
- [ ] Apply Correction 2: Best-effort semantic validation
- [ ] Apply Correction 3: Summarized retry prompts
- [ ] Apply Correction 4: Bucketed CloudWatch dimensions

### Post-Implementation
- [ ] Unit tests for all 3 validation layers
- [ ] Integration tests for retry logic
- [ ] Validation error table populated
- [ ] CloudWatch metrics emitting
- [ ] Alarms configured

---

## Files to Create/Modify

### New Files
- `src/validation/output-validator.ts` - Core validation logic
- `src/validation/schema-validator.ts` - Zod schema validation
- `src/validation/business-validator.ts` - Business logic validation
- `src/validation/semantic-validator.ts` - Semantic validation
- `src/validation/retry-orchestrator.ts` - Retry logic
- `src/validation/validation-store.ts` - DynamoDB operations
- `infra/constructs/validation-errors-table.ts` - DynamoDB table
- `infra/constructs/validation-alarms.ts` - CloudWatch alarms

### Modified Files
- `src/agents/orchestrator.ts` - Integrate validation
- `src/langgraph/agent_node.py` - Add validation wrapper
- `infra/phase6/stacks/phase6-bedrock-stack.ts` - Add validation resources

### Test Files
- `test/validation/output-validator.test.ts`
- `test/validation/retry-orchestrator.test.ts`
- `test/validation/semantic-validator.test.ts`

---

## Cost Impact

**Monthly:** ~$1-2
- DynamoDB: ~$0.50 (validation errors table)
- CloudWatch: Included in free tier
- Lambda: No additional cost (inline validation)

**Total Phase 8 Cost:** ~$5/month (8.1 + 8.2 + 8.3)

---

## Timeline

**Estimated Implementation:** 4-6 hours
- Infrastructure: 1 hour
- Core validation logic: 2 hours
- Retry orchestration: 1 hour
- Tests: 1-2 hours

**Validation Gates:** 2 hours
- Gate 1: Schema validation
- Gate 2: Retry logic
- Gate 3: Fallback behavior
- Gate 4: Observability

**Total:** 6-8 hours

---

## Next Steps

1. **Create infrastructure constructs**
   - Validation errors table
   - CloudWatch alarms
   - IAM permissions

2. **Implement validation layers**
   - Schema validator (Zod, non-throwing)
   - Business validator (domain rules)
   - Semantic validator (best-effort)

3. **Implement retry orchestrator**
   - Bounded retries (max 3)
   - Prompt simplification
   - Fallback generation

4. **Add observability**
   - DynamoDB logging
   - CloudWatch metrics (bucketed dimensions)
   - Alarms on rates

5. **Write tests**
   - Unit tests for each layer
   - Integration tests for retry flow
   - Edge case coverage

6. **Execute validation gates**
   - Verify all corrections applied
   - Test retry behavior
   - Validate observability

---

## Approval Confirmation

**Phase 8.3 Design:** ✅ APPROVED  
**Corrections:** ✅ ACKNOWLEDGED  
**Ready to Implement:** ✅ YES

**Approved By:** Design Review  
**Date:** January 29, 2026  
**Implementation Start:** Ready now

---

*All required corrections acknowledged and will be applied during implementation. Phase 8.3 is ready to build.*
