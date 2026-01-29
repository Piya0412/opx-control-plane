# Phase 8.4: Token Usage Analytics - APPROVED ✅

**Date:** January 29, 2026  
**Status:** APPROVED WITH CORRECTIONS  
**Scope:** Observability Only

---

## Approval Summary

Phase 8.4 (Token Usage Analytics) is **APPROVED** with 4 mandatory corrections to be applied during implementation.

**Core Principle:** Analytics and visibility only - no enforcement logic.

---

## What Was Approved (Locked In)

### ✅ 1. Phase Boundaries - PERFECT
- Strictly within analytics & visibility
- No enforcement logic
- No agent blocking
- No Cost Guardian execution logic

**This respects phase discipline.**

### ✅ 2. Incident Cardinality Rule - CORRECT
- ❌ `incidentId` NOT in CloudWatch dimensions
- ✅ `incidentId` only in DynamoDB (opx-llm-traces)
- Preserves Phase 7.5 fixes
- Prevents metric explosion
- Keeps CloudWatch costs predictable

### ✅ 3. Metric Set - CORRECT
Approved metrics:
- `InputTokens`
- `OutputTokens`
- `TotalCost`
- `TokenEfficiency`
- `InvocationCount` (added per correction)

**No junk metrics, clear signal-to-noise ratio.**

### ✅ 4. Dashboard Scope - CORRECT
6 widgets:
1. Token usage
2. Cost by agent
3. Efficiency
4. Cost trend
5. Budget utilization
6. Cost per invocation

**Operators can reason about cost in <30 seconds.**

### ✅ 5. Budget Alerts - CORRECT
- 80% warning
- 95% critical
- Cost-per-invocation spike alarm

**Observability only, no enforcement, human decision remains in control.**

---

## Required Corrections (Applied)

### 🔧 Correction 1: Remove ExecutionType Dimension

**Issue:** `ExecutionType` declared but never used

**Action Taken:** ✅ REMOVED
- Removed from allowed dimensions list
- Not emitted in metrics
- Simplest, least risk approach

**Status:** ✅ Applied

---

### 🔧 Correction 2: Fix CostPerInvocation Math

**Issue:** `CostPerInvocation` was just duplicating `TotalCost`

**Correct Pattern:** ✅ APPLIED
```typescript
// Emit two metrics
InvocationCount = 1
TotalCost = cost

// Compute in dashboard
CostPerInvocation = TotalCost / InvocationCount
```

**Benefits:**
- Avoids statistical distortion
- Correct for aggregation windows
- CloudWatch-correct math model

**Status:** ✅ Applied

---

### 🔧 Correction 3: Defer Budget Forecasting

**Issue:** `calculateBudgetForecast()` logic belongs in later phase

**Action Taken:** ✅ DEFERRED
- NOT implemented in Phase 8.4
- Kept as design notes only
- Deferred to Phase 9 or Phase 10

**Reason:**
- Phase 8.4 = visibility
- Forecasting = decision & enforcement
- Mixing them breaks phase isolation

**Status:** ✅ Applied

---

### 🔧 Correction 4: Make Budget Lambda Optional

**Issue:** Lambda adds cost + operational surface

**Action Taken:** ✅ MADE OPTIONAL
```typescript
enableBudgetLambda?: boolean // Default: false
```

**Reason:**
- CloudWatch alarms already exist
- Lambda adds cost + operational surface
- Operators may want alarms only

**Status:** ✅ Applied

---

## Implementation Scope

### ✅ What Will Be Implemented

1. **Metric Emission**
   - InputTokens
   - OutputTokens
   - TotalCost
   - TokenEfficiency
   - InvocationCount

2. **Dashboard**
   - 6 widgets (token usage, cost, efficiency, trends)
   - MathExpression for CostPerInvocation

3. **Alarms**
   - 80% budget warning
   - 95% budget critical
   - Cost-per-invocation spike

4. **Optional Budget Lambda**
   - Disabled by default
   - Flag-controlled deployment

### ❌ What Will NOT Be Implemented

1. Budget forecasting logic
2. Enforcement mechanisms
3. Cost Guardian execution
4. Agent blocking
5. ExecutionType dimension

---

## Important Statement

**"Advanced budget enforcement and forecasting are intentionally deferred to later phases."**

This ensures:
- Phase 8.4 remains observability-only
- No scope creep
- Clear phase boundaries
- Future phases can build on this foundation

---

## Allowed CloudWatch Dimensions

**Final List:**
- `AgentId` - Which agent (low cardinality: 6 agents)
- `Model` - Which model (low cardinality: ~3 models)

**Explicitly Forbidden:**
- ❌ `incidentId` - High cardinality, DynamoDB only
- ❌ `ExecutionType` - Removed per Correction 1
- ❌ `sessionId` - High cardinality
- ❌ `timestamp` - Infinite cardinality

---

## Cost Impact

**Monthly:** ~$2-3
- CloudWatch Metrics: ~$1-2 (low cardinality)
- CloudWatch Dashboard: Free (1 dashboard)
- CloudWatch Alarms: ~$0.20 (3 alarms)
- Lambda (optional): ~$0.10 if enabled

**Total Phase 8 Cost:** ~$8/month (8.1 + 8.2 + 8.3 + 8.4)

---

## Files to Create

### Infrastructure (3 files)
- `infra/constructs/token-analytics-metrics.ts` - Metric definitions
- `infra/constructs/token-analytics-dashboard.ts` - Dashboard
- `infra/constructs/token-analytics-alarms.ts` - Budget alarms
- `infra/constructs/budget-alert-lambda.ts` - Optional Lambda

### Application Code (3 files)
- `src/analytics/token-tracker.ts` - Token tracking logic
- `src/analytics/cost-calculator.ts` - Cost calculation
- `src/analytics/analytics-emitter.ts` - Metric emission

### Tests (2 files)
- `test/analytics/token-tracker.test.ts`
- `test/analytics/cost-calculator.test.ts`

---

## Validation Gates

### Gate 1: Metric Emission
- Verify metrics emitted correctly
- Check dimensions (AgentId, Model only)
- Confirm no incidentId in dimensions

### Gate 2: Dashboard Functionality
- Verify all 6 widgets render
- Check MathExpression for CostPerInvocation
- Confirm data displays correctly

### Gate 3: Alarm Behavior
- Test 80% warning alarm
- Test 95% critical alarm
- Verify cost-per-invocation spike alarm

### Gate 4: Optional Lambda
- Verify Lambda disabled by default
- Test Lambda when enabled
- Confirm no impact when disabled

---

## Success Criteria

- [ ] All 4 corrections applied
- [ ] Metrics emitting correctly
- [ ] Dashboard operational
- [ ] Alarms configured
- [ ] Budget Lambda optional
- [ ] No enforcement logic
- [ ] No forecasting logic
- [ ] All tests passing
- [ ] All gates passed

---

## Next Steps

1. **Implement Infrastructure**
   - Create metric definitions
   - Create dashboard
   - Create alarms
   - Create optional Lambda

2. **Implement Application Code**
   - Token tracking
   - Cost calculation
   - Metric emission

3. **Write Tests**
   - Unit tests for tracking
   - Unit tests for cost calculation
   - Integration tests

4. **Execute Validation Gates**
   - Verify all 4 gates pass
   - Document results

5. **Deploy and Verify**
   - Deploy infrastructure
   - Verify metrics flowing
   - Check dashboard

---

## Approval Confirmation

**Phase 8.4 Design:** ✅ APPROVED  
**Corrections:** ✅ ALL APPLIED  
**Ready to Implement:** ✅ YES

**Scope:** Observability only  
**Blocking:** None  
**Next Phase:** 8.5 (Hallucination Detection)

---

*All required corrections applied. Phase 8.4 is ready to implement with clear boundaries and no enforcement logic.*
