# Consensus & Confidence Agent - Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** Production  
**Breaking Changes:** No (initial release)  
**Implementation:** LangGraph Node (Python)

#### Added
- Complete logic specification for consensus aggregation
- Weighted confidence aggregation algorithm
- Agreement level calculation (confidence variance)
- Conflict detection and resolution logic
- Unified recommendation synthesis
- Quality metrics computation (data completeness, citation quality, reasoning coherence)
- Deterministic hash calculation for replay
- Zero-cost implementation (no LLM)

#### Design Decisions

**Why LangGraph node (not Bedrock Agent)?**
- Consensus logic is deterministic math, not natural language generation
- No LLM required → zero cost
- Exact reproducibility → perfect replay determinism
- Faster execution → no network latency

**Why weighted aggregation?**
- Agents have different historical performance
- High-performing agents should have more influence
- Weights enable calibration over time

**Why highest confidence wins?**
- Simple, deterministic conflict resolution
- Preserves minority opinions (not discarded)
- Explainable to human operators

**Why quality metrics?**
- Data completeness: % of agents that succeeded
- Citation quality: % of agents with citations
- Reasoning coherence: Agreement level across agents

#### Alignment with Contracts

- **Input:** Matches `AgentInput` envelope from `docs/AGENT_CONTRACTS.md`
- **Output:** Matches `AgentOutput` envelope with `ConsensusFindings`
- **Confidence:** Uses normalized 0.0-1.0 scale
- **Disclaimer:** Includes "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
- **Determinism:** Pure computation, no randomness
- **Cost:** Zero (no LLM invocation)

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
- Changing aggregation algorithm
- Changing conflict resolution strategy
- Changing output schema structure
- Incompatible with agent contract v1.0.0

### Minor Version (v1.X.0) - NON-BREAKING
- Adding optional quality metrics
- Improving conflict detection
- Enhancing minority opinion extraction

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
3. Added weighted aggregation (historical performance)
4. Added quality metrics
5. Added deterministic hash for replay

**No migration required** - This is the initial production version.

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
