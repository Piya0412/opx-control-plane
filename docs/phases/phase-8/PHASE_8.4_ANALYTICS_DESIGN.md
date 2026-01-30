# Phase 8.4: Token Usage Analytics

**Status:** ✅ COMPLETE  
**Completed:** January 29, 2026  
**Scope:** Observability Only - No Enforcement

---

## Important Statement

**"Advanced budget enforcement and forecasting are intentionally deferred to later phases."**

This phase provides **visibility only**. It does NOT:
- ❌ Enforce budgets
- ❌ Block agents on cost
- ❌ Forecast spending
- ❌ Make decisions
- ❌ Trigger Cost Guardian

---

## Objective

Provide token usage analytics and cost tracking for LLM operations through CloudWatch dashboards and metrics.

**Scope:** Observability and alerting only.

---

## Core Principle (LOCKED)

**IncidentId Cardinality Rule:**
```
incidentId ✅ ALLOWED in DynamoDB (opx-llm-traces)
incidentId ❌ NOT ALLOWED in CloudWatch metric dimensions
```

**Why:**
- Preserves Phase 7.5 fixes
- Prevents metric explosion
- Maintains cost predictability

**Allowed Dimensions (Final):**
- `AgentId` - Which agent (6 agents, low cardinality)
- `Model` - Which model (~3 models, low cardinality)

**Forbidden Dimensions:**
- ❌ `incidentId` - High cardinality
- ❌ `ExecutionType` - Removed (Correction 1)
- ❌ `sessionId` - High cardinality
- ❌ `timestamp` - Infinite cardinality

---

## Architecture

### Data Flow

```
LangGraph Agent Invocation
    ↓
Bedrock Agent Response (with token counts)
    ↓
Extract Token Metrics
    ├─→ CloudWatch Metrics (aggregated, no incidentId)
    └─→ DynamoDB Traces (detailed, with incidentId)
        ↓
CloudWatch Dashboard (6 widgets)
    ├─→ Token usage
    ├─→ Cost by agent
    ├─→ Efficiency
    ├─→ Cost trend
    ├─→ Budget utilization
    └─→ Cost per invocation
```

---

## Metrics

### CloudWatch Metrics

**Namespace:** `OPX/Analytics`

**Metrics (5 total):**

1. **InputTokens**
   - Unit: Count
   - Dimensions: `AgentId`, `Model`
   - Description: Number of input tokens consumed

2. **OutputTokens**
   - Unit: Count
   - Dimensions: `AgentId`, `Model`
   - Description: Number of output tokens generated

3. **TotalCost**
   - Unit: None (USD)
   - Dimensions: `AgentId`, `Model`
   - Description: Total cost in USD

4. **TokenEfficiency**
   - Unit: None (ratio)
   - Dimensions: `AgentId`, `Model`
   - Description: Output tokens / Input tokens

5. **InvocationCount**
   - Unit: Count
   - Dimensions: `AgentId`, `Model`
   - Description: Number of invocations (for CostPerInvocation calculation)

**Note:** CostPerInvocation is calculated in dashboard using MathExpression (Correction 2).

---

## CloudWatch Dashboard

**Dashboard Name:** `OPX-Token-Analytics`

### Widget 1: Token Usage (Line Chart)
- Input tokens by agent
- Output tokens by agent
- Period: 5 minutes
- Statistic: Sum

### Widget 2: Cost by Agent (Bar Chart)
- Total cost by agent (last 24 hours)
- Period: 1 hour
- Statistic: Sum

### Widget 3: Token Efficiency (Line Chart)
- Output/Input ratio
- Period: 15 minutes
- Statistic: Average

### Widget 4: Cost Trend (Line Chart)
- Total cost per hour (last 24 hours)
- Period: 1 hour
- Statistic: Sum

### Widget 5: Budget Utilization (Single Value)
- Current month cost
- Period: 30 days
- Statistic: Sum

### Widget 6: Cost Per Invocation (Line Chart)
- **Uses MathExpression:** `TotalCost / InvocationCount`
- Period: 5 minutes
- Statistic: Average

---

## CloudWatch Alarms

### Alarm 1: Budget Warning (80%)
- **Threshold:** 80% of daily budget
- **Period:** 1 day
- **Evaluation:** 1 period
- **Action:** Observability only (no enforcement)

### Alarm 2: Budget Critical (95%)
- **Threshold:** 95% of daily budget
- **Period:** 1 day
- **Evaluation:** 1 period
- **Action:** Observability only (no enforcement)

### Alarm 3: Cost Spike
- **Threshold:** $0.01 per invocation
- **Period:** 5 minutes
- **Evaluation:** 2 periods
- **Action:** Detect sudden cost increases

**Important:** Alarms are for visibility only. They do NOT:
- Block agents
- Stop execution
- Trigger Cost Guardian
- Enforce budgets

---

## Budget Alert Lambda (Optional)

**Status:** Disabled by default (Correction 4)

**Purpose:** Log budget status (observability only)

**Configuration:**
```typescript
new BudgetAlertLambda(this, 'BudgetAlertLambda', {
  enabled: false, // Default: disabled
});
```

**Why Optional:**
- CloudWatch alarms already exist
- Lambda adds cost + operational surface
- Operators may want alarms only

**What It Does (If Enabled):**
- Logs budget status
- Does NOT enforce
- Does NOT block agents
- Does NOT stop execution

---

## Implementation

### Metric Emission

**Location:** `src/analytics/analytics-emitter.ts`

```typescript
await cloudwatch.putMetricData({
  Namespace: 'OPX/Analytics',
  MetricData: [
    {
      MetricName: 'InputTokens',
      Value: analytics.inputTokens,
      Unit: 'Count',
      Dimensions: [
        { Name: 'AgentId', Value: analytics.agentId },
        { Name: 'Model', Value: analytics.modelName },
      ],
    },
    {
      MetricName: 'OutputTokens',
      Value: analytics.outputTokens,
      Unit: 'Count',
      Dimensions: [
        { Name: 'AgentId', Value: analytics.agentId },
        { Name: 'Model', Value: analytics.modelName },
      ],
    },
    {
      MetricName: 'TotalCost',
      Value: analytics.cost,
      Unit: 'None',
      Dimensions: [
        { Name: 'AgentId', Value: analytics.agentId },
        { Name: 'Model', Value: analytics.modelName },
      ],
    },
    {
      MetricName: 'TokenEfficiency',
      Value: analytics.efficiency,
      Unit: 'None',
      Dimensions: [
        { Name: 'AgentId', Value: analytics.agentId },
        { Name: 'Model', Value: analytics.modelName },
      ],
    },
    {
      MetricName: 'InvocationCount',
      Value: 1,
      Unit: 'Count',
      Dimensions: [
        { Name: 'AgentId', Value: analytics.agentId },
        { Name: 'Model', Value: analytics.modelName },
      ],
    },
  ],
});
```

---

## What Phase 8.4 Does NOT Include

### ❌ Budget Forecasting
**Status:** Deferred to Phase 9/10  
**Reason:** Forecasting = decision & enforcement, not observability

**Not Implemented:**
- `calculateBudgetForecast()` function
- Projected month-end cost
- Spending predictions
- Trend analysis

### ❌ Budget Enforcement
**Status:** Deferred to Phase 9  
**Reason:** Enforcement requires proven trust

**Not Implemented:**
- Agent blocking on budget
- Automatic cost limits
- Execution prevention
- Cost Guardian triggers

### ❌ Advanced Analytics
**Status:** Deferred to Phase 10  
**Reason:** Requires mature observability foundation

**Not Implemented:**
- Capacity planning
- Cost optimization recommendations
- Anomaly detection
- Predictive models

---

## Cost Analysis

**Monthly Costs:**
- CloudWatch Metrics: ~$1-2 (low cardinality)
- CloudWatch Dashboard: Free (1 dashboard)
- CloudWatch Alarms: ~$0.20 (3 alarms)
- Lambda (optional): ~$0.10 if enabled

**Total:** ~$2-3/month

---

## Success Criteria

- ✅ Token metrics emitted to CloudWatch
- ✅ No incidentId in metric dimensions
- ✅ Dashboard operational with 6 widgets
- ✅ CloudWatch alarms configured
- ✅ Budget alert Lambda optional (disabled by default)
- ✅ Unit tests passing (22 tests)
- ✅ No enforcement logic
- ✅ No forecasting logic

---

## Corrections Applied

### ✅ Correction 1: ExecutionType Removed
- Removed from allowed dimensions
- Not emitted in metrics
- Simplest, least risk approach

### ✅ Correction 2: CostPerInvocation Fixed
- Emit `InvocationCount` separately
- Calculate in dashboard using `MathExpression`
- Avoids statistical distortion

### ✅ Correction 3: Budget Forecasting Deferred
- NOT implemented in Phase 8.4
- Kept as design notes only
- Deferred to Phase 9 or Phase 10

### ✅ Correction 4: Budget Lambda Optional
- Disabled by default
- Can be enabled with `enabled: true`
- No impact when disabled

---

## Files Created

### Infrastructure (3 files)
- `infra/constructs/token-analytics-dashboard.ts`
- `infra/constructs/token-analytics-alarms.ts`
- `infra/constructs/budget-alert-lambda.ts`

### Application Code (4 files)
- `src/analytics/token-tracker.ts`
- `src/analytics/cost-calculator.ts`
- `src/analytics/analytics-emitter.ts`
- `src/analytics/index.ts`

### Tests (2 files)
- `test/analytics/token-tracker.test.ts`
- `test/analytics/cost-calculator.test.ts`

---

## Phase Boundaries

### ✅ What Phase 8.4 Does
- Track token usage
- Calculate costs
- Emit metrics
- Display dashboards
- Alert on thresholds

### ❌ What Phase 8.4 Does NOT Do
- Enforce budgets
- Block agents
- Forecast spending
- Make decisions
- Trigger Cost Guardian

**This is observability only.**

---

**Status:** ✅ COMPLETE  
**Production Ready:** ✅ YES  
**Next Phase:** 8.5 (Hallucination Detection) or 9 (Execution)
