# ARCHITECTURAL CORRECTION REQUIRED

**Date:** January 25, 2026  
**Authority:** Principal Architect  
**Status:** 🚨 CRITICAL - REFACTOR REQUIRED  

---

## Executive Summary

Phase 6 was implemented using a **Lambda-per-agent architecture** with custom orchestration. This is **architecturally incorrect** for the project's stated objective: building a **production-grade AWS Bedrock + LangGraph multi-agent system**.

**This document defines the required architectural correction.**

---

## Project Objective (Non-Negotiable)

This project MUST demonstrate senior-level capability in:

1. **Bedrock-native multi-agent architectures**
2. **LangGraph-based stateful orchestration**
3. **Agent-to-agent reasoning and consensus**
4. **Cost, reliability, and governance at scale**

**Resume Alignment:**
- Multi-agent orchestration using LangGraph
- Bedrock-native agent systems
- Production-grade observability and governance
- 8+ specialized agents

---

## What Was Built (Current State)

### Lambda-Based Agent Architecture ❌

```
EventBridge → Orchestrator Lambda → Fan-out to 6 Agent Lambdas
                                   ↓
                            Bedrock InvokeModel (per Lambda)
                                   ↓
                            Custom result aggregation
```

**Problems:**
1. **Not Bedrock-native** - Using Lambda wrappers around `InvokeModel`, not Bedrock Agents
2. **Not LangGraph** - Custom fan-out orchestration, not stateful graph execution
3. **No agent-to-agent reasoning** - Agents don't communicate or reach consensus
4. **No retry/fallback logic** - Custom timeout handling, not LangGraph's built-in patterns
5. **Not resume-aligned** - Cannot claim "LangGraph orchestration" or "Bedrock Agents"

### What Can Be Salvaged ✅

- Agent logic and prompts (can be migrated)
- Input/output schemas (can be adapted)
- Observability patterns (can be integrated)
- Guardrails and governance (can be preserved)

---

## What Must Be Built (Target State)

### Bedrock + LangGraph Multi-Agent Architecture ✅

```
EventBridge → LangGraph Orchestrator (State Machine)
                     ↓
         ┌───────────┴───────────┐
         ↓                       ↓
   Bedrock Agents          LangGraph Nodes
   (where applicable)      (custom logic)
         ↓                       ↓
   Agent-to-Agent Reasoning & Consensus
         ↓
   Stateful Graph Execution
   (retries, fallbacks, partial success)
         ↓
   Structured Recommendations
```

**Requirements:**
1. **Bedrock-native** - Use Bedrock Agent constructs where applicable
2. **LangGraph orchestration** - Stateful graph with nodes, edges, conditional routing
3. **Agent-to-agent reasoning** - Agents can communicate and reach consensus
4. **Built-in retry/fallback** - LangGraph's native error handling
5. **Resume-aligned** - Can legitimately claim "LangGraph + Bedrock multi-agent system"

---

## Why Lambda Agents Were Rejected

### Technical Reasons

1. **Not Bedrock-native**
   - Lambda + `InvokeModel` is just an API wrapper
   - Does not leverage Bedrock Agents' built-in capabilities
   - Cannot claim "Bedrock agent system" on resume

2. **Not LangGraph orchestration**
   - Custom fan-out logic is not a state machine
   - No graph-based execution flow
   - Cannot claim "LangGraph orchestration" on resume

3. **No agent-to-agent reasoning**
   - Agents execute in isolation
   - No consensus mechanism
   - No multi-agent collaboration patterns

4. **Limited retry/fallback**
   - Custom timeout handling
   - No built-in retry strategies
   - No graceful degradation patterns

5. **Not production-grade orchestration**
   - Custom orchestration code is maintenance burden
   - LangGraph provides battle-tested patterns
   - Missing checkpointing, replay, and state management

### Resume Impact

**Current (Lambda agents):**
- ❌ Cannot claim "Bedrock-native agent system"
- ❌ Cannot claim "LangGraph orchestration"
- ❌ Cannot claim "multi-agent reasoning"
- ✅ Can claim "custom Lambda orchestration" (not impressive)

**Target (Bedrock + LangGraph):**
- ✅ Can claim "Bedrock-native agent system"
- ✅ Can claim "LangGraph stateful orchestration"
- ✅ Can claim "multi-agent reasoning and consensus"
- ✅ Can claim "production-grade governance at scale"

---

## Architectural Correction Plan

### Phase 1: Document Correct Architecture ✅
- [x] Create this document
- [ ] Update PLAN.md with Bedrock + LangGraph requirements
- [ ] Create LangGraph architecture design
- [ ] Define agent contracts and state management

### Phase 2: Design LangGraph State Machine
- [ ] Define agent graph (nodes, edges, conditional routing)
- [ ] Define state schema (shared state across agents)
- [ ] Define retry and fallback strategies
- [ ] Define consensus mechanisms

### Phase 3: Implement Bedrock Agents
- [ ] Identify which agents should use Bedrock Agent constructs
- [ ] Implement Bedrock Agents where applicable
- [ ] Implement custom LangGraph nodes where needed
- [ ] Integrate with existing infrastructure

### Phase 4: Implement LangGraph Orchestration
- [ ] Replace custom orchestrator with LangGraph
- [ ] Implement stateful graph execution
- [ ] Implement checkpointing and replay
- [ ] Implement agent-to-agent communication

### Phase 5: Migrate Agent Logic
- [ ] Port agent prompts to Bedrock Agents / LangGraph nodes
- [ ] Preserve guardrails and governance
- [ ] Preserve observability patterns
- [ ] Update tests

### Phase 6: Validate and Deploy
- [ ] Integration tests with LangGraph
- [ ] Replay safety verification
- [ ] Cost and performance validation
- [ ] Production deployment

---

## Agent System Requirements

### Minimum 8 Specialized Agents

**CORE ANALYSIS AGENTS (4):**
1. **Signal Intelligence Agent** - Analyzes evidence bundles
2. **Historical Incident Pattern Agent** - Finds similar incidents
3. **Change Intelligence Agent** - Correlates with deployments
4. **Risk & Blast Radius Agent** - Estimates impact

**KNOWLEDGE & STRATEGY AGENTS (2):**
5. **Knowledge RAG Agent** - Searches documentation (projections only)
6. **Response Strategy Agent** - Ranks options (no execution plans)

**GOVERNANCE & QUALITY AGENTS (2):**
7. **Consensus & Confidence Agent** - Aggregates agent recommendations
8. **Cost & Budget Guardian Agent** - Enforces budget limits

**OPTIONAL (Recommended for Senior Impact):**
9. **Reliability / Hallucination Auditor Agent** - Validates agent outputs

---

## Hard Constraints (Non-Negotiable)

### Agents
- ✅ NEVER execute actions
- ✅ NEVER mutate incident state
- ✅ ALWAYS produce hypotheses with confidence
- ✅ ALWAYS include explicit disclaimers

### LangGraph
- ✅ MUST manage retries, fallbacks, partial success
- ✅ MUST support replay determinism
- ✅ MUST provide checkpointing and state management
- ✅ MUST enable agent-to-agent reasoning

### Bedrock
- ✅ Use Bedrock-native agent constructs where possible
- ✅ Do NOT treat `InvokeModel` wrappers as "agents"
- ✅ Leverage Bedrock Agents' built-in capabilities
- ✅ Use Bedrock Guardrails where applicable

---

## Process Rule

**If you detect a design choice that optimizes for speed or convenience but weakens architectural alignment with Bedrock + LangGraph, you MUST reject it and explain why.**

**If there is ambiguity, STOP and ask before proceeding.**

---

## Expected Deliverables

### 1. Updated PLAN.md (Authoritative)
- Redefine Phase 6 as "Bedrock + LangGraph Multi-Agent Intelligence"
- Explicitly state why Lambda-based agents were rejected
- Define agent graph, retries, fallbacks, and governance

### 2. Corrected Architecture Diagram
- Show LangGraph DAG/state machine
- Show agent roles and interaction paths
- Clearly separate: Reasoning (agents), Control (LangGraph), Execution (Phase 5)

### 3. LangGraph Node & Edge Definition
- Define all nodes (agents)
- Define all edges (transitions)
- Define conditional routing logic
- Define retry and fallback strategies

### 4. Agent Contracts
- Input/output schemas for each agent
- State management requirements
- Consensus mechanisms

### 5. Migration Plan
- Step-by-step migration from Lambda agents to LangGraph
- Preserve existing logic and guardrails
- Minimize disruption to other phases

---

## Authority & Confidence

**Authority:** Principal Architect - This is the single source of truth  
**Confidence:** ABSOLUTE - This correction is non-negotiable  
**Blocker Status:** CRITICAL - Phase 6 must be refactored before production  

---

## Next Steps

1. **STOP all Phase 6 deployment** - Do not deploy Lambda agents
2. **Review and approve this document** - Confirm architectural direction
3. **Update PLAN.md** - Redefine Phase 6 with correct architecture
4. **Design LangGraph state machine** - Define agent graph
5. **Begin controlled refactor** - Migrate to Bedrock + LangGraph

---

**This is not a demo, chatbot, or ESOC-style system.**  
**This is a resume-defining, production-grade Bedrock + LangGraph multi-agent platform.**

---

**Date:** January 25, 2026  
**Status:** 🚨 ARCHITECTURAL CORRECTION REQUIRED  
**Action Required:** Approve and proceed with refactor
