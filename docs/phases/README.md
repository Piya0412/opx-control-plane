# OPX Control Plane - Phase Documentation

This directory contains the **canonical documentation** for all development phases of the OPX Control Plane project. Each phase represents a major milestone in the system's evolution.

## Documentation Structure

Each phase contains a small, well-defined set of authoritative documents:

- **DESIGN.md** - Complete architecture, implementation, and technical details
- **STATUS.md** - Current status, completion summary, and known limitations (where applicable)
- **RUNBOOK.md** - Operational procedures and troubleshooting (where applicable)
- **IMPLEMENTATION.md** - Implementation-specific details (Phase 8 only)
- **VALIDATION.md** - Validation gates and test results (Phase 8 only)

## Phase Overview

### Phase 1: Foundation & Core Architecture
**Status:** ✅ COMPLETE | **Completion:** 2026-01-15

Core domain models, incident management, and foundational architecture.

**Documents:**
- `DESIGN.md` - Complete architecture and implementation
- `STATUS.md` - Completion summary and design freeze

**Key Features:**
- Deterministic incident state machine
- Event sourcing with DynamoDB
- Permanent idempotency
- IAM-only security

---

### Phase 2: Signal Ingestion & Correlation
**Status:** ✅ COMPLETE | **Completion:** 2026-01-21

Signal normalization, correlation engine, and detection rules.

**Documents:**
- `DESIGN.md` - Complete architecture covering all sub-phases (2.1, 2.2, 2.3)
- `RUNBOOK.md` - Operational procedures and troubleshooting

**Key Features:**
- Deterministic signal IDs
- Time-window correlation
- Kill switch mechanism
- Rate limiting

---

### Phase 3: Candidate Generation & Evidence
**Status:** ✅ COMPLETE | **Completion:** 2026-01-23

Candidate generation, evidence bundling, and graph construction.

**Documents:**
- `DESIGN.md` - Complete architecture and implementation

**Key Features:**
- Evidence bundling with confidence scoring
- Promotion gate with policy evaluation
- Incident lifecycle management
- Deterministic evidence IDs

---

### Phase 4: Promotion & Authority
**Status:** ✅ COMPLETE | **Completion:** 2026-01-24

Outcome recording, confidence calibration, and pattern extraction.

**Documents:**
- `DESIGN.md` - Complete architecture and implementation

**Key Features:**
- Post-incident learning
- Pattern extraction (weekly)
- Confidence calibration (monthly)
- Resolution summaries

---

### Phase 5: Learning & Calibration
**Status:** ✅ COMPLETE | **Completion:** 2026-01-24

Automation infrastructure with safety controls.

**Documents:**
- `DESIGN.md` - Complete architecture and implementation

**Key Features:**
- Automation audit trail
- Kill switch (global, service, action)
- Rate limiting with token bucket
- Retry logic with circuit breaker

---

### Phase 6: Agent Orchestration (LangGraph)
**Status:** ✅ COMPLETE | **Completion:** 2026-01-26

Multi-agent orchestration using LangGraph with Bedrock agents.

**Documents:**
- `DESIGN.md` - Complete architecture and implementation

**Key Features:**
- 6 Bedrock agents (Signal Intelligence, Historical Pattern, Change Intelligence, Risk & Blast Radius, Knowledge RAG, Response Strategy)
- LangGraph orchestration with parallel execution
- Deterministic replay via checkpointing
- Cost guardian with budget enforcement

---

### Phase 7: Knowledge Base & RAG
**Status:** ✅ COMPLETE (7.1-7.4) | **Completion:** 2026-01-27

Bedrock Knowledge Base with deterministic chunking and RAG integration.

**Documents:**
- `DESIGN.md` - Complete architecture covering all sub-phases (7.1-7.4)

**Key Features:**
- Deterministic document chunking (500 tokens, 10% overlap)
- OpenSearch Serverless with semantic search
- Bedrock Knowledge Base integration
- RAG agent with citation formatting

**Sub-phases:**
- 7.1: Knowledge Corpus Foundation
- 7.2: Deterministic Chunking
- 7.3: Bedrock Knowledge Base
- 7.4: RAG Integration
- 7.5: Operational Queries (deferred)

---

### Phase 8: Observability & Validation
**Status:** ✅ COMPLETE (8.1-8.4) | **Completion:** 2026-01-29

Comprehensive tracing, guardrails, validation framework, and token analytics.

**Documents:**
- `DESIGN.md` - Complete architecture covering all sub-phases (8.1-8.4)
- `IMPLEMENTATION.md` - Implementation details and file inventory
- `VALIDATION.md` - Validation gates and test results

**Key Features:**
- Prompt/response tracing with PII redaction (8.1)
- Bedrock Guardrails with PII blocking (8.2)
- 3-layer output validation with retry (8.3)
- Token analytics and cost tracking (8.4)

**Sub-phases:**
- 8.1: Prompt & Response Tracing
- 8.2: Guardrails
- 8.3: Output Validation
- 8.4: Token Analytics

---

## How to Navigate

1. **Understanding a phase?** Start with `DESIGN.md` for complete architecture
2. **Operating the system?** Check `RUNBOOK.md` for procedures (Phase 2)
3. **Checking status?** See `STATUS.md` for completion summary (Phase 1)
4. **Validating Phase 8?** Review `VALIDATION.md` for test gates

## Document Consolidation

This documentation structure represents a **complete consolidation** from 125+ files to 13 canonical documents. All intermediate checkpoints, approval markers, and status files have been merged into the authoritative documents above.

**Removed:**
- Step-level files (PHASE_X.Y_*)
- Status markers (*_COMPLETE.md, *_APPROVED.md, *_READY.md)
- Correction files (*_CORRECTIONS_APPLIED.md)
- Checkpoint files (*_MORNING_COMPLETE.md, *_ADJUSTMENTS_APPLIED.md)
- Weekly tracking (Phase 6 weeks/)
- Decision logs (Phase 6 decisions/)
- Integration reports (Phase 6 integration/)
- Status reports (Phase 6 reports/)

**Retained:**
- All technical content merged into DESIGN.md
- All operational procedures in RUNBOOK.md
- All validation results in VALIDATION.md
- All implementation details in IMPLEMENTATION.md

## Related Documentation

- **Architecture:** `docs/architecture/` - System-wide architecture documentation
- **Deployment:** `docs/deployment/` - Deployment guides and status
- **Validation:** `docs/validation/` - Validation audits and gates
- **Agent Contracts:** `docs/AGENT_CONTRACTS.md` - Agent interface specifications
- **Guardrails:** `docs/AGENT_GUARDRAILS.md` - Agent safety mechanisms

---

## Maintenance

This is the **single source of truth** for phase documentation. All phase-related documents must reside within their respective phase directories using the canonical naming convention.

**Canonical Documents:**
- `DESIGN.md` - Required for all phases
- `STATUS.md` - Optional, for completion summaries
- `RUNBOOK.md` - Optional, for operational procedures
- `IMPLEMENTATION.md` - Optional, for implementation details
- `VALIDATION.md` - Optional, for validation results

**Do not create:**
- Step-level files (PHASE_X.Y_*)
- Status markers (*_COMPLETE.md, *_APPROVED.md)
- Checkpoint files (*_CHECKPOINT.md, *_PROGRESS.md)
- Duplicate subdirectories (weeks/, decisions/, reports/)

---

**Last Updated:** 2026-01-31  
**Consolidation:** 125 files → 13 canonical documents  
**Reduction:** 89.6%
