# Cost & Budget Guardian Agent - Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** Production  
**Breaking Changes:** No (initial release)  
**Implementation:** LangGraph Node (Python)

#### Added
- Complete logic specification for cost tracking
- Per-agent cost aggregation
- Budget remaining calculation
- Budget exceeded signal (non-blocking)
- Monthly burn projection
- Incidents remaining estimate
- Deterministic hash calculation for replay
- Zero-cost implementation (no LLM)

#### Design Decisions

**Why LangGraph node (not Bedrock Agent)?**
- Cost tracking is deterministic arithmetic, not natural language generation
- No LLM required → zero cost (ironic but correct)
- Exact reproducibility → perfect replay determinism
- Faster execution → no network latency

**Why signal-only (not blocking)?**
- Cost Guardian provides budget status signal
- Phase 5 (automation) decides whether to proceed
- Agents should not self-throttle (control plane authority)
- Enables cost-aware decision-making without hard limits

**Why monthly burn projection?**
- Enables proactive budget management
- Alerts before budget exhaustion
- Supports capacity planning

**Why incidents remaining estimate?**
- Translates budget into operational capacity
- Enables workload prioritization
- Supports incident triage decisions

#### Alignment with Contracts

- **Input:** Matches `AgentInput` envelope from `docs/AGENT_CONTRACTS.md`
- **Output:** Matches `AgentOutput` envelope with `CostGuardianFindings`
- **Confidence:** Always 1.0 (deterministic calculation)
- **Disclaimer:** Includes "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
- **Determinism:** Pure computation, no randomness
- **Cost:** Zero (no LLM invocation)
- **Non-blocking:** MUST NOT throw errors or block execution

---

## Compatibility Matrix

### Agent Contract Compatibility

| Logic Version | Contract Version | Compatible |
|---------------|------------------|------------|
| v1.0.0 | v1.0.0 | ✅ Yes |

### LangGraph Compatibility

| Logic Version | LangGraph Version | Compatible |
|---------------|-------------------|------------|
| v1.0.0 | >=0.1.0 | ✅ Yes |

---

## Change Rules

### Major Version (vX.0.0) - BREAKING
- Changing cost calculation formula
- Changing output schema structure
- Incompatible with agent contract v1.0.0

### Minor Version (v1.X.0) - NON-BREAKING
- Adding optional projections
- Improving burn rate estimation
- Enhancing capacity planning

### Patch Version (v1.0.X) - BUG FIXES
- Fixing calculation errors
- Improving edge case handling
- Optimizing performance

---

## Migration Guide

### From Lambda Prototype to v1.0.0

**Changes:**
1. Migrated from Lambda function to LangGraph node
2. Removed LLM invocation (pure computation)
3. Added monthly burn projection
4. Added incidents remaining estimate
5. Added deterministic hash for replay
6. Enforced non-blocking signal-only behavior

**No migration required** - This is the initial production version.

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
