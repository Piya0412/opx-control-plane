# Signal Intelligence Agent - Prompt Changelog

## Version History

### v1.0.0 (2026-01-25) - Initial Production Release

**Status:** ✅ Production  
**Breaking Changes:** N/A (initial release)  
**Model:** Claude 3.5 Sonnet (anthropic.claude-3-5-sonnet-20241022-v2:0)

#### Added
- Initial prompt canonicalization from Lambda prototype
- System instructions with critical constraints
- Input/output format specifications
- Confidence scoring guidelines (0.0-1.0 scale)
- Analysis framework (4-step process)
- Example outputs (high and low confidence)
- Failure mode handling (insufficient data, conflicting evidence)
- Validation rules
- Explicit disclaimer

#### Design Decisions
- **Hypothesis-only framing:** Enforces non-authoritative output
- **Confidence required:** Every claim must include confidence score and basis
- **Evidence citation:** All findings must reference specific signal IDs
- **Contradiction acknowledgment:** Conflicting evidence must be explicitly stated
- **No execution language:** Recommendations are investigation-focused only

#### Alignment with Contracts
- ✅ Conforms to `AgentInput` envelope (incidentSnapshot + evidenceBundle)
- ✅ Conforms to `AgentOutput` envelope (confidence, reasoning, disclaimer)
- ✅ Enforces read-only behavior (analyzes frozen data)
- ✅ Includes explicit disclaimer: "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
- ✅ Provides confidence breakdown (data_quality, pattern_strength, assumption_count)

#### Validation Rules
- Confidence values: [0.0, 1.0]
- Description max length: 500 characters
- Recommendation description max length: 300 characters
- Rationale max length: 200 characters
- Evidence citations: Must reference signal IDs from input
- JSON validity: Must be parseable

#### Known Limitations
- Max 10 signal summaries processed (token budget constraint)
- Temperature 0.1 (low but not zero, LLM still non-deterministic)
- No live system access (by design)
- No execution authority (by design)

---

## Compatibility Matrix

| Prompt Version | Agent Contract Version | Schema Version | Model |
|----------------|------------------------|----------------|-------|
| v1.0.0 | v1.0.0 | 2026-01 | Claude 3.5 Sonnet |

---

## Change Rules

### Major Version (vX.0.0)
**Breaking changes that require agent contract updates:**
- Changing input/output schema structure
- Removing required fields
- Changing confidence scoring methodology
- Changing validation rules

### Minor Version (v1.X.0)
**Non-breaking enhancements:**
- Adding optional fields
- Improving examples
- Clarifying instructions
- Adding failure modes

### Patch Version (v1.0.X)
**Bug fixes and clarifications:**
- Fixing typos
- Clarifying ambiguous language
- Updating examples for clarity
- Adjusting string length limits (within reason)

---

## Migration Guide

### From Lambda Prototype → v1.0.0

**Changes Applied:**
1. **Removed Lambda-specific framing** - No references to Lambda execution context
2. **Removed orchestration assumptions** - No assumptions about how agent is invoked
3. **Aligned with AgentInput/AgentOutput** - Uses canonical envelope structure
4. **Enforced hypothesis-only framing** - Explicit non-authoritative language
5. **Added confidence requirements** - Mandatory confidence score and basis
6. **Added evidence citation** - Must reference specific signal IDs
7. **Removed execution language** - "Investigate X" not "Restart Y"

**Backward Compatibility:** N/A (initial release)

---

## Future Roadmap

### Planned for v1.1.0
- [ ] Add anomaly detection scoring guidelines
- [ ] Add temporal correlation analysis framework
- [ ] Add service dependency context handling
- [ ] Improve failure mode examples

### Planned for v2.0.0
- [ ] Support for multi-service incident analysis
- [ ] Enhanced pattern matching with historical incident context
- [ ] Integration with Knowledge RAG agent outputs

---

## Review History

| Date | Reviewer | Status | Notes |
|------|----------|--------|-------|
| 2026-01-25 | Principal Architect | ✅ Approved | Initial canonicalization complete |

---

## References

- **Agent Contracts:** `docs/AGENT_CONTRACTS.md`
- **Lambda Prototype:** `src/agents/signal-analysis-agent-v2.ts`
- **Schema Definitions:** `src/agents/schemas.ts`

---

**Maintained by:** Principal Architect  
**Last Updated:** 2026-01-25
