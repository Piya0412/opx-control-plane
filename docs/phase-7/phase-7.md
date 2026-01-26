# Phase 7: Knowledge Base / RAG

**Status:** 🟢 OPEN FOR REVIEW  
**Authority:** Advisory only  
**Prerequisites:** Phase 6 COMPLETE ✅  
**Duration:** 2-3 weeks  
**Risk Level:** MEDIUM

---

## Executive Summary

Phase 7 adds **institutional memory** to Phase 6 agents through a Bedrock Knowledge Base. This enables agents to recall runbooks, ground recommendations in postmortems, and cite historical resolutions—**without any state mutation, execution authority, or runtime learning**.

**Core Principle:** Make agents smarter, not more dangerous.

---

## What Phase 7 Unlocks

### Before Phase 7 (Current State)
- ✅ Agents are intelligent and deterministic
- ❌ Blind to institutional memory
- ❌ No runbook recall
- ❌ No postmortem grounding
- ❌ No historical resolution patterns

### After Phase 7
- ✅ Runbook recall with citations
- ✅ Postmortem grounding
- ✅ Historical reasoning with evidence
- ✅ Stronger confidence calibration
- ✅ Explainable recommendations

### Still Prohibited (NEVER)
- ❌ No state mutation
- ❌ No execution authority
- ❌ No learning during incidents
- ❌ No feedback loops
- ❌ No auto-ingestion

---

## Phase 7 Structure

Phase 7 is divided into **4 sub-phases**, each requiring review and approval:

### [Phase 7.1: Knowledge Corpus Definition & Versioning](./phase-7.1-knowledge-corpus.md)
**Duration:** 2-3 days  
**Objective:** Define what knowledge exists and how it is frozen

**Deliverables:**
- Document schema (types, identity, versioning)
- Document store (S3 + DynamoDB)
- Manual ingestion script
- Sample documents (runbooks, postmortems)

**Success Criteria:**
- Document IDs are deterministic
- Versioning works (updates create new versions)
- No auto-ingestion (human-triggered only)

---

### [Phase 7.2: Deterministic Chunking](./phase-7.2-deterministic-chunking.md)
**Duration:** 2-3 days  
**Objective:** Define how text becomes chunks (repeatable forever)

**Deliverables:**
- Chunking algorithm (fixed size, fixed overlap)
- Chunk store (S3 + DynamoDB)
- Tokenizer utility
- Chunking tests (prove determinism)

**Success Criteria:**
- Same document → same chunks (always)
- Chunk IDs are stable
- Chunking is repeatable

---

### [Phase 7.3: Bedrock Knowledge Base](./phase-7.3-bedrock-knowledge-base.md)
**Duration:** 3-4 days  
**Objective:** Deploy vector store and query interface

**Deliverables:**
- Bedrock Knowledge Base (Titan embeddings)
- OpenSearch Serverless collection
- Manual sync script
- Query utility
- IAM roles (read-only at runtime)

**Success Criteria:**
- Knowledge Base deployed
- Manual sync works (chunks → vectors)
- Query works (natural language → Top-K chunks)
- No runtime updates (IAM enforced)

---

### [Phase 7.4: Agent Integration](./phase-7.4-agent-integration.md)
**Duration:** 3-4 days  
**Objective:** Wire Knowledge RAG Agent to Knowledge Base

**Deliverables:**
- Knowledge RAG Agent updates
- Citation enforcement
- Confidence impact rules
- Replay support (logged queries)
- Integration tests

**Success Criteria:**
- Knowledge RAG Agent queries Knowledge Base
- Citations enforced (all recommendations include citations)
- Confidence impact rules work
- Replay determinism proven

---

## Phase 7 Entry Checklist (VERIFIED ✅)

- ✅ Deterministic replay proven (Phase 6 Week 5)
- ✅ Stable agent contracts (Phase 6 complete)
- ✅ Cost tracking implemented
- ✅ Advisory-only outputs enforced
- ✅ IAM DENY on mutation
- ✅ End-to-end wiring complete

**Phase 7 is SAFE to begin.**

---

## Global Constraints (NON-NEGOTIABLE)

### ✅ Allowed
- Read-only access to knowledge corpus
- Manual document ingestion (human-triggered)
- Deterministic chunking and embedding
- Citation enforcement
- Confidence impact rules

### ❌ Prohibited
- No feedback loops (agents cannot update knowledge)
- No learning from live incidents
- No auto-ingestion (no crawlers, no scrapers)
- No prompt-based "search" (structured queries only)
- No LLM deciding relevance (score thresholds only)
- No vector updates mid-flight (immutable after sync)

---

## Technology Stack

### Knowledge Storage
- **Primary Store:** S3 (versioned, immutable)
- **Metadata Store:** DynamoDB (document/chunk metadata)
- **Vector Store:** OpenSearch Serverless (managed by Bedrock)

### Embeddings
- **Model:** Amazon Titan Embeddings G1 - Text (ONLY)
- **Dimension:** 1536
- **Cost:** $0.0001 per 1K tokens

### Knowledge Base
- **Service:** Amazon Bedrock Knowledge Base
- **Retrieval:** Top-K (fixed at 5)
- **Score Threshold:** 0.7 (minimum similarity)
- **Timeout:** 5 seconds

---

## Cost Estimates

### One-Time Costs
- Document ingestion: $0.125 per 100 documents
- Initial sync: $0.125 (one-time)

### Monthly Costs (1000 queries/day)
- OpenSearch Serverless: $345/month (2 OCUs)
- Query costs: $0.15/month (50K tokens)
- Storage: $5/month (S3 + DynamoDB)

**Total:** ~$350/month

---

## Timeline

- **Phase 7.1:** 2-3 days (Knowledge Corpus)
- **Phase 7.2:** 2-3 days (Deterministic Chunking)
- **Phase 7.3:** 3-4 days (Bedrock Knowledge Base)
- **Phase 7.4:** 3-4 days (Agent Integration)

**Total:** 10-14 days (2-3 weeks)

---

## Success Criteria

- [ ] Knowledge corpus defined and versioned
- [ ] Deterministic chunking proven
- [ ] Bedrock Knowledge Base deployed
- [ ] Knowledge RAG Agent integrated
- [ ] Citations enforced
- [ ] Confidence impact rules work
- [ ] Replay determinism proven
- [ ] End-to-end flow works

---

## Risks & Mitigations

### Risk 1: Embedding Model Changes
**Impact:** HIGH  
**Mitigation:** Pin Titan model version, never upgrade without re-sync

### Risk 2: Query Non-Determinism
**Impact:** MEDIUM  
**Mitigation:** Use score threshold, deterministic tie-breaking, log all queries

### Risk 3: Cost Overruns
**Impact:** MEDIUM  
**Mitigation:** Limit Top-K to 5, set query timeout, monitor costs

### Risk 4: Unvetted Content
**Impact:** MEDIUM  
**Mitigation:** Manual ingestion only, human review required

---

## Next Steps

1. **Review Phase 7.1 design** → [phase-7.1-knowledge-corpus.md](./phase-7.1-knowledge-corpus.md)
2. **Approve Phase 7.1** (or request changes)
3. **Implement Phase 7.1** (2-3 days)
4. **Review Phase 7.2 design** (after 7.1 complete)
5. **Repeat for 7.2, 7.3, 7.4**

---

## Related Documentation

- [Phase 6: AI Decision Intelligence](../phase-6/phase-6.md) - Prerequisites
- [Architecture](../../ARCHITECTURE.md) - System architecture
- [Plan](../../PLAN.md) - Phase roadmap

---

**Status:** 🟢 OPEN FOR REVIEW  
**Authority:** Principal Architect  
**Next Action:** Review and approve Phase 7.1 design
