# OPX Control Plane - Phase Documentation

This directory contains the **canonical documentation** for all development phases of the OPX Control Plane project. Each phase represents a major milestone in the system's evolution.

## Directory Structure

```
docs/phases/
├── phase-1/    # Foundation & Core Architecture
├── phase-2/    # Signal Ingestion & Correlation
├── phase-3/    # Candidate Generation & Evidence
├── phase-4/    # Promotion & Authority
├── phase-5/    # Learning & Calibration
├── phase-6/    # Agent Orchestration (LangGraph)
├── phase-7/    # Knowledge Base & RAG
└── phase-8/    # Observability & Validation
```

## Phase Overview

### Phase 1: Foundation & Core Architecture
**Status:** ✅ Complete

Core domain models, incident management, and foundational architecture.

**Key Documents:**
- `PHASE_1_DESIGN.md` - Initial architecture and design
- `PHASE_1_IMPLEMENTATION_LOCK.md` - Implementation completion marker

---

### Phase 2: Signal Ingestion & Correlation
**Status:** ✅ Complete

Signal normalization, correlation engine, and detection rules.

**Key Documents:**
- `PHASE_2_DESIGN.md` - Overall phase design
- `PHASE_2.1_SIGNAL_INGESTION_DESIGN.md` - Signal ingestion architecture
- `PHASE_2.2_SIGNAL_CORRELATION_DESIGN.md` - Correlation engine design
- `PHASE_2.3_ARCHITECTURE.md` - Candidate generation architecture
- `PHASE_2.3_RUNBOOK.md` - Operational runbook
- `PHASE_2.3_KILL_SWITCH.md` - Safety mechanisms
- `PHASE_2_INVARIANTS.md` - System invariants
- `PHASE_2_OBSERVABILITY_DESIGN.md` - Observability strategy

---

### Phase 3: Candidate Generation & Evidence
**Status:** ✅ Complete

Candidate generation, evidence bundling, and graph construction.

**Key Documents:**
- `PHASE_3_DESIGN.md` - Phase design
- `phase-3-logic-complete.md` - Implementation completion

---

### Phase 4: Promotion & Authority
**Status:** ✅ Complete

Promotion policies, authority validation, and incident lifecycle management.

**Key Documents:**
- `PHASE_4_DESIGN.md` - Phase design

---

### Phase 5: Learning & Calibration
**Status:** ✅ Complete

Outcome recording, confidence calibration, and pattern extraction.

**Key Documents:**
- `PHASE_5_DESIGN.md` - Phase design
- `PHASE_5_DEPLOYMENT.md` - Deployment guide
- `PHASE_5_RUNBOOK.md` - Operational runbook
- `PHASE_5_TROUBLESHOOTING.md` - Troubleshooting guide

---

### Phase 6: Agent Orchestration (LangGraph)
**Status:** ✅ Complete

Multi-agent orchestration using LangGraph, consensus mechanisms, and agent coordination.

**Key Documents:**
- `PHASE_6_DESIGN.md` - Phase design
- `phase-6.md` - Overview and summary
- `PHASE_6_WEEK_4_COMPLETE.md` - Week 4 milestone

**Subdirectories:**
- `decisions/` - Architectural decisions and design choices
- `integration/` - End-to-end integration documentation
- `reports/` - Status reports and cleanup documentation
- `weeks/` - Weekly progress tracking (weeks 1-5)

---

### Phase 7: Knowledge Base & RAG
**Status:** ✅ Complete

Bedrock Knowledge Base integration, deterministic chunking, and RAG agent implementation.

**Key Documents:**
- `PHASE_7_DESIGN.md` - Overall phase design
- `phase-7.md` - Phase overview
- `PHASE_7_STATUS.md` - Status tracking

**Sub-phases:**
- **7.1:** Knowledge Corpus (`phase-7.1-knowledge-corpus.md`)
- **7.2:** Deterministic Chunking (`phase-7.2-deterministic-chunking.md`)
- **7.3:** Bedrock Knowledge Base (`phase-7.3-bedrock-knowledge-base.md`)
- **7.4:** Agent Integration (`phase-7.4-agent-integration.md`)
- **7.5:** Operational Queries (`PHASE_7.5_LOGS_INSIGHTS_QUERIES.md`)

---

### Phase 8: Observability & Validation
**Status:** ✅ Complete

Comprehensive tracing, guardrails, validation framework, and token analytics.

**Key Documents:**
- `PHASE_8_DESIGN.md` - Overall phase design
- `PHASE_8_DESIGN_PLAN.md` - Implementation plan
- `IMPLEMENTATION.md` - Implementation guide
- `VALIDATION.md` - Validation framework

**Sub-phases:**

#### 8.1: Tracing Infrastructure
- `PHASE_8.1_DESIGN.md` - Tracing design
- `PHASE_8.1_TRACING_DESIGN.md` - Detailed tracing architecture
- `PHASE_8.1_IMPLEMENTATION_COMPLETE.md` - Completion marker

#### 8.2: Guardrails
- `PHASE_8.2_DESIGN.md` - Guardrails design
- `PHASE_8.2_GUARDRAILS_DESIGN.md` - Detailed guardrails architecture
- `PHASE_8.2_VALIDATION_GATES.md` - Validation gates
- `PHASE_8.2_DEPLOYMENT_COMPLETE_FINAL.md` - Final deployment status

#### 8.3: Validation Framework
- `PHASE_8.3_DESIGN.md` - Validation design
- `PHASE_8.3_VALIDATION_DESIGN.md` - Detailed validation architecture
- `PHASE_8.3_IMPLEMENTATION_COMPLETE.md` - Completion marker

#### 8.4: Token Analytics
- `PHASE_8.4_DESIGN.md` - Analytics design
- `PHASE_8.4_TOKEN_ANALYTICS_DESIGN.md` - Token analytics architecture
- `PHASE_8.4_COMPLETE.md` - Completion marker

---

## Document Naming Conventions

- `PHASE_X_DESIGN.md` - Main design document for phase X
- `PHASE_X.Y_DESIGN.md` - Design for sub-phase X.Y
- `PHASE_X.Y_IMPLEMENTATION_COMPLETE.md` - Implementation completion marker
- `PHASE_X.Y_DEPLOYMENT_SUCCESS.md` - Deployment completion marker
- `PHASE_X.Y_COMPLETE.md` - Overall sub-phase completion
- `phase-x.md` - Phase overview/summary (lowercase for summaries)
- `phase-x.y-feature.md` - Feature-specific documentation

---

## How to Navigate

1. **Starting a new feature?** Check the relevant phase's `PHASE_X_DESIGN.md` for architecture
2. **Understanding implementation?** Look for `IMPLEMENTATION.md` or `*_IMPLEMENTATION_COMPLETE.md`
3. **Deploying?** Check `*_DEPLOYMENT*.md` files
4. **Troubleshooting?** Look for `*_RUNBOOK.md` or `*_TROUBLESHOOTING.md`
5. **Understanding decisions?** Check phase-6's `decisions/` directory for architectural choices

---

## Related Documentation

- **Architecture:** `docs/architecture/` - System-wide architecture documentation
- **Deployment:** `docs/deployment/` - Deployment guides and status
- **Validation:** `docs/validation/` - Validation audits and gates
- **Agent Contracts:** `docs/AGENT_CONTRACTS.md` - Agent interface specifications
- **Guardrails:** `docs/AGENT_GUARDRAILS.md` - Agent safety mechanisms

---

## Maintenance

This is the **single source of truth** for phase documentation. All phase-related documents must reside within their respective phase directories. Do not create duplicate documentation hierarchies.

**Last Updated:** 2026-01-31
