import { CloudWatch } from 'aws-sdk';
import { TokenAnalytics } from './token-tracker';

/**
 * Analytics Emitter
 * Phase 8.4: Emit token analytics metrics to CloudWatch
 * 
 * ✅ Correction 1: ExecutionType removed
 * ✅ Correction 2: InvocationCount emitted separately
 * ✅ Allowed dimensions: AgentId, Model only
 * ❌ Forbidden dimensions: incidentId, sessionId, timestamp
 */
export class AnalyticsEmitter {
  private cloudwatch = new CloudWatch();

  /**
   * Emit token analytics metrics
   * ✅ Correction 2: Emit InvocationCount separately for correct CostPerInvocation
   */
  async emitMetrics(analytics: TokenAnalytics): Promise<void> {
    const timestamp = new Date(analytics.timestamp);

    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'OPX/Analytics',
        MetricData: [
          // Input tokens
          {
            MetricName: 'InputTokens',
            Value: analytics.inputTokens,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [
              { Name: 'AgentId', Value: analytics.agentId },
              { Name: 'Model', Value: analytics.modelName },
            ],
          },
          // Output tokens
          {
            MetricName: 'OutputTokens',
            Value: analytics.outputTokens,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [
              { Name: 'AgentId', Value: analytics.agentId },
              { Name: 'Model', Value: analytics.modelName },
            ],
          },
          // Total cost
          {
            MetricName: 'TotalCost',
            Value: analytics.cost,
            Unit: 'None', // USD
            Timestamp: timestamp,
            Dimensions: [
              { Name: 'AgentId', Value: analytics.agentId },
              { Name: 'Model', Value: analytics.modelName },
            ],
          },
          // Token efficiency
          {
            MetricName: 'TokenEfficiency',
            Value: analytics.efficiency,
            Unit: 'None', // Ratio
            Timestamp: timestamp,
            Dimensions: [
              { Name: 'AgentId', Value: analytics.agentId },
              { Name: 'Model', Value: analytics.modelName },
            ],
          },
          // ✅ Correction 2: Invocation count (for CostPerInvocation calculation)
          {
            MetricName: 'InvocationCount',
            Value: 1,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [
              { Name: 'AgentId', Value: analytics.agentId },
              { Name: 'Model', Value: analytics.modelName },
            ],
          },
        ],
      }).promise();
    } catch (error) {
      // Never block on metrics failure
      console.error('Failed to emit analytics metrics', {
        error: error instanceof Error ? error.message : String(error),
        agentId: analytics.agentId,
      });
    }
  }

  /**
   * Emit metrics without dimensions (for total aggregation)
   */
  async emitTotalMetrics(analytics: TokenAnalytics): Promise<void> {
    const timestamp = new Date(analytics.timestamp);

    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'OPX/Analytics',
        MetricData: [
          {
            MetricName: 'TotalCost',
            Value: analytics.cost,
            Unit: 'None',
            Timestamp: timestamp,
            Dimensions: [], // No dimensions for total
          },
          {
            MetricName: 'InvocationCount',
            Value: 1,
            Unit: 'Count',
            Timestamp: timestamp,
            Dimensions: [],
          },
        ],
      }).promise();
    } catch (error) {
      console.error('Failed to emit total metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
