# opx-control-plane — Development Plan (UPDATED)

## Program Identity

| Attribute | Value |
|-----------|-------|
| Project | opx-control-plane |
| Type | Enterprise Operational Control Plane |
| Goal | Encode SRE discipline into a deterministic, auditable system |

**This system must behave correctly at 3 AM during an incident.**

---

## Global Rules (Apply to ALL Phases)

1. **Fail-closed by default**
2. **Human approval is always possible**
3. **No execution without explicit approval**
4. **Intelligence never mutates authoritative state**
5. **Single authoritative control plane**
6. **Deterministic behavior only**
7. **All actions auditable and replayable**
8. **Chat / UI is never authoritative**
9. **If a phase is incomplete, STOP**

---

## Phase 0 — Program & Repo Foundation

**Status:** ✅ COMPLETE

### Objective
Lock scope and prevent AI-demo drift.

### Deliverables
- [x] Repository initialized
- [x] ARCHITECTURE.md
- [x] PLAN.md
- [x] NON_GOALS.md
- [x] Project structure established
- [x] Infrastructure scaffolded
- [x] Domain models defined
- [x] Tests passing

### Forbidden
- Bedrock
- LangGraph
- Agents
- Chat UX

---

## Phase 1 — Incident Control Plane (FOUNDATION)

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-15

### Objective
Make incidents first-class, deterministic, replayable system objects.

### Key Invariants (FROZEN)
1. **DynamoDB event store is replay source** - EventBridge is fan-out only
2. **Permanent idempotency (no TTL)** - Audit trail forever
3. **IAM-only security** - No API keys, no secrets, SigV4 everywhere
4. **No AI / heuristics** - Deterministic state machine only
5. **Deterministic state transitions** - Rule-based only

### Data Model
- `opx-incidents` (current state)
- `opx-incident-events` (authoritative event store)
- `opx-idempotency` (permanent, no TTL)

### Lifecycle (FIXED)
```
CREATED → ANALYZING → DECIDED → WAITING_FOR_HUMAN → CLOSED
```

### Exit Criteria
- ✅ Incidents persist across time (DynamoDB with point-in-time recovery)
- ✅ Full audit & replay works (deterministic, authoritative, hash-verified)
- ✅ No intelligence present (verified via code search, 0 matches)
- ✅ IAM-only enforcement
- ✅ 71 tests passing (13 suites, 0 failures)

---

## Phase 2 — Observability & Autonomous Detection

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-21

### Objective
Detect problems deterministically without deciding outcomes.

**Rule:** Monitoring observes. Detection signals. Control plane decides.

### Capabilities
- ✅ Signal ingestion with normalization (54 signals)
- ✅ Detection engine with rule evaluation (6 rules)
- ✅ Correlation threshold logic
- ✅ Fail-closed behavior throughout
- ✅ Deterministic processing
- ✅ Complete audit trail

### Forbidden
- ML-based anomaly detection
- Predictive alerting
- Auto-remediation
- Dynamic thresholds

### Exit Criteria
- ✅ Signal ingestion working (54 signals stored)
- ✅ Detection rules loading (6 rules loaded)
- ✅ Detection creation (3 detections created)
- ✅ Correlation threshold logic (thresholdMetRules: 1)
- ✅ Fail-closed behavior (refused unsafe escalation)
- ✅ Deterministic processing (same inputs → same IDs)
- ✅ Complete audit trail (all events stored)

---

## Phase 3 — Incident Construction & Promotion (CONTROL PLANE)

**Status:** 🚧 IN PROGRESS (3/5 complete)  
**Started:** January 22, 2026

**CRITICAL:** This phase is 100% deterministic and contains NO AI.

### Objective
Convert correlated evidence into authoritative incidents via explicit promotion.

### Sub-Phases (LOCKED)

#### 3.1 Evidence Model ✅ COMPLETE
**Completed:** January 22, 2026 (~2 hours)

**Deliverables:**
- Evidence bundle schema with deterministic identity
- Evidence builder with fail-closed validation
- Evidence store with idempotent operations
- DynamoDB table deployed and ACTIVE
- 11/11 integration tests passing

**Key Files:**
- `src/evidence/evidence-bundle.schema.ts`
- `src/evidence/evidence-builder.ts`
- `src/evidence/evidence-store.ts`
- `src/evidence/evidence-id.ts`
- `infra/constructs/evidence-bundle-table.ts`

#### 3.2 Confidence Model ✅ COMPLETE
**Completed:** January 22, 2026 (~2 hours)

**Deliverables:**
- Deterministic confidence scoring (5 factors)
- Confidence calculator with weighted sum
- In-memory assessment (no persistence)
- Integration with candidate orchestrator
- 47/47 tests passing

**Key Files:**
- `src/confidence/confidence.schema.ts`
- `src/confidence/confidence-factors.ts`
- `src/confidence/confidence-calculator.ts`

**Model Version:** v1.0.0  
**Promotion Threshold:** 0.6 (HIGH minimum)

#### 3.3 Promotion Gate ✅ COMPLETE
**Completed:** January 22, 2026

**Deliverables:**
- Binary decision logic (PROMOTE | REJECT)
- Confidence threshold check (>= HIGH, >= 0.6)
- Evidence-derived incident identity
- Promotion store with incident-scoped identity
- 20/20 tests passing

**Key Files:**
- `src/promotion/promotion.schema.ts`
- `src/promotion/incident-identity.ts`
- `src/promotion/promotion-gate.ts`
- `src/promotion/promotion-store.ts`

**Gate Version:** v1.0.0

#### 3.4 Incident Lifecycle 🚧 IN PROGRESS
**Status:** Implementation started  
**Estimated Effort:** 3-4 days

**Scope:**
- Incident state machine (OPEN → ACKNOWLEDGED → MITIGATING → RESOLVED → CLOSED)
- State transition validation
- Incident manager with creation and transitions
- Incident store operations
- Event schemas (IncidentCreated, StateTransitioned)
- Integration with promotion gate

**Key Files (In Progress):**
- `src/incident/incident.schema.ts` ✅
- `src/incident/state-machine.ts` ✅
- `src/incident/incident-manager.ts` ✅
- `src/incident/incident-store.ts` ✅
- `src/incident/incident-event.schema.ts` ✅
- `src/orchestration/candidate-event-handler.ts` (updated) ✅

**Critical Rules:**
- Creation timestamps: DERIVED from promotionResult.evaluatedAt
- Transition timestamps: Real-time (human actions)
- Severity: DERIVED from evidence (max severity)
- Incident identity: SHA256(service + evidenceId) - LOCKED

#### 3.5 Idempotency & Replay 📋 PENDING
**Status:** Awaiting Phase 3.4  
**Estimated Effort:** 2-3 days

**Scope:**
- End-to-end idempotency verification
- Replay verification service
- Determinism validation
- Replay service implementation

### Non-Negotiable Invariants

- **P3-I1: Evidence-First** ✅ - No incident without evidence
- **P3-I2: Promotion Is Explicit** ✅ - Conscious gate decision required
- **P3-I3: Deterministic Decisions** ✅ - Same inputs → same outputs
- **P3-I4: Fail-Closed Escalation** ✅ - Insufficient confidence → reject
- **P3-I5: One Authority, One Incident** ✅ - No duplicate incidents

### Progress Visualization

```
Phase 3.1: Evidence Model         ████████████████████ 100% ✅
Phase 3.2: Confidence Model       ████████████████████ 100% ✅
Phase 3.3: Promotion Gate         ████████████████████ 100% ✅
Phase 3.4: Incident Lifecycle     ████████░░░░░░░░░░░░  40% 🚧
Phase 3.5: Idempotency & Replay   ░░░░░░░░░░░░░░░░░░░░   0% 📋
                                  ────────────────────
Overall Phase 3 Progress:         ████████████░░░░░░░░  60%
```

### Outcome
A fully authoritative incident lifecycle with replay guarantees.

---

## Phase 4 — Post-Incident Learning & Evaluation (OFFLINE ONLY)

**Status:** 🔲 NOT STARTED

### Objective
Build institutional memory after incidents are CLOSED.

### Rules
- No online learning
- No policy mutation
- No mid-incident adaptation
- Used only to improve future recommendations

### Capabilities
- Outcome recording (CLOSED incidents only)
- Human-validated feedback
- Pattern extraction
- Confidence calibration

### Exit Criteria
- [ ] Learning is explainable
- [ ] Improves future recommendations only
- [ ] No policy mutation
- [ ] No historical rewriting

---

## Phase 5 — Limited Automation (OPTIONAL, LAST FOR AUTHORITY)

**Status:** 🔲 NOT STARTED

### Objective
Earn small, reversible automation through human trust.

### Preconditions (ALL REQUIRED)
- ≥50 successful human-approved actions
- Zero policy violations
- Kill switch proven
- Stable confidence metrics
- SRE sign-off

### Capabilities
- Single-step, idempotent actions
- Explicit human approval
- Instant rollback
- Scoped blast radius

### Kill Switch
- Global disable <30 seconds
- No redeploy required

### Exit Criteria
- [ ] Automation never surprises humans
- [ ] Kill switch proven
- [ ] Rollback tested

---

## Phase 6 — AI Decision Intelligence Layer (ADVISORY ONLY)

**Status:** 🔲 NOT STARTED

**This is where agents are implemented.**

### Objective
Provide deep investigation and recommendations without authority.

### Characteristics
- Read-only
- No execution
- No approvals
- Structured JSON output
- Time-bounded

### Agents (6 total)
1. **Signal Analysis Agent** - Metrics/logs/traces correlation
2. **Historical Incident Agent** - Similar incident lookup
3. **Change Intelligence Agent** - Deploy/config correlation
4. **Risk & Blast Radius Agent** - Impact estimation
5. **Knowledge (RAG) Agent** - Runbook/postmortem search
6. **Execution Proposal Agent** - Action recommendations

### Orchestration
- LangGraph-based orchestration
- AWS Bedrock or Ollama-backed LLMs
- Parallel, read-only agents

### Authority
**NONE** - Advisory only, no decision-making power

### Exit Criteria
- [ ] Agents fail safely
- [ ] Controller remains deterministic
- [ ] Recommendations auditable
- [ ] Structured output validated

---

## Phase 7 — RAG & Knowledge Intelligence Layer

**Status:** 🔲 NOT STARTED

### Objective
Augment agents with institutional knowledge.

### Sources
- Closed incidents
- Runbooks
- Postmortems
- Architecture docs

### Capabilities
- Vector search (OpenSearch / FAISS / Pinecone)
- Deterministic chunking & versioning
- Explainable citations

### Rules
- Read-only
- Explainable citations
- Deterministic retrieval
- No mid-incident embedding updates

### Exit Criteria
- [ ] Measurable recommendation improvement
- [ ] Explainable citations
- [ ] No document auto-editing

---

## Phase 8 — LLM Observability, Safety & Governance

**Status:** 🔲 NOT STARTED

### Objective
Make AI behavior observable, auditable, and governable.

### Includes
- Prompt/response tracing
- Cost & latency metrics
- Guardrails enforcement
- Structured output validation
- Token usage tracking

### Forbidden
- Hidden prompts
- Untracked agent calls
- Silent failures

### Exit Criteria
- [ ] AI SLOs enforced
- [ ] Human trust measurable
- [ ] All prompts traced
- [ ] Cost attribution working

---

## Phase 9 — Human-Approved Autonomous Execution (GATED)

**Status:** 🔲 NOT STARTED

### Objective
Allow tightly scoped execution only after trust is proven.

### Rules
- Explicit human approval
- Idempotent actions
- Instant rollback
- Global kill switch

### Capabilities
- Agent-proposed actions
- Explicit approvals
- Idempotent execution
- Rollback guaranteed

### Forbidden
- Multi-step autonomy
- Cross-service execution
- Silent execution

### Exit Criteria
- [ ] Kill switch proven
- [ ] Rollback tested
- [ ] Human approval enforced

---

## Milestone Summary

| Phase | Name | AI Allowed | Authority | Status |
|-------|------|------------|-----------|--------|
| 0 | Foundation | ❌ | Deterministic | ✅ COMPLETE |
| 1 | Incident Control Plane | ❌ | Deterministic | ✅ COMPLETE |
| 2 | Observability & Detection | ❌ | Deterministic | ✅ COMPLETE |
| 3 | Incident Construction & Promotion | ❌ | Deterministic | 🚧 IN PROGRESS (60%) |
| 4 | Post-Incident Learning | ✅ Offline | Read-only | 🔲 NOT STARTED |
| 5 | Limited Automation | ✅ Gated | Human-approved | 🔲 NOT STARTED |
| 6 | AI Decision Intelligence | ✅ Advisory | None | 🔲 NOT STARTED |
| 7 | RAG Knowledge Layer | ✅ Advisory | None | 🔲 NOT STARTED |
| 8 | AI Governance | ✅ | Governed | 🔲 NOT STARTED |
| 9 | Human-Approved Automation | ✅ | Gated | 🔲 NOT STARTED |

---

## Current Status Summary

### Completed Phases (3)
- ✅ Phase 0: Foundation
- ✅ Phase 1: Incident Control Plane (71 tests passing)
- ✅ Phase 2: Observability & Detection (54 signals, 6 rules, 3 detections)

### In Progress (1)
- 🚧 Phase 3: Incident Construction & Promotion (60% complete)
  - ✅ 3.1 Evidence Model (11 tests passing)
  - ✅ 3.2 Confidence Model (47 tests passing)
  - ✅ 3.3 Promotion Gate (20 tests passing)
  - 🚧 3.4 Incident Lifecycle (implementation started)
  - 📋 3.5 Idempotency & Replay (pending)

### Pending Phases (6)
- 🔲 Phase 4: Post-Incident Learning
- 🔲 Phase 5: Limited Automation
- 🔲 Phase 6: AI Decision Intelligence
- 🔲 Phase 7: RAG Knowledge Layer
- 🔲 Phase 8: AI Governance
- 🔲 Phase 9: Human-Approved Automation

---

## Final Note

This project is not a chatbot. It is not an AI demo. It is a deterministic SRE control plane with layered intelligence.

**That distinction is the entire value.**

---

**Last Updated:** January 22, 2026  
**Current Phase:** 3.4 (Incident Lifecycle)  
**Overall Progress:** 3.6 / 10 phases (36%)
