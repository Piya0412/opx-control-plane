# Phase 4: Post-Incident Learning - Usage Guide

## Overview

The learning system captures institutional memory from closed incidents. It operates entirely offline with zero impact on live incident management.

## Core Principles

1. **Offline Only** - Learning runs after incidents close
2. **Human Validated** - Only human authorities can record outcomes
3. **Append-Only** - No updates or deletes
4. **Read-Only Insights** - Recommendations don't mutate system

---

## Recording Outcomes

### Prerequisites

- Incident must be in CLOSED state
- Human authority required (HUMAN_OPERATOR, ON_CALL_SRE, EMERGENCY_OVERRIDE)
- All required fields must be provided

### Example

```typescript
import { OutcomeRecorder } from './src/learning';

const recorder = new OutcomeRecorder(
  validationGate,
  outcomeStore,
  incidentStore
);

const result = await recorder.recordOutcome(
  'incident-id-here',
  {
    classification: {
      truePositive: true,
      falsePositive: false,
      rootCause: 'Database connection pool exhausted',
      resolutionType: 'FIXED',
    },
    humanAssessment: {
      confidenceRating: 0.85,
      severityAccuracy: 'ACCURATE',
      detectionQuality: 'GOOD',
    },
  },
  {
    type: 'ON_CALL_SRE',
    principal: 'arn:aws:iam::123456789012:user/sre',
  }
);

console.log(`Outcome recorded: ${result.outcomeId}`);
```

### Fields

**Classification:**
- `truePositive` - Was this a real incident?
- `falsePositive` - Was this a false alarm?
- `rootCause` - What caused the incident? (1-500 chars)
- `resolutionType` - How was it resolved? (FIXED, MITIGATED, FALSE_ALARM, DUPLICATE, OTHER)

**Human Assessment:**
- `confidenceRating` - How confident are you? (0.0-1.0)
- `severityAccuracy` - Was severity correct? (ACCURATE, TOO_HIGH, TOO_LOW)
- `detectionQuality` - How good was detection? (EXCELLENT, GOOD, FAIR, POOR)
- `notes` - Optional notes (max 2000 chars)

---

## Extracting Patterns

### Purpose

Identify common root causes, resolutions, and detection gaps from historical outcomes.

### Example

```typescript
import { PatternExtractor } from './src/learning';

const extractor = new PatternExtractor(
  outcomeStore,
  summaryStore
);

// Extract for single service
const summary = await extractor.extractPatterns(
  'order-service',
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);

console.log(`Total incidents: ${summary.metrics.totalIncidents}`);
console.log(`True positives: ${summary.metrics.truePositives}`);
console.log(`False positives: ${summary.metrics.falsePositives}`);
console.log(`Average TTD: ${summary.metrics.averageTTD}ms`);
console.log(`Average TTR: ${summary.metrics.averageTTR}ms`);

// Common root causes
for (const cause of summary.patterns.commonRootCauses) {
  const percentage = (cause.count / summary.metrics.totalIncidents * 100).toFixed(1);
  console.log(`- ${cause.value}: ${cause.count} (${percentage}%)`);
}

// Detection warnings (services with high FP rate)
for (const warning of summary.patterns.detectionWarnings) {
  console.log(`⚠️  ${warning}`);
}
```

### Scheduling

Pattern extraction should run offline, typically:
- Daily: After midnight
- Weekly: Sunday night
- Monthly: Last day of month

**Cron Example:**
```bash
# Daily pattern extraction at 2 AM
0 2 * * * /path/to/extract-patterns.sh
```

---

## Calibrating Confidence

### Purpose

Compare predicted confidence (from promotion) vs actual outcomes. Identify drift.

### Example

```typescript
import { ConfidenceCalibrator } from './src/learning';

const calibrator = new ConfidenceCalibrator(
  outcomeStore,
  calibrationStore
);

const calibration = await calibrator.calibrateConfidence(
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);

console.log('Drift Analysis:');
console.log(`- Overconfident bands: ${calibration.driftAnalysis.overconfident}`);
console.log(`- Underconfident bands: ${calibration.driftAnalysis.underconfident}`);
console.log(`- Well calibrated bands: ${calibration.driftAnalysis.wellCalibrated}`);
console.log(`- Average drift: ${calibration.driftAnalysis.averageDrift.toFixed(3)}`);

// Recommendations
for (const rec of calibration.recommendations) {
  console.log(`[${rec.severity}] ${rec.recommendation}`);
}
```

### Confidence Bands

- **VERY_LOW:** 0.0 - 0.2
- **LOW:** 0.2 - 0.4
- **MEDIUM:** 0.4 - 0.6
- **HIGH:** 0.6 - 0.8
- **VERY_HIGH:** 0.8 - 1.0

### Drift Interpretation

- **Positive drift:** Underconfident (actual > predicted)
- **Negative drift:** Overconfident (actual < predicted)
- **|drift| < 0.05:** Well calibrated
- **|drift| >= 0.15:** Significant drift (review needed)

---

## Creating Snapshots

### Purpose

Create versioned snapshots of learning data for historical analysis.

### Example

```typescript
import { SnapshotService } from './src/learning';

const service = new SnapshotService(
  outcomeStore,
  summaryStore,
  calibrationStore,
  snapshotStore
);

// Daily snapshot (yesterday)
const daily = await service.createDailySnapshot();

// Weekly snapshot (last week)
const weekly = await service.createWeeklySnapshot();

// Monthly snapshot (last month)
const monthly = await service.createMonthlySnapshot();

// Custom snapshot
const custom = await service.createSnapshot(
  'CUSTOM',
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);

console.log(`Snapshot created: ${custom.snapshotId}`);
console.log(`Total outcomes: ${custom.data.totalOutcomes}`);
console.log(`Services: ${custom.data.services.join(', ')}`);
```

### Scheduling

```bash
# Daily snapshot at 3 AM
0 3 * * * /path/to/create-daily-snapshot.sh

# Weekly snapshot on Sundays at 4 AM
0 4 * * 0 /path/to/create-weekly-snapshot.sh

# Monthly snapshot on 1st of month at 5 AM
0 5 1 * * /path/to/create-monthly-snapshot.sh
```

---

## Querying Learning Data

### List Outcomes

```typescript
const outcomes = await outcomeStore.listOutcomes({
  service: 'order-service',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-31T23:59:59.999Z',
  truePositive: true,
});
```

### List Summaries

```typescript
const summaries = await summaryStore.listSummaries(
  'order-service',
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);
```

### List Calibrations

```typescript
const calibrations = await calibrationStore.listCalibrations(
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);
```

### List Snapshots

```typescript
const snapshots = await snapshotStore.listSnapshots(
  'DAILY',
  '2026-01-01T00:00:00.000Z',
  '2026-01-31T23:59:59.999Z'
);
```

---

## Troubleshooting

### "Outcome can only be recorded for CLOSED incidents"

**Cause:** Incident is not in CLOSED state.

**Solution:** Wait until incident is closed, then record outcome.

### "AUTO_ENGINE cannot validate outcomes"

**Cause:** Attempting to use AUTO_ENGINE authority.

**Solution:** Use human authority (HUMAN_OPERATOR, ON_CALL_SRE, EMERGENCY_OVERRIDE).

### "Root cause is required"

**Cause:** Missing or empty root cause field.

**Solution:** Provide root cause (1-500 characters).

### "Outcome cannot be both true positive and false positive"

**Cause:** Both flags set to true.

**Solution:** Set only one to true.

### Duplicate outcome returns created: false

**Cause:** Outcome already exists for this incident.

**Solution:** This is expected (idempotent). Use existing outcome.

---

## Best Practices

1. **Record outcomes promptly** - Within 24 hours of incident closure
2. **Be specific in root causes** - Detailed descriptions help pattern extraction
3. **Run pattern extraction regularly** - Weekly or monthly
4. **Review calibration drift** - Monthly review recommended
5. **Create snapshots for audits** - Monthly snapshots for compliance
6. **Use read-only insights** - Don't manually modify confidence factors yet

---

## Next Steps

After Phase 4 is operational:
- Phase 5: Automated scheduling
- Phase 6: AI advisory agents (use learning data)
- Phase 7: Confidence factor tuning (based on calibration)

---

**Last Updated:** January 22, 2026  
**Version:** 1.0.0
