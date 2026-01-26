# Risk & Blast Radius Agent - Prompt Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** Production  
**Breaking Changes:** No (initial release)  
**Model:** Claude 3.5 Sonnet (anthropic.claude-3-5-sonnet-20241022-v2:0)

#### Added
- Complete system instructions for blast radius analysis
- Input/output format specifications aligned with AgentInput/AgentOutput envelopes
- Confidence scoring guidelines (0.0-1.0 scale with basis)
- Analysis framework (dependency analysis, traffic impact assessment, propagation risk calculation)
- Examples (high confidence wide blast radius, low confidence limited blast radius, failure modes)
- Validation rules (required fields, confidence bounds, string lengths)
- Explicit disclaimer (HYPOTHESIS_ONLY_NOT_AUTHORITATIVE)
- Conservative estimation requirement (fail-safe approach)

#### Design Decisions

**Why pre-computed snapshots?**
- Agents must not query live infrastructure (control plane authority)
- Snapshots are frozen at specific timestamps, ensuring replay determinism
- Prevents race conditions and data consistency issues

**Why conservative estimates?**
- Fail-safe approach: overestimate impact rather than underestimate
- Prevents underestimating severity and delaying response
- Human operators can adjust estimates based on additional context

**Why propagation probability?**
- Dependency type (SYNC vs ASYNC) affects propagation likelihood
- Criticality (CRITICAL vs LOW) affects business impact
- Probabilistic estimates enable risk-based prioritization

**Why blast radius scope?**
- Single service: isolated failure, limited impact
- Multi-service: cascading failure, moderate impact
- Infrastructure-wide: systemic failure, critical impact

#### Alignment with Contracts

- **Input:** Matches `RiskBlastRadiusInput` from `docs/AGENT_CONTRACTS.md`
- **Output:** Matches `AgentOutput` envelope with `RiskBlastRadiusFindings`
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
4. Enforced hypothesis-only framing (estimates not certainty)
5. Added explicit confidence scoring guidelines
6. Added conservative estimation requirement
7. Added validation rules

**No migration required** - This is the initial production version.

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
