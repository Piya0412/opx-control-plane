# Phase 8.2: Guardrails Enforcement - Ready for Implementation

**Date:** January 29, 2026  
**Status:** ✅ ALL CORRECTIONS APPLIED - READY FOR IMPLEMENTATION

## Summary

Phase 8.2 design has been approved with all 4 required corrections successfully applied. The design now accurately reflects AWS Bedrock Guardrails API reality and is ready for implementation.

## Verification Results

All corrections verified in `PHASE_8.2_GUARDRAILS_DESIGN.md`:

```bash
✅ confidence?: number - 2 instances found
✅ SYSTEM_COMMAND_EXECUTION - 4 instances found  
✅ response.get('guardrailAction') == 'BLOCKED' - 1 instance found
✅ WARN mode clarification - Present in design
```

## What Was Corrected

### 1. WARN Mode Clarification ✅
- **Location:** Lines 11-13, 28-30
- **Change:** Added clarification that Bedrock returns `BLOCK` or `ALLOW`, not native `WARN`
- **Impact:** Code interprets non-blocking violations as `WARN` for logging

### 2. Dual Block Handling ✅
- **Location:** Lines 373-450 (Agent Integration)
- **Change:** Updated `invoke_agent_with_guardrails()` to handle BOTH:
  - Exception-based: `GuardrailInterventionException`
  - Response-based: `{"guardrailAction": "BLOCKED"}`
- **Impact:** Catches all guardrail blocks regardless of Bedrock's return pattern

### 3. Optional Confidence Field ✅
- **Location:** Line 226 (schema), Lines 410/425/445 (code)
- **Change:** Made `confidence?: number` optional with default 1.0
- **Impact:** Handles cases where Bedrock doesn't provide confidence scores

### 4. Conceptual Topic Names ✅
- **Location:** Lines 145-180 (policy), Lines 323-335 (CDK)
- **Change:** Updated topic names to conceptual definitions:
  - `SYSTEM_COMMAND_EXECUTION` (not "Execute shell commands")
  - `CREDENTIAL_HANDLING` (not "Provide AWS credentials")
  - `DESTRUCTIVE_ACTIONS` (not "Delete production data")
- **Impact:** Better semantic matching by Bedrock

## Implementation Checklist

### Infrastructure (CDK)
- [ ] Create `infra/constructs/bedrock-guardrails.ts`
  - Bedrock Guardrail resource with all policies
  - PII detection (BLOCK mode)
  - Content filters (WARN mode)
  - Topic denial (BLOCK mode with conceptual names)
  - Word filters (WARN mode)
- [ ] Create `infra/constructs/guardrail-violations-table.ts`
  - DynamoDB table: `opx-guardrail-violations`
  - GSI: `agentId-timestamp-index`
  - GSI: `type-timestamp-index`
  - No TTL (permanent records)
- [ ] Update `infra/stacks/opx-control-plane-stack.ts`
  - Add guardrails construct
  - Add violations table construct
  - Wire environment variables

### Application Code (Python)
- [ ] Create `src/tracing/guardrail-handler.py`
  - `handle_guardrail_violation()` function
  - Confidence defaults to 1.0 if absent
  - PII redaction before storage
  - CloudWatch metrics (no incidentId dimension)
- [ ] Update `src/langgraph/agent_node.py`
  - Integrate `invoke_agent_with_guardrails()`
  - Handle response-based blocks FIRST
  - Handle non-blocking violations (WARN)
  - Handle exception-based blocks in catch
  - All confidence fields default to 1.0

### Testing
- [ ] Unit tests for PII detection (BLOCK mode)
- [ ] Unit tests for content filters (WARN mode)
- [ ] Unit tests for dual block handling (exception + response)
- [ ] Unit tests for confidence field defaults
- [ ] Integration test: End-to-end guardrail enforcement
- [ ] Integration test: Violation logging to DynamoDB
- [ ] Integration test: CloudWatch metrics emission

### Deployment
- [ ] Deploy CDK stack with guardrails
- [ ] Verify guardrail created in Bedrock console
- [ ] Verify DynamoDB table created
- [ ] Test with sample PII input (should block)
- [ ] Test with sample content violation (should warn)
- [ ] Verify violations logged to DynamoDB
- [ ] Verify CloudWatch metrics populated

## Governance Rules (Locked)

These rules are authoritative and cannot be changed without approval:

- ✅ PII/Credentials → BLOCK always (hard stop)
- ✅ Content → ALLOW + LOG (WARN mode)
- ✅ Guardrails never mutate state
- ✅ Violations are permanent records (no TTL)
- ✅ Metrics stay low-cardinality (no incidentId dimensions)
- ✅ No agent bypasses guardrails
- ✅ Confidence defaults to 1.0 if absent
- ✅ Handle both exception and response-based blocks
- ✅ Topics use conceptual definitions

## Cost Estimate

**Bedrock Guardrails:** ~$1.80/month  
**DynamoDB:** Negligible (violations are rare)  
**Total:** ~$2/month

## Dependencies

- ✅ Phase 8.1 (Tracing) - COMPLETE
  - Provides `redact_pii()` function
  - Provides CloudWatch metrics patterns
  - Provides trace correlation

## Next Phase

After Phase 8.2 implementation complete:
- Phase 8.3: Validation Gates (human-in-loop)
- Phase 8.4: Token Analytics (cost tracking)

---

**Design File:** `PHASE_8.2_GUARDRAILS_DESIGN.md`  
**Corrections Doc:** `PHASE_8.2_CORRECTIONS_APPLIED.md`  
**Status:** READY FOR IMPLEMENTATION  
**Estimated Duration:** 1 day
