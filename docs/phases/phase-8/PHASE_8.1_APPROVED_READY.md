# Phase 8.1: Tracing Design - APPROVED & READY

**Date:** January 29, 2026  
**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Reviewer Verdict:** Design approved with all required adjustments applied

## Approval Summary

Phase 8.1 (Prompt & Response Tracing) has been reviewed and approved for implementation. The design meets senior SRE and governance standards with all required adjustments successfully applied.

## What Was Approved

### ✅ Core Design Strengths
- **Non-blocking architecture:** Tracing failures never fail agents
- **Separation of concerns:** LangGraph → EventBridge → Processor → DynamoDB
- **Schema quality:** Complete trace identity, cost tracking, metadata
- **Cost modeling:** Realistic and conservative (~$0.50/month)
- **Testing discipline:** Unit, integration, and failure-path tests

### ✅ Required Adjustments (All Applied)

#### 1. EventBridge Handler Fixed
- **Before:** SQS-style `event['Records']` ❌
- **After:** Native EventBridge `event['detail']` ✅
- **Impact:** Cleaner, simpler, one trace per event

#### 2. Variables Type Safety
- **Before:** `Record<string, any>` (risky) ❌
- **After:** `Record<string, string>` (safe) ✅
- **Added:** Explicit stringify, redaction, 2KB truncation
- **Impact:** Prevents credential/secret leakage

#### 3. incidentId Cardinality Rules Locked
- ✅ **Allowed:** In DynamoDB (for querying)
- ❌ **Forbidden:** As CloudWatch metric dimension
- ❌ **Forbidden:** As GSI key alone
- **Impact:** Preserves Phase 7.5 cardinality fixes

#### 4. Trace Versioning Added
- **Added:** `traceVersion: "v1"` field
- **Purpose:** Future schema evolution
- **Impact:** Zero cost, high payoff for backward compatibility

#### 5. Redaction Order Clarified
- **Order:** Cost computation → Redaction → Storage
- **Critical:** Cost uses raw tokens (before redaction)
- **Critical:** Redaction before storage/logging
- **Impact:** Explicit code comments documenting order

## Governance Rules (Locked)

These decisions are now authoritative for all of Phase 8:

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

## Implementation Checklist

### Day 1: Tracing Implementation

**Morning (4 hours):**
- [ ] Create `opx-llm-traces` DynamoDB table (CDK)
  - PK: traceId, SK: timestamp
  - GSI: agentId-timestamp-index
  - TTL: 90 days
  - On-demand billing
- [ ] Implement redaction logic (Python)
  - `redact_pii()` function with 5 PII patterns
  - `prepare_variables()` function (stringify, redact, truncate)
- [ ] Implement trace processor Lambda (Python)
  - Native EventBridge handler (`event['detail']`)
  - Redaction before storage
  - Non-blocking error handling

**Afternoon (4 hours):**
- [ ] Integrate with LangGraph agent node
  - Add `invoke_agent_with_tracing()` wrapper
  - Emit trace events to EventBridge
  - Include traceVersion: "v1"
  - Calculate cost before redaction
- [ ] Write unit tests (10 tests)
  - Redaction logic (email, phone, SSN, AWS keys)
  - Variable preparation (stringify, redact, truncate)
  - Trace versioning
- [ ] Write integration tests (3 tests)
  - End-to-end trace capture
  - Verify DynamoDB storage
  - Verify TTL configuration
- [ ] Write failure tests (2 tests)
  - Tracing failure doesn't break agent
  - Graceful degradation
- [ ] Deploy and verify
  - CDK deploy
  - Manual smoke test
  - Verify CloudWatch Logs Insights queries

## Success Criteria

All criteria must be met before marking Phase 8.1 complete:

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
- ✅ Unit tests passing (15+ tests)
- ✅ Integration tests passing (3+ tests)
- ✅ Failure tests passing (2+ tests)

## Cost Estimate

**Monthly Cost:** ~$0.50/month (negligible)

**Breakdown:**
- DynamoDB writes: $0.11/month
- DynamoDB storage: $0.23/month
- Lambda invocations: $0.02/month
- Lambda duration: $0.01/month
- EventBridge: $0.13/month

**Trigger for sampling:** If DynamoDB cost exceeds $50/month

## Files to Create/Modify

### New Files (Infrastructure)
- `infra/constructs/llm-traces-table.ts` - DynamoDB table construct
- `infra/constructs/trace-processor-lambda.ts` - Lambda construct (optional)

### New Files (Runtime)
- `src/tracing/redaction.py` - PII redaction logic
- `src/tracing/trace-processor.py` - EventBridge handler
- `src/tracing/trace-emitter.py` - EventBridge event emission

### Modified Files
- `src/langgraph/agent_node.py` - Add tracing wrapper
- `infra/stacks/opx-control-plane-stack.ts` - Add trace table and Lambda

### New Files (Tests)
- `src/tracing/test_redaction.py` - Unit tests for redaction
- `src/tracing/test_trace_processor.py` - Unit tests for processor
- `src/tracing/test_tracing_integration.py` - Integration tests

## Dependencies

**Required (Must be complete):**
- ✅ Phase 6: Bedrock Agents deployed
- ✅ Phase 7: Knowledge Base operational
- ✅ LangGraph orchestrator functional

**Optional (Nice to have):**
- Phase 4: Calibration data (for validation tuning)
- Phase 5: Automation audit (for pattern analysis)

## Next Phase

After Phase 8.1 is complete and verified:
- **Phase 8.2:** Guardrails Enforcement (1 day)
- **Phase 8.3:** Structured Output Validation (0.5 days)
- **Phase 8.4:** Token Usage Analytics (1 day)

## Approval Chain

- ✅ **Design Review:** Completed January 29, 2026
- ✅ **Adjustments Applied:** Completed January 29, 2026
- ✅ **Final Approval:** Granted January 29, 2026
- 🔄 **Implementation:** Ready to begin

---

**Approved by:** User (Senior SRE/Governance Review)  
**Design Document:** `PHASE_8.1_TRACING_DESIGN.md`  
**Implementation Start:** Authorized immediately  
**Estimated Completion:** 1 day (8 hours)

