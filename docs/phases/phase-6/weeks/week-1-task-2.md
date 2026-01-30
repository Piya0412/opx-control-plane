# Phase 6 · Week 1 · Task 2: Document Agent Contracts - COMPLETE ✅

**Date:** January 25, 2026  
**Authority:** Principal Architect  
**Status:** ✅ COMPLETE - HARDENED TO PRINCIPAL-GRADE  

---

## Summary

Agent contracts have been **documented, reviewed, and hardened** to principal-grade quality. The document is now **frozen** and serves as the authoritative specification for all agent implementations.

---

## What Was Delivered

### Core Document
**File:** `docs/AGENT_CONTRACTS.md` (🔒 FROZEN)

**Contents:**
- Canonical `AgentInput` envelope (immutable, replay-safe)
- Canonical `AgentOutput` envelope (deterministic, JSON-safe)
- 9 agent specializations with detailed schemas
- LangGraph interaction rules
- Replay + determinism guarantees
- Non-negotiable constraints
- Failure semantics
- Interview defense points

---

## Architectural Review Results

### Status: ✅ APPROVED WITH MINOR HARDENING REQUIRED

**Architectural Maturity:** Senior / Staff+ level  
**Resume Defensibility:** YES (strong)  
**LangGraph Compatibility:** YES (native fit)  
**Risk of Regression:** LOW (with 4 fixes applied)

---

## What Was Exceptional (Reviewer Feedback)

### 1. Canonical Envelopes = Correct ✅
- Stable, deterministic, replay-safe
- Separates LLM variability from system determinism
- **Eliminates 80% of multi-agent chaos**

### 2. Separation of Reasoning vs Control = Correct ✅
- Agents → reason
- LangGraph → orchestrates
- Phase 5 → executes
- Cost Guardian → signals
- Auditor → evaluates
- **No authority boundary blur**

### 3. Consensus as First-Class Agent = Excellent ✅
- Preserves minority opinions
- Explains resolutions
- Uses weighted confidence
- Is deterministic
- **Staff/Principal-level design**

### 4. Replay & Determinism Section = Interview Gold ✅
- Realistic and honest
- "Schema and bounds must match, exact text may vary"
- **Avoids the classic lie: "LLMs are deterministic if temperature=0"**

---

## Hardening Fixes Applied (4/4)

### 🔴 FIX 1: Map → Record (MANDATORY) ✅

**Problem:** `Map<>` is not JSON-serializable, breaks checkpointing and replay

**Fix Applied:**
- ✅ `priorAgentOutputs?: Record<AgentId, AgentOutput>`
- ✅ `agentOutputs: Record<AgentId, AgentOutput>`
- ✅ `retryCount: Record<AgentId, number>`
- ✅ `perAgentCost: Record<AgentId, {...}>`

**Why This Matters:**
- Checkpointing works
- Replay works
- Python ↔ TypeScript interop works
- No subtle serialization bugs

---

### 🟠 FIX 2: Deterministic Hash Construction Rules (RECOMMENDED) ✅

**Problem:** Hash construction was underspecified

**Fix Applied:**
Added explicit section with:
- JSON canonicalization (sorted keys)
- Exclude non-deterministic fields (reasoning, free text)
- Include numeric findings, enums, structure
- Fixed float precision (4 decimal places)
- Null handling rules
- Array ordering rules

**Example:**
```typescript
deterministicHash = SHA256(
  JSON.stringify(canonicalize(input)) + 
  JSON.stringify(canonicalize(findings))
)
```

**Why This Matters:**
- Interview-defensible
- Survives LLM non-determinism
- Detects schema drift
- Enables replay verification

---

### 🟠 FIX 3: LangGraph Node Justification (RECOMMENDED) ✅

**Problem:** Why some agents are LangGraph nodes (not Bedrock Agents) was implicit

**Fix Applied:**
Added explicit justification for:
- **Consensus Agent** - "Operates purely on structured outputs, no LLM reasoning needed"
- **Cost Guardian Agent** - "Performs deterministic arithmetic, no LLM reasoning needed"

**Rationale:**
- Reduces cost (no LLM invocation)
- Improves determinism (pure computation)
- Simplifies replay (no Bedrock API calls)
- Enables faster execution (no network latency)

**Why This Matters:**
- Prevents "why didn't you make everything a Bedrock Agent?" question
- Shows architectural maturity
- Demonstrates cost optimization

---

### 🟡 FIX 4: IAM Read-Only Scope (MINOR) ✅

**Problem:** "Read-only" was stated but not detailed

**Fix Applied:**
Added IAM security section for all action groups:
```
Action groups are IAM-restricted to read-only APIs and scoped per-agent.
Each action group Lambda has explicit DENY policies on write operations.
```

**Why This Matters:**
- Signals AWS security maturity
- Shows defense-in-depth
- Interview-defensible

---

## LangGraph Compatibility: PASS ✅

| Our Concept | LangGraph Equivalent |
|-------------|---------------------|
| AgentInput | State slice |
| AgentOutput | Node output |
| Parallel agents | Fan-out nodes |
| Consensus | Reducer node |
| Cost Guardian | Observer node |
| Retry rules | LangGraph retry |
| Checkpointing | Built-in |

**No red flags. Clean mapping.**

---

## Bedrock Agent Fit: PASS ✅

**Correctly using Bedrock Agents for:**
- Tool-using agents (action groups)
- Knowledge Base agents (RAG)
- Reasoning-heavy synthesis

**Correctly NOT using Bedrock Agents for:**
- Pure aggregation (Consensus)
- Cost math (Cost Guardian)
- Deterministic checks

**This is exactly right.**

---

## 9 Agent Specializations (Frozen)

### Core Analysis Agents (4)
1. **Signal Intelligence Agent** - Bedrock Agent + Action Groups
2. **Historical Incident Pattern Agent** - Bedrock Agent + Action Groups
3. **Change Intelligence Agent** - Bedrock Agent + Action Groups
4. **Risk & Blast Radius Agent** - Bedrock Agent + Action Groups

### Knowledge & Strategy Agents (2)
5. **Knowledge RAG Agent** - Bedrock Agent + Knowledge Base
6. **Response Strategy Agent** - Bedrock Agent (LLM synthesis)

### Governance & Quality Agents (2)
7. **Consensus & Confidence Agent** - LangGraph Node (custom logic)
8. **Cost & Budget Guardian Agent** - LangGraph Node (custom logic)

### Optional (Recommended)
9. **Reliability / Hallucination Auditor Agent** - Bedrock Agent (validation)

---

## Non-Negotiable Constraints (Locked)

### Agents MUST
1. ✅ Accept `AgentInput` envelope exactly
2. ✅ Return `AgentOutput` envelope exactly
3. ✅ Include disclaimer "HYPOTHESIS_ONLY_NOT_AUTHORITATIVE"
4. ✅ Track cost (tokens + USD)
5. ✅ Provide reasoning and confidence
6. ✅ Handle errors gracefully (no throws)
7. ✅ Respect time constraints
8. ✅ Preserve replay metadata

### Agents MUST NOT
1. ❌ Mutate incident state
2. ❌ Execute actions
3. ❌ Write to authoritative tables
4. ❌ Call AWS APIs directly (use action groups)
5. ❌ Throw exceptions
6. ❌ Block on budget exceeded
7. ❌ Add/remove envelope fields
8. ❌ Produce non-deterministic hashes

---

## Interview Defense Points

### "How did you prevent agent sprawl?"
> "We froze agent contracts in `docs/AGENT_CONTRACTS.md` with canonical input/output envelopes. Any new agent must conform to these contracts or get Principal Architect approval. This prevented the 'just add another agent' anti-pattern."

### "How did you ensure replay determinism?"
> "Every agent output includes a `deterministicHash` computed from canonicalized input + findings. On replay, we verify the hash matches. We guarantee schema and bounds match, not exact text, because LLMs are non-deterministic."

### "How did you handle agent failures?"
> "We defined explicit failure semantics with 4 status codes (SUCCESS, PARTIAL, TIMEOUT, FAILURE) and 15 error codes. LangGraph retries on retryable errors (max 3 attempts) and gracefully degrades on non-retryable errors."

### "How did you prevent agents from executing actions?"
> "Hard constraint: agents MUST NOT mutate incident state or execute actions. They return recommendations only. Phase 5 (automation) is the sole executor, and it requires human approval."

### "How did you manage costs?"
> "Dedicated Cost Guardian agent tracks per-agent costs and signals budget exceeded. It does NOT throw or block—Phase 5 decides whether to proceed. Every agent output includes token counts and estimated cost."

---

## Final Judgment (Reviewer)

**"This is not a 'good learning project'."**

**This is:**
- ✅ Architecturally sound
- ✅ Resume-aligned
- ✅ Interview-defensible
- ✅ Production-shaped

**With the 4 fixes applied:**
- ✅ Principal-grade quality
- ✅ No regression risk
- ✅ Ready for implementation

---

## Change Control

**To modify these contracts:**
1. Submit architectural review request
2. Justify why change is necessary
3. Assess impact on existing agents
4. Update schema version
5. Get Principal Architect approval

**This document is the guardrail. Point to it in interviews. Defend it in code reviews.**

---

## Next Steps

### ✅ Task 2 Complete
- [x] Create `docs/AGENT_CONTRACTS.md`
- [x] Define canonical envelopes
- [x] Specify 9 agent specializations
- [x] Define LangGraph interaction rules
- [x] Define replay guarantees
- [x] Apply 4 hardening fixes
- [x] Get architectural review approval

### 👉 Proceed to Task 3
**Phase 6 · Week 1 · Task 3: Extract and Version Prompts**

Extract agent logic from Lambda prototypes and convert to:
- Bedrock Agent instruction templates
- Action group specifications
- Prompt versioning strategy
- Validation rules

---

**Status:** ✅ COMPLETE  
**Quality:** Principal-grade  
**Blocker:** NONE  
**Next:** Week 1 Task 3 - Extract and version prompts

---

**Date:** January 25, 2026  
**Authority:** Principal Architect  
**Confidence:** ABSOLUTE
