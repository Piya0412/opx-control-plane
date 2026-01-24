# Commit Strategy for First GitHub Push

**Status:** Ready for Initial Commit  
**Target:** Clean, reviewable commit history  
**Principle:** Tell the story, don't hide it

---

## Commit Sequence (Do Not Squash)

### Commit 1: Governance Foundation
```bash
git add README.md DESIGN_AUTHORITY_DECISION.md
git commit -m "chore(governance): establish design authority model

- Add Design Authority section to README
- Document Phase 3.4 as canonical implementation
- Establish test-to-implementation conformance requirement
- Create DESIGN_AUTHORITY_DECISION.md with full rationale

BREAKING: Removes CP-6 test artifacts (abandoned design iteration)
RATIONALE: Implementation reflects approved Phase 3.4 design"
```

### Commit 2: Schema Reconciliation
```bash
git add src/promotion/promotion.schema.ts \
        src/incident/incident.schema.ts \
        src/incident/state-machine.ts \
        src/signal/signal-event.schema.ts \
        src/evidence/evidence-bundle.schema.ts
        
git commit -m "feat(schemas): add CP-6 schemas and missing methods

Promotion Schema:
- Add PromotionRequest, PromotionDecision, PromotionAuditRecord
- Implement computeDecisionId(), computeDecisionHash(), computeRequestContextHash()
- Add PROMOTION_VERSION constant
- Maintain backward compatibility with Phase 3.3

Incident Schema:
- Fix state vs status field naming (use 'state')
- Make classification and decisionId optional
- Add ResolutionMetadataSchema export

State Machine:
- Add validateTransition(), isTerminal(), requiresResolution()
- Add requiresExistingResolution(), getLegalNextStates()
- Enhance error messages with legal transition lists

Evidence Bundle:
- Add optional metadata field to DetectionSummary
- Add optional correlationKey and bundleVersion fields

Signal Schema:
- Remove unused normalizedSeverity field

IMPACT: +83 tests passing"
```

### Commit 3: Incident Manager Realignment
```bash
git add src/incident/incident-manager.ts \
        test/incident/incident-manager.test.ts
        
git commit -m "test(incident): align manager tests with Phase 3.4 canonical implementation

- Remove obsolete CP-6 test file (75+ tests with wrong signatures)
- Create canonical Phase 3.4 tests using correct method signatures
- Test createIncident(promotionResult, evidence, candidateId, authority)
- Test transitionIncident(incidentId, targetState, authority, metadata)
- Verify deterministic timestamp rules (DERIVED vs real-time)
- Verify severity derivation from evidence (max severity)
- Verify idempotency (returns existing incident)

REMOVED: test/incident/incident-manager.test.ts (CP-6 version)
ADDED: test/incident/incident-manager.test.ts (Phase 3.4 version)

RATIONALE: CP-6 tests reflected abandoned design iteration.
Phase 3.4 implementation is canonical source of truth."
```

### Commit 4: Test Data Corrections
```bash
git add test/candidate/candidate-schema.test.ts \
        test/candidate/candidate-store.test.ts \
        test/candidate/correlation-rule.test.ts
        
git commit -m "test(candidate): fix test fixtures and paths

- Add missing policyId and policyVersion fields to candidate fixtures
- Update correlation rule loader paths to examples/correlation-rules/
- Align test data with Phase 2.3 schema additions

IMPACT: +10 tests passing"
```

### Commit 5: Documentation
```bash
git add CLEANUP_STATUS.md \
        CLEANUP_PROGRESS_REPORT.md \
        SESSION_COMPLETE.md \
        COMMIT_STRATEGY.md
        
git commit -m "docs: add cleanup session documentation

- CLEANUP_STATUS.md: Current state and remaining work
- CLEANUP_PROGRESS_REPORT.md: Technical progress details
- SESSION_COMPLETE.md: Full session summary
- COMMIT_STRATEGY.md: This file

Documents the design authority decision process and test realignment work."
```

---

## Commit Message Guidelines

### Structure
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types Used
- `chore`: Governance, tooling, non-code changes
- `feat`: New features or capabilities
- `test`: Test additions or modifications
- `docs`: Documentation only
- `fix`: Bug fixes (use sparingly, most work is alignment)

### Scopes Used
- `governance`: Design authority, policies
- `schemas`: Schema definitions
- `incident`: Incident management
- `candidate`: Candidate generation
- `evidence`: Evidence bundles

### Footer Keywords
- `BREAKING:` - Breaking changes (use for CP-6 removal)
- `RATIONALE:` - Explain non-obvious decisions
- `IMPACT:` - Quantify test improvements
- `REMOVED:` - Explicitly list deletions
- `ADDED:` - Explicitly list additions

---

## What NOT to Include in Initial Commit

❌ **Do Not Commit:**
- `node_modules/` (in .gitignore)
- `dist/` (build artifacts)
- `cdk.out/` (CDK synthesis outputs)
- `venv/` (Python virtual environment)
- `.env` files (secrets)
- `archive/` (optional - can delete or commit)

✅ **Do Commit:**
- All source code (`src/`)
- All tests (`test/`)
- Infrastructure (`infra/`)
- Documentation (`docs/`, `*.md`)
- Configuration (`package.json`, `tsconfig.json`, etc.)
- Examples (`examples/`)

---

## Pre-Commit Checklist

Before running `git commit`:

1. ✅ All tests passing (or document known failures)
2. ✅ Build successful (`npm run build`)
3. ✅ No secrets in code
4. ✅ No real AWS account IDs in source
5. ✅ `.gitignore` is comprehensive
6. ✅ LICENSE file present
7. ✅ README.md updated
8. ✅ Design Authority documented

---

## Post-Commit Actions

After initial push to GitHub:

### 1. Create Initial Release Tag
```bash
git tag -a v0.1.0 -m "Initial release: Phase 3.4 complete with design authority"
git push origin v0.1.0
```

### 2. Optional: Delete Archive
```bash
rm -rf archive/
git add -A
git commit -m "chore: remove development artifacts"
git push
```

### 3. Create GitHub Issues for Remaining Work
- Issue #1: Fix rule loader path resolution
- Issue #2: Debug evidence bundle integration tests
- Issue #3: Achieve 100% test pass rate

---

## Branch Strategy (Recommended)

### Initial Push
```bash
git checkout -b main
git push -u origin main
```

### Future Work
```bash
git checkout -b fix/rule-loader-paths
# Make changes
git commit -m "fix(rules): resolve rule loader path issues"
git push -u origin fix/rule-loader-paths
# Create PR to main
```

---

## Review Guidance for Contributors

When reviewing PRs, enforce:

1. **Design Authority** - Implementation is canonical
2. **Test Conformance** - Tests adapt to implementation
3. **Determinism** - No Date.now() in derived facts
4. **Backward Compatibility** - Optional fields for new additions
5. **Documentation** - Update docs with code changes

---

## Success Criteria

Initial commit is successful when:

- ✅ All commits pushed to GitHub
- ✅ Repository is public (or private with team access)
- ✅ README.md renders correctly
- ✅ Design Authority section is visible
- ✅ Tests run in CI (if configured)
- ✅ No secrets exposed
- ✅ Clean commit history tells the story

---

## Final Note

**This commit strategy preserves the narrative.**

Future contributors will see:
1. Governance was established deliberately
2. Tests were realigned with purpose
3. Design authority was exercised, not declared
4. The repository converged through discipline

That's the story worth telling.

---

**Status:** Ready for `git init` and first push  
**Next Action:** Execute commit sequence above
