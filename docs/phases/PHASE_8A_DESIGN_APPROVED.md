# Phase 8A: LLM Observability & Governance (APPROVED)

**Status:** ✅ APPROVED - READY FOR IMPLEMENTATION  
**Created:** January 29, 2026  
**Approved:** January 29, 2026  
**Estimated Duration:** 3-4 days

## Scope Decision (LOCKED)

**Phase 8A Implementation = 8.1 → 8.4 ONLY**

| Sub-phase | Status | Reason |
|-----------|--------|--------|
| 8.1 Prompt & Response Tracing | ✅ REQUIRED | Auditability is non-negotiable |
| 8.2 Guardrails Enforcement | ✅ REQUIRED | Safety baseline |
| 8.3 Structured Output Validation | ✅ REQUIRED | Determinism & correctness |
| 8.4 Token Usage Analytics | ✅ REQUIRED | Cost & governance |

**Deferred to Phase 8B:**
| Sub-phase | Decision | Why |
|-----------|----------|-----|
| 8.5 Hallucination Detection | ⏸️ DEFER | Needs real production data to tune |
| 8.6 Safety Incident Tracking | ⏸️ DEFER | Depends on 8.5 signal quality |

## Key Design Decisions (LOCKED)

### 1. Tracing Is Non-Blocking ✅

**Rule:** Tracing failures must NEVER fail an agent

**Implementation:**
- Async tracing only
- Best-effort delivery
- Graceful degradation on errors
- No exceptions propagated to agents

**Rationale:** Observability cannot break production

### 2. Guardrails Behavior ✅

**Question Answered:** Should guardrail violations block execution?

**Decision:**
```
PII / Credentials → BLOCK (hard stop)
Content categories → WARN + LOG (soft enforcement)
```

**Enforcement Mode:**
- **BLOCK:** Email, phone, SSN, AWS credentials, API keys
- **WARN:** Hate speech, violence, sexual content, misconduct

**Rationale:**
- Over-blocking destroys trust early
- Need data before strict enforcement
- PII leaks are unacceptable
- Content issues can be tuned

### 3. Tracing Volume & Sampling ✅

**Question Answered:** Should we implement sampling for high-volume tracing?

**Decision:** Start with 100% tracing, add sampling only if DynamoDB cost exceeds threshold

**Thresholds:**
- If DynamoDB cost > $50/month → Enable 10% sampling
- If DynamoDB cost > $100/month → Enable 1% sampling
- Always trace: Guardrail violations, validation errors, high-cost calls

**Rationale:** Do NOT prematurely optimize

### 4. IncidentId Cardinality (CRITICAL) ✅

**Rule (LOCKED):**
```
incidentId ✅ ALLOWED in DynamoDB
incidentId ❌ NOT ALLOWED in CloudWatch metric dimensions
```

**Why:**
- Preserves Phase 7.5 fixes
- Prevents metric explosion
- Maintains cost predictability

**Allowed Dimensions:**
- `agentId`
- `model`
- `guardrailViolationType`
- `validationErrorType`

## Architecture Philosophy

**Observe → Enforce → Judge → Automate**

This mirrors how real organizations do AI governance:
1. **First observe** (Phase 8A: Tracing, Analytics)
2. **Then enforce** (Phase 8A: Guardrails, Validation)
3. **Then judge quality** (Phase 8B: Hallucination Detection)
4. **Then automate response** (Phase 8B: Safety Incidents)

Not all at once.

## Implementation Scope

### 8.1: Prompt & Response Tracing

**Deliverables:**
- DynamoDB table: `opx-llm-traces` (90-day TTL)
- Trace schema with redaction
- Async tracing middleware
- CloudWatch Logs Insights queries

**See:** `PHASE_8.1_TRACING_DESIGN.md`

### 8.2: Guardrails Enforcement

**Deliverables:**
- Bedrock Guardrail: `opx-agent-guardrail`
- PII detection (BLOCK mode)
- Content filters (WARN mode)
- Violation logging to `opx-guardrail-violations`

**See:** `PHASE_8.2_GUARDRAILS_DESIGN.md`

### 8.3: Structured Output Validation

**Deliverables:**
- Enhanced Zod schemas
- Validation middleware
- Retry logic on schema violations
- Validation error table: `opx-validation-errors`

**See:** `PHASE_8.3_VALIDATION_DESIGN.md`

### 8.4: Token Usage Analytics

**Deliverables:**
- CloudWatch dashboard: `OPX-LLM-Observability`
- Per-agent token metrics
- Cost breakdown by incident
- Budget forecasting

**See:** `PHASE_8.4_ANALYTICS_DESIGN.md`

## Infrastructure Summary

### New DynamoDB Tables (3)

1. **opx-llm-traces**
   - Purpose: Store all LLM interactions
   - TTL: 90 days
   - Keys: `traceId` (PK), `timestamp` (SK)
   - GSI: `agentId-timestamp-index`

2. **opx-guardrail-violations**
   - Purpose: Permanent record of safety violations
   - TTL: None (permanent)
   - Keys: `violationId` (PK), `timestamp` (SK)
   - GSI: `agentId-timestamp-index`

3. **opx-validation-errors**
   - Purpose: Schema validation failures
   - TTL: 90 days
   - Keys: `errorId` (PK), `timestamp` (SK)
   - GSI: `agentId-timestamp-index`

### Bedrock Guardrails (1)

- **opx-agent-guardrail**
  - Content filters: WARN mode
  - PII detection: BLOCK mode
  - Attached to all 6 agents

### CloudWatch Resources

**Dashboard:**
- `OPX-LLM-Observability` (tokens, costs, latency, violations)

**Alarms:**
- High PII violation rate (>1%)
- High validation error rate (>10%)
- Budget exceeded (>$100/day)
- High agent latency (P95 > 5s)

### Lambda Functions (1)

- **opx-trace-processor**
  - Purpose: Async trace processing and redaction
  - Trigger: EventBridge (from LangGraph)
  - Runtime: Python 3.12
  - Timeout: 30s

## Cost Estimate

**Monthly Costs:**
- DynamoDB (3 tables): ~$8/month
- CloudWatch Logs: ~$3/month
- CloudWatch Dashboard: $3/month
- Lambda executions: ~$1/month
- Bedrock Guardrails: ~$5/month (estimated)

**Total Phase 8A:** ~$20/month

## Implementation Timeline

### Day 1: Tracing Infrastructure
- Create `opx-llm-traces` table
- Implement trace schema
- Add async tracing to LangGraph
- Test trace capture

### Day 2: Guardrails & Redaction
- Create Bedrock Guardrail
- Configure PII detection (BLOCK)
- Configure content filters (WARN)
- Implement PII redaction
- Test guardrail enforcement

### Day 3: Validation & Processing
- Enhance Zod schemas
- Add validation middleware
- Create `opx-validation-errors` table
- Implement retry logic
- Deploy trace processor Lambda

### Day 4: Analytics & Dashboards
- Create token usage dashboard
- Add per-agent metrics
- Implement cost breakdown
- Configure CloudWatch alarms
- End-to-end testing

## Success Criteria

- ✅ All LLM calls traced (100% capture rate)
- ✅ PII redacted from traces
- ✅ Guardrails enforced (BLOCK on PII, WARN on content)
- ✅ Structured validation working with retry
- ✅ Token usage dashboard operational
- ✅ CloudWatch alarms configured
- ✅ Tracing failures do not break agents
- ✅ No incidentId in CloudWatch dimensions
- ✅ All tests passing (unit + integration)
- ✅ Documentation complete

## Testing Strategy

### Unit Tests
- Trace schema validation
- PII redaction logic
- Guardrail configuration
- Validation retry flow
- Async tracing error handling

### Integration Tests
- End-to-end trace capture
- Guardrail enforcement (BLOCK vs WARN)
- Validation with retry
- Dashboard metric population

### Failure Tests
- Tracing failure does not break agent
- DynamoDB unavailable (graceful degradation)
- Guardrail API timeout
- Validation error handling

## Dependencies

**Required:**
- ✅ Phase 6 complete (Bedrock Agents)
- ✅ Phase 7 complete (Knowledge Base)

**Infrastructure:**
- ✅ LangGraph orchestrator deployed
- ✅ 6 Bedrock Agents operational
- ✅ DynamoDB tables accessible

## Risks & Mitigations

**Risk 1: Tracing overhead**
- Mitigation: Async processing (non-blocking)
- Mitigation: Batch writes to DynamoDB
- Mitigation: Sampling if cost exceeds threshold

**Risk 2: Guardrails too strict**
- Mitigation: WARN mode for content (not BLOCK)
- Mitigation: Monitor false positive rate
- Mitigation: Tune thresholds based on data

**Risk 3: Validation breaks agents**
- Mitigation: Retry logic (3 attempts)
- Mitigation: Graceful degradation
- Mitigation: Validation errors logged, not thrown

**Risk 4: Cost overrun**
- Mitigation: 90-day TTL on traces
- Mitigation: Sampling trigger at $50/month
- Mitigation: Budget alarms

## Phase 8B (Future)

**Deferred to Phase 8B:**
- 8.5: Hallucination Detection (needs production data)
- 8.6: Safety Incident Tracking (depends on 8.5)

**Rationale:**
- Need real production data to tune detection
- Need signal quality before automating response
- Premature optimization is wasteful

## Design Quality Assessment

**What Was Done Exceptionally Well:**
- ✅ Clear separation of observability vs authority
- ✅ Proper use of TTL for non-authoritative data
- ✅ Guardrails attached at invocation, not post-hoc
- ✅ Realistic cost estimates
- ✅ Non-blocking tracing philosophy
- ✅ Correct understanding of hallucination detection complexity

**This is resume-grade architecture.**

## Next Steps

1. ✅ Review individual sub-phase designs
2. ✅ Approve each sub-phase before implementation
3. ✅ Begin Day 1 implementation (8.1 Tracing)

---

**Status:** APPROVED - READY FOR IMPLEMENTATION  
**Next Phase:** Phase 8B (Hallucination Detection & Safety Incidents)  
**Overall Progress:** 7.5 / 10 phases → 8A (75% → 80%)
