# Phase 8: LLM Observability, Safety & Governance

**Status:** ✅ APPROVED (8.1-8.4 ONLY)  
**Created:** January 29, 2026  
**Estimated Duration:** 3-4 days (Phase 8A only)

## Objective

Make AI behavior observable, auditable, and governable through comprehensive monitoring, safety guardrails, and structured validation.

## Context

With Phase 6 (Bedrock + LangGraph Agents) and Phase 7 (Knowledge Base) complete, we now have:
- 6 Bedrock Agents making LLM calls
- LangGraph orchestration managing agent execution
- Knowledge Base retrieval augmenting responses
- Cost tracking at agent level

**What's Missing:**
- Detailed prompt/response tracing
- Guardrails enforcement (content safety, PII detection)
- Structured output validation beyond basic schemas
- Hallucination detection and quality scoring
- Comprehensive token usage analytics
- Safety incident tracking

## Approved Scope (Phase 8A)

**IMPLEMENTATION SCOPE:** 8.1 → 8.4 ONLY

These are CORE and REQUIRED:

| Sub-phase | Status | Reason |
|-----------|--------|--------|
| 8.1 Prompt & Response Tracing | ✅ REQUIRED | Auditability is non-negotiable |
| 8.2 Guardrails Enforcement | ✅ REQUIRED | Safety baseline |
| 8.3 Structured Output Validation | ✅ REQUIRED | Determinism & correctness |
| 8.4 Token Usage Analytics | ✅ REQUIRED | Cost & governance |

**DEFERRED to Phase 8B:**

| Sub-phase | Decision | Why |
|-----------|----------|-----|
| 8.5 Hallucination Detection | ⏸️ DEFER | Needs real production data to tune |
| 8.6 Safety Incident Tracking | ⏸️ DEFER | Depends on 8.5 signal quality |

**Rationale:** This mirrors how real orgs do AI governance:
1. First observe (8.1)
2. Then enforce (8.2)
3. Then validate (8.3)
4. Then optimize (8.4)
5. Then judge quality (8.5 - later)
6. Then automate response (8.6 - later)

Not all at once.

---

## Detailed Sub-Phase Designs

**See individual design documents:**
- `PHASE_8.1_TRACING_DESIGN.md` - Prompt & Response Tracing
- `PHASE_8.2_GUARDRAILS_DESIGN.md` - Guardrails Enforcement
- `PHASE_8.3_VALIDATION_DESIGN.md` - Structured Output Validation
- `PHASE_8.4_TOKEN_ANALYTICS_DESIGN.md` - Token Usage Analytics

---

### 8.1: Prompt & Response Tracing ✅ REQUIRED

**Objective:** Capture and store all LLM interactions for audit and debugging

**Deliverables:**
- DynamoDB table: `opx-llm-traces`
- Trace schema with redaction support
- Lambda middleware for automatic tracing
- CloudWatch Logs Insights queries
- Trace retention policy (90 days)

**Schema:**
```typescript
{
  traceId: string;           // UUID
  timestamp: string;         // ISO 8601
  agentId: string;           // Which agent
  incidentId: string;        // Context
  model: string;             // e.g., "anthropic.claude-3-sonnet"
  
  prompt: {
    text: string;            // Full prompt (redacted)
    tokens: number;
    template: string;        // Prompt template ID
    variables: object;       // Template variables (redacted)
  };
  
  response: {
    text: string;            // Full response (redacted)
    tokens: number;
    finishReason: string;    // "stop", "length", "content_filter"
    latency: number;         // ms
  };
  
  cost: {
    inputCost: number;       // USD
    outputCost: number;      // USD
    total: number;           // USD
  };
  
  metadata: {
    retryCount: number;
    guardrailsApplied: string[];
    validationStatus: "passed" | "failed" | "warning";
    redactionApplied: boolean;
  };
}
```

**Redaction Rules:**
- PII (emails, phone numbers, SSNs)
- AWS account IDs
- IP addresses (optional)
- Custom patterns via configuration

### 8.2: Guardrails Enforcement ✅ Core

**Objective:** Prevent unsafe or inappropriate LLM outputs

**Deliverables:**
- Bedrock Guardrails integration
- Content filtering (hate, violence, sexual, misconduct)
- PII detection and blocking
- Topic denial lists
- Word filters
- Guardrail violation tracking

**Guardrail Policies:**

1. **Content Filters** (Bedrock native)
   - Hate speech: MEDIUM threshold
   - Violence: MEDIUM threshold
   - Sexual content: HIGH threshold
   - Misconduct: LOW threshold

2. **PII Detection** (Bedrock native)
   - Email addresses: BLOCK
   - Phone numbers: BLOCK
   - SSN: BLOCK
   - Credit cards: BLOCK
   - AWS credentials: BLOCK

3. **Topic Denial**
   - Execution commands (prevent hallucinated actions)
   - Credential requests
   - Data deletion suggestions

4. **Word Filters**
   - Profanity blocking
   - Competitor mentions (optional)

**Implementation:**
- CDK construct: `infra/constructs/bedrock-guardrails.ts`
- Guardrail ID attached to all agent invocations
- Violation logging to `opx-guardrail-violations` table
- CloudWatch alarms on violation rate

### 8.3: Structured Output Validation ✅ Core

**Objective:** Ensure agent outputs conform to expected schemas

**Deliverables:**
- Enhanced Zod schema validation
- JSON schema enforcement
- Type safety verification
- Validation error tracking
- Automatic retry on schema violations

**Validation Layers:**

1. **Schema Validation** (Zod)
   - All agent outputs validated against TypeScript types
   - Automatic coercion where safe
   - Strict mode for critical fields

2. **Business Logic Validation**
   - Confidence scores: 0.0 - 1.0
   - Timestamps: ISO 8601 format
   - Citations: Valid source references
   - Cost: Non-negative numbers

3. **Semantic Validation**
   - Reasoning must be non-empty
   - Findings must match agent type
   - Citations must reference actual documents

**Error Handling:**
- First failure: Log warning, retry with clarified prompt
- Second failure: Log error, return degraded response
- Third failure: Fail agent execution, escalate

### 8.4: Token Usage Analytics ✅ Core

**Objective:** Detailed tracking and optimization of token consumption

**Deliverables:**
- Token usage dashboard (CloudWatch)
- Per-agent token metrics
- Per-incident cost breakdown
- Token efficiency trends
- Budget forecasting

**Metrics:**
- Input tokens by agent
- Output tokens by agent
- Total cost by incident
- Average tokens per agent call
- Token efficiency (output/input ratio)
- Cost per recommendation

**Dashboards:**
- Real-time token usage
- Daily/weekly/monthly trends
- Agent comparison (which agents are expensive)
- Incident cost distribution
- Budget burn rate

### 8.5: Hallucination Detection ✅ Advanced

**Objective:** Identify and flag low-quality or hallucinated responses

**Deliverables:**
- Hallucination scoring algorithm
- Citation verification
- Fact-checking against evidence
- Quality metrics
- Automatic flagging

**Detection Methods:**

1. **Citation Verification**
   - Verify cited documents exist
   - Check line numbers are valid
   - Validate quotes match source

2. **Consistency Checking**
   - Cross-agent consistency
   - Temporal consistency (same incident, different times)
   - Evidence alignment (claims match evidence)

3. **Confidence Calibration**
   - Compare stated confidence to actual accuracy
   - Track calibration over time
   - Flag overconfident responses

4. **Heuristic Checks**
   - Vague language detection ("might", "possibly", "unclear")
   - Contradictory statements
   - Unsupported claims

**Quality Score:**
```typescript
{
  overallScore: number;      // 0.0 - 1.0
  citationAccuracy: number;  // 0.0 - 1.0
  consistencyScore: number;  // 0.0 - 1.0
  confidenceCalibration: number; // 0.0 - 1.0
  flags: string[];           // ["vague_language", "missing_citation"]
}
```

### 8.6: Safety Incident Tracking ✅ Advanced

**Objective:** Track and respond to AI safety incidents

**Deliverables:**
- Safety incident schema
- Incident classification
- Automatic escalation
- Remediation tracking
- Safety metrics dashboard

**Incident Types:**
- Guardrail violations
- Hallucinations
- Schema validation failures
- Timeout/errors
- Cost overruns
- Quality degradation

**Response Workflow:**
1. Detect safety incident
2. Log to `opx-ai-safety-incidents` table
3. Classify severity (LOW, MEDIUM, HIGH, CRITICAL)
4. Trigger CloudWatch alarm if HIGH/CRITICAL
5. Automatic remediation (retry, fallback, disable agent)
6. Human review for CRITICAL incidents

## Infrastructure

### New Resources

**DynamoDB Tables:**
- `opx-llm-traces` (90-day TTL)
- `opx-guardrail-violations` (permanent)
- `opx-validation-errors` (90-day TTL)
- `opx-ai-safety-incidents` (permanent)

**Bedrock Guardrails:**
- `opx-agent-guardrail` (single guardrail for all agents)

**CloudWatch Dashboards:**
- `OPX-LLM-Observability` (traces, tokens, costs)
- `OPX-AI-Safety` (guardrails, hallucinations, incidents)

**CloudWatch Alarms:**
- High guardrail violation rate (>5%)
- High hallucination rate (>10%)
- Budget exceeded
- High validation error rate (>10%)
- Critical safety incident

**Lambda Functions:**
- `opx-trace-processor` (process and redact traces)
- `opx-hallucination-detector` (analyze responses)
- `opx-safety-incident-handler` (respond to incidents)

### CDK Constructs

```
infra/constructs/
├── llm-traces-table.ts
├── guardrail-violations-table.ts
├── validation-errors-table.ts
├── ai-safety-incidents-table.ts
├── bedrock-guardrails.ts
├── llm-observability-dashboard.ts
├── ai-safety-dashboard.ts
├── llm-observability-alarms.ts
├── trace-processor-lambda.ts
├── hallucination-detector-lambda.ts
└── safety-incident-handler-lambda.ts
```

## Implementation Plan

### Week 1: Tracing & Guardrails (Days 1-3)

**Day 1: Tracing Infrastructure**
- Create `opx-llm-traces` table
- Implement trace schema
- Add tracing middleware to LangGraph
- Test trace capture

**Day 2: Redaction & Storage**
- Implement PII redaction
- Add trace processor Lambda
- Configure retention policy
- Test redaction rules

**Day 3: Guardrails**
- Create Bedrock Guardrail resource
- Configure content filters
- Configure PII detection
- Attach to all agents
- Test guardrail enforcement

### Week 2: Validation & Analytics (Days 4-5)

**Day 4: Structured Validation**
- Enhance Zod schemas
- Add validation middleware
- Implement retry logic
- Create validation error table
- Test validation flow

**Day 5: Token Analytics**
- Create token usage dashboard
- Add per-agent metrics
- Implement cost breakdown
- Add budget forecasting
- Test analytics queries

### Week 3: Quality & Safety (Days 6-7)

**Day 6: Hallucination Detection**
- Implement citation verification
- Add consistency checking
- Create quality scoring
- Build hallucination detector Lambda
- Test detection accuracy

**Day 7: Safety Incidents**
- Create safety incident schema
- Implement incident classification
- Add automatic escalation
- Create safety dashboard
- Test incident workflow

## Testing Strategy

### Unit Tests
- Trace schema validation
- Redaction logic
- Guardrail configuration
- Validation rules
- Hallucination detection algorithms

### Integration Tests
- End-to-end trace capture
- Guardrail enforcement
- Validation retry flow
- Safety incident workflow

### Load Tests
- Trace storage at scale
- Dashboard query performance
- Alarm trigger latency

## Success Criteria

- ✅ All LLM calls traced and stored
- ✅ PII redacted from traces
- ✅ Guardrails enforced on all agents
- ✅ Structured output validation working
- ✅ Token usage dashboard operational
- ✅ Hallucination detection active
- ✅ Safety incidents tracked and escalated
- ✅ CloudWatch alarms configured
- ✅ All tests passing (unit + integration)
- ✅ Documentation complete

## Cost Estimate

**Monthly Costs:**
- DynamoDB (4 tables): ~$10/month
- CloudWatch Logs: ~$5/month
- CloudWatch Dashboards: $3/month
- Lambda executions: ~$2/month
- Bedrock Guardrails: $0.75 per 1000 content units (~$5/month)

**Total:** ~$25/month

## Dependencies

**Required:**
- Phase 6 complete (Bedrock Agents)
- Phase 7 complete (Knowledge Base)

**Optional:**
- Phase 4 (for calibration data)
- Phase 5 (for automation audit)

## Risks & Mitigations

**Risk 1: Trace storage costs**
- Mitigation: 90-day TTL, sampling for high-volume
- Mitigation: Compress traces before storage

**Risk 2: Guardrails too strict**
- Mitigation: Start with MEDIUM thresholds
- Mitigation: Monitor false positive rate
- Mitigation: Tune thresholds based on data

**Risk 3: Hallucination detection false positives**
- Mitigation: Multiple detection methods
- Mitigation: Quality score threshold (not binary)
- Mitigation: Human review for edge cases

**Risk 4: Performance impact**
- Mitigation: Async trace processing
- Mitigation: Batch writes to DynamoDB
- Mitigation: Optimize validation logic

## Next Steps

1. **Review and approve this design**
2. **Create Phase 8 implementation tasks**
3. **Set up development environment**
4. **Begin Week 1 implementation**

## Questions for Review

1. Should we implement all 6 sub-phases or prioritize core features (8.1-8.4)?
2. What PII patterns should be redacted beyond standard types?
3. Should guardrail violations block agent execution or just log warnings?
4. What hallucination detection threshold should trigger alerts?
5. Should we implement sampling for high-volume tracing?

---

**Status:** Awaiting approval to proceed with implementation  
**Next Phase:** Phase 9 (Human-Approved Autonomous Execution)
