# Phase 6 - Week 1: Preserve Logic - COMPLETE ✅

**Date:** January 25, 2026  
**Status:** ✅ COMPLETE  
**Task:** Audit existing Lambda agent code and extract prompts

---

## Checklist of Extracted Prompts

### Core Analysis Agents (4) ✅
- [x] `prompts/signal-intelligence.txt` - Signal analysis prompt extracted
- [x] `prompts/historical-pattern.txt` - Historical incident pattern prompt extracted
- [x] `prompts/change-intelligence.txt` - Change correlation prompt extracted
- [x] `prompts/risk-blast-radius.txt` - Risk & blast radius prompt extracted

### Knowledge & Strategy Agents (2) ✅
- [x] `prompts/knowledge-rag.txt` - Knowledge recommendation prompt extracted
- [x] `prompts/response-strategy.txt` - Response strategy prompt extracted

### Governance & Quality Agents (2) ✅
- [x] `prompts/consensus.txt` - Consensus & confidence prompt created (NEW)
- [x] `prompts/cost-guardian.txt` - Cost & budget guardian prompt created (NEW)

### Optional Agent (1) ✅
- [x] `prompts/reliability-auditor.txt` - Reliability auditor prompt created (NEW)

**Total Prompts Extracted:** 9/9 ✅

---

## File Paths Created

```
prompts/
├── signal-intelligence.txt       ✅ Created
├── historical-pattern.txt        ✅ Created
├── change-intelligence.txt       ✅ Created
├── risk-blast-radius.txt         ✅ Created
├── knowledge-rag.txt             ✅ Created
├── response-strategy.txt         ✅ Created
├── consensus.txt                 ✅ Created (NEW)
├── cost-guardian.txt             ✅ Created (NEW)
└── reliability-auditor.txt       ✅ Created (NEW)
```

---

## Audit Findings

### Existing Lambda Agents Audited (6)

1. **signal-analysis-agent-v2.ts** ✅
   - Prompt extracted verbatim
   - Uses pre-aggregated signal summaries
   - Fail-closed output parsing
   - Normalized confidence scoring
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1 (deterministic)

2. **historical-incident-agent-v2.ts** ✅
   - Prompt extracted verbatim
   - Uses read-only incident projections
   - Pattern-based hypothesis
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1

3. **change-intelligence-agent-v2.ts** ✅
   - Prompt extracted verbatim
   - Uses pre-collected change records
   - Explicit source marking (MOCK/DERIVED/AUTHORITATIVE)
   - Correlation hypothesis (not causation)
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1

4. **risk-blast-radius-agent.ts** ✅
   - Prompt extracted verbatim
   - Uses pre-computed dependency snapshots
   - Uses traffic summaries (not live CloudWatch)
   - Impact estimation hypothesis
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1

5. **knowledge-recommendation-agent.ts** ✅
   - Prompt extracted verbatim
   - Uses pre-indexed knowledge chunks
   - No vector search (Phase 7 responsibility)
   - Document relevance hypothesis
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1

6. **response-strategy-agent.ts** ✅
   - Prompt extracted verbatim
   - Synthesizes agent recommendations
   - Ranks options and compares tradeoffs
   - Does NOT build execution plans
   - Model: Claude 3.5 Sonnet
   - Temperature: 0.1

### New Agents Designed (3)

7. **Consensus & Confidence Agent** (NEW) ✅
   - Prompt created from requirements
   - Aggregates agent outputs
   - Resolves conflicts
   - Produces unified recommendation
   - Consensus confidence scoring

8. **Cost & Budget Guardian Agent** (NEW) ✅
   - Prompt created from requirements
   - Tracks LLM token usage
   - Signals budget status (does NOT throw)
   - Budget thresholds: 80% warning, 95% critical, 100% exceeded

9. **Reliability / Hallucination Auditor Agent** (OPTIONAL, NEW) ✅
   - Prompt created from requirements
   - Validates agent outputs for consistency
   - Detects hallucinations
   - Flags low-quality responses
   - Quality assessment report

---

## Reasoning Patterns Documented

### Common Patterns Across All Agents

1. **Read-Only Data Access**
   - All agents use pre-aggregated/pre-collected data
   - No live queries to infrastructure
   - Timestamped snapshots for replay safety

2. **Hypothesis-Based Output**
   - All outputs are hypotheses, not truth
   - Explicit confidence scoring (0.0-1.0)
   - Confidence basis: 'data', 'pattern', or 'assumption'
   - Supporting AND contradicting evidence

3. **Structured JSON Output**
   - Consistent schema across all agents
   - Fail-closed parsing
   - Normalized confidence
   - Versioned output

4. **Non-Authoritative Recommendations**
   - All recommendations require human approval
   - No execution authority
   - No state mutation
   - Explicit disclaimer: "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"

5. **Deterministic Behavior**
   - Low temperature (0.1) for consistency
   - Same inputs → same outputs (within LLM variance)
   - Versioned prompts and models

---

## Validation Logic Documented

### Input Validation (All Agents)
- Zod schema validation
- Required fields enforced
- Type safety guaranteed

### Output Validation (All Agents)
- Fail-closed parsing (OutputParser)
- Partial schema validation
- Confidence normalization (ConfidenceNormalizer)
- Cost estimation (TokenEstimator)

### Confidence Scoring
- 3-factor breakdown:
  - `data_quality` (0.0-1.0)
  - `pattern_strength` (0.0-1.0)
  - `assumption_count` (integer)
- Confidence basis: ['data', 'pattern', 'assumption']
- Normalized to 0.0-1.0 range

---

## Model Configuration

**All Agents Use:**
- Model: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- Temperature: `0.1` (deterministic)
- Max Tokens: `1500-2000` (varies by agent)
- Anthropic Version: `bedrock-2023-05-31`

**Cost Estimation:**
- Input tokens tracked
- Output tokens tracked
- Cost calculated per invocation
- Aggregated per incident

---

## Ambiguities Found

### ❓ AMBIGUITY 1: LangGraph Deployment Target

**Question:** Should LangGraph orchestrator run in:
- Option A: Single Lambda function (simpler, cold start risk)
- Option B: ECS/Fargate (more complex, better for long-running)
- Option C: Step Functions (AWS-native, limited Python support)

**Impact:** Affects Week 2 implementation

**Recommendation:** STOP and clarify before Week 2

---

### ❓ AMBIGUITY 2: Bedrock Agent Action Groups

**Question:** Should action groups be:
- Option A: Lambda functions (existing TypeScript code)
- Option B: Python functions (match LangGraph language)
- Option C: Hybrid (TypeScript for data access, Python for orchestration)

**Impact:** Affects Week 3 implementation

**Recommendation:** STOP and clarify before Week 3

---

### ❓ AMBIGUITY 3: State Persistence

**Question:** Should LangGraph state be stored in:
- Option A: DynamoDB (existing infrastructure)
- Option B: S3 (cheaper for large state)
- Option C: LangGraph Cloud (managed service)

**Impact:** Affects Week 2 checkpointing implementation

**Recommendation:** STOP and clarify before Week 2

---

### ❓ AMBIGUITY 4: Consensus Agent Conflict Resolution

**Question:** How should consensus agent resolve conflicts when:
- 2 high-confidence agents disagree?
- Should it use voting, weighted average, or flag for human review?

**Impact:** Affects consensus prompt and logic

**Recommendation:** Define conflict resolution algorithm

---

## Next Steps

### Week 2: Build LangGraph (PENDING CLARIFICATION)

**Before proceeding, MUST clarify:**
1. LangGraph deployment target (Lambda vs ECS vs Step Functions)
2. Action group language (TypeScript vs Python vs Hybrid)
3. State persistence mechanism (DynamoDB vs S3 vs LangGraph Cloud)
4. Consensus conflict resolution algorithm

**Once clarified, proceed with:**
- Day 1: Python project setup
- Day 2-3: Implement state schema
- Day 4-5: Build graph with nodes and edges

---

## Summary

✅ **Week 1 COMPLETE**
- 9/9 prompts extracted/created
- All existing Lambda agents audited
- Reasoning patterns documented
- Validation logic documented
- Model configuration documented
- 4 ambiguities identified (STOP before Week 2)

**Status:** Ready for Week 2 after ambiguities are resolved

---

**Completed:** January 25, 2026  
**Next Phase:** Week 2 - Build LangGraph (PENDING CLARIFICATION)
