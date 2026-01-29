# Phase 3: Incident Construction

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-23  
**Version:** 1.0.0

---

## Overview

Phase 3 implements evidence bundling, confidence scoring, promotion gates, and incident lifecycle management.

## Architecture

### Evidence Model

**Evidence Bundle:**
- Deterministic evidence ID (hash of detections + window)
- Detection summaries
- Signal summary (count, severity distribution, time spread)
- Service attribution

**Confidence Scoring:**
Five factors contribute to confidence:
1. Signal count
2. Severity distribution
3. Time spread
4. Rule diversity
5. Historical patterns

### Promotion Gate

**Binary Decision:** Promote to incident or not

**Criteria:**
- Confidence threshold
- Severity requirements
- Service validation
- Authority check

### Incident Lifecycle

**States:**
- PENDING: Awaiting promotion decision
- OPEN: Active incident
- MITIGATING: Mitigation in progress
- RESOLVED: Issue resolved
- CLOSED: Post-mortem complete

## Implementation

### Evidence Builder

- Aggregates detections into evidence bundle
- Computes deterministic evidence ID
- Calculates signal summary
- Validates time windows

### Confidence Calculator

- Evaluates 5 confidence factors
- Normalizes scores (0.0-1.0)
- Weighted combination
- Deterministic calculation

### Promotion Engine

- Evaluates promotion criteria
- Binary promote/reject decision
- Audit trail
- Idempotent

### Incident Manager

- State machine enforcement
- Authority validation
- Transition metadata
- Event emission

## Design Principles

1. **Deterministic evidence IDs** - Replay produces same ID
2. **Order-independent** - Detection order doesn't matter
3. **Fail-closed** - Invalid evidence rejected
4. **Idempotent** - Safe to retry
5. **Auditable** - Complete trace

## Validation

**Test Coverage:** Comprehensive unit and integration tests

**Key Tests:**
- Evidence ID determinism
- Confidence calculation
- Promotion gate logic
- State machine transitions
- Idempotency verification

## Deployment

**Stack:** OpxControlPlaneStack  
**Tables:** Evidence bundles, incidents, promotion decisions

## References

- Logic Complete: `phase-3-logic-complete.md` (consolidated)
- Evidence graph implementation
- Incident lifecycle tests

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready, no changes planned
