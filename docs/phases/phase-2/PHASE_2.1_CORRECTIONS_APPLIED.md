# Phase 2.1 Corrections Applied ✅

**Date:** 2026-01-17  
**Version:** 2.0.0 (Corrected)  
**Status:** Ready for Re-Review

---

## Summary

All four mandatory corrections have been applied to the Phase 2.1 design document.

---

## 🔴 CORRECTION 1: TTL Removed

### Problem
TTL was enabled on `opx-signals` table, which violates replay integrity guarantees.

### Why Dangerous
- Phase 2.2 correlation depends on historical signal windows
- Replay verification in Phase 2.4 cannot reconstruct truth
- Silently introduces non-replayable state

### Fix Applied ✅
```diff
- TimeToLiveSpecification: {
-   Enabled: true,
-   AttributeName: 'ttl',
- }
+ // No TTL in Phase 2.1
+ // Automatic deletion is forbidden until learning phase exists
+ // Signals must be kept indefinitely for:
+ // - Replay verification (Phase 2.4)
+ // - Historical correlation windows (Phase 2.2)
+ // - Future learning (Phase 3+)
+ // Manual archival/compaction tooling may be added in Phase 4+
```

### Rule Established
**Automatic deletion is forbidden until learning phase exists.**

---

## 🔴 CORRECTION 2: SignalId Uses Identity Window

### Problem
SignalId included raw timestamp, making duplicate detection unreliable.

### Failure Mode
- Same alarm, same state change, same metadata
- Slightly different timestamps
- Different signalIds
- Duplicate signals treated as unique truth

### Fix Applied ✅

**Schema Changes:**
```diff
- timestamp: z.string().datetime(),
- correlationWindow: z.string().regex(/^PT\d+[HMS]$/),
+ observedAt: z.string().datetime(),        // When signal actually happened
+ identityWindow: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/), // Rounded time bucket
```

**SignalId Computation:**
```diff
export function computeSignalId(
  source: SignalSource,
  signalType: SignalType,
  service: string,
- timestamp: string,
+ severity: SignalSeverity,
+ identityWindow: string,
  metadata: Record<string, unknown>
): string
```

**New Function:**
```typescript
export function computeIdentityWindow(observedAt: string): string {
  const date = new Date(observedAt);
  date.setSeconds(0, 0); // Zero out seconds and milliseconds
  return date.toISOString().slice(0, 17) + 'Z'; // Format: YYYY-MM-DDTHH:MMZ
}
```

### Benefits
- Same alarm within same minute → same signalId
- Reliable deduplication
- Correlation stability
- Replay fidelity

### Example
```
observedAt: 2026-01-17T10:23:45.123Z → identityWindow: 2026-01-17T10:23Z
observedAt: 2026-01-17T10:23:47.456Z → identityWindow: 2026-01-17T10:23Z
                                     → SAME signalId (deduplication works)
```

---

## 🔴 CORRECTION 3: CorrelationWindow Removed

### Problem
`correlationWindow` field was included in SignalEvent schema, leaking Phase 2.2 logic into Phase 2.1.

### Why Wrong
- Correlation belongs to Phase 2.2
- Signals should be pure observations
- Violates "If it feels clever, it's wrong"

### Fix Applied ✅
```diff
- correlationWindow: z.string().regex(/^PT\d+[HMS]$/),
```

### Principle
**Signals are pure observations. Correlation windows are defined in correlation rules, not embedded in raw signals.**

---

## 🔴 CORRECTION 4: EventBridge Emission Best-Effort

### Problem
Handler flow always emitted to EventBridge, which could:
- Cause retries if EventBridge throttles
- Create duplicate writes
- Impact Phase 1 reliability

### Fix Applied ✅

**Handler Flow Updated:**
```diff
7. Write to DynamoDB (source of truth)
- 8. Emit to EventBridge (for Phase 2.2)
+ 8. Emit to EventBridge (best-effort, non-blocking)
9. Return success
```

**Error Handling:**
```typescript
try {
  await emitEventBridge(signal);
} catch (err) {
  log.warn("EventBridge emit failed", err);
  metrics.increment("SignalEmitFailures");
  // DO NOT throw - signal storage is source of truth
}
```

### Principle
**Signal storage (DynamoDB) is the source of truth, not EventBridge. EventBridge failure must not fail the handler.**

### New Metric
```typescript
{
  MetricName: 'SignalEmitFailures',
  Dimensions: [
    { Name: 'Reason', Value: 'EventBridgeThrottled' },
  ],
  Value: 1,
  Unit: 'Count',
}
```

---

## ✅ What Remains Excellent (No Changes)

These aspects were explicitly approved:

- ✅ Zod-based schema validation
- ✅ Deterministic hashing (conceptually correct)
- ✅ Idempotent DynamoDB writes
- ✅ Boring Lambda philosophy
- ✅ No CP-5/6/7/8 imports
- ✅ Error handling strategy
- ✅ Testing depth (unusually strong)
- ✅ IAM isolation (excellent)
- ✅ Observability discipline

---

## 📊 Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| TTL | Enabled (30 days) | Disabled (indefinite) |
| Timestamp | Single `timestamp` field | Split: `observedAt` + `identityWindow` |
| SignalId Input | Raw timestamp | Identity window (rounded) |
| CorrelationWindow | Included in schema | Removed |
| EventBridge | Blocking | Best-effort, non-blocking |

---

## 🧪 New Tests Required

### Identity Window Tests
```typescript
describe('computeIdentityWindow', () => {
  it('should round to minute bucket');
  it('should produce same window for signals within same minute');
});
```

### SignalId Deduplication Tests
```typescript
describe('computeSignalId', () => {
  it('should generate SAME signalId for signals in same identity window');
  it('should generate different signalId for different identity windows');
});
```

### EventBridge Failure Tests
```typescript
describe('signal-ingestor handler', () => {
  it('should continue if EventBridge emission fails');
});
```

---

## 📝 Documentation Updates

All corrections documented in:
- `docs/PHASE_2.1_SIGNAL_INGESTION_DESIGN.md` (v2.0.0)
- Schema definitions updated
- Handler flow updated
- Testing strategy updated
- Implementation steps updated
- Success criteria updated

---

## 🚦 Status

**All four mandatory corrections applied.**

**Ready for architectural re-review.**

---

## 🎯 Next Steps

1. ⏳ Await architectural approval
2. ⏳ Begin implementation (Step 1: Schema & Types)
3. ⏳ Proceed through 7 implementation steps
4. ⏳ Verify all success criteria
5. ⏳ Pass exit gate
6. ⏳ Proceed to Phase 2.2

---

**Corrections applied. Ready for re-review.**
