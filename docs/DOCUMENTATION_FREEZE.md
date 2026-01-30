# Documentation Structure Freeze 🔒

**Freeze Date:** 2026-01-31  
**Status:** API-STABLE  
**Version:** 1.0.0

---

## Freeze Declaration

The documentation structure for OPX Control Plane is hereby **FROZEN** and treated as API-stable.

This freeze applies to:
- ✅ Directory structure (`docs/phases/phase-X/`)
- ✅ Canonical naming convention (DESIGN.md, STATUS.md, RUNBOOK.md)
- ✅ Document types and purposes
- ✅ Navigation patterns

---

## Permitted Changes

Changes are **ONLY** permitted for:

### 1. New Phase Added
**Trigger:** New major system capability  
**Action:** Create `docs/phases/phase-X/DESIGN.md`  
**Review:** Architectural review required  
**Example:** Phase 9 for advanced analytics

### 2. Phase Fundamentally Redesigned
**Trigger:** Major architectural change to existing phase  
**Action:** Update existing `docs/phases/phase-X/DESIGN.md`  
**Review:** Architectural review required  
**Example:** Phase 6 migrates from LangGraph to different orchestration

### 3. Critical Corrections
**Trigger:** Technical inaccuracy in documentation  
**Action:** Update affected DESIGN.md  
**Review:** Technical review required  
**Example:** Incorrect API endpoint, wrong metric, outdated cost

---

## Prohibited Changes

The following changes are **STRICTLY FORBIDDEN**:

### ❌ Structural Changes
- Renaming canonical files (DESIGN.md → ARCHITECTURE.md)
- Adding new document types (PLANNING.md, ROADMAP.md)
- Creating subdirectories (weeks/, decisions/, reports/)
- Splitting DESIGN.md into multiple files

### ❌ Tracking Files
- Status markers (*_COMPLETE.md, *_APPROVED.md, *_READY.md)
- Checkpoint files (*_CHECKPOINT.md, *_PROGRESS.md)
- Correction files (*_CORRECTIONS_APPLIED.md)
- Weekly tracking (week-1-task-1.md)

### ❌ Duplicate Content
- Multiple design documents per phase
- Redundant architecture files
- Duplicate runbooks
- Historical artifacts

---

## Change Process

### Step 1: Justification
Document why the change is necessary:
- What problem does it solve?
- Why can't existing structure accommodate it?
- What is the impact of not making the change?

### Step 2: Review
- **New Phase:** Architectural review board
- **Redesign:** Architectural review + stakeholder approval
- **Correction:** Technical review (2+ engineers)

### Step 3: Implementation
- Update affected DESIGN.md files
- Update `docs/README.md` if structure changes
- Update `docs/phases/README.md` if phase added
- Update this freeze document if policy changes

### Step 4: Commit
- Clear commit message with rationale
- Reference review approval
- Link to design document or RFC if applicable

---

## Enforcement

### Automated Checks (Future)
- CI/CD validation of file structure
- Linting for prohibited file patterns
- Automated rejection of non-canonical files

### Manual Review
- All documentation PRs require review
- Reviewers check against this freeze policy
- Non-compliant changes rejected

### Exceptions
- Exceptions require VP Engineering approval
- Exception rationale documented in this file
- Exception is time-bound (must be resolved)

---

## Rationale

### Why Freeze?

**1. Prevents Documentation Drift**
- No more "which file is canonical?"
- No more duplicate information
- No more intermediate tracking files

**2. Maintains Production Standards**
- Enterprise-grade documentation
- Suitable for team handoff
- Clear maintenance expectations

**3. Reduces Cognitive Load**
- 3-5 documents per phase (not 20-40)
- Obvious navigation patterns
- Clear document purposes

**4. Enables Automation**
- Predictable structure for tooling
- Automated validation possible
- Consistent metrics extraction

### Why API-Stable?

Documentation structure is treated like an API:
- **Consumers:** Engineers, operations, management
- **Contract:** File locations, naming, content structure
- **Breaking Changes:** Require migration and communication
- **Versioning:** Major version bump for structural changes

---

## Version History

### Version 1.0.0 (2026-01-31)
- Initial freeze after consolidation
- 125 files → 13 canonical documents
- Canonical structure established
- Use cases and metrics documented

### Future Versions
- **1.1.0:** Minor additions (new optional doc type)
- **2.0.0:** Major restructure (breaking change)

---

## Exceptions Log

No exceptions granted as of 2026-01-31.

**Format for exceptions:**
```
Date: YYYY-MM-DD
Approved By: [Name, Title]
Exception: [Description]
Rationale: [Why necessary]
Duration: [Time-bound or permanent]
Resolution: [How/when resolved]
```

---

## Metrics

### Documentation Health
- **File count:** 13 (target: <20)
- **Avg files per phase:** 1.6 (target: <3)
- **Prohibited files:** 0 (target: 0)
- **Duplicate content:** 0% (target: 0%)

### Compliance
- **Structure violations:** 0 (target: 0)
- **Naming violations:** 0 (target: 0)
- **Unauthorized changes:** 0 (target: 0)

---

## Contact

**Questions about freeze policy:**
- Review `docs/README.md` first
- Check `docs/phases/README.md` for navigation
- Escalate to architecture team if unclear

**Requesting exception:**
- Document justification
- Submit for architectural review
- Await approval before proceeding

---

**Status:** 🔒 ACTIVE  
**Enforcement:** STRICT  
**Review Cycle:** Annual or when new phase added  
**Last Updated:** 2026-01-31
