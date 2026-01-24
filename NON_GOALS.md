# opx-control-plane — Non-Goals

## Purpose of This Document

This document explicitly states what opx-control-plane is **NOT** and will **NEVER** become. These boundaries are non-negotiable and exist to prevent scope drift toward AI demos, autonomous systems, or chatbot patterns.

---

## This System Is NOT

### ❌ An AI Assistant
- No conversational interface as primary UX
- No "ask me anything" patterns
- No natural language as authoritative input
- Chat is never the source of truth

### ❌ An Agent-First System
- Agents are advisory only (Phase 3+)
- Agents never have authority
- Agents never execute actions
- Agents never approve anything
- Agents never bypass policy

### ❌ A Chatbot
- No conversational memory as state
- No prompt-driven workflows
- No LLM-generated decisions
- No "AI-powered" as a feature

### ❌ Autonomous
- No self-directed actions
- No automatic execution
- No unsupervised decisions
- No "AI takes over when confident"

### ❌ A Demo or PoC
- Production-grade from day one
- Must work at 3 AM during incidents
- No "we'll harden it later"
- No shortcuts on auditability

---

## Forbidden Patterns

### Architecture Anti-Patterns
| Pattern | Why Forbidden |
|---------|---------------|
| Agent-as-controller | Agents advise, never control |
| LLM-in-the-loop for decisions | Non-deterministic |
| Confidence-based auto-approval | Humans approve, not scores |
| Chat as command interface | Chat is never authoritative |
| Autonomous remediation | Requires human approval |

### Technology Anti-Patterns (Phase 0-2)
| Technology | Status | When Allowed |
|------------|--------|--------------|
| Amazon Bedrock | ❌ Forbidden | Phase 3+ only |
| LangGraph | ❌ Forbidden | Phase 3+ only |
| LangChain | ❌ Forbidden | Phase 3+ only |
| Any LLM SDK | ❌ Forbidden | Phase 3+ only |
| Vector databases | ❌ Forbidden | Phase 4+ only |

### Behavioral Anti-Patterns
| Behavior | Why Forbidden |
|----------|---------------|
| Fail-open | Must fail-closed |
| Default allow | Must default deny |
| Implicit approval | Must be explicit |
| Time-based auto-approve | Humans approve |
| Skipping phases | Sequential gates required |

---

## Explicit Exclusions

### We Will NOT Build
1. **Natural language incident creation** — Incidents are created via structured API
2. **AI-generated runbooks** — Runbooks are human-authored and versioned
3. **Autonomous scaling decisions** — Requires human approval
4. **Self-healing infrastructure** — Requires human approval
5. **Predictive alerting** — Out of scope
6. **Cost optimization automation** — Out of scope
7. **Security remediation automation** — Out of scope (requires human approval)

### We Will NOT Support
1. **"Just let the AI handle it"** — Never
2. **Confidence thresholds for auto-action** — Never
3. **Agent-to-agent delegation** — Never
4. **Learning during incidents** — Post-incident only
5. **Policy modification by agents** — Never

---

## Boundary Enforcement

### Phase Gates
- Phase 0 must complete before Phase 1
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3
- No skipping. No exceptions.

### Code Review Requirements
Any PR that introduces:
- LLM calls before Phase 3 → **REJECT**
- Agent patterns before Phase 3 → **REJECT**
- Autonomous execution before Phase 5 → **REJECT**
- Non-deterministic decision logic → **REJECT**
- Implicit approvals → **REJECT**

### Runtime Enforcement
- Intelligence layer has read-only credentials
- Execution requires approval token
- Audit log is append-only
- Kill switch stops automation in <30 seconds

---

## The Line We Will Not Cross

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Intelligence advises. Control decides. Humans approve.   │
│                                                             │
│   This line is NEVER crossed.                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What This Means
- An agent can say "I recommend restarting the service"
- An agent can say "Confidence: 85%"
- An agent can say "Similar incidents were resolved this way"
- An agent **CANNOT** restart the service
- An agent **CANNOT** approve the restart
- An agent **CANNOT** bypass the approval requirement
- A human **MUST** approve before execution

---

## Questions This Document Answers

| Question | Answer |
|----------|--------|
| Can we add a chatbot? | No |
| Can agents auto-execute if confidence is high? | No |
| Can we skip Phase 1 and start with agents? | No |
| Can we use Bedrock in Phase 1? | No |
| Can agents modify incident state? | No |
| Can we learn during an incident? | No |
| Can automation run without approval? | No (until Phase 5 with strict preconditions) |

---

## Document References

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [PLAN.md](./PLAN.md) — Development phases
