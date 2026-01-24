# Phase 2.1: Signal Event Ingestion — Implementation Plan

**Version:** 2.0.0 (Corrected)  
**Date:** 2026-01-17  
**Status:** 🔲 AWAITING RE-APPROVAL

---

## 🔴 Mandatory Corrections Applied

### CORRECTION 1: TTL Removed ✅
- **Problem:** TTL enabled on `opx-signals` violates replay integrity
- **Fix:** No TTL in Phase 2.1 - signals kept indefinitely
- **Rationale:** Required for replay verification and historical correlation
- **Future:** Manual archival/compaction tooling may be added in Phase 4+

### CORRECTION 2: SignalId Uses Identity Window ✅
- **Problem:** Raw timestamp in signalId makes duplicate detection unreliable
- **Fix:** Split time into `observedAt` (actual) and `identityWindow` (rounded bucket)
- **Rationale:** Same alarm → same signalId, even with slight timing variations
- **Benefit:** Reliable deduplication, correlation stability, replay fidelity

### CORRECTION 3: CorrelationWindow Removed ✅
- **Problem:** `correlationWindow` field leaked Phase 2.2 logic into Phase 2.1
- **Fix:** Removed from SignalEvent schema
- **Rationale:** Signals should be pure observations, correlation belongs to Phase 2.2
- **Philosophy:** "If it feels clever, it's wrong"

### CORRECTION 4: EventBridge Emission Best-Effort ✅
- **Problem:** EventBridge failure could block signal ingestion
- **Fix:** EventBridge emission is non-blocking, failures logged as warnings
- **Rationale:** Signal storage (DynamoDB) is source of truth, not EventBridge
- **Benefit:** Phase 2.1 cannot accidentally impact Phase 1 reliability

---

## 🎯 Goal

Create truthful, normalized observation records — nothing more.

**This Lambda should feel boring. If it feels clever, it's wrong.**

---

## 📋 Scope

### What This Phase Delivers

1. `SignalEvent` schema (TypeScript + Zod)
2. DynamoDB table: `opx-signals`
3. Lambda: `opx-signal-ingestor`
4. Unit tests (comprehensive)
5. Integration tests (basic)

### What This Phase Does NOT Deliver

- ❌ No correlation logic
- ❌ No decision-making
- ❌ No thresholds
- ❌ No calls to CP-5/6/7/8
- ❌ No intelligence

---

## 🔒 Invariant Compliance

| Invariant | Compliance |
|-----------|------------|
| INV-P2.1: Read-only w.r.t. incidents | ✅ Only writes to `opx-signals` |
| INV-P2.2: Candidates only | ✅ No candidate creation in this phase |
| INV-P2.3: No CP-7 calls | ✅ No CP-7 imports |
| INV-P2.4: Deterministic | ✅ Deterministic signalId generation |
| INV-P2.5: Non-blocking | ✅ Async processing, Phase 1 unaffected |

---

## 📐 Schema Design

### SignalEvent Schema

```typescript
import { z } from 'zod';

/**
 * Signal sources
 */
export const SignalSourceSchema = z.enum([
  'CLOUDWATCH_ALARM',
  'CLOUDWATCH_METRIC',
  'CLOUDWATCH_LOGS',
  'CUSTOM_API',
  'EVENTBRIDGE',
]);

export type SignalSource = z.infer<typeof SignalSourceSchema>;

/**
 * Signal types
 */
export const SignalTypeSchema = z.enum([
  'ALARM_STATE_CHANGE',
  'METRIC_BREACH',
  'LOG_PATTERN_MATCH',
  'CUSTOM_EVENT',
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Severity levels (aligned with Incident severity)
 */
export const SignalSeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);

export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/**
 * Signal metadata (flexible, source-specific)
 */
export const SignalMetadataSchema = z.record(z.unknown()).optional();

/**
 * SignalEvent - Normalized observation record
 */
export const SignalEventSchema = z.object({
  // Identity
  signalId: z.string().length(64), // SHA-256 hash (deterministic)
  
  // Source information
  source: SignalSourceSchema,
  signalType: SignalTypeSchema,
  
  // Service context
  service: z.string().min(1).max(256),
  severity: SignalSeveritySchema,
  
  // Temporal
  observedAt: z.string().datetime(), // ISO 8601 - When signal actually happened
  identityWindow: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/), // Rounded time bucket (e.g., 2026-01-17T10:00Z)
  
  // Source-specific metadata
  metadata: SignalMetadataSchema,
  
  // Audit
  ingestedAt: z.string().datetime(), // When system saw it
});

export type SignalEvent = z.infer<typeof SignalEventSchema>;
```

### SignalId Generation (Deterministic)

```typescript
/**
 * Compute deterministic signalId based on semantic identity
 * 
 * INV-P2.4: Must be deterministic and replayable
 * 
 * CORRECTION 2: Uses identityWindow (rounded time bucket) instead of raw timestamp
 * This ensures same alarm/event generates same signalId even with slight timing variations
 */
export function computeSignalId(
  source: SignalSource,
  signalType: SignalType,
  service: string,
  severity: SignalSeverity,
  identityWindow: string,
  metadata: Record<string, unknown>
): string {
  const input = {
    source,
    signalType,
    service,
    severity,
    identityWindow, // Rounded time bucket, NOT raw timestamp
    // Normalize metadata for determinism
    metadata: JSON.stringify(metadata, Object.keys(metadata).sort()),
  };
  
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
  
  return hash;
}

/**
 * Round timestamp to identity window (1-minute buckets)
 * 
 * Example: 2026-01-17T10:23:47.123Z → 2026-01-17T10:23Z
 */
export function computeIdentityWindow(observedAt: string): string {
  const date = new Date(observedAt);
  date.setSeconds(0, 0); // Zero out seconds and milliseconds
  return date.toISOString().slice(0, 17) + 'Z'; // Format: YYYY-MM-DDTHH:MMZ
}
```

**Rationale:**
- **Semantic identity:** Same alarm/event → same signalId
- **Deduplication:** Slight timing variations don't create duplicates
- **Replay stability:** Replaying same events produces same signalIds
- **Correlation correctness:** Related signals have stable identities

**Why identityWindow instead of raw timestamp:**
- Same alarm firing at 10:23:45 and 10:23:47 → Same signalId
- Prevents duplicate signals from being treated as unique
- Enables reliable idempotency
- Supports accurate correlation

---

## 🗄️ DynamoDB Table Design

### Table: `opx-signals`

```typescript
{
  TableName: 'opx-signals',
  BillingMode: 'PAY_PER_REQUEST',
  
  AttributeDefinitions: [
    { AttributeName: 'signalId', AttributeType: 'S' },      // PK
    { AttributeName: 'service', AttributeType: 'S' },       // GSI1 PK
    { AttributeName: 'observedAt', AttributeType: 'S' },    // GSI1 SK
    { AttributeName: 'severity', AttributeType: 'S' },      // GSI2 PK
  ],
  
  KeySchema: [
    { AttributeName: 'signalId', KeyType: 'HASH' },
  ],
  
  GlobalSecondaryIndexes: [
    {
      IndexName: 'ServiceObservedAtIndex',
      KeySchema: [
        { AttributeName: 'service', KeyType: 'HASH' },
        { AttributeName: 'observedAt', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'SeverityObservedAtIndex',
      KeySchema: [
        { AttributeName: 'severity', KeyType: 'HASH' },
        { AttributeName: 'observedAt', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  
  // CORRECTION 1: No TTL in Phase 2.1
  // Automatic deletion is forbidden until learning phase exists
  // Signals must be kept indefinitely for:
  // - Replay verification (Phase 2.4)
  // - Historical correlation windows (Phase 2.2)
  // - Future learning (Phase 3+)
  // Manual archival/compaction tooling may be added in Phase 4+
  
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true,
  },
}
```

**Storage Strategy:**
- **CORRECTION 1:** No TTL enabled - signals kept indefinitely
- Rationale: Required for replay verification and historical correlation
- Future: Manual archival/compaction tooling may be added in Phase 4+
- Automatic deletion is forbidden until learning phase exists

**Access Patterns:**
1. Get signal by ID: `signalId` (PK)
2. Query signals by service + time: `ServiceObservedAtIndex`
3. Query signals by severity + time: `SeverityObservedAtIndex`

---

## ⚙️ Lambda Design

### Function: `opx-signal-ingestor`

**Purpose:** Ingest and normalize signals from various sources

**Trigger:** SNS topic `opx-signal-events`

**Handler Flow:**
```
1. Receive SNS event
2. Parse source-specific format
3. Normalize to SignalEvent
4. Compute identityWindow (round observedAt)
5. Validate schema (Zod)
6. Compute deterministic signalId
7. Check for duplicate (idempotency)
8. Write to DynamoDB (source of truth)
9. Emit to EventBridge (best-effort, non-blocking)
10. Return success
```

**CORRECTION 4: EventBridge emission is best-effort:**
- Signal storage is the source of truth
- EventBridge failure does NOT fail the handler
- Logged as warning, metrics incremented
- Phase 2.2 will read from DynamoDB if needed

**Code Structure:**
```typescript
// src/signal/signal-event.schema.ts
export { SignalEventSchema, SignalEvent, ... }

// src/signal/signal-id.ts
export function computeSignalId(...): string
export function computeIdentityWindow(observedAt: string): string

// src/signal/signal-store.ts
export class SignalStore {
  async putSignal(signal: SignalEvent): Promise<void>
  async getSignal(signalId: string): Promise<SignalEvent | null>
  async queryByService(service: string, startTime: string, endTime: string): Promise<SignalEvent[]>
}

// src/signal/signal-normalizer.ts
export class SignalNormalizer {
  normalizeCloudWatchAlarm(event: CloudWatchAlarmEvent): SignalEvent
  normalizeMetricBreach(event: MetricBreachEvent): SignalEvent
  normalizeLogPattern(event: LogPatternEvent): SignalEvent
  normalizeCustomEvent(event: CustomEvent): SignalEvent
}

// src/signal/signal-ingestor.ts (Lambda handler)
export async function handler(event: SNSEvent): Promise<void>
```

**Error Handling:**
- Invalid schema → Log error, return success (don't retry)
- Duplicate signal → Log info, return success (idempotent)
- DynamoDB error → Log error, throw (retry)
- Unknown source → Log error, return success (don't retry)
- **EventBridge error → Log warning, continue (CORRECTION 4: non-blocking)**

**Observability:**
- CloudWatch metric: `SignalsIngested` (by source, by severity)
- CloudWatch metric: `SignalValidationErrors`
- CloudWatch metric: `SignalDuplicates`
- CloudWatch metric: `SignalEmitFailures` (CORRECTION 4: EventBridge failures)
- CloudWatch logs: Structured JSON logs

---

## 🧪 Testing Strategy

### Unit Tests

#### 1. Schema Validation Tests
```typescript
describe('SignalEvent Schema', () => {
  it('should accept valid signal', () => {
    const signal = {
      signalId: 'a'.repeat(64),
      source: 'CLOUDWATCH_ALARM',
      signalType: 'ALARM_STATE_CHANGE',
      service: 'lambda',
      severity: 'SEV2',
      observedAt: '2026-01-17T10:23:45.123Z',
      identityWindow: '2026-01-17T10:23Z',
      metadata: { alarmName: 'HighErrorRate' },
      ingestedAt: '2026-01-17T10:23:47.000Z',
    };
    
    expect(() => SignalEventSchema.parse(signal)).not.toThrow();
  });
  
  it('should reject invalid severity', () => {
    const signal = { ...validSignal, severity: 'INVALID' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });
  
  it('should reject invalid observedAt', () => {
    const signal = { ...validSignal, observedAt: 'not-iso' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });
  
  it('should reject invalid identityWindow format', () => {
    const signal = { ...validSignal, identityWindow: '2026-01-17T10:23:45Z' };
    expect(() => SignalEventSchema.parse(signal)).toThrow();
  });
});
```

#### 2. SignalId Determinism Tests
```typescript
describe('computeIdentityWindow', () => {
  it('should round to minute bucket', () => {
    expect(computeIdentityWindow('2026-01-17T10:23:45.123Z')).toBe('2026-01-17T10:23Z');
    expect(computeIdentityWindow('2026-01-17T10:23:00.000Z')).toBe('2026-01-17T10:23Z');
    expect(computeIdentityWindow('2026-01-17T10:23:59.999Z')).toBe('2026-01-17T10:23Z');
  });
  
  it('should produce same window for signals within same minute', () => {
    const window1 = computeIdentityWindow('2026-01-17T10:23:12.000Z');
    const window2 = computeIdentityWindow('2026-01-17T10:23:47.000Z');
    expect(window1).toBe(window2);
  });
});

describe('computeSignalId', () => {
  it('should generate deterministic signalId', () => {
    const id1 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { alarm: 'test' });
    const id2 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { alarm: 'test' });
    
    expect(id1).toBe(id2);
  });
  
  it('should generate SAME signalId for signals in same identity window', () => {
    // CORRECTION 2: Same alarm within same minute → same signalId
    const id1 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { alarm: 'test' });
    const id2 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { alarm: 'test' });
    
    expect(id1).toBe(id2); // Deduplication works
  });
  
  it('should generate different signalId for different identity windows', () => {
    const id1 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { alarm: 'test' });
    const id2 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:24Z', { alarm: 'test' });
    
    expect(id1).not.toBe(id2);
  });
  
  it('should normalize metadata for determinism', () => {
    const id1 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { a: 1, b: 2 });
    const id2 = computeSignalId('CLOUDWATCH_ALARM', 'ALARM_STATE_CHANGE', 'lambda', 'SEV2', '2026-01-17T10:23Z', { b: 2, a: 1 });
    
    expect(id1).toBe(id2); // Order doesn't matter
  });
});
```

#### 3. SignalStore Tests
```typescript
describe('SignalStore', () => {
  it('should store signal', async () => {
    await store.putSignal(signal);
    const retrieved = await store.getSignal(signal.signalId);
    expect(retrieved).toEqual(signal);
  });
  
  it('should handle duplicate signals idempotently', async () => {
    await store.putSignal(signal);
    await store.putSignal(signal); // Duplicate
    const retrieved = await store.getSignal(signal.signalId);
    expect(retrieved).toEqual(signal);
  });
  
  it('should query signals by service and time', async () => {
    await store.putSignal(signal1);
    await store.putSignal(signal2);
    
    const results = await store.queryByService('lambda', '2026-01-17T09:00:00.000Z', '2026-01-17T11:00:00.000Z');
    expect(results).toHaveLength(2);
  });
});
```

#### 4. SignalNormalizer Tests
```typescript
describe('SignalNormalizer', () => {
  it('should normalize CloudWatch alarm', () => {
    const alarmEvent = { /* CloudWatch alarm format */ };
    const signal = normalizer.normalizeCloudWatchAlarm(alarmEvent);
    
    expect(signal.source).toBe('CLOUDWATCH_ALARM');
    expect(signal.signalType).toBe('ALARM_STATE_CHANGE');
    expect(SignalEventSchema.parse(signal)).toBeTruthy();
  });
  
  it('should extract service from alarm name', () => {
    const alarmEvent = { AlarmName: 'lambda-HighErrorRate' };
    const signal = normalizer.normalizeCloudWatchAlarm(alarmEvent);
    
    expect(signal.service).toBe('lambda');
  });
  
  it('should map alarm severity correctly', () => {
    const alarmEvent = { /* SEV1 alarm */ };
    const signal = normalizer.normalizeCloudWatchAlarm(alarmEvent);
    
    expect(signal.severity).toBe('SEV1');
  });
});
```

#### 5. Lambda Handler Tests
```typescript
describe('signal-ingestor handler', () => {
  it('should ingest valid signal', async () => {
    const snsEvent = createSNSEvent(validAlarm);
    await handler(snsEvent);
    
    // Verify signal stored
    const signal = await store.getSignal(expectedSignalId);
    expect(signal).toBeDefined();
  });
  
  it('should reject invalid signal schema', async () => {
    const snsEvent = createSNSEvent(invalidAlarm);
    await handler(snsEvent);
    
    // Should not throw, should log error
    // Verify no signal stored
    const signal = await store.getSignal(expectedSignalId);
    expect(signal).toBeNull();
  });
  
  it('should handle duplicate signals idempotently', async () => {
    const snsEvent = createSNSEvent(validAlarm);
    await handler(snsEvent);
    await handler(snsEvent); // Duplicate
    
    // Should not throw
    const signal = await store.getSignal(expectedSignalId);
    expect(signal).toBeDefined();
  });
  
  it('should continue if EventBridge emission fails (CORRECTION 4)', async () => {
    // Mock EventBridge to fail
    mockEventBridge.putEvents.mockRejectedValue(new Error('Throttled'));
    
    const snsEvent = createSNSEvent(validAlarm);
    await handler(snsEvent);
    
    // Should not throw - signal still stored
    const signal = await store.getSignal(expectedSignalId);
    expect(signal).toBeDefined();
    
    // Should log warning and increment metric
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('EventBridge emit failed'));
    expect(mockMetrics.increment).toHaveBeenCalledWith('SignalEmitFailures');
  });
});
```

### Integration Tests

```typescript
describe('Signal Ingestion Integration', () => {
  it('should ingest CloudWatch alarm end-to-end', async () => {
    // 1. Publish alarm to SNS
    await sns.publish({
      TopicArn: signalTopicArn,
      Message: JSON.stringify(cloudWatchAlarm),
    });
    
    // 2. Wait for Lambda processing
    await sleep(2000);
    
    // 3. Verify signal in DynamoDB
    const signal = await dynamodb.getItem({
      TableName: 'opx-signals',
      Key: { signalId: { S: expectedSignalId } },
    });
    
    expect(signal.Item).toBeDefined();
  });
  
  it('should emit signal to EventBridge', async () => {
    // 1. Ingest signal
    await handler(snsEvent);
    
    // 2. Verify EventBridge event
    const events = await getEventBridgeEvents('opx-signal-ingested');
    expect(events).toHaveLength(1);
    expect(events[0].detail.signalId).toBe(expectedSignalId);
  });
});
```

---

## 🚀 Implementation Steps

### Step 1: Schema & Types
- [ ] Create `src/signal/signal-event.schema.ts` (with observedAt, identityWindow)
- [ ] Create `src/signal/signal-id.ts` (with computeIdentityWindow)
- [ ] Unit tests for schema validation
- [ ] Unit tests for identityWindow rounding
- [ ] Unit tests for signalId determinism

### Step 2: DynamoDB Table
- [ ] Create CDK construct for `opx-signals` table (NO TTL - CORRECTION 1)
- [ ] Deploy table to dev environment
- [ ] Verify table structure
- [ ] Verify no TTL enabled

### Step 3: SignalStore
- [ ] Create `src/signal/signal-store.ts`
- [ ] Implement `putSignal()`, `getSignal()`, `queryByService()`
- [ ] Unit tests with DynamoDB mock
- [ ] Integration tests with real DynamoDB

### Step 4: SignalNormalizer
- [ ] Create `src/signal/signal-normalizer.ts`
- [ ] Implement CloudWatch alarm normalization
- [ ] Implement metric breach normalization
- [ ] Unit tests for each normalizer

### Step 5: Lambda Handler
- [ ] Create `src/signal/signal-ingestor.ts`
- [ ] Implement handler logic
- [ ] Error handling (including EventBridge best-effort - CORRECTION 4)
- [ ] Observability (metrics, logs)
- [ ] Unit tests (including EventBridge failure test)
- [ ] Integration tests

### Step 6: Infrastructure
- [ ] Create SNS topic: `opx-signal-events`
- [ ] Create Lambda function
- [ ] Wire SNS → Lambda
- [ ] Configure IAM permissions (write to `opx-signals` only)
- [ ] Deploy to dev environment

### Step 7: Testing & Validation
- [ ] Run all unit tests
- [ ] Run integration tests
- [ ] Manual testing with fake alarms
- [ ] Verify metrics in CloudWatch
- [ ] Verify logs in CloudWatch

---

## 📊 Success Criteria

Phase 2.1 is complete when:

- ✅ All unit tests pass (>90% coverage)
- ✅ All integration tests pass
- ✅ Can inject fake alarms all day without breaking
- ✅ SignalId generation is deterministic (verified)
- ✅ Duplicate signals handled idempotently
- ✅ Malformed signals rejected gracefully
- ✅ No calls to CP-5/6/7/8 (verified)
- ✅ No writes to incident tables (verified)
- ✅ CloudWatch metrics emitting correctly
- ✅ Phase 1 continues working (verified)

---

## 🚫 Forbidden in This Phase

- ❌ No correlation logic
- ❌ No candidate creation
- ❌ No decision-making
- ❌ No thresholds or rules
- ❌ No calls to CP-5/6/7/8
- ❌ No intelligence or ML
- ❌ No "smart" defaults

---

## 📈 Observability

### CloudWatch Metrics

```typescript
// Emitted by signal-ingestor
{
  Namespace: 'OPX/Signals',
  Metrics: [
    {
      MetricName: 'SignalsIngested',
      Dimensions: [
        { Name: 'Source', Value: signal.source },
        { Name: 'Severity', Value: signal.severity },
      ],
      Value: 1,
      Unit: 'Count',
    },
    {
      MetricName: 'SignalValidationErrors',
      Value: 1,
      Unit: 'Count',
    },
    {
      MetricName: 'SignalDuplicates',
      Value: 1,
      Unit: 'Count',
    },
    {
      MetricName: 'SignalEmitFailures',
      Dimensions: [
        { Name: 'Reason', Value: 'EventBridgeThrottled' },
      ],
      Value: 1,
      Unit: 'Count',
    },
  ],
}
```

### CloudWatch Logs

```json
{
  "level": "info",
  "message": "Signal ingested",
  "signalId": "abc123...",
  "source": "CLOUDWATCH_ALARM",
  "service": "lambda",
  "severity": "SEV2",
  "observedAt": "2026-01-17T10:23:45.123Z",
  "identityWindow": "2026-01-17T10:23Z",
  "ingestedAt": "2026-01-17T10:23:47.000Z"
}
```

---

## 🔐 IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/opx-signals",
        "arn:aws:dynamodb:*:*:table/opx-signals/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "events:PutEvents"
      ],
      "Resource": "arn:aws:events:*:*:event-bus/default"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

**Note:** No permissions to incident tables (INV-P2.1 enforcement)

---

## 📝 Exit Gate

Before proceeding to Phase 2.2:

**Manual Verification:**
```bash
# 1. Inject fake alarm
aws sns publish --topic-arn $SIGNAL_TOPIC_ARN --message file://fake-alarm.json

# 2. Verify signal in DynamoDB
aws dynamodb get-item --table-name opx-signals --key '{"signalId":{"S":"expected-id"}}'

# 3. Verify metrics
aws cloudwatch get-metric-statistics --namespace OPX/Signals --metric-name SignalsIngested --start-time ... --end-time ...

# 4. Verify Phase 1 still works
aws lambda invoke --function-name opx-incident-controller --payload file://test-incident.json
```

**Automated Verification:**
```bash
npm test -- test/signal/
npm run test:integration -- test/signal-integration/
```

**Invariant Verification:**
```bash
# No writes to incident tables
grep -r "opx-incidents" src/signal/ && echo "VIOLATION: INV-P2.1"

# No CP-7 imports
grep -r "incident-manager" src/signal/ && echo "VIOLATION: INV-P2.3"

# No candidate creation
grep -r "createCandidate" src/signal/ && echo "VIOLATION: INV-P2.2"
```

---

## 🎯 Approval Checklist

Before implementation begins:

- [ ] Schema design reviewed and approved
- [ ] DynamoDB table design reviewed and approved
- [ ] Lambda design reviewed and approved
- [ ] Testing strategy reviewed and approved
- [ ] Invariant compliance verified
- [ ] Success criteria agreed upon
- [ ] Forbidden patterns understood

---

**STATUS:** 🔲 AWAITING ARCHITECTURAL APPROVAL

**Next Action:** Review this design and provide approval or corrections before implementation begins.
