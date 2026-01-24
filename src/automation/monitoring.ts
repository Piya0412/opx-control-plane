/**
 * Phase 5 - Step 6: Monitoring Utilities
 * 
 * Utilities for emitting CloudWatch metrics and SNS alerts.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 6.1: SNS deduplication keys (OperationType, TriggerType, AuditId)
 * - FIX 6.2: Emit raw metrics only (Success, Failure, Duration)
 * 
 * REMINDERS:
 * - Emit raw metrics only (Success, Failure, Duration)
 * - Derive rates in alarms (MathExpression)
 * - SNS deduplication keys required
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { OperationType, TriggerType } from './automation-audit.schema';

const VERSION = '1.0.0';

// Environment variables
const NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'LearningOperations';
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

// AWS clients
const cloudwatchClient = new CloudWatchClient({});
const snsClient = new SNSClient({});

/**
 * Metric emitter
 */
export class MetricEmitter {
  /**
   * FIX 6.2: Emit raw success count
   */
  static async emitSuccess(
    operationType: OperationType,
    triggerType: TriggerType,
    duration: number
  ): Promise<void> {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'Success',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'OperationType', Value: operationType },
              { Name: 'TriggerType', Value: triggerType },
            ],
            Timestamp: new Date(),
          },
          {
            MetricName: 'Duration',
            Value: duration,
            Unit: 'Milliseconds',
            Dimensions: [
              { Name: 'OperationType', Value: operationType },
              { Name: 'TriggerType', Value: triggerType },
            ],
            Timestamp: new Date(),
          },
        ],
      })
    );
  }

  /**
   * FIX 6.2: Emit raw failure count
   */
  static async emitFailure(
    operationType: OperationType,
    triggerType: TriggerType,
    duration: number,
    errorType: string
  ): Promise<void> {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'Failure',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'OperationType', Value: operationType },
              { Name: 'TriggerType', Value: triggerType },
              { Name: 'ErrorType', Value: errorType },
            ],
            Timestamp: new Date(),
          },
          {
            MetricName: 'Duration',
            Value: duration,
            Unit: 'Milliseconds',
            Dimensions: [
              { Name: 'OperationType', Value: operationType },
              { Name: 'TriggerType', Value: triggerType },
            ],
            Timestamp: new Date(),
          },
        ],
      })
    );
  }

  /**
   * Emit calibration-specific metrics
   */
  static async emitCalibrationMetrics(
    triggerType: TriggerType,
    outcomeCount: number,
    drift?: number
  ): Promise<void> {
    const metricData: any[] = [
      {
        MetricName: 'OutcomeCount',
        Value: outcomeCount,
        Unit: 'Count',
        Dimensions: [
          { Name: 'OperationType', Value: 'CALIBRATION' },
          { Name: 'TriggerType', Value: triggerType },
        ],
        Timestamp: new Date(),
      },
    ];

    if (drift !== undefined) {
      metricData.push({
        MetricName: 'Drift',
        Value: drift,
        Unit: 'None',
        Dimensions: [
          { Name: 'OperationType', Value: 'CALIBRATION' },
          { Name: 'TriggerType', Value: triggerType },
        ],
        Timestamp: new Date(),
      });
    }

    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: metricData,
      })
    );
  }

  /**
   * Emit calibration skipped metric
   */
  static async emitCalibrationSkipped(
    triggerType: TriggerType,
    reason: 'INSUFFICIENT_DATA' | 'KILL_SWITCH_ACTIVE'
  ): Promise<void> {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'CalibrationSkipped',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'Reason', Value: reason },
              { Name: 'TriggerType', Value: triggerType },
            ],
            Timestamp: new Date(),
          },
        ],
      })
    );
  }

  /**
   * Emit snapshot-specific metrics
   */
  static async emitSnapshotMetrics(
    triggerType: TriggerType,
    snapshotType: string,
    recordCount: number
  ): Promise<void> {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'SnapshotRecordCount',
            Value: recordCount,
            Unit: 'Count',
            Dimensions: [
              { Name: 'OperationType', Value: 'SNAPSHOT' },
              { Name: 'TriggerType', Value: triggerType },
              { Name: 'SnapshotType', Value: snapshotType },
            ],
            Timestamp: new Date(),
          },
        ],
      })
    );
  }
}

/**
 * Alert emitter
 */
export class AlertEmitter {
  /**
   * FIX 6.1: Publish alert with deduplication keys
   */
  static async publishAlert(alert: {
    operationType: OperationType;
    triggerType: TriggerType;
    auditId: string;
    alertType: 'FAILURE' | 'TIMEOUT' | 'DRIFT' | 'INSUFFICIENT_DATA';
    subject: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<void> {
    if (!ALERT_TOPIC_ARN) {
      console.warn('ALERT_TOPIC_ARN not configured, skipping alert');
      return;
    }

    const messageBody = {
      alertType: alert.alertType,
      operationType: alert.operationType,
      triggerType: alert.triggerType,
      auditId: alert.auditId,
      message: alert.message,
      timestamp: new Date().toISOString(),
      details: alert.details || {},
    };

    // FIX 6.1: Include deduplication keys in message attributes
    await snsClient.send(
      new PublishCommand({
        TopicArn: ALERT_TOPIC_ARN,
        Subject: alert.subject,
        Message: JSON.stringify(messageBody, null, 2),
        MessageAttributes: {
          OperationType: {
            DataType: 'String',
            StringValue: alert.operationType,
          },
          TriggerType: {
            DataType: 'String',
            StringValue: alert.triggerType,
          },
          AuditId: {
            DataType: 'String',
            StringValue: alert.auditId,
          },
          AlertType: {
            DataType: 'String',
            StringValue: alert.alertType,
          },
        },
        // FIX 6.1: Deduplication for FIFO topic
        MessageDeduplicationId: `${alert.operationType}-${alert.auditId}`,
        MessageGroupId: alert.operationType,
      })
    );
  }

  /**
   * Publish drift alert (advisory only)
   */
  static async publishDriftAlert(
    auditId: string,
    triggerType: TriggerType,
    drift: number,
    previousBands: any,
    newBands: any
  ): Promise<void> {
    await this.publishAlert({
      operationType: 'CALIBRATION',
      triggerType,
      auditId,
      alertType: 'DRIFT',
      subject: `[ADVISORY] Calibration Drift Detected: ${(drift * 100).toFixed(1)}%`,
      message: `Significant drift detected in confidence calibration. Human review recommended.`,
      details: {
        drift,
        driftPercent: (drift * 100).toFixed(1),
        previousBands,
        newBands,
        advisory: true,
        action: 'HUMAN_REVIEW_RECOMMENDED',
      },
    });
  }

  /**
   * Publish failure alert
   */
  static async publishFailureAlert(
    operationType: OperationType,
    triggerType: TriggerType,
    auditId: string,
    error: Error
  ): Promise<void> {
    await this.publishAlert({
      operationType,
      triggerType,
      auditId,
      alertType: 'FAILURE',
      subject: `[FAILURE] ${operationType} Operation Failed`,
      message: `Operation failed: ${error.message}`,
      details: {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      },
    });
  }

  /**
   * Publish insufficient data alert
   */
  static async publishInsufficientDataAlert(
    auditId: string,
    triggerType: TriggerType,
    outcomeCount: number,
    minimumRequired: number
  ): Promise<void> {
    await this.publishAlert({
      operationType: 'CALIBRATION',
      triggerType,
      auditId,
      alertType: 'INSUFFICIENT_DATA',
      subject: `[SKIPPED] Calibration Skipped - Insufficient Data`,
      message: `Calibration skipped due to insufficient outcomes (${outcomeCount} < ${minimumRequired})`,
      details: {
        outcomeCount,
        minimumRequired,
        action: 'SKIPPED',
      },
    });
  }
}
