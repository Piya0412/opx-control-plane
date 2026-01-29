# Phase 4: Post-Incident Learning

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-24  
**Version:** 1.0.0

---

## Overview

Phase 4 implements post-incident learning through outcome recording, pattern extraction, and confidence calibration.

## Architecture

### Outcome Recording

**Trigger:** CLOSED incidents only

**Data Captured:**
- Incident classification (true positive, false positive, etc.)
- Root cause analysis
- Resolution summary
- Human assessment
- Timing metrics (TTD, TTR)

**Validation Gate:**
- Human-validated feedback required
- Incident must be CLOSED
- Complete classification required
- Authority validation

### Pattern Extraction

**Offline Processing:**
- Analyzes historical outcomes
- Identifies recurring patterns
- Extracts common root causes
- Builds pattern library

**Execution:** Scheduled Lambda (weekly)

### Confidence Calibration

**Purpose:** Adjust confidence scoring based on outcomes

**Process:**
1. Analyze prediction accuracy
2. Calculate calibration factors
3. Update confidence weights
4. Validate improvements

**Execution:** Scheduled Lambda (monthly)

## Implementation

### Outcome Store

**Table:** `opx-outcomes`

**Schema:**
- Outcome ID (deterministic)
- Incident ID
- Classification
- Root cause
- Resolution summary
- Human assessment
- Timing metrics

**Guarantees:**
- Append-only (no updates)
- Idempotent writes
- Complete audit trail

### Pattern Extractor

**Lambda:** `pattern-extraction-handler`

**Process:**
1. Query closed incidents
2. Group by service/severity
3. Extract common patterns
4. Store in pattern library

### Confidence Calibrator

**Lambda:** `calibration-handler`

**Process:**
1. Analyze outcome accuracy
2. Calculate calibration factors
3. Update confidence weights
4. Emit metrics

## Design Principles

1. **Append-only** - No updates to outcomes
2. **Human-validated** - No automated feedback
3. **Offline processing** - No real-time impact
4. **Deterministic** - Replay produces same results
5. **Auditable** - Complete trace

## Validation

**Test Coverage:** Comprehensive unit and integration tests

**Key Tests:**
- Outcome recording validation
- Append-only enforcement
- Pattern extraction logic
- Calibration calculations
- Idempotency verification

## Deployment

**Stack:** OpxControlPlaneStack  
**Tables:** Outcomes, patterns, calibration data  
**Lambdas:** Pattern extractor, calibrator  
**Schedules:** Weekly (patterns), Monthly (calibration)

## References

- Learning guide: `LEARNING_GUIDE.md`
- Learning safety: `LEARNING_SAFETY.md`
- Outcome schema tests
- Calibration tests

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready, no changes planned
