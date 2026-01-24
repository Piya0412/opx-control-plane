# opx-control-plane — Architecture

## System Identity

| Attribute | Value |
|-----------|-------|
| Name | opx-control-plane |
| Type | Enterprise Operational Control Plane |
| Purpose | Own operational state, enforce policy, coordinate intelligence safely |

**Core Truth:** Intelligence advises. Control decides. Humans approve.

---

## What This System IS

- A **deterministic control plane** for operational incidents
- A **policy enforcement engine** that fails closed
- An **audit system** where every action is replayable
- A **human-in-the-loop system** where approval is always possible
- A system that **must behave correctly at 3 AM during an incident**

## What This System IS NOT

- ❌ NOT an AI assistant
- ❌ NOT an agent-first system
- ❌ NOT a chatbot or conversational UI
- ❌ NOT a demo or proof-of-concept
- ❌ NOT autonomous

---

## Architectural Layers

```
┌─────────────────────────────────────────────────┐
│           Human Interfaces                      │
│  (API / UI / Integrations)                      │
│  Read & Approve only — Never authoritative      │
└───────────────────────▲─────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│        OPX CONTROL PLANE (Authority)            │
│                                                 │
│  • Incident / Investigation Objects             │
│  • Deterministic Controller                     │
│  • State Machines                               │
│  • Policy Engine                                │
│  • Approval & Governance                        │
│  • Audit & Replay                               │
└───────────────────────▲─────────────────────────┘
                        │ advisory only (Phase 3+)
┌───────────────────────┴─────────────────────────┐
│        INTELLIGENCE LAYER (Phase 3+)            │
│                                                 │
│  • Specialized Agents (read-only)               │
│  • Structured outputs only                      │
│  • Time-bounded execution                       │
│  • No state mutation                            │
└───────────────────────▲─────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│        EXECUTION & SYSTEMS LAYER                │
│  (AWS APIs, Playbooks, Infra, Tools)            │
│  Executed ONLY after human approval             │
└─────────────────────────────────────────────────┘
```

---

## Global Invariants (Never Broken)

1. **Single source of truth** = control plane
2. **Deterministic state transitions** — same input → same output
3. **Fail-closed on ambiguity** — when uncertain, deny
4. **Humans retain final authority** — always
5. **All actions auditable and replayable**
6. **Intelligence never executes** — advisory only

---

## Phase Boundaries

| Phase | Scope | Forbidden |
|-------|-------|-----------|
| 0 | Program & Repo Foundation | AI, agents, LangGraph |
| 1 | Incident Control Plane | AI, agents, LangGraph |
| 2 | Policy & Governance | Autonomy, AI |
| 3 | Multi-Agent Intelligence | State changes, execution |
| 4 | Learning System | Online learning, mid-incident learning |
| 5 | Limited Automation | Broad/autonomous actions |

**Rule:** If a phase is incomplete, STOP.

---

## Technology Decisions

### Infrastructure (AWS)
- **Compute:** AWS Lambda (deterministic handlers)
- **State:** DynamoDB (single-table design, append-only timelines)
- **Events:** EventBridge (audit trail, event sourcing)
- **Orchestration:** Step Functions (state machines)
- **API:** API Gateway (REST)
- **IaC:** AWS CDK (TypeScript)

### Application
- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20.x
- **Testing:** Vitest
- **Validation:** Zod schemas

### Intelligence (Phase 3+ Only)
- **Orchestration:** LangGraph (contained to intelligence layer)
- **LLM:** Amazon Bedrock (advisory only, no authority)

---

## Data Flow Principles

1. **Inbound signals** → Control Plane validates → State updated
2. **State changes** → Audit event emitted → Immutable log
3. **Intelligence requests** (Phase 3+) → Read-only access → Structured response
4. **Actions** → Policy check → Approval required → Human approves → Execution

---

## Security Model

- All mutations require authenticated principals
- Role-based access control for approvals
- No ambient authority — explicit grants only
- Audit log is append-only and immutable
- Intelligence layer has read-only credentials

---

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Invalid state transition | Reject, log, alert |
| Policy evaluation fails | DENY (fail-closed) |
| Intelligence timeout | Continue without advisory |
| Approval timeout | Escalate, do not auto-approve |
| Unknown input | Reject, require human review |

---

## Document References

- [PLAN.md](./PLAN.md) — Development phases and milestones
- [NON_GOALS.md](./NON_GOALS.md) — Explicit exclusions and boundaries
