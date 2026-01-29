# Phase 2: Observability & Detection

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-21  
**Version:** 1.0.0

---

## Overview

Phase 2 implements signal ingestion, normalization, detection, and correlation - the observability foundation for incident detection.

## Sub-Phases

### Phase 2.1: Signal Ingestion
- CloudWatch alarm normalization
- Deterministic signal IDs
- Evidence preservation (raw + interpreted)
- Fail-closed validation

### Phase 2.2: Signal Correlation
- Time-window correlation
- Threshold-based detection
- Rule evaluation engine
- Correlation rule schema

### Phase 2.3: Detection & Automation
- Detection engine
- Kill switch mechanism
- Rate limiting
- Failure playbook

## Architecture

### Signal Flow

```
CloudWatch → SNS → Lambda → DynamoDB (signals)
                              ↓
                         Detection Engine
                              ↓
                         EventBridge (fan-out)
```

### Key Components

**Tables:**
- `opx-signals` - Normalized signals
- `opx-detections` - Detection results
- `opx-correlation-rules` - Correlation rules

**Lambdas:**
- Signal ingestor
- Detection engine
- Correlation executor

## Design Principles

1. **Deterministic signal IDs** - Same input → same ID
2. **Evidence preservation** - Raw + interpreted data
3. **Fail-closed** - Invalid signals rejected
4. **Non-invasive** - EventBridge failures don't block ingestion
5. **Complete audit trail** - All signals and detections logged

## Implementation

### Signal Normalization

- Extract service from alarm name
- Extract severity from alarm name
- Compute deterministic signal ID
- Preserve raw CloudWatch data
- Add interpreted metadata

### Detection Rules

- Time-window based correlation
- Configurable thresholds
- Rule versioning
- Deterministic evaluation

### Kill Switch

- Global automation disable
- Per-service disable
- Immediate effect
- Audit trail

## Validation

**Test Coverage:** Comprehensive unit and integration tests

**Key Validations:**
- Signal ID determinism
- Normalization correctness
- Detection rule evaluation
- Correlation threshold logic
- Kill switch effectiveness

## Deployment

**Stack:** OpxControlPlaneStack  
**EventBridge Rules:** Signal routing  
**SNS Topics:** CloudWatch alarm delivery

## References

- Signal Ingestion Design: `PHASE_2.1_SIGNAL_INGESTION_DESIGN.md` (consolidated)
- Correlation Design: `PHASE_2.2_SIGNAL_CORRELATION_DESIGN.md` (consolidated)
- Architecture: `PHASE_2.3_ARCHITECTURE.md` (consolidated)
- Invariants: `PHASE_2_INVARIANTS.md` (consolidated)
- Observability: `PHASE_2_OBSERVABILITY_DESIGN.md` (consolidated)

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready, no changes planned
