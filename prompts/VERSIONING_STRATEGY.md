# Prompt Versioning Strategy

**Date:** 2026-01-25  
**Authority:** Principal Architect  
**Status:** 🔒 FROZEN  

---

## Purpose

This document defines the **authoritative versioning strategy** for all agent prompts in the Bedrock + LangGraph multi-agent system. Prompts are treated as **production artifacts**, not text blobs.

**Why This Matters:**
- Enables controlled evolution without drift
- Provides audit trail for prompt changes
- Ensures compatibility with agent contracts
- Demonstrates production maturity in interviews

---

## Versioning Scheme

### Semantic Versioning (SemVer)

All prompts use **semantic versioning**: `vMAJOR.MINOR.PATCH`

```
v1.2.3
│ │ │
│ │ └─ Patch: Bug fixes, clarifications
│ └─── Minor: Non-breaking enhancements
└───── Major: Breaking changes
```

### Version Format

- **Format:** `vX.Y.Z` (e.g., `v1.0.0`, `v2.1.3`)
- **File naming:** `prompts/<agent-id>/vX.Y.Z.md`
- **Initial version:** `v1.0.0` (not `v0.1.0`)

---

## Change Classification

### Major Version (vX.0.0) - BREAKING

**Triggers:**
- Changing input/output schema structure
- Removing required fields
- Changing confidence scoring methodology
- Changing validation rules
- Incompatible with previous agent contract version

**Impact:**
- Requires agent contract update
- Requires LangGraph orchestration changes
- Requires migration plan
- Requires Principal Architect approval

**Example:**
```
v1.0.0 → v2.0.0
- Changed confidence from single number to breakdown object
- Requires AgentOutput schema update
```

---

### Minor Version (v1.X.0) - NON-BREAKING

**Triggers:**
- Adding optional fields
- Improving examples
- Clarifying instructions
- Adding failure modes
- Enhancing analysis framework

**Impact:**
- Backward compatible with agent contracts
- No orchestration changes required
- Can be deployed independently

**Example:**
```
v1.0.0 → v1.1.0
- Added anomaly detection scoring guidelines
- Added temporal correlation examples
- No schema changes
```

---

### Patch Version (v1.0.X) - BUG FIXES

**Triggers:**
- Fixing typos
- Clarifying ambiguous language
- Updating examples for clarity
- Adjusting string length limits (within reason)

**Impact:**
- No functional changes
- No schema changes
- Can be deployed immediately

**Example:**
```
v1.0.0 → v1.0.1
- Fixed typo in confidence scoring guidelines
- Clarified "data" vs "pattern" confidence basis
```

---

## File Structure

### Directory Layout

```
prompts/
├── VERSIONING_STRATEGY.md          # This file
├── VALIDATION_RULES.md             # Pre-LLM validation rules
├── signal-intelligence/
│   ├── v1.0.0.md                   # Production prompt
│   ├── v1.1.0.md                   # Future version
│   └── CHANGELOG.md                # Version history
├── historical-pattern/
│   ├── v1.0.0.md
│   └── CHANGELOG.md
├── change-intelligence/
│   ├── v1.0.0.md
│   └── CHANGELOG.md
├── risk-blast-radius/
│   ├── v1.0.0.md
│   └── CHANGELOG.md
├── knowledge-rag/
│   ├── v1.0.0.md
│   └── CHANGELOG.md
├── response-strategy/
│   ├── v1.0.0.md
│   └── CHANGELOG.md
├── consensus/
│   ├── v1.0.0.md                   # LangGraph node logic
│   └── CHANGELOG.md
├── cost-guardian/
│   ├── v1.0.0.md                   # LangGraph node logic
│   └── CHANGELOG.md
└── reliability-auditor/
    ├── v1.0.0.md
    └── CHANGELOG.md
```

### File Naming Rules

1. **Prompt files:** `vX.Y.Z.md` (e.g., `v1.0.0.md`)
2. **Changelog:** `CHANGELOG.md` (one per agent)
3. **Agent ID:** Directory name matches `agentId` from contracts

---

## Prompt File Template

Every prompt file MUST include:

```markdown
# <Agent Name> - Prompt vX.Y.Z

**Agent ID:** `agent-id`
**Version:** vX.Y.Z
**Date:** YYYY-MM-DD
**Model:** Model name and ID
**Schema Version:** YYYY-MM

---

## System Instructions
[Core instructions, constraints, capabilities, limitations]

## Input Format
[Expected input structure with examples]

## Output Format
[Required output structure with examples]

## Confidence Scoring Guidelines
[How to score confidence]

## Analysis Framework
[Step-by-step analysis process]

## Examples
[High confidence, low confidence, failure modes]

## Validation Rules
[Pre-LLM validation requirements]

## Disclaimer
[Explicit non-authoritative statement]

---

**Version:** vX.Y.Z
**Status:** Production | Draft | Deprecated
**Last Updated:** YYYY-MM-DD
```

---

## Changelog Template

Every `CHANGELOG.md` MUST include:

```markdown
# <Agent Name> - Prompt Changelog

## Version History

### vX.Y.Z (YYYY-MM-DD) - Release Name

**Status:** Production | Draft | Deprecated
**Breaking Changes:** Yes | No
**Model:** Model name

#### Added
- New features or sections

#### Changed
- Modified sections

#### Deprecated
- Features marked for removal

#### Removed
- Deleted features

#### Fixed
- Bug fixes

#### Design Decisions
- Why certain choices were made

#### Alignment with Contracts
- How this version aligns with agent contracts

---

## Compatibility Matrix
[Version compatibility table]

## Change Rules
[Major/Minor/Patch definitions]

## Migration Guide
[How to migrate from previous versions]

---

**Maintained by:** Principal Architect
**Last Updated:** YYYY-MM-DD
```

---

## Compatibility Matrix

### Agent Contract Compatibility

| Prompt Version | Contract Version | Compatible |
|----------------|------------------|------------|
| v1.0.0 | v1.0.0 | ✅ Yes |
| v1.1.0 | v1.0.0 | ✅ Yes (backward compatible) |
| v2.0.0 | v1.0.0 | ❌ No (requires contract v2.0.0) |

### Model Compatibility

| Prompt Version | Claude 3.5 Sonnet | Claude 3 Opus | Other Models |
|----------------|-------------------|---------------|--------------|
| v1.0.0 | ✅ Tested | ⚠️ Untested | ❌ Not supported |

---

## Change Process

### 1. Propose Change

**Required:**
- Identify change type (major/minor/patch)
- Document rationale
- Assess impact on agent contracts
- Create draft prompt file

**Approval:**
- Patch: Team lead approval
- Minor: Principal Architect review
- Major: Principal Architect approval + contract update

### 2. Create New Version

**Steps:**
1. Copy current version file (e.g., `v1.0.0.md` → `v1.1.0.md`)
2. Make changes in new file
3. Update version number in file header
4. Update date
5. Add entry to `CHANGELOG.md`

**Do NOT:**
- Modify existing version files (immutable)
- Skip version numbers
- Use non-semantic versions

### 3. Test New Version

**Required Tests:**
- Schema validation (input/output)
- Confidence scoring (within bounds)
- Example outputs (match expected format)
- Failure modes (graceful degradation)
- Replay determinism (hash verification)

### 4. Deploy New Version

**Deployment:**
1. Update Bedrock Agent instruction reference
2. Update LangGraph orchestrator version mapping
3. Monitor for 24 hours
4. Mark as "Production" in changelog

**Rollback:**
- Revert to previous version file
- Update Bedrock Agent instruction reference
- Document rollback reason in changelog

---

## Deprecation Policy

### Marking as Deprecated

**When:**
- New major version released
- Security issue discovered
- Model no longer supported

**Process:**
1. Update status in prompt file: `**Status:** Deprecated`
2. Add deprecation notice to changelog
3. Set deprecation date (30 days minimum)
4. Notify all stakeholders

### Removing Deprecated Versions

**When:**
- 90 days after deprecation
- No active usage in production
- Migration complete

**Process:**
1. Archive file to `prompts/archive/<agent-id>/vX.Y.Z.md`
2. Update changelog with removal date
3. Remove from active directory

---

## Validation Rules

### Pre-Deployment Validation

Every prompt version MUST pass:

1. **Schema Validation**
   - Input matches `AgentInput` envelope
   - Output matches `AgentOutput` envelope
   - All required fields present

2. **Confidence Validation**
   - Confidence values in range [0.0, 1.0]
   - Confidence basis is valid enum
   - Confidence breakdown present

3. **String Length Validation**
   - Description ≤ 500 characters
   - Recommendation description ≤ 300 characters
   - Rationale ≤ 200 characters

4. **Disclaimer Validation**
   - Contains "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
   - Explicit non-authoritative language

5. **Example Validation**
   - At least 2 examples (high and low confidence)
   - At least 1 failure mode example
   - All examples are valid JSON

---

## Interview Defense Points

### "How do you manage prompt evolution?"

> "We treat prompts as production artifacts with semantic versioning. Every prompt has a version number (vX.Y.Z), changelog, and compatibility matrix. Major changes require contract updates, minor changes are backward compatible, and patches are bug fixes only."

### "How do you prevent prompt drift?"

> "Prompts are immutable once deployed. To change a prompt, we create a new version file (e.g., v1.0.0 → v1.1.0) and update the changelog. Old versions remain in the repository for audit and rollback."

### "How do you ensure prompt quality?"

> "Every prompt version must pass pre-deployment validation: schema validation, confidence bounds, string lengths, disclaimer presence, and example validity. We also test for replay determinism and failure mode handling."

### "How do you handle breaking changes?"

> "Breaking changes trigger a major version bump (v1.0.0 → v2.0.0) and require agent contract updates. We document the migration path in the changelog and provide a 30-day deprecation period for the old version."

---

## Authority & Confidence

**Authority:** Principal Architect - This is the single source of truth  
**Confidence:** ABSOLUTE - This strategy is frozen  
**Blocker Status:** NONE - Ready for prompt extraction  

---

## Change Control

**To modify this strategy:**
1. Submit architectural review request
2. Justify why change is necessary
3. Assess impact on existing prompts
4. Get Principal Architect approval

---

**This document is the versioning anchor. Point to it in interviews. Defend it in code reviews.**

---

**Date:** 2026-01-25  
**Status:** 🔒 FROZEN  
**Next:** Extract and version remaining 8 agent prompts
