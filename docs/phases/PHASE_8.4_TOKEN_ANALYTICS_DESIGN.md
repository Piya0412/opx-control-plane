# Phase 8.4: Token Usage Analytics

**Status:** 📋 DESIGN - AWAITING APPROVAL  
**Created:** January 29, 2026  
**Estimated Duration:** 1 day  
**Priority:** ✅ REQUIRED (Cost & governance)

## Objective

Provide detailed tracking and optimization insights for token consumption across all agents with comprehensive dashboards and forecasting.

## Key Design Decisions (Locked)

### Metric Dimensions ✅ LOCKED

**ALLOWED Dimensions:**
- `AgentId` - Which agent consumed tokens
- `Model` - Which model was used
- `Period` - Time period (DAILY, WEEKLY, MONTHLY)

**FORBIDDEN Dimensions:**
- ❌ `incidentId` - High cardinality (preserves Phase 7.5 fixes)

**Rationale:**
- Incident-level cost tracking via DynamoDB (Phase 8.1 traces)
- CloudWatch metrics for aggregated trends only
- Prevents metric explosion

### Data Sources

**Primary:** Phase 8.1 LLM Traces (DynamoDB)
- Authoritative source for all token/cost data
- Query for incident-level breakdowns
- 90-day retention

**Secondary:** CloudWatch Metrics
- Real-time aggregated metrics
- Trend analysis
- Alerting

## Metrics Design

### CloudWatch Metrics

**Namespace:** `OPX/TokenUsage`

**Core Metrics:**

1. **InputTokens** (Count)
   - Dimensions: `AgentId`, `Model`
   - Unit: Count
   - Statistic: Sum
   - Description: Total input tokens consumed

2. **OutputTokens** (Count)
   - Dimensions: `AgentId`, `Model`
   - Unit: Count
   - Statistic: Sum
   - Description: Total output tokens generated

3. **TotalCost** (None)
   - Dimensions: `AgentId`, `Model`, `Period`
   - Unit: None (USD)
   - Statistic: Sum
   - Description: Total cost in USD

4. **TokenEfficiency** (None)
   - Dimensions: `AgentId`
   - Unit: None (ratio)
   - Statistic: Average
   - Description: Output tokens / Input tokens ratio
   - Formula: `output_tokens / input_tokens`

5. **CostPerRecommendation** (None)
   - Dimensions: `AgentId`
   - Unit: None (USD)
   - Statistic: Average
   - Description: Average cost per agent execution

6. **TokensPerSecond** (Count/Second)
   - Dimensions: `AgentId`, `Model`
   - Unit: Count/Second
   - Statistic: Average
   - Description: Token generation rate

### Derived Metrics (Math Expressions)

**Budget Utilization:**
```
(daily_cost / daily_budget) * 100
```

**Cost Trend:**
```
(today_cost - yesterday_cost) / yesterday_cost * 100
```

**Efficiency Trend:**
```
(today_efficiency - last_week_efficiency) / last_week_efficiency * 100
```

## Dashboard Design

### Dashboard: `OPX-Token-Analytics`

**Layout:** 6 rows × 3 columns (18 widgets)

#### Row 1: Overview (3 widgets)

**Widget 1: Total Cost Today**
- Type: Single Value
- Metric: `TotalCost` (Period=DAILY, Sum)
- Comparison: Yesterday
- Color: Green if < budget, Red if > budget

**Widget 2: Total Tokens Today**
- Type: Single Value
- Metric: `InputTokens + OutputTokens` (Sum)
- Comparison: Yesterday

**Widget 3: Budget Utilization**
- Type: Gauge
- Formula: `(daily_cost / daily_budget) * 100`
- Thresholds: <80% green, 80-95% yellow, >95% red

#### Row 2: Cost Trends (3 widgets)

**Widget 4: Daily Cost Trend (7 days)**
- Type: Line Chart
- Metric: `TotalCost` (Period=DAILY, Sum)
- Time Range: Last 7 days
- Y-Axis: USD

**Widget 5: Cost by Agent (Today)**
- Type: Bar Chart
- Metric: `TotalCost` (Sum, grouped by AgentId)
- Sort: Descending

**Widget 6: Cost by Model (Today)**
- Type: Pie Chart
- Metric: `TotalCost` (Sum, grouped by Model)

#### Row 3: Token Consumption (3 widgets)

**Widget 7: Input vs Output Tokens**
- Type: Stacked Area Chart
- Metrics: `InputTokens`, `OutputTokens`
- Time Range: Last 24 hours
- Dimensions: AgentId

**Widget 8: Token Efficiency by Agent**
- Type: Bar Chart
- Metric: `TokenEfficiency` (Average)
- Dimensions: AgentId
- Sort: Descending

**Widget 9: Tokens Per Second**
- Type: Line Chart
- Metric: `TokensPerSecond` (Average)
- Dimensions: AgentId
- Time Range: Last 1 hour

#### Row 4: Agent Comparison (3 widgets)

**Widget 10: Cost Per Recommendation**
- Type: Bar Chart
- Metric: `CostPerRecommendation` (Average)
- Dimensions: AgentId
- Target Line: $0.50 (budget target)

**Widget 11: Agent Execution Count**
- Type: Bar Chart
- Metric: Custom metric from Phase 6
- Dimensions: AgentId
- Time Range: Today

**Widget 12: Average Tokens Per Agent Call**
- Type: Table
- Columns: AgentId, Avg Input, Avg Output, Avg Total, Avg Cost
- Sort: By Avg Cost descending

#### Row 5: Forecasting (3 widgets)

**Widget 13: Monthly Cost Forecast**
- Type: Line Chart with Forecast
- Metric: `TotalCost` (Period=DAILY, Sum)
- Forecast: 7 days ahead
- Confidence Interval: 95%

**Widget 14: Budget Burn Rate**
- Type: Line Chart
- Formula: `cumulative_cost / days_in_month`
- Target Line: Monthly budget / days_in_month
- Alert: If burn rate > target

**Widget 15: Projected Month-End Cost**
- Type: Single Value
- Formula: `(current_cost / days_elapsed) * days_in_month`
- Comparison: Monthly budget
- Color: Red if > budget

#### Row 6: Anomalies & Alerts (3 widgets)

**Widget 16: Cost Anomalies**
- Type: Line Chart with Anomaly Detection
- Metric: `TotalCost` (Period=HOURLY, Sum)
- Anomaly Band: 2 standard deviations
- Time Range: Last 7 days

**Widget 17: High-Cost Incidents**
- Type: Log Insights Query
- Query: Top 10 incidents by cost (from traces)
- Columns: IncidentId, TotalCost, AgentCount, TokenCount

**Widget 18: Recent Alerts**
- Type: Alarm Status
- Alarms: All token/cost related alarms
- Status: OK, ALARM, INSUFFICIENT_DATA

## Query Patterns

### DynamoDB Queries (Phase 8.1 Traces)

**Query 1: Cost by Incident**
```python
def get_incident_cost(incident_id: str) -> dict:
    """Get total cost for an incident."""
    response = dynamodb.query(
        TableName='opx-llm-traces',
        IndexName='IncidentIndex',
        KeyConditionExpression='GSI1PK = :pk',
        ExpressionAttributeValues={':pk': f'INCIDENT#{incident_id}'},
        ProjectionExpression='cost',
    )
    
    total_cost = sum(item['cost']['total'] for item in response['Items'])
    total_input_tokens = sum(item['cost']['inputTokens'] for item in response['Items'])
    total_output_tokens = sum(item['cost']['outputTokens'] for item in response['Items'])
    
    return {
        'incident_id': incident_id,
        'total_cost': total_cost,
        'input_tokens': total_input_tokens,
        'output_tokens': total_output_tokens,
        'agent_count': len(response['Items']),
    }
```

**Query 2: Cost by Agent (Time Range)**
```python
def get_agent_cost(agent_id: str, start_time: str, end_time: str) -> dict:
    """Get cost for an agent in a time range."""
    response = dynamodb.query(
        TableName='opx-llm-traces',
        IndexName='AgentIndex',
        KeyConditionExpression='GSI2PK = :pk AND GSI2SK BETWEEN :start AND :end',
        ExpressionAttributeValues={
            ':pk': f'AGENT#{agent_id}',
            ':start': f'TIMESTAMP#{start_time}',
            ':end': f'TIMESTAMP#{end_time}',
        },
        ProjectionExpression='cost, prompt.tokens, response.tokens',
    )
    
    return {
        'agent_id': agent_id,
        'total_cost': sum(item['cost']['total'] for item in response['Items']),
        'execution_count': len(response['Items']),
        'avg_cost': sum(item['cost']['total'] for item in response['Items']) / len(response['Items']),
    }
```

**Query 3: Top Expensive Incidents**
```python
def get_top_expensive_incidents(limit: int = 10) -> list:
    """Get most expensive incidents."""
    # Scan traces, group by incident, sort by cost
    # (In production, use aggregation table or cache)
    
    incidents = {}
    response = dynamodb.scan(
        TableName='opx-llm-traces',
        ProjectionExpression='incidentId, cost',
    )
    
    for item in response['Items']:
        incident_id = item['incidentId']
        cost = item['cost']['total']
        incidents[incident_id] = incidents.get(incident_id, 0) + cost
    
    sorted_incidents = sorted(incidents.items(), key=lambda x: x[1], reverse=True)
    return sorted_incidents[:limit]
```

### CloudWatch Logs Insights Queries

**Query 1: Cost by Agent (Last 24h)**
```
fields @timestamp, agent_id, cost_usd
| filter @message like /LLM trace captured/
| stats sum(cost_usd) as total_cost by agent_id
| sort total_cost desc
```

**Query 2: Token Efficiency**
```
fields @timestamp, agent_id, input_tokens, output_tokens
| filter @message like /LLM trace captured/
| stats sum(output_tokens) / sum(input_tokens) as efficiency by agent_id
| sort efficiency desc
```

**Query 3: High-Cost Traces**
```
fields @timestamp, trace_id, agent_id, cost_usd, input_tokens, output_tokens
| filter cost_usd > 0.01
| sort cost_usd desc
| limit 20
```

## Alerting

### CloudWatch Alarms

**Alarm 1: Daily Budget Exceeded**
- Metric: `TotalCost` (Period=DAILY, Sum)
- Threshold: $10.00 (configurable)
- Evaluation: 1 datapoint in 1 period
- Action: SNS notification
- Severity: HIGH

**Alarm 2: Hourly Cost Spike**
- Metric: `TotalCost` (Period=HOURLY, Sum)
- Threshold: $2.00 (configurable)
- Evaluation: 1 datapoint in 1 period
- Action: SNS notification
- Severity: MEDIUM

**Alarm 3: Agent Cost Anomaly**
- Metric: `TotalCost` (by AgentId)
- Anomaly Detection: 2 standard deviations
- Evaluation: 2 datapoints in 3 periods
- Action: SNS notification
- Severity: LOW

**Alarm 4: Low Token Efficiency**
- Metric: `TokenEfficiency` (by AgentId)
- Threshold: < 0.5 (output/input ratio)
- Evaluation: 3 datapoints in 5 periods
- Action: SNS notification
- Severity: LOW

**Alarm 5: Monthly Budget Forecast Exceeded**
- Metric: Math expression (projected month-end cost)
- Threshold: Monthly budget
- Evaluation: 1 datapoint in 1 period
- Action: SNS notification
- Severity: HIGH

## Budget Management

### Budget Configuration

**Location:** `infra/constructs/token-budget-config.ts`

```typescript
export interface TokenBudgetConfig {
  daily: number;    // USD
  weekly: number;   // USD
  monthly: number;  // USD
  perIncident: number; // USD
  perAgent: {
    [agentId: string]: number; // USD per day
  };
}

export const DEFAULT_BUDGET: TokenBudgetConfig = {
  daily: 10.00,
  weekly: 60.00,
  monthly: 250.00,
  perIncident: 1.00,
  perAgent: {
    'signal-intelligence': 2.00,
    'historical-pattern': 1.50,
    'change-intelligence': 1.50,
    'risk-blast-radius': 1.50,
    'knowledge-rag': 2.00,
    'response-strategy': 1.50,
  },
};
```

### Budget Enforcement

**Location:** `src/langgraph/cost_guardian_node.py`

**Enhanced Cost Guardian:**
```python
class CostGuardian:
    def __init__(self, budget_config: dict):
        self.budget = budget_config
        self.dynamodb = boto3.resource('dynamodb')
        self.traces_table = self.dynamodb.Table('opx-llm-traces')
    
    async def check_budget(self, state: dict) -> dict:
        """Check if budget allows execution."""
        
        # Get current daily spend
        daily_spend = await self._get_daily_spend()
        
        # Check daily budget
        if daily_spend >= self.budget['daily']:
            logger.warning(f"Daily budget exceeded: ${daily_spend:.2f} / ${self.budget['daily']:.2f}")
            state['budget_exceeded'] = True
            state['budget_status'] = {
                'daily_spend': daily_spend,
                'daily_budget': self.budget['daily'],
                'remaining': 0,
            }
            return state
        
        # Check per-agent budget
        agent_spend = await self._get_agent_spend_today(state['current_agent'])
        agent_budget = self.budget['perAgent'].get(state['current_agent'], 2.00)
        
        if agent_spend >= agent_budget:
            logger.warning(f"Agent budget exceeded: {state['current_agent']} ${agent_spend:.2f} / ${agent_budget:.2f}")
            state['agent_budget_exceeded'] = True
        
        # Update state
        state['budget_status'] = {
            'daily_spend': daily_spend,
            'daily_budget': self.budget['daily'],
            'remaining': self.budget['daily'] - daily_spend,
            'agent_spend': agent_spend,
            'agent_budget': agent_budget,
        }
        
        return state
    
    async def _get_daily_spend(self) -> float:
        """Get total spend today."""
        today = datetime.utcnow().date().isoformat()
        
        # Query traces from today
        response = self.traces_table.scan(
            FilterExpression='begins_with(#ts, :today)',
            ExpressionAttributeNames={'#ts': 'timestamp'},
            ExpressionAttributeValues={':today': today},
            ProjectionExpression='cost.total',
        )
        
        return sum(item['cost']['total'] for item in response['Items'])
```

## Infrastructure (CDK)

### Construct: `infra/constructs/token-analytics-dashboard.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class TokenAnalyticsDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'OPX-Token-Analytics',
      start: '-P7D', // Last 7 days
    });

    // Row 1: Overview
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Total Cost Today',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'OPX/TokenUsage',
            metricName: 'TotalCost',
            dimensionsMap: { Period: 'DAILY' },
            statistic: 'Sum',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 8,
      }),
      // ... more widgets
    );

    // Row 2: Cost Trends
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Daily Cost Trend (7 days)',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/TokenUsage',
            metricName: 'TotalCost',
            dimensionsMap: { Period: 'DAILY' },
            statistic: 'Sum',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 12,
      }),
      // ... more widgets
    );

    // ... more rows
  }
}
```

### Construct: `infra/constructs/token-budget-alarms.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface TokenBudgetAlarmsProps {
  dailyBudget: number;
  hourlyBudget: number;
  alarmTopic: sns.Topic;
}

export class TokenBudgetAlarms extends Construct {
  constructor(scope: Construct, id: string, props: TokenBudgetAlarmsProps) {
    super(scope, id);

    // Daily Budget Alarm
    new cloudwatch.Alarm(this, 'DailyBudgetAlarm', {
      alarmName: 'opx-token-daily-budget-exceeded',
      alarmDescription: 'Daily token budget exceeded',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/TokenUsage',
        metricName: 'TotalCost',
        dimensionsMap: { Period: 'DAILY' },
        statistic: 'Sum',
        period: cdk.Duration.days(1),
      }),
      threshold: props.dailyBudget,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      actionsEnabled: true,
    }).addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));

    // Hourly Spike Alarm
    new cloudwatch.Alarm(this, 'HourlySpikeAlarm', {
      alarmName: 'opx-token-hourly-spike',
      alarmDescription: 'Hourly token cost spike detected',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/TokenUsage',
        metricName: 'TotalCost',
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      }),
      threshold: props.hourlyBudget,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      actionsEnabled: true,
    }).addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
  }
}
```

## Testing Strategy

### Unit Tests

```python
def test_budget_check_allows_execution_under_budget():
    guardian = CostGuardian(budget={'daily': 10.00})
    state = {'current_agent': 'signal-intelligence'}
    
    # Mock daily spend = $5.00
    with patch.object(guardian, '_get_daily_spend', return_value=5.00):
        result = await guardian.check_budget(state)
        assert result['budget_exceeded'] is False
        assert result['budget_status']['remaining'] == 5.00

def test_budget_check_blocks_execution_over_budget():
    guardian = CostGuardian(budget={'daily': 10.00})
    state = {'current_agent': 'signal-intelligence'}
    
    # Mock daily spend = $12.00
    with patch.object(guardian, '_get_daily_spend', return_value=12.00):
        result = await guardian.check_budget(state)
        assert result['budget_exceeded'] is True
        assert result['budget_status']['remaining'] == 0
```

### Integration Tests

```python
@pytest.mark.integration
async def test_cost_tracking_end_to_end():
    # Execute agent
    result = await invoke_agent(agent_id='signal-intelligence', ...)
    
    # Wait for trace write
    await asyncio.sleep(1)
    
    # Query cost
    cost = await get_agent_cost('signal-intelligence', today, today)
    assert cost['total_cost'] > 0
    assert cost['execution_count'] > 0
```

## Success Criteria

- ✅ CloudWatch dashboard deployed with 18 widgets
- ✅ All metrics publishing correctly
- ✅ Budget alarms configured and tested
- ✅ DynamoDB queries working (incident cost, agent cost)
- ✅ CloudWatch Logs Insights queries functional
- ✅ Budget enforcement in Cost Guardian
- ✅ Forecasting working
- ✅ Unit tests passing
- ✅ Integration tests passing

## Cost Estimate

**CloudWatch:**
- Dashboard: $3/month
- Metrics: ~20 custom metrics × $0.30 = $6/month
- Alarms: 5 alarms × $0.10 = $0.50/month
- Logs Insights queries: ~$1/month

**Total:** ~$10.50/month

## Next Steps

1. **Review and approve this design**
2. **Implement CloudWatch dashboard (CDK)**
3. **Implement budget alarms (CDK)**
4. **Enhance Cost Guardian with budget checks**
5. **Create DynamoDB query functions**
6. **Write unit tests**
7. **Deploy and verify**

---

**Status:** Awaiting approval to proceed with implementation  
**Dependencies:** Phase 8.1 (Tracing) for cost data  
**Blocks:** None
