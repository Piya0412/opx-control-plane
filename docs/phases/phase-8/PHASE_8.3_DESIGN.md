# Phase 8.3: Structured Output Validation

**Status:** ✅ COMPLETE  
**Completed:** January 29, 2026  
**Type:** Quality Layer

---

## Objective

Ensure all agent outputs conform to expected schemas with bounded retries and graceful degradation.

---

## Core Principle

**Validation failures should not break agents.**

```
Schema validation → Business validation → Semantic validation
    ↓ (if fails)
Retry with clarification (max 3 attempts)
    ↓ (if still fails)
Fallback response (confidence: 0.0)
```

---

## Architecture

### Three-Layer Validation

```
Agent Output
    ↓
1. Schema Validation (Zod)
    ├─→ Pass → Continue
    └─→ Fail → Retry
    ↓
2. Business Logic Validation
    ├─→ Pass → Continue
    └─→ Fail → Retry
    ↓
3. Semantic Validation
    ├─→ Pass → Accept
    └─→ Fail → Retry
    ↓ (after 3 retries)
Fallback Response
```

---

## Validation Layers

### 1. Schema Validation (Zod)
- Structural correctness
- Type checking
- Required fields
- Format validation

### 2. Business Logic Validation
- Domain invariants
- Value ranges
- Relationship constraints
- Consistency checks

### 3. Semantic Validation
- Logical coherence
- Contextual sanity
- Citation verification (best-effort)
- Reasoning quality

---

## Retry Strategy

**Max Retries:** 3

**Retry Prompts:**
1. First retry: Clarify requirements
2. Second retry: Simplify request
3. Third retry: Request minimal response

**Fallback Response:**
```json
{
  "confidence": 0.0,
  "reasoning": "Unable to generate valid response after 3 attempts",
  "recommendation": "MANUAL_REVIEW_REQUIRED"
}
```

---

## Implementation

### Files Created

**Application Code (9 files):**
- `src/validation/output-validator.ts` - Main validator
- `src/validation/schema-validator.ts` - Zod validation
- `src/validation/business-validator.ts` - Business rules
- `src/validation/semantic-validator.ts` - Semantic checks
- `src/validation/retry-orchestrator.ts` - Retry logic
- `src/validation/fallback-generator.ts` - Fallback responses
- `src/validation/validation-store.ts` - DynamoDB storage
- `src/validation/validation-metrics.ts` - CloudWatch metrics
- `src/validation/validation.schema.ts` - Schema definitions

**Infrastructure (2 files):**
- `infra/constructs/validation-errors-table.ts` - DynamoDB table
- `infra/constructs/validation-alarms.ts` - CloudWatch alarms

**Tests (4 files):**
- `test/validation/schema-validator.test.ts`
- `test/validation/business-validator.test.ts`
- `test/validation/retry-orchestrator.test.ts`
- `test/validation/fallback-generator.test.ts`

---

## Corrections Applied

### ✅ Correction 1: Zod Validation Non-Throwing
Validation errors are returned as data, not exceptions. Use `safeParse()` and return values.

### ✅ Correction 2: Semantic Validation Best-Effort
Semantic validation never blocks. Treat verification failures as warnings, not hard failures.

### ✅ Correction 3: Retry Prompt Sanitization
Summarize errors, don't echo raw validation details. Keep raw errors in logs only.

### ✅ Correction 4: CloudWatch Dimensions Bucketed
Attempt dimension bucketed as: `first`, `second`, `fallback` (not numeric).

---

## Cost Impact

**Monthly:** ~$2-3
- DynamoDB: ~$1-2
- CloudWatch alarms: ~$0.20
- Metrics: ~$0.50

---

**Next Phase:** Phase 8.4 (Token Analytics)
