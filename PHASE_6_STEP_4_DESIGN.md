# Phase 6 Step 4: Observability & Governance

**Status:** 📋 DESIGN - AWAITING APPROVAL  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Phase 6 Steps 1-3 complete  
**Risk:** LOW (infrastructure and monitoring)

---

## Objective

Implement comprehensive observability, cost tracking, and governance for the AI agent system to ensure transparency, accountability, and operational excellence.

---

## Scope

### In Scope
- CloudWatch dashboards for agent performance
- Cost tracking and budget alerts
- Agent execution tracing (X-Ray)
- LLM prompt/response logging
- Timeout and failure alerting
- Recommendation quality metrics
- Budget enforcement
- Guardrails validation

### Out of Scope
- Human approval workflow (Phase 5)
- Action execution monitoring (Phase 5)
- Advanced ML observability (Phase 8)
- Custom metrics aggregation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT SYSTEM                             │
│  • Orchestrator                                             │
│  • 6 Agent Lambdas                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Metrics, Logs, Traces
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                 OBSERVABILITY LAYER                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  CloudWatch  │  │   X-Ray      │  │  DynamoDB    │      │
│  │  Metrics     │  │   Traces     │  │  Logs        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CloudWatch Dashboard                         │  │
│  │  • Agent performance                                 │  │
│  │  • Cost tracking                                     │  │
│  │  • Recommendation quality                            │  │
│  │  • Timeout/failure rates                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Budget Alerts & Governance                   │  │
│  │  • Per-incident cost limits                          │  │
│  │  • Monthly budget alerts                             │  │
│  │  • Automatic throttling                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                     │
                     │ Alerts
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    SNS TOPICS                               │
│  • AgentFailureAlerts                                       │
│  • BudgetAlerts                                             │
│  • QualityAlerts                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Task 4.1: CloudWatch Metrics (4 hours)

**File:** `src/agents/metrics.ts`

```typescript
/**
 * Phase 6 Step 4: Agent Metrics
 * 
 * Centralized metrics publishing for all agents.
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({});

export class AgentMetrics {
  /**
   * Publish agent execution metrics
   */
  static async publishExecutionMetrics(params: {
    agentId: string;
    incidentId: string;
    durationMs: number;
    success: boolean;
    timedOut: boolean;
    cost: number;
  }): Promise<void> {
    const metrics = [
      {
        MetricName: 'ExecutionDuration',
        Value: params.durationMs,
        Unit: 'Milliseconds',
        Dimensions: [
          { Name: 'AgentId', Value: params.agentId },
          { Name: 'Success', Value: params.success.toString() },
        ],
      },
      {
        MetricName: 'ExecutionSuccess',
        Value: params.success ? 1 : 0,
        Unit: 'Count',
        Dimensions: [{ Name: 'AgentId', Value: params.agentId }],
      },
      {
        MetricName: 'ExecutionTimeout',
        Value: params.timedOut ? 1 : 0,
        Unit: 'Count',
        Dimensions: [{ Name: 'AgentId', Value: params.agentId }],
      },
      {
        MetricName: 'ExecutionCost',
        Value: params.cost,
        Unit: 'None',
        Dimensions: [{ Name: 'AgentId', Value: params.agentId }],
      },
    ];

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Agents',
        MetricData: metrics,
      })
    );
  }

  /**
   * Publish recommendation quality metrics
   */
  static async publishRecommendationMetrics(params: {
    incidentId: string;
    recommendationId: string;
    actionCount: number;
    totalCost: number;
    totalDurationMs: number;
  }): Promise<void> {
    const metrics = [
      {
        MetricName: 'RecommendationGenerated',
        Value: 1,
        Unit: 'Count',
      },
      {
        MetricName: 'RecommendationActionCount',
        Value: params.actionCount,
        Unit: 'Count',
      },
      {
        MetricName: 'RecommendationCost',
        Value: params.totalCost,
        Unit: 'None',
      },
      {
        MetricName: 'RecommendationDuration',
        Value: params.totalDurationMs,
        Unit: 'Milliseconds',
      },
    ];

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Recommendations',
        MetricData: metrics,
      })
    );
  }

  /**
   * Publish budget tracking metrics
   */
  static async publishBudgetMetrics(params: {
    period: 'DAILY' | 'MONTHLY';
    totalCost: number;
    budgetLimit: number;
    utilizationPercent: number;
  }): Promise<void> {
    const metrics = [
      {
        MetricName: 'BudgetUtilization',
        Value: params.utilizationPercent,
        Unit: 'Percent',
        Dimensions: [{ Name: 'Period', Value: params.period }],
      },
      {
        MetricName: 'TotalCost',
        Value: params.totalCost,
        Unit: 'None',
        Dimensions: [{ Name: 'Period', Value: params.period }],
      },
    ];

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Budget',
        MetricData: metrics,
      })
    );
  }
}
```

**Acceptance:**
- [ ] Metrics published to CloudWatch
- [ ] Agent execution metrics tracked
- [ ] Recommendation metrics tracked
- [ ] Budget metrics tracked

---
### Task 4.2: X-Ray Tracing (3 hours)

**File:** `src/agents/tracing.ts`

```typescript
/**
 * Phase 6 Step 4: Agent Tracing
 * 
 * X-Ray tracing for agent execution visibility.
 */

import * as AWSXRay from 'aws-xray-sdk-core';

export class AgentTracing {
  /**
   * Create trace segment for agent execution
   */
  static async traceAgentExecution<T>(
    agentId: string,
    incidentId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const segment = AWSXRay.getSegment();
    const subsegment = segment?.addNewSubsegment(`Agent-${agentId}`);

    subsegment?.addAnnotation('agentId', agentId);
    subsegment?.addAnnotation('incidentId', incidentId);
    subsegment?.addMetadata('timestamp', new Date().toISOString());

    try {
      const result = await fn();
      subsegment?.close();
      return result;
    } catch (error) {
      subsegment?.addError(error as Error);
      subsegment?.close();
      throw error;
    }
  }

  /**
   * Trace LLM invocation
   */
  static async traceLLMInvocation<T>(
    modelId: string,
    inputTokens: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const segment = AWSXRay.getSegment();
    const subsegment = segment?.addNewSubsegment('LLM-Invocation');

    subsegment?.addAnnotation('modelId', modelId);
    subsegment?.addMetadata('inputTokens', inputTokens);

    try {
      const result = await fn();
      subsegment?.close();
      return result;
    } catch (error) {
      subsegment?.addError(error as Error);
      subsegment?.close();
      throw error;
    }
  }
}
```

**Update agents to use tracing:**

```typescript
// In each agent handler
export async function handler(event: AgentInput): Promise<AgentOutput> {
  return await AgentTracing.traceAgentExecution(
    'signal-analysis',
    event.incidentId,
    async () => {
      const agent = new SignalAnalysisAgent();
      return await agent.analyze(event);
    }
  );
}
```

**Acceptance:**
- [ ] X-Ray SDK integrated
- [ ] Agent executions traced
- [ ] LLM invocations traced
- [ ] Trace IDs propagated

---
### Task 4.3: LLM Prompt/Response Logging (4 hours)

**File:** `src/agents/llm-logger.ts`

```typescript
/**
 * Phase 6 Step 4: LLM Logging
 * 
 * Comprehensive logging of LLM prompts and responses for debugging and auditing.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface LLMLogEntry {
  logId: string;
  agentId: string;
  incidentId: string;
  modelId: string;
  prompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

export class LLMLogger {
  /**
   * Log LLM invocation
   */
  static async logInvocation(entry: Omit<LLMLogEntry, 'logId' | 'timestamp'>): Promise<void> {
    const logId = randomUUID();
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    const logEntry: LLMLogEntry = {
      ...entry,
      logId,
      timestamp,
    };

    // Store in DynamoDB for auditing
    await dynamodb.send(
      new PutCommand({
        TableName: 'opx-agent-executions',
        Item: {
          pk: `AGENT#${entry.agentId}`,
          sk: `LLM_LOG#${timestamp}#${logId}`,
          ...logEntry,
          ttl,
        },
      })
    );

    // Also log to CloudWatch for searchability
    console.log('LLM_INVOCATION', {
      logId,
      agentId: entry.agentId,
      incidentId: entry.incidentId,
      modelId: entry.modelId,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cost: entry.cost,
      durationMs: entry.durationMs,
      success: entry.success,
      // Truncate prompt/response for CloudWatch
      promptPreview: entry.prompt.substring(0, 200),
      responsePreview: entry.response.substring(0, 200),
    });
  }
}
```

**Update agents to use logging:**

```typescript
// In each agent's invokeLLM method
private async invokeLLM(prompt: string): Promise<any> {
  const startTime = Date.now();
  let success = false;
  let response = '';
  let error: string | undefined;

  try {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      // ... rest of config
    });

    const llmResponse = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(llmResponse.body).toString());
    response = responseBody.content[0].text;
    success = true;

    return JSON.parse(response);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    throw err;
  } finally {
    // Log invocation
    await LLMLogger.logInvocation({
      agentId: 'signal-analysis',
      incidentId: this.incidentId,
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      prompt,
      response,
      inputTokens: 1000, // Extract from response
      outputTokens: 500,  // Extract from response
      cost: this.calculateCost({ usage: { input_tokens: 1000, output_tokens: 500 } }),
      durationMs: Date.now() - startTime,
      success,
      error,
    });
  }
}
```

**Acceptance:**
- [ ] All LLM invocations logged
- [ ] Prompts and responses stored
- [ ] Token usage tracked
- [ ] Cost calculated
- [ ] Searchable in CloudWatch

---
### Task 4.4: CloudWatch Dashboard (6 hours)

**File:** `infra/constructs/agent-dashboard.ts`

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class AgentDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.dashboard = new cloudwatch.Dashboard(this, 'AgentDashboard', {
      dashboardName: 'OPX-Agent-Intelligence',
    });

    // Row 1: Agent Performance
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Execution Duration (p50, p95, p99)',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'ExecutionDuration',
            statistic: 'p50',
          }),
          new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'ExecutionDuration',
            statistic: 'p95',
          }),
          new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'ExecutionDuration',
            statistic: 'p99',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Agent Success Rate',
        left: [
          new cloudwatch.MathExpression({
            expression: '(success / (success + failure)) * 100',
            usingMetrics: {
              success: new cloudwatch.Metric({
                namespace: 'OPX/Agents',
                metricName: 'ExecutionSuccess',
                statistic: 'Sum',
              }),
              failure: new cloudwatch.Metric({
                namespace: 'OPX/Agents',
                metricName: 'ExecutionSuccess',
                statistic: 'Sum',
              }),
            },
          }),
        ],
        width: 12,
      })
    );

    // Row 2: Cost Tracking
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cost per Incident',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Recommendations',
            metricName: 'RecommendationCost',
            statistic: 'Average',
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Daily Cost',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Budget',
            metricName: 'TotalCost',
            dimensionsMap: { Period: 'DAILY' },
            statistic: 'Sum',
          }),
        ],
        width: 8,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Budget Utilization',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'OPX/Budget',
            metricName: 'BudgetUtilization',
            dimensionsMap: { Period: 'MONTHLY' },
            statistic: 'Average',
          }),
        ],
        width: 8,
      })
    );

    // Row 3: Agent-Specific Metrics
    const agentNames = [
      'signal-analysis',
      'historical-incident',
      'change-intelligence',
      'risk-blast-radius',
      'knowledge-rag',
      'execution-proposal',
    ];

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Execution Count',
        left: agentNames.map(
          (name) =>
            new cloudwatch.Metric({
              namespace: 'OPX/Agents',
              metricName: 'ExecutionSuccess',
              dimensionsMap: { AgentId: name },
              statistic: 'Sum',
              label: name,
            })
        ),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Agent Timeout Rate',
        left: agentNames.map(
          (name) =>
            new cloudwatch.Metric({
              namespace: 'OPX/Agents',
              metricName: 'ExecutionTimeout',
              dimensionsMap: { AgentId: name },
              statistic: 'Sum',
              label: name,
            })
        ),
        width: 12,
      })
    );

    // Row 4: Recommendation Quality
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Recommendations Generated',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Recommendations',
            metricName: 'RecommendationGenerated',
            statistic: 'Sum',
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Actions per Recommendation',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Recommendations',
            metricName: 'RecommendationActionCount',
            statistic: 'Average',
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Recommendation Duration',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Recommendations',
            metricName: 'RecommendationDuration',
            statistic: 'Average',
          }),
        ],
        width: 8,
      })
    );
  }
}
```

**Acceptance:**
- [ ] Dashboard created in CloudWatch
- [ ] All key metrics visualized
- [ ] Cost tracking visible
- [ ] Agent performance tracked
- [ ] Recommendation quality tracked

---
### Task 4.5: Budget Enforcement (5 hours)

**File:** `src/agents/budget-enforcer.ts`

```typescript
/**
 * Phase 6 Step 4: Budget Enforcement
 * 
 * Enforces per-incident and monthly budget limits.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetItemCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export class BudgetEnforcer {
  private static readonly PER_INCIDENT_LIMIT = 1.0; // $1.00
  private static readonly MONTHLY_LIMIT = 10000.0; // $10,000

  /**
   * Check if incident budget allows agent execution
   */
  static async checkIncidentBudget(incidentId: string, estimatedCost: number): Promise<boolean> {
    // Get current incident cost
    const response = await dynamodb.send(
      new GetItemCommand({
        TableName: 'opx-agent-recommendations',
        Key: {
          pk: `INCIDENT#${incidentId}`,
          sk: 'BUDGET',
        },
      })
    );

    const currentCost = response.Item?.totalCost || 0;
    const newTotal = currentCost + estimatedCost;

    if (newTotal > this.PER_INCIDENT_LIMIT) {
      console.warn('Incident budget exceeded', {
        incidentId,
        currentCost,
        estimatedCost,
        limit: this.PER_INCIDENT_LIMIT,
      });
      return false;
    }

    return true;
  }

  /**
   * Check if monthly budget allows agent execution
   */
  static async checkMonthlyBudget(estimatedCost: number): Promise<boolean> {
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    // Get current monthly cost
    const response = await dynamodb.send(
      new GetItemCommand({
        TableName: 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
      })
    );

    const currentCost = response.Item?.totalCost || 0;
    const newTotal = currentCost + estimatedCost;

    if (newTotal > this.MONTHLY_LIMIT) {
      console.error('Monthly budget exceeded', {
        month,
        currentCost,
        estimatedCost,
        limit: this.MONTHLY_LIMIT,
      });
      return false;
    }

    return true;
  }

  /**
   * Record agent cost
   */
  static async recordCost(incidentId: string, agentId: string, cost: number): Promise<void> {
    const month = new Date().toISOString().substring(0, 7);

    // Update incident budget
    await dynamodb.send(
      new UpdateCommand({
        TableName: 'opx-agent-recommendations',
        Key: {
          pk: `INCIDENT#${incidentId}`,
          sk: 'BUDGET',
        },
        UpdateExpression: 'ADD totalCost :cost SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':cost': cost,
          ':now': new Date().toISOString(),
        },
      })
    );

    // Update monthly budget
    await dynamodb.send(
      new UpdateCommand({
        TableName: 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
        UpdateExpression: 'ADD totalCost :cost SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':cost': cost,
          ':now': new Date().toISOString(),
        },
      })
    );

    // Publish budget metrics
    const monthlyResponse = await dynamodb.send(
      new GetItemCommand({
        TableName: 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
      })
    );

    const monthlyTotal = monthlyResponse.Item?.totalCost || 0;
    const utilizationPercent = (monthlyTotal / this.MONTHLY_LIMIT) * 100;

    await AgentMetrics.publishBudgetMetrics({
      period: 'MONTHLY',
      totalCost: monthlyTotal,
      budgetLimit: this.MONTHLY_LIMIT,
      utilizationPercent,
    });
  }
}
```

**Update orchestrator to enforce budget:**

```typescript
// In orchestrator.ts
async orchestrate(input: AgentInput): Promise<OrchestratorResult> {
  // Check budgets before execution
  const estimatedCost = 0.50; // Estimate based on agent count

  const incidentBudgetOk = await BudgetEnforcer.checkIncidentBudget(
    input.incidentId,
    estimatedCost
  );

  const monthlyBudgetOk = await BudgetEnforcer.checkMonthlyBudget(estimatedCost);

  if (!incidentBudgetOk || !monthlyBudgetOk) {
    throw new Error('Budget limit exceeded - agent execution blocked');
  }

  // ... rest of orchestration ...

  // Record actual cost after execution
  const actualCost = result.agentResults.reduce((sum, r) => sum + (r.output?.cost || 0), 0);
  await BudgetEnforcer.recordCost(input.incidentId, 'orchestrator', actualCost);

  return result;
}
```

**Acceptance:**
- [ ] Per-incident budget enforced
- [ ] Monthly budget enforced
- [ ] Costs tracked in DynamoDB
- [ ] Budget metrics published
- [ ] Execution blocked when over budget

---
### Task 4.6: Alerting (4 hours)

**File:** `infra/constructs/agent-alerts.ts`

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface AgentAlertsProps {
  alertEmail: string;
}

export class AgentAlerts extends Construct {
  public readonly failureTopic: sns.Topic;
  public readonly budgetTopic: sns.Topic;
  public readonly qualityTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: AgentAlertsProps) {
    super(scope, id);

    // SNS Topics
    this.failureTopic = new sns.Topic(this, 'AgentFailureTopic', {
      displayName: 'OPX Agent Failures',
    });

    this.budgetTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      displayName: 'OPX Agent Budget Alerts',
    });

    this.qualityTopic = new sns.Topic(this, 'QualityAlertTopic', {
      displayName: 'OPX Agent Quality Alerts',
    });

    // Email subscriptions
    this.failureTopic.addSubscription(
      new subscriptions.EmailSubscription(props.alertEmail)
    );
    this.budgetTopic.addSubscription(
      new subscriptions.EmailSubscription(props.alertEmail)
    );
    this.qualityTopic.addSubscription(
      new subscriptions.EmailSubscription(props.alertEmail)
    );

    // Alarm 1: High Agent Failure Rate
    const failureAlarm = new cloudwatch.Alarm(this, 'HighFailureRate', {
      alarmName: 'OPX-Agent-HighFailureRate',
      alarmDescription: 'Agent failure rate exceeds 20%',
      metric: new cloudwatch.MathExpression({
        expression: '(failure / (success + failure)) * 100',
        usingMetrics: {
          success: new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'ExecutionSuccess',
            statistic: 'Sum',
          }),
          failure: new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'ExecutionSuccess',
            statistic: 'Sum',
          }),
        },
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 20,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    failureAlarm.addAlarmAction(new actions.SnsAction(this.failureTopic));

    // Alarm 2: High Timeout Rate
    const timeoutAlarm = new cloudwatch.Alarm(this, 'HighTimeoutRate', {
      alarmName: 'OPX-Agent-HighTimeoutRate',
      alarmDescription: 'Agent timeout rate exceeds 10%',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Agents',
        metricName: 'ExecutionTimeout',
        statistic: 'Sum',
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    timeoutAlarm.addAlarmAction(new actions.SnsAction(this.failureTopic));

    // Alarm 3: Budget Utilization Warning (80%)
    const budgetWarningAlarm = new cloudwatch.Alarm(this, 'BudgetWarning', {
      alarmName: 'OPX-Agent-BudgetWarning',
      alarmDescription: 'Monthly budget utilization exceeds 80%',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Budget',
        metricName: 'BudgetUtilization',
        dimensionsMap: { Period: 'MONTHLY' },
        statistic: 'Average',
      }),
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    budgetWarningAlarm.addAlarmAction(new actions.SnsAction(this.budgetTopic));

    // Alarm 4: Budget Utilization Critical (95%)
    const budgetCriticalAlarm = new cloudwatch.Alarm(this, 'BudgetCritical', {
      alarmName: 'OPX-Agent-BudgetCritical',
      alarmDescription: 'Monthly budget utilization exceeds 95%',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Budget',
        metricName: 'BudgetUtilization',
        dimensionsMap: { Period: 'MONTHLY' },
        statistic: 'Average',
      }),
      threshold: 95,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    budgetCriticalAlarm.addAlarmAction(new actions.SnsAction(this.budgetTopic));

    // Alarm 5: High Cost per Incident
    const costAlarm = new cloudwatch.Alarm(this, 'HighCostPerIncident', {
      alarmName: 'OPX-Agent-HighCostPerIncident',
      alarmDescription: 'Cost per incident exceeds $0.75',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Recommendations',
        metricName: 'RecommendationCost',
        statistic: 'Average',
      }),
      threshold: 0.75,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    costAlarm.addAlarmAction(new actions.SnsAction(this.budgetTopic));

    // Alarm 6: Low Recommendation Quality (placeholder)
    // This would be based on human feedback metrics (Phase 5)
    const qualityAlarm = new cloudwatch.Alarm(this, 'LowRecommendationQuality', {
      alarmName: 'OPX-Agent-LowRecommendationQuality',
      alarmDescription: 'Recommendation acceptance rate below 40%',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Recommendations',
        metricName: 'AcceptanceRate',
        statistic: 'Average',
      }),
      threshold: 40,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    qualityAlarm.addAlarmAction(new actions.SnsAction(this.qualityTopic));
  }
}
```

**Acceptance:**
- [ ] SNS topics created
- [ ] Email subscriptions configured
- [ ] Failure rate alarm created
- [ ] Timeout rate alarm created
- [ ] Budget alarms created (80%, 95%)
- [ ] Cost per incident alarm created
- [ ] Quality alarm created

---
### Task 4.7: Guardrails Validation (3 hours)

**File:** `src/agents/guardrails.ts`

```typescript
/**
 * Phase 6 Step 4: Agent Guardrails
 * 
 * Validates agent outputs against safety and quality guardrails.
 */

export interface GuardrailViolation {
  rule: string;
  severity: 'WARNING' | 'ERROR';
  message: string;
}

export class AgentGuardrails {
  /**
   * Validate agent output against guardrails
   */
  static validateOutput(agentId: string, output: any): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    // Guardrail 1: No execution authority
    if (this.hasExecutionAuthority(output)) {
      violations.push({
        rule: 'NO_EXECUTION_AUTHORITY',
        severity: 'ERROR',
        message: 'Agent output contains execution commands - agents are advisory only',
      });
    }

    // Guardrail 2: Confidence scores required
    if (this.missingConfidenceScores(output)) {
      violations.push({
        rule: 'CONFIDENCE_REQUIRED',
        severity: 'WARNING',
        message: 'Agent output missing confidence scores',
      });
    }

    // Guardrail 3: Approval required flag
    if (this.missingApprovalFlag(output)) {
      violations.push({
        rule: 'APPROVAL_REQUIRED',
        severity: 'ERROR',
        message: 'All actions must have approvalRequired=true',
      });
    }

    // Guardrail 4: Rollback plan required
    if (this.missingRollbackPlan(output)) {
      violations.push({
        rule: 'ROLLBACK_PLAN_REQUIRED',
        severity: 'WARNING',
        message: 'Actions missing rollback plans',
      });
    }

    // Guardrail 5: Cost within limits
    if (output.cost && output.cost > 1.0) {
      violations.push({
        rule: 'COST_LIMIT',
        severity: 'ERROR',
        message: `Agent cost ${output.cost} exceeds limit of $1.00`,
      });
    }

    // Guardrail 6: No PII in output
    if (this.containsPII(output)) {
      violations.push({
        rule: 'NO_PII',
        severity: 'ERROR',
        message: 'Agent output contains potential PII',
      });
    }

    return violations;
  }

  private static hasExecutionAuthority(output: any): boolean {
    // Check for execution commands
    const executionKeywords = ['execute', 'run', 'deploy', 'delete', 'terminate'];
    const outputStr = JSON.stringify(output).toLowerCase();

    return executionKeywords.some((keyword) => outputStr.includes(keyword));
  }

  private static missingConfidenceScores(output: any): boolean {
    if (output.analysis && typeof output.analysis.confidence !== 'number') {
      return true;
    }
    return false;
  }

  private static missingApprovalFlag(output: any): boolean {
    if (output.proposedActions && Array.isArray(output.proposedActions)) {
      return output.proposedActions.some(
        (action: any) => action.approvalRequired !== true
      );
    }
    return false;
  }

  private static missingRollbackPlan(output: any): boolean {
    if (output.proposedActions && Array.isArray(output.proposedActions)) {
      return output.proposedActions.some(
        (action: any) => !action.rollbackPlan || action.rollbackPlan.trim() === ''
      );
    }
    return false;
  }

  private static containsPII(output: any): boolean {
    // Simple PII detection (email, SSN patterns)
    const outputStr = JSON.stringify(output);
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const ssnPattern = /\d{3}-\d{2}-\d{4}/;

    return emailPattern.test(outputStr) || ssnPattern.test(outputStr);
  }

  /**
   * Log guardrail violations
   */
  static logViolations(
    agentId: string,
    incidentId: string,
    violations: GuardrailViolation[]
  ): void {
    if (violations.length === 0) return;

    console.warn('GUARDRAIL_VIOLATIONS', {
      agentId,
      incidentId,
      violations,
    });

    // Publish metric
    const errorCount = violations.filter((v) => v.severity === 'ERROR').length;
    const warningCount = violations.filter((v) => v.severity === 'WARNING').length;

    // TODO: Publish to CloudWatch metrics
  }
}
```

**Update agents to validate output:**

```typescript
// In each agent handler
export async function handler(event: AgentInput): Promise<AgentOutput> {
  const agent = new SignalAnalysisAgent();
  const output = await agent.analyze(event);

  // Validate against guardrails
  const violations = AgentGuardrails.validateOutput('signal-analysis', output);

  if (violations.some((v) => v.severity === 'ERROR')) {
    AgentGuardrails.logViolations('signal-analysis', event.incidentId, violations);
    throw new Error('Guardrail violations detected - output rejected');
  }

  if (violations.length > 0) {
    AgentGuardrails.logViolations('signal-analysis', event.incidentId, violations);
  }

  return output;
}
```

**Acceptance:**
- [ ] Guardrails implemented
- [ ] Output validation working
- [ ] Violations logged
- [ ] Errors block execution
- [ ] Warnings logged but allowed

---

## Testing Strategy

### Unit Tests
- Metrics publishing
- Budget enforcement logic
- Guardrail validation
- Alert threshold calculations

### Integration Tests
- End-to-end observability flow
- Dashboard data population
- Alert triggering
- Budget limit enforcement

### Manual Tests
1. Generate test incidents
2. Verify metrics in CloudWatch
3. Check dashboard visualization
4. Trigger budget alerts
5. Validate guardrail enforcement

---

## Deployment Steps

1. **Deploy metrics infrastructure**
   ```bash
   npm run cdk deploy -- --exclusively opx-control-plane/AgentMetrics
   ```

2. **Deploy dashboard**
   ```bash
   npm run cdk deploy -- --exclusively opx-control-plane/AgentDashboard
   ```

3. **Deploy alerts**
   ```bash
   npm run cdk deploy -- --exclusively opx-control-plane/AgentAlerts
   ```

4. **Update agents with observability**
   ```bash
   npm run build
   npm run cdk deploy -- --exclusively opx-control-plane/AgentOrchestration
   ```

5. **Verify observability**
   ```bash
   # Check dashboard
   aws cloudwatch get-dashboard --dashboard-name OPX-Agent-Intelligence

   # Check alarms
   aws cloudwatch describe-alarms --alarm-name-prefix OPX-Agent
   ```

---

## Success Criteria

- [ ] All metrics published to CloudWatch
- [ ] Dashboard displaying real-time data
- [ ] X-Ray tracing working
- [ ] LLM invocations logged
- [ ] Budget enforcement working
- [ ] Alerts configured and tested
- [ ] Guardrails validated
- [ ] Cost per incident < $0.50
- [ ] All tests passing

---

## Rollback Plan

If issues arise:
1. Disable alerting (to prevent noise)
2. Keep metrics collection (for debugging)
3. Disable budget enforcement (if blocking legitimate work)
4. Document issues for next attempt

---

## Open Questions

1. Should we implement automatic agent disabling if quality drops below threshold?
2. What is the acceptable cost per incident for production?
3. Should we implement rate limiting per service (not just global)?
4. How do we handle budget overruns mid-month?

---

## Next Steps

After Step 4 completion:
- **Phase 6 Complete:** All agents implemented with full observability
- **Phase 7:** RAG implementation (document ingestion, vector store)
- **Phase 5:** Human approval workflow and action execution

---

**Status:** AWAITING APPROVAL  
**Estimated Duration:** 1-2 weeks  
**Risk:** LOW (infrastructure and monitoring)

---

**Design Authority:** This design must be approved before implementation begins.
