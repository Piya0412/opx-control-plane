/**
 * Phase 6 Step 4: Observability Adapter
 * 
 * CORRECTION 1: Agents call this adapter, adapter calls AWS APIs.
 * This preserves replay safety and control plane boundaries.
 * 
 * All operations are timestamped for replay determinism.
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

const cloudwatch = new CloudWatchClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface MetricData {
  agentId: string;
  incidentId: string;
  durationMs: number;
  success: boolean;
  timedOut: boolean;
  cost: number;
  timestamp: string; // ISO 8601
}

export interface BudgetStatus {
  allowed: boolean;
  reason?: string;
  currentIncidentCost: number;
  currentMonthlyCost: number;
  incidentLimit: number;
  monthlyLimit: number;
}

export interface RedactedLLMLog {
  logId: string;
  agentId: string;
  incidentId: string;
  modelId: string;
  promptHash: string; // SHA-256 hash of prompt
  promptLength: number;
  responseSummary: string; // First 200 chars only
  responseLength: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
  timestamp: string;
  success: boolean;
  error?: string;
}


export class ObservabilityAdapter {
  private static readonly PER_INCIDENT_LIMIT = 1.0; // $1.00
  private static readonly MONTHLY_LIMIT = 10000.0; // $10,000

  /**
   * Publish agent execution metrics to CloudWatch
   */
  static async publishMetrics(data: MetricData): Promise<void> {
    const metrics = [
      {
        MetricName: 'ExecutionDuration',
        Value: data.durationMs,
        Unit: StandardUnit.Milliseconds,
        Timestamp: new Date(data.timestamp),
        Dimensions: [
          { Name: 'AgentId', Value: data.agentId },
          { Name: 'Success', Value: data.success.toString() },
        ],
      },
      {
        MetricName: 'ExecutionSuccess',
        Value: data.success ? 1 : 0,
        Unit: StandardUnit.Count,
        Timestamp: new Date(data.timestamp),
        Dimensions: [{ Name: 'AgentId', Value: data.agentId }],
      },
      {
        MetricName: 'ExecutionFailure',
        Value: data.success ? 0 : 1,
        Unit: StandardUnit.Count,
        Timestamp: new Date(data.timestamp),
        Dimensions: [{ Name: 'AgentId', Value: data.agentId }],
      },
      {
        MetricName: 'ExecutionTimeout',
        Value: data.timedOut ? 1 : 0,
        Unit: StandardUnit.Count,
        Timestamp: new Date(data.timestamp),
        Dimensions: [{ Name: 'AgentId', Value: data.agentId }],
      },
      {
        MetricName: 'ExecutionCost',
        Value: data.cost,
        Unit: StandardUnit.None,
        Timestamp: new Date(data.timestamp),
        Dimensions: [{ Name: 'AgentId', Value: data.agentId }],
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
   * CORRECTION 3 APPLIED: Log LLM invocation with redaction
   * 
   * Stores:
   * - Hash of prompt (for replay matching, not reconstruction)
   * - Summary of response (first 200 chars, not full text)
   * - Token counts and cost
   * 
   * Does NOT store:
   * - Full prompt (may contain PII/secrets)
   * - Full response (may contain PII/secrets)
   */
  static async logRedactedLLMInvocation(params: {
    agentId: string;
    incidentId: string;
    modelId: string;
    prompt: string;
    response: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const logId = `${params.agentId}-${timestamp}-${Math.random().toString(36).substring(7)}`;

    // REDACTION: Hash prompt, summarize response
    const promptHash = createHash('sha256').update(params.prompt).digest('hex');
    const responseSummary = params.response.substring(0, 200);

    const redactedLog: RedactedLLMLog = {
      logId,
      agentId: params.agentId,
      incidentId: params.incidentId,
      modelId: params.modelId,
      promptHash,
      promptLength: params.prompt.length,
      responseSummary,
      responseLength: params.response.length,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cost: params.cost,
      durationMs: params.durationMs,
      timestamp,
      success: params.success,
      error: params.error,
    };

    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    // Store in DynamoDB
    await dynamodb.send(
      new PutCommand({
        TableName: process.env.AGENT_EXECUTIONS_TABLE || 'opx-agent-executions',
        Item: {
          pk: `AGENT#${params.agentId}`,
          sk: `LLM_LOG#${timestamp}#${logId}`,
          ...redactedLog,
          ttl,
        },
      })
    );

    // Log to CloudWatch (structured, searchable)
    console.log('LLM_INVOCATION_REDACTED', {
      logId,
      agentId: params.agentId,
      incidentId: params.incidentId,
      modelId: params.modelId,
      promptHash,
      promptLength: params.prompt.length,
      responseLength: params.response.length,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cost: params.cost,
      durationMs: params.durationMs,
      success: params.success,
    });
  }


  /**
   * CORRECTION 2 APPLIED: Check budget status (returns signal, does NOT throw)
   * 
   * Phase 5 decides what to do with budget signals.
   * This method only reports status.
   */
  static async checkBudgetStatus(
    incidentId: string,
    estimatedCost: number
  ): Promise<BudgetStatus> {
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    // Get current incident cost
    const incidentResponse = await dynamodb.send(
      new GetCommand({
        TableName: process.env.AGENT_RECOMMENDATIONS_TABLE || 'opx-agent-recommendations',
        Key: {
          pk: `INCIDENT#${incidentId}`,
          sk: 'BUDGET',
        },
      })
    );

    const currentIncidentCost = incidentResponse.Item?.totalCost || 0;
    const projectedIncidentCost = currentIncidentCost + estimatedCost;

    // Get current monthly cost
    const monthlyResponse = await dynamodb.send(
      new GetCommand({
        TableName: process.env.AGENT_RECOMMENDATIONS_TABLE || 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
      })
    );

    const currentMonthlyCost = monthlyResponse.Item?.totalCost || 0;
    const projectedMonthlyCost = currentMonthlyCost + estimatedCost;

    // Check limits
    const incidentExceeded = projectedIncidentCost > this.PER_INCIDENT_LIMIT;
    const monthlyExceeded = projectedMonthlyCost > this.MONTHLY_LIMIT;

    if (incidentExceeded || monthlyExceeded) {
      const reason = incidentExceeded
        ? `Incident budget would exceed $${this.PER_INCIDENT_LIMIT}`
        : `Monthly budget would exceed $${this.MONTHLY_LIMIT}`;

      // Publish budget exceeded signal metric
      await cloudwatch.send(
        new PutMetricDataCommand({
          Namespace: 'OPX/Budget',
          MetricData: [
            {
              MetricName: 'BudgetExceededSignal',
              Value: 1,
              Unit: StandardUnit.Count,
              Timestamp: new Date(),
            },
          ],
        })
      );

      return {
        allowed: false,
        reason,
        currentIncidentCost,
        currentMonthlyCost,
        incidentLimit: this.PER_INCIDENT_LIMIT,
        monthlyLimit: this.MONTHLY_LIMIT,
      };
    }

    return {
      allowed: true,
      currentIncidentCost,
      currentMonthlyCost,
      incidentLimit: this.PER_INCIDENT_LIMIT,
      monthlyLimit: this.MONTHLY_LIMIT,
    };
  }

  /**
   * Record agent cost (updates incident and monthly budgets)
   */
  static async recordCost(incidentId: string, _agentId: string, cost: number): Promise<void> {
    const month = new Date().toISOString().substring(0, 7);
    const timestamp = new Date().toISOString();

    // Update incident budget
    await dynamodb.send(
      new UpdateCommand({
        TableName: process.env.AGENT_RECOMMENDATIONS_TABLE || 'opx-agent-recommendations',
        Key: {
          pk: `INCIDENT#${incidentId}`,
          sk: 'BUDGET',
        },
        UpdateExpression: 'ADD totalCost :cost SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':cost': cost,
          ':now': timestamp,
        },
      })
    );

    // Update monthly budget
    await dynamodb.send(
      new UpdateCommand({
        TableName: process.env.AGENT_RECOMMENDATIONS_TABLE || 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
        UpdateExpression: 'ADD totalCost :cost SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':cost': cost,
          ':now': timestamp,
        },
      })
    );

    // Publish budget utilization metrics
    const monthlyResponse = await dynamodb.send(
      new GetCommand({
        TableName: process.env.AGENT_RECOMMENDATIONS_TABLE || 'opx-agent-recommendations',
        Key: {
          pk: 'BUDGET',
          sk: `MONTH#${month}`,
        },
      })
    );

    const monthlyTotal = monthlyResponse.Item?.totalCost || 0;
    const utilizationPercent = (monthlyTotal / this.MONTHLY_LIMIT) * 100;

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Budget',
        MetricData: [
          {
            MetricName: 'BudgetUtilization',
            Value: utilizationPercent,
            Unit: StandardUnit.Percent,
            Timestamp: new Date(timestamp),
            Dimensions: [{ Name: 'Period', Value: 'MONTHLY' }],
          },
          {
            MetricName: 'TotalCost',
            Value: monthlyTotal,
            Unit: StandardUnit.None,
            Timestamp: new Date(timestamp),
            Dimensions: [{ Name: 'Period', Value: 'MONTHLY' }],
          },
        ],
      })
    );
  }

  /**
   * Publish recommendation metrics
   */
  static async publishRecommendationMetrics(params: {
    incidentId: string;
    recommendationId: string;
    actionCount: number;
    totalCost: number;
    totalDurationMs: number;
  }): Promise<void> {
    const timestamp = new Date().toISOString();

    const metrics = [
      {
        MetricName: 'RecommendationGenerated',
        Value: 1,
        Unit: StandardUnit.Count,
        Timestamp: new Date(timestamp),
      },
      {
        MetricName: 'RecommendationActionCount',
        Value: params.actionCount,
        Unit: StandardUnit.Count,
        Timestamp: new Date(timestamp),
      },
      {
        MetricName: 'RecommendationCost',
        Value: params.totalCost,
        Unit: StandardUnit.None,
        Timestamp: new Date(timestamp),
      },
      {
        MetricName: 'RecommendationDuration',
        Value: params.totalDurationMs,
        Unit: StandardUnit.Milliseconds,
        Timestamp: new Date(timestamp),
      },
    ];

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'OPX/Recommendations',
        MetricData: metrics,
      })
    );
  }
}
