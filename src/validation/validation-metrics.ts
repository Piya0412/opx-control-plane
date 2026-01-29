import { CloudWatch } from 'aws-sdk';
import { Logger } from './logger';

/**
 * Validation metrics emitter
 * ✅ Correction 4: Bucketed attempt dimensions (first/second/fallback)
 */
export class ValidationMetrics {
  private cloudwatch = new CloudWatch();
  private logger = new Logger('ValidationMetrics');

  /**
   * Emit validation attempt metric with bucketed dimensions
   * ✅ Correction 4: Attempt bucketed as first/second/fallback
   */
  async emitValidationAttempt(params: {
    agentId: string;
    attempt: number;
    success: boolean;
    validationLayer: 'schema' | 'business' | 'semantic';
  }): Promise<void> {
    const attemptBucket = this.getAttemptBucket(params.attempt);

    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'OPX/Validation',
        MetricData: [
          {
            MetricName: 'ValidationAttempt',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'AgentId', Value: params.agentId },
              { Name: 'Attempt', Value: attemptBucket },
              { Name: 'Layer', Value: params.validationLayer },
              { Name: 'Success', Value: params.success ? 'true' : 'false' },
            ],
          },
        ],
      }).promise();
    } catch (error) {
      // Never block on metrics failure
      this.logger.warn('Failed to emit validation metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emit retry metric
   */
  async emitRetry(params: {
    agentId: string;
    attempt: number;
    strategy: 'clarify' | 'simplify' | 'fallback';
  }): Promise<void> {
    const attemptBucket = this.getAttemptBucket(params.attempt);

    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'OPX/Validation',
        MetricData: [
          {
            MetricName: 'RetryAttempt',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'AgentId', Value: params.agentId },
              { Name: 'Attempt', Value: attemptBucket },
              { Name: 'Strategy', Value: params.strategy },
            ],
          },
        ],
      }).promise();
    } catch (error) {
      this.logger.warn('Failed to emit retry metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emit fallback metric
   */
  async emitFallback(params: {
    agentId: string;
    attempts: number;
  }): Promise<void> {
    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'OPX/Validation',
        MetricData: [
          {
            MetricName: 'FallbackUsed',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'AgentId', Value: params.agentId },
              { Name: 'Attempts', Value: String(params.attempts) },
            ],
          },
        ],
      }).promise();
    } catch (error) {
      this.logger.warn('Failed to emit fallback metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get attempt bucket for metrics
   * ✅ Correction 4: Bucketed dimensions
   */
  private getAttemptBucket(attempt: number): 'first' | 'second' | 'fallback' {
    if (attempt === 0) return 'first';
    if (attempt === 1) return 'second';
    return 'fallback';
  }
}
