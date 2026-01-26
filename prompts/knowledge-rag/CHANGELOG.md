# Knowledge RAG Agent - Prompt Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** Production  
**Breaking Changes:** No (initial release)  
**Model:** Claude 3.5 Sonnet (anthropic.claude-3-5-sonnet-20241022-v2:0)

#### Added
- Complete system instructions for knowledge retrieval analysis
- Input/output format specifications aligned with AgentInput/AgentOutput envelopes
- Confidence scoring guidelines (0.0-1.0 scale with basis)
- Analysis framework (relevance assessment, citation quality, hypothesis formation)
- Examples (high confidence multiple docs, low confidence limited docs, failure modes)
- Validation rules (required fields, confidence bounds, string lengths)
- Explicit disclaimer (HYPOTHESIS_ONLY_NOT_AUTHORITATIVE)
- Explainable citation requirements

#### Design Decisions

**Why pre-indexed knowledge chunks?**
- Agents must not perform live vector search (Phase 7 responsibility)
- Pre-indexed chunks are frozen snapshots, ensuring replay determinism
- Prevents race conditions and data consistency issues

**Why explainable citations?**
- Excerpts provide context for relevance assessment
- Human operators can verify document content without opening links
- Transparency enables confidence calibration

**Why document type prioritization?**
- RUNBOOK: actionable steps, highest priority
- POSTMORTEM: historical context, high priority
- PLAYBOOK: diagnostic guidance, medium priority
- ARCHITECTURE: background context, low priority

**Why recency scoring?**
- Recent documents (<30 days) more likely to reflect current state
- Stale documents (>180 days) may contain outdated guidance
- Recency affects confidence calculation

#### Alignment with Contracts

- **Input:** Matches `KnowledgeRecommendationInput` from `docs/AGENT_CONTRACTS.md`
- **Output:** Matches `AgentOutput` envelope with `KnowledgeRAGFindings`
- **Confidence:** Uses normalized 0.0-1.0 scale with basis
- **Disclaimer:** Includes "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
- **Determinism:** Excludes free-text reasoning from hash calculation

---

## Compatibility Matrix

### Agent Contract Compatibility

| Prompt Version | Contract Version | Compatible |
|----------------|------------------|------------|
| v1.0.0 | v1.0.0 | ✅ Yes |

### Model Compatibility

| Prompt Version | Claude 3.5 Sonnet | Claude 3 Opus | Other Models |
|----------------|-------------------|---------------|--------------|
| v1.0.0 | ✅ Tested | ⚠️ Untested | ❌ Not supported |

---

## Change Rules

### Major Version (vX.0.0) - BREAKING
- Changing input/output schema structure
- Removing required fields
- Changing confidence scoring methodology
- Incompatible with agent contract v1.0.0

### Minor Version (v1.X.0) - NON-BREAKING
- Adding optional fields
- Improving examples
- Clarifying instructions
- Enhancing analysis framework

### Patch Version (v1.0.X) - BUG FIXES
- Fixing typos
- Clarifying ambiguous language
- Updating examples for clarity

---

## Migration Guide

### From Lambda Prototype to v1.0.0

**Changes:**
1. Removed Lambda-specific framing
2. Removed orchestration assumptions
3. Aligned with AgentInput/AgentOutput envelopes
4. Enforced hypothesis-only framing (relevance not certainty)
5. Added explicit confidence scoring guidelines
6. Added explainable citation requirements
7. Added validation rules
8. Clarified Phase 7 boundary (no vector search in Phase 6)

**No migration required** - This is the initial production version.

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
