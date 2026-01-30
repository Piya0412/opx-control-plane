# Phase 4: Post-Incident Learning

**Status:** ✅ COMPLETE  
**Completion Date:** 2026-01-24  
**Version:** 1.0.0

---

## Overview

Phase 4 implements post-incident learning through outcome recording, pattern extraction, and confidence calibration - enabling the system to learn from past incidents and improve over time.

## Architecture

### Outcome Recording

**Trigger:** CLOSED incidents only

**Data Captured:**
```typescript
interface IncidentOutcome {
  outcomeId: string;            // Deterministic
  incidentId: string;
  classification: OutcomeClassification;
  rootCause: string;
  resolutionSummary: string;
  humanAssessment: HumanFeedback;
  metrics: {
    timeToDetect: number;       // seconds
    timeToResolve: number;      // seconds
    falsePositiveRate: number;
  };
  createdAt: string;
  authority: AuthorityContext;
}
```

**Outcome Classifications:**
- `TRUE_POSITIVE` - Real incident, correctly detected
- `FALSE_POSITIVE` - Not an incident, incorrectly promoted
- `TRUE_NEGATIVE` - Correctly not promoted
- `FALSE_NEGATIVE` - Missed incident

**Validation Gate:**
- Human-validated feedback required
- Incident must be CLOSED
- Complete classification required
- Authority validation

### Pattern Extraction

**Purpose:** Identify recurring patterns from historical outcomes

**Offline Processing:**
- Analyzes historical outcomes
- Identifies recurring patterns
- Extracts common root causes
- Builds pattern library

**Execution:** Scheduled Lambda (weekly)

**Pattern Schema:**
```typescript
interface IncidentPattern {
  patternId: string;
  name: string;
  description: string;
  frequency: number;            // occurrences
  commonSignals: string[];      // signal patterns
  commonServices: string[];
  commonRootCauses: string[];
  averageConfidence: number;
  successRate: number;          // % true positives
  lastSeen: string;
}
```

**Pattern Matching:**
- Signal similarity analysis
- Service correlation
- Temporal patterns
- Severity patterns

### Confidence Calibration

**Purpose:** Adjust confidence scoring based on outcomes

**Process:**
1. Analyze prediction accuracy
2. Calculate calibration factors
3. Update confidence weights
4. Validate improvements

**Calibration Factors:**
```typescript
interface CalibrationFactors {
  signalCountWeight: number;    // 0-0.3
  severityWeight: number;       // 0-0.25
  timeSpreadWeight: number;     // 0-0.2
  diversityWeight: number;      // 0-0.15
  historicalWeight: number;     // 0-0.1
  lastUpdated: string;
  accuracy: number;             // validation metric
}
```

**Calibration Algorithm:**
1. Collect outcomes from last 30 days
2. Calculate actual vs predicted confidence
3. Adjust weights to minimize error
4. Validate on holdout set
5. Deploy if improvement > 5%

**Validation:**
- Holdout set (20% of data)
- Accuracy improvement required
- No degradation in precision/recall
- Human review before deployment

### Resolution Summary

**Purpose:** Capture structured resolution information

**Schema:**
```typescript
interface ResolutionSummary {
  summaryId: string;
  incidentId: string;
  rootCause: string;
  mitigationSteps: string[];
  preventionMeasures: string[];
  lessonsLearned: string[];
  relatedIncidents: string[];   // similar past incidents
  createdAt: string;
  createdBy: string;
}
```

**Usage:**
- Knowledge base enrichment
- Pattern extraction input
- Runbook generation
- Training data for agents

## Implementation

### Outcome Recorder

**Purpose:** Capture and validate incident outcomes

**Process:**
1. Validate incident is CLOSED
2. Collect human feedback
3. Calculate metrics (TTD, TTR)
4. Validate classification
5. Store outcome record
6. Emit outcome event

**Guarantees:**
- Human validation required
- Complete data capture
- Authority validation
- Audit trail

### Pattern Extractor

**Purpose:** Identify recurring patterns

**Process:**
1. Query outcomes from last 90 days
2. Group by similarity
3. Extract common features
4. Calculate pattern metrics
5. Store pattern library
6. Update pattern index

**Execution:** Weekly Lambda (Sunday 00:00 UTC)

**Guarantees:**
- Deterministic pattern extraction
- Reproducible results
- Complete audit trail

### Confidence Calibrator

**Purpose:** Optimize confidence scoring

**Process:**
1. Collect outcomes from last 30 days
2. Calculate prediction errors
3. Optimize weights using gradient descent
4. Validate on holdout set
5. Deploy if improvement validated
6. Audit calibration changes

**Execution:** Monthly Lambda (1st of month, 00:00 UTC)

**Guarantees:**
- No degradation in accuracy
- Human review required
- Rollback capability
- Complete audit trail

## Data Flow

```
Incident CLOSED
    ↓
Human Feedback
    ↓
Outcome Recorder
    ↓
opx-outcomes (DynamoDB)
    ↓
    ├─→ Pattern Extractor (weekly)
    │   └─→ opx-patterns (DynamoDB)
    │
    └─→ Confidence Calibrator (monthly)
        └─→ opx-calibration (DynamoDB)
```

## Tables

### opx-outcomes
- Partition key: `outcomeId`
- GSI: `incidentId-index`
- GSI: `classification-createdAt-index`
- TTL: None (permanent record)

### opx-patterns
- Partition key: `patternId`
- GSI: `frequency-index`
- GSI: `lastSeen-index`
- TTL: None

### opx-calibration
- Partition key: `calibrationId`
- Sort key: `version`
- GSI: `active-index`
- TTL: None

### opx-resolution-summaries
- Partition key: `summaryId`
- GSI: `incidentId-index`
- TTL: None

## Observability

### Metrics
- Outcome recording rate
- Pattern extraction duration
- Calibration accuracy improvement
- False positive rate
- False negative rate

### Alarms
- High false positive rate (>10%)
- Calibration degradation
- Pattern extraction failures
- Outcome recording failures

### Dashboards
- Learning Operations Dashboard
- Calibration Performance
- Pattern Library Status

## Testing

### Unit Tests
- Outcome recording: 25 tests
- Pattern extraction: 30 tests
- Confidence calibration: 35 tests
- Resolution summaries: 15 tests

### Integration Tests
- End-to-end learning flow: 15 tests
- Calibration pipeline: 10 tests
- Pattern matching: 12 tests

## Deployment

**Stack:** OpxLearningStack  
**Region:** us-east-1  
**Status:** DEPLOYED

**Resources:**
- 4 DynamoDB tables
- 3 Lambda functions (outcome recorder, pattern extractor, calibrator)
- EventBridge schedules
- CloudWatch dashboards

## Cost

**Monthly:** ~$30-50
- DynamoDB: $20-30
- Lambda: $5-10
- CloudWatch: $5-10

## Security

- Human validation required for outcomes
- Authority context on all operations
- Audit trail for calibration changes
- IAM-only access

---

**Last Updated:** 2026-01-31
