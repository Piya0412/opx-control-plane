# Phase 8A: LLM Observability & Governance - APPROVED

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Approval Date:** January 29, 2026  
**Estimated Duration:** 3-4 days  
**Priority:** REQUIRED (Core governance features)

## Executive Summary

Phase 8A implements the foundational observability and governance layer for all LLM interactions in the OPX Control Plane. This phase focuses on the four core capabilities required for production AI systems:

1. **Tracing** - Capture all LLM interactions for audit
2. **Guardrails** - Prevent unsafe outputs
3. **Validation** - Ensure output correctness
4. **Analytics** - Track and optimize costs

## Approved Scope

### ✅ INCLUDED (Phase 8A)

| Sub-Phase | Duration | Priority | Design Doc |
|-----------|----------|----------|------------|
| 8.1 Prompt & Response Tracing | 1 day | REQUIRED | `PHASE_8.1_TRACING_DESIGN.md` |
| 8.2 Guardrails Enforcement | 1 day | REQUIRED | `PHASE_8.2_GUARDRAILS_DESIGN.md` |
| 8.3 Structured Output Validation | 0.5 days | REQUIRED | `PHASE_8.3_VALIDATION_DESIGN.md` |
| 8.4 Token Usage Analytics | 1 day | REQUIRED | `PHASE_8.4_TOKEN_ANALYTICS_DESIGN.md` |

**Total:** 3.5 days

### ⏸️ DEFERRED (Phase 8B - Future)

| Sub-Phase | Reason for Deferral |
|-----------|---------------------|
| 8.5 Hallucination Detection | Needs real production data to tune effectively |
| 8.6 Safety Incident Tracking | Depends on 8.5 signal quality |

**Rationale:** Real organizations implement AI governance incrementally:
1. First **observe** (tracing)
2. Then **enforce** (guardrails)
3. Then **validate** (schemas)
4. Then **optimize** (analytics)
5. Then **judge quality** (hallucination detection - later)
6. Then **automate response** (incident tracking - later)

## Key Design Decisions (Locked)

### 1. Non-Blocking Architecture ✅
- **Tracing failures MUST NEVER fail an agent**
- Async + best-effort only
- Agent execution continues even if observability fails
- Philosophy: Observability serves the system, not vice versa

### 2. Selective Guardrail Enforcement ✅
**BLOCK (Fail Execution):**
- PII detection (emails, phones, SSN, credit cards)
- AWS credentials (access keys, secret keys)

**WARN + LOG (Continue Execution):**
- Content filters (hate, violence, sexual, misconduct)
- Topic denial
- Word filters

**Rationale:** Over-blocking destroys trust early. Need data before strict enforcement.

### 3. No Premature Optimization ✅
- Start with 100% tracing (no sampling)
- Add sampling **ONLY IF** DynamoDB cost exceeds threshold
- Measure first, optimize later

### 4. Cardinality Constraints ✅
- `incidentId` ✅ **ALLOWED** in DynamoDB (for querying)
- `incidentId` ❌ **NOT ALLOWED** in CloudWatch metric dimensions
- Preserves Phase 7.5 cardinality fixes
- Prevents metric explosion

## Infrastructure Summary

### New DynamoDB Tables (3)
1. **opx-llm-traces** (90-day TTL)
   - All LLM interactions
   - PII redacted
   - Queryable by incident, agent, timestamp

2. **opx-guardrail-violations** (permanent)
   - All guardrail violations
   - Audit trail
   - Queryable by incident, agent, type

3. **opx-validation-errors** (90-day TTL)
   - Schema and validation failures
   - Retry tracking
   - Queryable by agent, error type

### Bedrock Resources (1)
- **opx-agent-guardrail**
  - Single guardrail for all agents
  - Content filters (WARN mode)
  - PII detection (BLOCK mode)
  - Topic denial (WARN mode)

### CloudWatch Resources
- **2 Dashboards:**
  - `OPX-LLM-Observability` (traces, tokens, costs)
  - `OPX-Token-Analytics` (18 widgets, forecasting)

- **~25 Custom Metrics:**
  - Namespace: `OPX/LLMTracing`, `OPX/Guardrails`, `OPX/Validation`, `OPX/TokenUsage`
  - NO incidentId dimensions (cardinality protection)

- **~8 Alarms:**
  - Guardrail violation rate
  - Validation error rate
  - Daily budget exceeded
  - Hourly cost spike
  - Monthly forecast exceeded

### Lambda Functions (0)
- No new Lambda functions required
- All logic integrated into existing LangGraph executor

## Cost Estimate

| Component | Monthly Cost |
|-----------|--------------|
| DynamoDB (3 tables) | ~$6.50 |
| Bedrock Guardrails | ~$7.50 |
| CloudWatch Dashboards | ~$6.00 |
| CloudWatch Metrics | ~$6.00 |
| CloudWatch Alarms | ~$0.80 |
| CloudWatch Logs | ~$0.50 |
| **Total** | **~$27.30/month** |

**Note:** This is incremental cost on top of existing Phase 6/7 infrastructure.

## Success Criteria

### Phase 8.1: Tracing
- ✅ All LLM calls generate traces
- ✅ Traces written asynchronously (non-blocking)
- ✅ PII redacted from all traces
- ✅ 90-day TTL configured
- ✅ GSI queries working (by incident, by agent)
- ✅ CloudWatch Logs Insights queries functional

### Phase 8.2: Guardrails
- ✅ Bedrock Guardrail deployed
- ✅ Guardrail attached to all 6 agents
- ✅ PII detection blocks execution
- ✅ Content filters warn but continue
- ✅ Violations logged to DynamoDB
- ✅ CloudWatch metrics published

### Phase 8.3: Validation
- ✅ Enhanced Pydantic schemas deployed
- ✅ Three-layer validation implemented
- ✅ Automatic retry logic working
- ✅ Validation errors logged to DynamoDB
- ✅ Degraded responses returned on final failure

### Phase 8.4: Analytics
- ✅ CloudWatch dashboard deployed with 18 widgets
- ✅ All metrics publishing correctly
- ✅ Budget alarms configured and tested
- ✅ DynamoDB queries working (incident cost, agent cost)
- ✅ Forecasting working

## Implementation Plan

### Day 1: Tracing (8.1)
**Morning:**
- Create `opx-llm-traces` DynamoDB table (CDK)
- Implement redaction logic (Python)
- Implement trace service (Python)

**Afternoon:**
- Integrate with LangGraph agent node
- Write unit tests (redaction, non-blocking)
- Write integration tests (end-to-end)
- Deploy and verify

### Day 2: Guardrails (8.2)
**Morning:**
- Create Bedrock Guardrail resource (CDK)
- Create `opx-guardrail-violations` table (CDK)
- Configure content filters, PII detection, topic denial

**Afternoon:**
- Attach guardrail to all 6 agents
- Implement violation logging service
- Integrate with agent invocation
- Write unit tests
- Write integration tests
- Deploy and verify

### Day 3: Validation (8.3)
**Morning:**
- Enhance Pydantic schemas
- Implement three-layer validation
- Implement retry logic

**Afternoon:**
- Create `opx-validation-errors` table (CDK)
- Integrate with agent node
- Write unit tests
- Deploy and verify

### Day 4: Analytics (8.4)
**Morning:**
- Create CloudWatch dashboard (CDK)
- Implement DynamoDB query functions
- Configure budget alarms

**Afternoon:**
- Enhance Cost Guardian with budget checks
- Write unit tests
- Deploy and verify
- Final integration testing

## Testing Strategy

### Unit Tests (~40 tests)
- Redaction logic (10 tests)
- Guardrail configuration (8 tests)
- Validation layers (12 tests)
- Budget calculations (10 tests)

### Integration Tests (~15 tests)
- End-to-end trace capture (3 tests)
- Guardrail enforcement (4 tests)
- Validation retry flow (4 tests)
- Cost tracking (4 tests)

### Manual Verification
- Dashboard widgets display correctly
- Alarms trigger appropriately
- Queries return expected results
- Non-blocking behavior verified

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Trace write latency impacts performance | ✅ Async writes in thread pool, non-blocking |
| Guardrails too strict (false positives) | ✅ WARN mode for content, only BLOCK for PII |
| Validation errors break agents | ✅ Degraded responses, graceful degradation |
| Cost tracking overhead | ✅ Efficient DynamoDB queries, caching |
| Dashboard query performance | ✅ Aggregated metrics, not raw traces |

## Dependencies

**Required (Must be complete):**
- ✅ Phase 6: Bedrock Agents deployed
- ✅ Phase 7: Knowledge Base operational

**Optional (Nice to have):**
- Phase 4: Calibration data (for validation tuning)
- Phase 5: Automation audit (for pattern analysis)

## Deliverables

### Code
- `src/langgraph/tracing/trace_service.py`
- `src/langgraph/tracing/redaction.py`
- `src/langgraph/guardrails/violation_service.py`
- `src/langgraph/validation/validators.py`
- `src/langgraph/analytics/cost_queries.py`

### Infrastructure (CDK)
- `infra/constructs/llm-traces-table.ts`
- `infra/constructs/guardrail-violations-table.ts`
- `infra/constructs/validation-errors-table.ts`
- `infra/constructs/bedrock-guardrails.ts`
- `infra/constructs/llm-observability-dashboard.ts`
- `infra/constructs/token-analytics-dashboard.ts`
- `infra/constructs/token-budget-alarms.ts`

### Tests
- `src/langgraph/tests/test_tracing.py`
- `src/langgraph/tests/test_guardrails.py`
- `src/langgraph/tests/test_validation.py`
- `src/langgraph/tests/test_analytics.py`

### Documentation
- `PHASE_8A_IMPLEMENTATION_COMPLETE.md` (upon completion)
- Updated `PLAN.md` (mark Phase 8A complete)

## Next Steps

1. ✅ **Design approved** - All 4 sub-phases reviewed and locked
2. 🔄 **Begin implementation** - Start with Day 1 (Tracing)
3. ⏭️ **Daily reviews** - Review progress at end of each day
4. ⏭️ **Phase 8B planning** - After 8A complete, plan 8.5-8.6

## Questions Answered

**Q1: Should we implement all 6 sub-phases?**
- ✅ **A:** No, only 8.1-8.4 (core features). Defer 8.5-8.6 to Phase 8B.

**Q2: What PII patterns should be redacted?**
- ✅ **A:** Email, phone, SSN, credit cards, AWS credentials, account IDs.

**Q3: Should guardrail violations block execution?**
- ✅ **A:** BLOCK for PII/credentials only. WARN for content/topics/words.

**Q4: What hallucination detection threshold?**
- ⏸️ **A:** Deferred to Phase 8B (needs production data to tune).

**Q5: Should we implement sampling for tracing?**
- ✅ **A:** No, start with 100%. Add sampling only if cost exceeds threshold.

---

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Next Phase:** Phase 8B (Hallucination Detection & Safety Incidents)  
**Estimated Completion:** February 1-2, 2026
