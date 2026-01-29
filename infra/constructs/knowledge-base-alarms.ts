/**
 * Phase 7.5: Knowledge Base Monitoring Alarms
 * 
 * Creates CloudWatch alarms for Knowledge Base retrieval monitoring.
 * 
 * Alarms:
 * 1. High Latency (P95 > 2000ms)
 * 2. High Error Rate (> 5%)
 * 3. High Zero Results Rate (> 50%)
 * 4. Low Relevance Score (< 0.4)
 * 
 * All alarms use TreatMissingData = notBreaching to avoid false positives.
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface KnowledgeBaseAlarmsProps {
  /**
   * Email address for alarm notifications
   */
  readonly alarmEmail?: string;

  /**
   * SNS topic for alarm notifications (optional, will create if not provided)
   */
  readonly alarmTopic?: sns.ITopic;
}

export class KnowledgeBaseAlarms extends Construct {
  public readonly alarmTopic: sns.ITopic;
  public readonly highLatencyAlarm: cloudwatch.Alarm;
  public readonly highErrorRateAlarm: cloudwatch.Alarm;
  public readonly highZeroResultsAlarm: cloudwatch.Alarm;
  public readonly lowRelevanceAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: KnowledgeBaseAlarmsProps = {}) {
    super(scope, id);

    // ========================================================================
    // SNS TOPIC
    // ========================================================================

    this.alarmTopic = props.alarmTopic || new sns.Topic(this, 'AlarmTopic', {
      topicName: 'opx-knowledge-base-alerts',
      displayName: 'OPX Knowledge Base Alerts',
    });

    // Add email subscription if provided
    if (props.alarmEmail) {
      this.alarmTopic.addSubscription(
        new sns_subscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    const alarmAction = new cloudwatch_actions.SnsAction(this.alarmTopic);

    // ========================================================================
    // ALARM 1: HIGH LATENCY
    // ========================================================================

    this.highLatencyAlarm = new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: 'opx-knowledge-base-high-latency',
      alarmDescription: 'Knowledge Base retrieval latency (P95) exceeds 2 seconds',
      metric: new cloudwatch.Metric({
        namespace: 'OpxKnowledgeBase',
        metricName: 'KnowledgeRetrievalLatency',
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // milliseconds
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.highLatencyAlarm.addAlarmAction(alarmAction);

    // ========================================================================
    // ALARM 2: HIGH ERROR RATE
    // ========================================================================

    const errorRateMetric = new cloudwatch.MathExpression({
      expression: '(errors / total) * 100',
      usingMetrics: {
        errors: new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalErrors',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        total: new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      },
      period: cdk.Duration.minutes(5),
    });

    this.highErrorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: 'opx-knowledge-base-high-error-rate',
      alarmDescription: 'Knowledge Base error rate exceeds 5%',
      metric: errorRateMetric,
      threshold: 5, // percent
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.highErrorRateAlarm.addAlarmAction(alarmAction);

    // ========================================================================
    // ALARM 3: HIGH ZERO RESULTS RATE
    // ========================================================================

    const zeroResultsRateMetric = new cloudwatch.MathExpression({
      expression: '(zero / total) * 100',
      usingMetrics: {
        zero: new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalZeroResults',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        total: new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      },
      period: cdk.Duration.minutes(5),
    });

    this.highZeroResultsAlarm = new cloudwatch.Alarm(this, 'HighZeroResultsAlarm', {
      alarmName: 'opx-knowledge-base-high-zero-results',
      alarmDescription: 'Knowledge Base zero results rate exceeds 50%',
      metric: zeroResultsRateMetric,
      threshold: 50, // percent
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.highZeroResultsAlarm.addAlarmAction(alarmAction);

    // ========================================================================
    // ALARM 4: LOW RELEVANCE SCORE
    // ========================================================================

    this.lowRelevanceAlarm = new cloudwatch.Alarm(this, 'LowRelevanceAlarm', {
      alarmName: 'opx-knowledge-base-low-relevance',
      alarmDescription: 'Knowledge Base average relevance score below 0.4',
      metric: new cloudwatch.Metric({
        namespace: 'OpxKnowledgeBase',
        metricName: 'KnowledgeRetrievalRelevanceScore',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.4,
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.lowRelevanceAlarm.addAlarmAction(alarmAction);

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for Knowledge Base alarms',
      exportName: 'OpxKnowledgeBaseAlarmTopicArn',
    });

    new cdk.CfnOutput(this, 'HighLatencyAlarmArn', {
      value: this.highLatencyAlarm.alarmArn,
      description: 'High Latency Alarm ARN',
    });

    new cdk.CfnOutput(this, 'HighErrorRateAlarmArn', {
      value: this.highErrorRateAlarm.alarmArn,
      description: 'High Error Rate Alarm ARN',
    });

    new cdk.CfnOutput(this, 'HighZeroResultsAlarmArn', {
      value: this.highZeroResultsAlarm.alarmArn,
      description: 'High Zero Results Alarm ARN',
    });

    new cdk.CfnOutput(this, 'LowRelevanceAlarmArn', {
      value: this.lowRelevanceAlarm.alarmArn,
      description: 'Low Relevance Alarm ARN',
    });
  }
}
