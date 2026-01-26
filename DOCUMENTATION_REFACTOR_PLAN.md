# Documentation Refactor Plan

**Date:** January 26, 2026  
**Authority:** Principal Architect  
**Objective:** Eliminate documentation sprawl, enforce phase-gated discipline

---

## Current State

**Root Directory:** 55 markdown files (SPRAWL)  
**Problem:** Unreadable, no phase discipline, no approval gates

---

## Target Structure

```
opx-control-plane/
├── README.md                          # Project overview
├── ARCHITECTURE.md                    # System architecture
├── PLAN.md                           # Phase roadmap
├── NON_GOALS.md                      # Explicit exclusions
│
├── docs/                             # ALL documentation
│   ├── phase-0/                      # Foundation
│   │   └── phase-0.md
│   ├── phase-1/                      # Core incident management
│   │   └── phase-1.md
│   ├── phase-2/                      # Signal ingestion & detection
│   │   ├── phase-2.md
│   │   ├── phase-2.1-signal-ingestion.md
│   │   ├── phase-2.2-correlation.md
│   │   └── phase-2.3-approved-and-locked.md
│   ├── phase-3/                      # Promotion & incident creation
│   │   ├── phase-3.md
│   │   └── phase-3-logic-complete.md
│   ├── phase-4/                      # Learning system
│   │   └── phase-4.md
│   ├── phase-5/                      # Automation
│   │   └── phase-5.md
│   ├── phase-6/                      # AI decision intelligence
│   │   ├── phase-6.md               # AUTHORITATIVE ENTRY POINT
│   │   ├── weeks/                    # Weekly progress
│   │   │   ├── week-1-complete.md
│   │   │   ├── week-1-task-1.md
│   │   │   ├── week-1-task-2.md
│   │   │   ├── week-1-task-3.md
│   │   │   ├── week-2-complete.md
│   │   │   ├── week-2-summary.md
│   │   │   ├── week-2-task-4.2.md
│   │   │   ├── week-2-task-4.3.md
│   │   │   ├── week-2-task-4.4.md
│   │   │   ├── week-3-complete.md
│   │   │   ├── week-3-cdk-synth.md
│   │   │   ├── week-3-final-status.md
│   │   │   ├── week-3-summary.md
│   │   │   ├── week-4-complete.md
│   │   │   ├── week-4-ready.md
│   │   │   ├── week-5-complete.md
│   │   │   ├── week-5-plan.md
│   │   │   ├── week-5-status.md
│   │   │   ├── week-5-task-1-2.md
│   │   │   ├── week-5-task-2b.md
│   │   │   ├── week-5-task-3.md
│   │   │   └── week-5-task-4.md
│   │   ├── decisions/                # Design decisions
│   │   │   ├── architectural-correction-complete.md
│   │   │   ├── architectural-correction-required.md
│   │   │   ├── design-authority-decision.md
│   │   │   ├── isolation-complete.md
│   │   │   ├── isolation-required.md
│   │   │   ├── isolation-strategy.md
│   │   │   ├── langgraph-architecture.md
│   │   │   ├── migration-plan.md
│   │   │   ├── deployment-guide.md
│   │   │   ├── deployment-ready.md
│   │   │   └── status-summary.md
│   │   ├── reports/                  # Progress reports
│   │   │   ├── hygiene-complete.md
│   │   │   ├── hygiene-report.md
│   │   │   ├── final-status.md
│   │   │   ├── cleanup-progress.md
│   │   │   └── cleanup-status.md
│   │   └── integration/              # End-to-end wiring
│   │       ├── end-to-end-flow.md
│   │       ├── end-to-end-validation.md
│   │       └── end-to-end-complete.md
│   ├── phase-7/                      # Knowledge Base / RAG
│   │   ├── phase-7.md               # EXECUTIVE OVERVIEW
│   │   ├── phase-7.1-knowledge-corpus.md
│   │   ├── phase-7.2-deterministic-chunking.md
│   │   ├── phase-7.3-bedrock-knowledge-base.md
│   │   └── phase-7.4-agent-integration.md
│   ├── phase-8/                      # Human review UI
│   │   └── phase-8.md
│   └── phase-9/                      # Automation with approval
│       └── phase-9.md
│
└── archive/                          # Obsolete/session docs
    ├── commit-strategy.md
    ├── deploy-phase-6-now.md
    ├── pre-push-checklist.md
    ├── ready-for-github.md
    ├── session-complete.md
    └── session-status.md
```

---

## Migration Map

### Root → docs/phase-2/
- `PHASE_2.2_CORRELATOR_DEPLOYED.md` → `docs/phase-2/phase-2.2-correlation.md`
- `PHASE_2.3_APPROVED_AND_LOCKED.md` → `docs/phase-2/phase-2.3-approved-and-locked.md`

### Root → docs/phase-3/
- `PHASE_3_LOGIC_COMPLETE.md` → `docs/phase-3/phase-3-logic-complete.md`

### Root → docs/phase-6/
- `PHASE_6_DESIGN.md` → `docs/phase-6/phase-6.md` (AUTHORITATIVE)

### Root → docs/phase-6/weeks/
- `PHASE_6_WEEK_1_COMPLETE.md` → `docs/phase-6/weeks/week-1-complete.md`
- `PHASE_6_WEEK_1_TASK_1_COMPLETE.md` → `docs/phase-6/weeks/week-1-task-1.md`
- `PHASE_6_WEEK_1_TASK_2_COMPLETE.md` → `docs/phase-6/weeks/week-1-task-2.md`
- `PHASE_6_WEEK_1_TASK_3_COMPLETE.md` → `docs/phase-6/weeks/week-1-task-3.md`
- `PHASE_6_WEEK_2_COMPLETE.md` → `docs/phase-6/weeks/week-2-complete.md`
- `PHASE_6_WEEK_2_IMPLEMENTATION_SUMMARY.md` → `docs/phase-6/weeks/week-2-summary.md`
- `PHASE_6_WEEK_2_TASK_4.2_COMPLETE.md` → `docs/phase-6/weeks/week-2-task-4.2.md`
- `PHASE_6_WEEK_2_TASK_4.3_COMPLETE.md` → `docs/phase-6/weeks/week-2-task-4.3.md`
- `PHASE_6_WEEK_2_TASK_4.4_COMPLETE.md` → `docs/phase-6/weeks/week-2-task-4.4.md`
- `PHASE_6_WEEK_3_COMPLETE.md` → `docs/phase-6/weeks/week-3-complete.md`
- `PHASE_6_WEEK_3_CDK_SYNTH_SUCCESS.md` → `docs/phase-6/weeks/week-3-cdk-synth.md`
- `PHASE_6_WEEK_3_FINAL_STATUS.md` → `docs/phase-6/weeks/week-3-final-status.md`
- `PHASE_6_WEEK_3_IMPLEMENTATION_SUMMARY.md` → `docs/phase-6/weeks/week-3-summary.md`
- `PHASE_6_WEEK_4_COMPLETE.md` → `docs/phase-6/weeks/week-4-complete.md`
- `PHASE_6_WEEK_4_READY.md` → `docs/phase-6/weeks/week-4-ready.md`
- `PHASE_6_WEEK_5_COMPLETE.md` → `docs/phase-6/weeks/week-5-complete.md`
- `PHASE_6_WEEK_5_IMPLEMENTATION_PLAN.md` → `docs/phase-6/weeks/week-5-plan.md`
- `PHASE_6_WEEK_5_STATUS.md` → `docs/phase-6/weeks/week-5-status.md`
- `PHASE_6_WEEK_5_TASK_1_2_COMPLETE.md` → `docs/phase-6/weeks/week-5-task-1-2.md`
- `PHASE_6_WEEK_5_TASK_2B_COMPLETE.md` → `docs/phase-6/weeks/week-5-task-2b.md`
- `PHASE_6_WEEK_5_TASK_3_COMPLETE.md` → `docs/phase-6/weeks/week-5-task-3.md`
- `PHASE_6_WEEK_5_TASK_4_COMPLETE.md` → `docs/phase-6/weeks/week-5-task-4.md`

### Root → docs/phase-6/decisions/
- `ARCHITECTURAL_CORRECTION_COMPLETE.md` → `docs/phase-6/decisions/architectural-correction-complete.md`
- `ARCHITECTURAL_CORRECTION_REQUIRED.md` → `docs/phase-6/decisions/architectural-correction-required.md`
- `DESIGN_AUTHORITY_DECISION.md` → `docs/phase-6/decisions/design-authority-decision.md`
- `PHASE_6_ISOLATION_COMPLETE.md` → `docs/phase-6/decisions/isolation-complete.md`
- `PHASE_6_ISOLATION_REQUIRED.md` → `docs/phase-6/decisions/isolation-required.md`
- `PHASE_6_ISOLATION_STRATEGY.md` → `docs/phase-6/decisions/isolation-strategy.md`
- `PHASE_6_LANGGRAPH_ARCHITECTURE.md` → `docs/phase-6/decisions/langgraph-architecture.md`
- `PHASE_6_MIGRATION_PLAN.md` → `docs/phase-6/decisions/migration-plan.md`
- `PHASE_6_DEPLOYMENT_GUIDE.md` → `docs/phase-6/decisions/deployment-guide.md`
- `PHASE_6_DEPLOYMENT_READY.md` → `docs/phase-6/decisions/deployment-ready.md`
- `PHASE_6_STATUS_SUMMARY.md` → `docs/phase-6/decisions/status-summary.md`

### Root → docs/phase-6/reports/
- `PHASE_6_HYGIENE_COMPLETE.md` → `docs/phase-6/reports/hygiene-complete.md`
- `PHASE_6_HYGIENE_REPORT.md` → `docs/phase-6/reports/hygiene-report.md`
- `PHASE_6_FINAL_STATUS.md` → `docs/phase-6/reports/final-status.md`
- `CLEANUP_PROGRESS_REPORT.md` → `docs/phase-6/reports/cleanup-progress.md`
- `CLEANUP_STATUS.md` → `docs/phase-6/reports/cleanup-status.md`

### Root → docs/phase-6/integration/
- `END_TO_END_FLOW.md` → `docs/phase-6/integration/end-to-end-flow.md`
- `END_TO_END_VALIDATION_CHECKLIST.md` → `docs/phase-6/integration/end-to-end-validation.md`
- `END_TO_END_WIRING_COMPLETE.md` → `docs/phase-6/integration/end-to-end-complete.md`

### Root → archive/
- `COMMIT_STRATEGY.md` → `archive/commit-strategy.md`
- `DEPLOY_PHASE_6_NOW.md` → `archive/deploy-phase-6-now.md`
- `PRE_PUSH_CHECKLIST.md` → `archive/pre-push-checklist.md`
- `READY_FOR_GITHUB.md` → `archive/ready-for-github.md`
- `SESSION_COMPLETE.md` → `archive/session-complete.md`
- `SESSION_STATUS.md` → `archive/session-status.md`

### Remain in Root
- `README.md` ✅
- `ARCHITECTURE.md` ✅
- `PLAN.md` ✅
- `NON_GOALS.md` ✅

---

## Execution Steps

1. Create directory structure
2. Move Phase 6 files
3. Create Phase 7 files
4. Update cross-references
5. Delete old files from root
6. Verify structure

---

**Status:** READY FOR EXECUTION  
**Next:** Execute migration script
