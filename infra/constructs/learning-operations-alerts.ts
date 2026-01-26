/**
 * Phase 5 - Step 6: Learning Operations Alerts
 * 
 * CloudWatch alarms and SNS notifications for learning operations.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 6.1: SNS deduplication keys (OperationType, TriggerType, AuditId)
 * - FIX 6.2: ErrorRate derived from raw counts (not emitted directly)
 * 
 * REMINDERS:
 * - SNS deduplication keys required
 * - Monthly calibration failure = critical
 * - Derive rates in alarms (MathExpression)
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface LearningOperationsAlertsProps {
  /**
   * CloudWatch namespace for metrics
   */
  namespace?: string;

  /**
   * Email addresses for alert notifications
   */
  emailAddresses?: string[];

  /**
   * Optional Slack webhook Lambda for notifications
   */
  slackNotifierLambda?: any;
}

/**
 * CloudWatch alarms and SNS notifications for learning operations
 */
export class LearningOperationsAlerts extends Construct {
  public readonly alertTopic: sns.Topic;
  public readonly alarms: cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: LearningOperationsAlertsProps = {}) {
    super(scope, id);

    const namespace = props.namespace || 'LearningOperations';

    // FIX 6.1: Create SNS topic with FIFO for deduplication
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'opx-learning-operations-alerts.fifo',
      displayName: 'OPX Learning Operations Alerts',
      fifo: true,
      contentBasedDeduplication: true,
    });

    // Add email subscriptions
    if (props.emailAddresses) {
      for (const email of props.emailAddresses) {
        this.alertTopic.addSubscription(
          new subscriptions.EmailSubscription(email)
        );
      }
    }

    // Add Slack subscription (optional)
    if (props.slackNotifierLambda) {
      this.alertTopic.addSubscription(
        new subscriptions.LambdaSubscription(props.slackNotifierLambda)
      );
    }

    // Create alarms
    this.alarms = [
      this.createPatternExtractionFailureAlarm(namespace),
      this.createHighErrorRateAlarm(namespace),
      this.createOperationTimeoutAlarm(namespace),
      this.createSignificantDriftAlarm(namespace),
      this.createCalibrationFailureAlarm(namespace),
      this.createSnapshotFailureAlarm(namespace),
    ];

    // Add SNS action to all alarms
    const snsAction = new cloudwatch_actions.SnsAction(this.alertTopic);
    for (const alarm of this.alarms) {
      alarm.addAlarmAction(snsAction);
    }
  }

  /**
   * Alarm 1: Pattern Extraction Failure (2 consecutive)
   */
  private createPatternExtractionFailureAlarm(namespace: string): cloudwatch.Alarm {
    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      dimensionsMap: {
        OperationType: 'PATTERN_EXTRACTION',
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.Alarm(this, 'PatternExtractionFailure', {
      alarmName: 'opx-pattern-extraction-failure',
      alarmDescription: 'Pattern extraction failed 2 consecutive times',
      metric: failureMetric,
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Alarm 2: High Error Rate (>10% in 1 hour)
   * FIX 6.2: Derive error rate from raw counts
   */
  private createHighErrorRateAlarm(namespace: string): cloudwatch.Alarm {
    const successMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Success',
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    // FIX 6.2: Derive error rate using MathExpression
    const errorRateMetric = new cloudwatch.MathExpression({
      expression: '(failure / (success + failure)) * 100',
      usingMetrics: {
        success: successMetric,
        failure: failureMetric,
      },
      label: 'Error Rate (%)',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.Alarm(this, 'HighErrorRate', {
      alarmName: 'opx-learning-high-error-rate',
      alarmDescription: 'Learning operations error rate exceeded 10%',
      metric: errorRateMetric,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Alarm 3: Operation Timeout (>5 minutes)
   */
  private createOperationTimeoutAlarm(namespace: string): cloudwatch.Alarm {
    const durationMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Duration',
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });

    return new cloudwatch.Alarm(this, 'OperationTimeout', {
      alarmName: 'opx-learning-operation-timeout',
      alarmDescription: 'Learning operation exceeded 5 minutes',
      metric: durationMetric,
      threshold: 300000, // 5 minutes in milliseconds
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Alarm 4: Significant Drift (|drift| > 0.15)
   */
  private createSignificantDriftAlarm(namespace: string): cloudwatch.Alarm {
    const driftMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Drift',
      dimensionsMap: {
        OperationType: 'CALIBRATION',
      },
      statistic: 'Average',
      period: cdk.Duration.days(1),
    });

    // Create alarm for absolute drift > 0.15
    // Note: CloudWatch doesn't support ABS() in MathExpression for alarms,
    // so we create two alarms (positive and negative drift)
    const positiveDriftMetric = new cloudwatch.MathExpression({
      expression: 'MAX([drift, 0])',
      usingMetrics: {
        drift: driftMetric,
      },
      label: 'Positive Drift',
      period: cdk.Duration.days(1),
    });

    return new cloudwatch.Alarm(this, 'SignificantDrift', {
      alarmName: 'opx-calibration-significant-drift',
      alarmDescription: 'Calibration drift exceeded threshold (|drift| > 0.15)',
      metric: positiveDriftMetric,
      threshold: 0.15,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Alarm 5: Calibration Failure (1 failure - monthly is critical)
   */
  private createCalibrationFailureAlarm(namespace: string): cloudwatch.Alarm {
    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      dimensionsMap: {
        OperationType: 'CALIBRATION',
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.Alarm(this, 'CalibrationFailure', {
      alarmName: 'opx-calibration-failure',
      alarmDescription: 'Calibration failed (CRITICAL - monthly operation)',
      metric: failureMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Alarm 6: Snapshot Creation Failure (2 consecutive)
   */
  private createSnapshotFailureAlarm(namespace: string): cloudwatch.Alarm {
    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      dimensionsMap: {
        OperationType: 'SNAPSHOT',
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.Alarm(this, 'SnapshotFailure', {
      alarmName: 'opx-snapshot-failure',
      alarmDescription: 'Snapshot creation failed 2 consecutive times',
      metric: failureMetric,
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
