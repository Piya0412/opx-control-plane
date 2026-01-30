# Phase 8.1 Design Adjustments - APPLIED

**Date:** January 29, 2026  
**Status:** ✅ ALL REQUIRED ADJUSTMENTS APPLIED  
**Design Document:** `PHASE_8.1_TRACING_DESIGN.md`

## Summary

All 5 required adjustments from the design review have been successfully applied to the Phase 8.1 design document. The design is now ready for implementation.

## Applied Adjustments

### 1️⃣ EventBridge Handler Fixed ✅

**Issue:** Handler code assumed SQS-style batch processing (`event['Records']`)  
**Fix Applied:** Changed to native EventBridge format (`event['detail']`)

**Changes:**
- Updated trace processor Lambda to use `event['detail']` for single-event processing
- Added explicit EventBridge event structure documentation
- Added code comments explaining the native EventBridge approach
- Removed batch processing loop (one event per invocation)

### 2️⃣ Variables Type Safety Fixed ✅

**Issue:** `variables: Record<string, any>` could store raw objects/secrets  
**Fix Applied:** Changed to `Record<string, string>` with explicit preparation

**Changes:**
- Updated schema: `variables: Record<string, string>`
- Added `prepare_variables()` function with 3 steps:
  1. Stringify all values (no raw objects)
  2. Redact PII from each value
  3. Truncate to 2KB per variable
- Added unit tests for variable preparation
- Updated trace processor to call `prepare_variables()`

### 3️⃣ incidentId Cardinality Rule Locked ✅

**Issue:** Need to prevent future relaxation of cardinality constraints  
**Fix Applied:** Added explicit governance rules and code comments

**Changes:**
- Added comment in schema: "✅ OK in DynamoDB, ❌ NEVER as CloudWatch dimension"
- Added to Governance Rules section
- Added to Success Criteria
- Added comment in trace processor Lambda

### 4️⃣ Trace Versioning Added ✅

**Issue:** Missing schema versioning for future evolution  
**Fix Applied:** Added `traceVersion: "v1"` field

**Changes:**
- Added `traceVersion: string` to schema with comment about evolution
- Updated LangGraph integration to include `trace_version="v1"`
- Updated trace processor to store `traceVersion`
- Added to Success Criteria

### 5️⃣ Redaction Order Clarified ✅

**Issue:** Redaction order not explicit in code  
**Fix Applied:** Added explicit comments and documentation

**Changes:**
- Added critical comment in trace processor:
  ```python
  # REDACTION ORDER (CRITICAL):
  # 1. Cost already computed (before this Lambda)
  # 2. Now redact PII (before storage)
  # 3. Then store (after redaction)
  ```
- Added comment in `redact_pii()` function
- Updated LangGraph integration to calculate cost before emission
- Added to Success Criteria

## New Governance Rules (Locked)

The following rules are now authoritative for Phase 8:

1. ✅ Tracing failures NEVER fail agents (non-blocking, async, best-effort)
2. ✅ 100% tracing (no sampling initially)
3. ✅ Event-driven, async only (EventBridge → Lambda)
4. ✅ DynamoDB traces are non-authoritative (TTL-based)
5. ✅ TTL = 90 days (automatic cleanup)
6. ✅ PII redaction is mandatory (not optional)
7. ✅ Variables must be stringified (no raw objects)
8. ✅ incidentId allowed in DynamoDB (for querying)
9. ❌ incidentId NOT allowed in CloudWatch dimensions (cardinality protection)
10. ✅ Trace versioning required (traceVersion field)

## Updated Success Criteria

The success criteria now include all adjustments:

- ✅ All agent invocations traced (100% capture)
- ✅ PII redacted from all traces (prompt, response, variables)
- ✅ Variables stringified, redacted, and truncated to 2KB
- ✅ Traces stored in DynamoDB with 90-day TTL
- ✅ Tracing failures do not break agents (non-blocking)
- ✅ Native EventBridge handler (event['detail'], not event['Records'])
- ✅ Trace versioning included (traceVersion: "v1")
- ✅ Redaction order correct (after cost, before storage)
- ✅ incidentId NOT used as CloudWatch dimension
- ✅ CloudWatch Logs Insights queries working
- ✅ Unit tests passing (redaction, variables, truncation)
- ✅ Integration tests passing (end-to-end)
- ✅ Failure tests passing (graceful degradation)

## New Unit Tests Added

Three new test functions added for variable preparation:

1. `test_prepare_variables_stringify()` - Ensures all values are strings
2. `test_prepare_variables_redaction()` - Ensures PII is redacted
3. `test_prepare_variables_truncation()` - Ensures 2KB limit enforced

## Implementation Ready

The design is now complete and ready for Day 1 implementation:

**Morning Tasks:**
1. Create `opx-llm-traces` DynamoDB table (CDK)
2. Implement redaction logic with variable preparation (Python)
3. Implement trace service with EventBridge native handler (Python)

**Afternoon Tasks:**
4. Integrate with LangGraph agent node
5. Write unit tests (redaction, variables, truncation)
6. Write integration tests (end-to-end)
7. Deploy and verify

---

**Status:** ✅ READY FOR IMPLEMENTATION  
**Next Step:** Begin Day 1 implementation tasks  
**Estimated Duration:** 1 day
