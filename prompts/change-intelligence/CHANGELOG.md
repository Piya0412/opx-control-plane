# Change Intelligence Agent - Prompt Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** Production  
**Breaking Changes:** No (initial release)  
**Model:** Claude 3.5 Sonnet (anthropic.claude-3-5-sonnet-20241022-v2:0)

#### Added
- Complete system instructions for change correlation analysis
- Input/output format specifications aligned with AgentInput/AgentOutput envelopes
- Confidence scoring guidelines (0.0-1.0 scale with basis)
- Analysis framework (temporal correlation, change impact assessment, hypothesis formation)
- Examples (high confidence, low confidence, failure modes)
- Validation rules (required fields, confidence bounds, string lengths)
- Explicit disclaimer (HYPOTHESIS_ONLY_NOT_AUTHORITATIVE)
- Source marking requirements (MOCK/DERIVED/AUTHORITATIVE)

#### Design Decisions

**Why pre-collected change records?**
- Agents must not query live deployment systems (control plane authority)
- Pre-collected records are timestamped snapshots, ensuring replay determinism
- Prevents race conditions and data consistency issues

**Why temporal correlation focus?**
- Time delta between change and incident is primary signal
- Recency increases suspicion score
- Multiple changes in time window require prioritization

**Why explicit source marking?**
- Change data quality varies (MOCK for testing, DERIVED for inferred, AUTHORITATIVE for verified)
- Source marking enables confidence adjustment
- Transparency for human operators

**Why correlation not causation?**
- Temporal correlation does not prove causation
- Agents provide hypotheses, not definitive root causes
- Human judgment required for final determination

#### Alignment with Contracts

- **Input:** Matches `ChangeIntelligenceInput` from `docs/AGENT_CONTRACTS.md`
- **Output:** Matches `AgentOutput` envelope with `ChangeIntelligenceFindings`
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
4. Enforced hypothesis-only framing (correlation not causation)
5. Added explicit confidence scoring guidelines
6. Added source marking requirements
7. Added validation rules

**No migration required** - This is the initial production version.

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
