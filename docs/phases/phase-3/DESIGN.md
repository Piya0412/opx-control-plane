# Phase 3: Incident Construction

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-23  
**Version:** 1.0.0

---

## Overview

Phase 3 implements evidence bundling, confidence scoring, promotion gates, and incident lifecycle management - transforming correlated signals into actionable incidents.

## Architecture

### Evidence Model

**Evidence Bundle:**
```typescript
interface EvidenceBundle {
  evidenceId: string;           // Deterministic hash
  detectionIds: string[];       // Source detections
  signalSummary: {
    count: number;
    severityDistribution: Record<Severity, number>;
    timeSpread: number;         // seconds
    services: string[];
  };
  confidence: ConfidenceScore;
  createdAt: string;
}
```

**Evidence ID Generation:**
```typescript
evidenceId = hash(
  sorted(detectionIds),
  timeWindow
)
```

### Confidence Scoring

Five factors contribute to confidence (0.0-1.0):

1. **Signal Count** (0-0.3)
   - More signals → higher confidence
   - Threshold: 5+ signals = max score

2. **Severity Distribution** (0-0.25)
   - SEV1/SEV2 signals weighted higher
   - Mixed severity reduces confidence

3. **Time Spread** (0-0.2)
   - Signals clustered in time → higher confidence
   - Spread over hours → lower confidence

4. **Rule Diversity** (0-0.15)
   - Multiple correlation rules → higher confidence
   - Single rule → lower confidence

5. **Historical Patterns** (0-0.1)
   - Similar past incidents → higher confidence
   - Novel patterns → lower confidence

**Formula:**
```
confidence = min(1.0, 
  signalScore + 
  severityScore + 
  timeScore + 
  diversityScore + 
  historicalScore
)
```

### Promotion Gate

**Binary Decision:** Promote to incident or not

**Criteria:**
```typescript
interface PromotionCriteria {
  minConfidence: number;        // e.g., 0.7
  minSeverity: Severity;        // e.g., SEV2
  requiresService: boolean;     // Must have service attribution
  requiresAuthority: boolean;   // Must have authority context
}
```

**Promotion Logic:**
1. Evaluate confidence score
2. Check severity threshold
3. Validate service attribution
4. Verify authority context
5. Apply promotion policy
6. Create incident if all criteria met

**Promotion Decision:**
```typescript
interface PromotionDecision {
  evidenceId: string;
  decision: 'PROMOTE' | 'REJECT';
  confidence: number;
  reason: string;
  criteria: PromotionCriteria;
  timestamp: string;
  authority: AuthorityContext;
}
```

### Incident Lifecycle

**States:**
```
PENDING → OPEN → MITIGATING → RESOLVED → CLOSED
         ↓
      CANCELLED
```

**State Descriptions:**
- **PENDING:** Awaiting promotion decision
- **OPEN:** Active incident, investigation in progress
- **MITIGATING:** Mitigation actions being taken
- **RESOLVED:** Issue resolved, awaiting post-mortem
- **CLOSED:** Post-mortem complete, incident archived
- **CANCELLED:** False positive, no action needed

**Transitions:**
- All transitions require authority validation
- State changes are audited
- Deterministic state machine

## Implementation

### Evidence Builder

**Purpose:** Construct evidence bundles from detections

**Process:**
1. Collect detections in time window
2. Extract signal summaries
3. Calculate confidence score
4. Generate deterministic evidence ID
5. Store evidence bundle

**Guarantees:**
- Deterministic evidence IDs
- Complete signal preservation
- Confidence score reproducibility

### Promotion Engine

**Purpose:** Evaluate evidence and decide promotion

**Process:**
1. Load promotion policy
2. Evaluate evidence against criteria
3. Calculate confidence score
4. Make promotion decision
5. Audit decision
6. Create incident if promoted

**Guarantees:**
- Deterministic decisions
- Complete audit trail
- Authority validation

### Incident Manager

**Purpose:** Manage incident lifecycle

**Process:**
1. Create incident from promoted evidence
2. Validate state transitions
3. Enforce authority requirements
4. Emit lifecycle events
5. Maintain audit trail

**Guarantees:**
- Deterministic state machine
- Authority validation
- Complete audit trail

## Schema Contracts

### Incident Schema

```typescript
interface Incident {
  incidentId: string;           // Deterministic
  state: IncidentState;
  severity: Severity;
  service: string;
  title: string;
  description: string;
  evidenceId: string;           // Link to evidence
  confidence: number;
  createdAt: string;
  updatedAt: string;
  authority: AuthorityContext;
  metadata: IncidentMetadata;
}
```

### Authority Context

```typescript
interface AuthorityContext {
  actor: string;                // Who made the decision
  actorType: 'HUMAN' | 'SYSTEM';
  reason: string;
  timestamp: string;
  source: string;               // Where decision came from
}
```

## Invariants

### Evidence Determinism
Same detections + same window → same evidence ID

### Promotion Determinism
Same evidence + same policy → same decision

### State Machine Integrity
- No invalid transitions
- All transitions audited
- Authority required for all changes

### Idempotency
- Duplicate evidence bundles rejected
- Duplicate promotion decisions rejected
- Duplicate incidents rejected

## Testing

### Unit Tests
- Evidence building: 40 tests
- Confidence scoring: 30 tests
- Promotion logic: 50 tests
- State machine: 45 tests

### Integration Tests
- End-to-end evidence flow: 20 tests
- Promotion pipeline: 15 tests
- Incident lifecycle: 25 tests

### Test Coverage
- Evidence builder: 100%
- Promotion engine: 100%
- Incident manager: 100%

## Deployment

**Stack:** OpxIncidentConstructionStack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 4 DynamoDB tables
- 3 Lambda functions
- EventBridge rules
- IAM roles

## Cost

**Monthly:** ~$40-60
- DynamoDB: $25-35
- Lambda: $10-15
- EventBridge: $5-10

## Status

**Logic:** ✅ 100% COMPLETE  
**Infrastructure:** ✅ DEPLOYED  
**Tests:** ✅ ALL PASSING

**Known Limitations:** None

---

**Last Updated:** 2026-01-31
