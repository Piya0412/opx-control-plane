# Phase 1: Incident Control Plane

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-15  
**Version:** 1.0.0

---

## Overview

Phase 1 establishes the foundational incident control plane - a deterministic, auditable, and replayable system for managing incident lifecycle state.

## Design Principles

1. **Fail-closed by default** - Safety over convenience
2. **Deterministic behavior** - Replay must produce identical results
3. **EventBridge is fan-out only** - DynamoDB event store is source of truth
4. **No AI/heuristics in control plane** - Pure state machine logic
5. **IAM-only security** - No API keys, SigV4 everywhere
6. **Permanent idempotency** - No TTL on idempotency keys

## Architecture

### Core Components

**DynamoDB Tables:**
- `opx-incidents` - Current incident state (single-table design)
- `opx-incident-events` - Event store (authoritative, append-only)
- `opx-idempotency` - Permanent idempotency keys (no TTL)

**State Machine:**
- 7 states: PENDING, OPEN, MITIGATING, RESOLVED, CLOSED, CANCELLED, ARCHIVED
- Deterministic transitions with authority validation
- Complete audit trail

**Security:**
- IAM-only authentication
- SigV4 request signing
- No API keys or secrets

## Implementation

### State Machine States

```
PENDING → OPEN → MITIGATING → RESOLVED → CLOSED
          ↓                      ↓
      CANCELLED              ARCHIVED
```

### Key Invariants

- Events are immutable once written
- State transitions require appropriate authority
- All actions are auditable
- Replay produces identical results
- No data loss on failure

## Validation

**Test Coverage:** 71 tests passing

**Key Tests:**
- State transition validation
- Authority checking
- Idempotency verification
- Replay determinism
- Audit trail completeness

## Deployment

**Stack:** OpxControlPlaneStack  
**Region:** us-east-1  
**Tables:** 3 DynamoDB tables with on-demand billing

## References

- Implementation Lock: See `PHASE_1_IMPLEMENTATION_LOCK.md` (archived)
- Original design documents consolidated into this file

---

**Last Updated:** 2026-01-29  
**Status:** Production-ready, no changes planned
