/**
 * Phase 6 Step 4: Agent Alerts
 * 
 * CloudWatch alarms and SNS topics for agent failures, budget, and quality.
 */

import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cdk from 'aws-cdk-lib';
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
            metricName: 'ExecutionFailure',
            statistic: 'Sum',
          }),
        },
        period: cdk.Duration.minutes(5),
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

    // Alarm 6: High Guardrail Violation Rate
    const guardrailAlarm = new cloudwatch.Alarm(this, 'HighGuardrailViolations', {
      alarmName: 'OPX-Agent-HighGuardrailViolations',
      alarmDescription: 'Guardrail violations exceed 5 per hour',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Agents',
        metricName: 'GuardrailViolationCount',
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    guardrailAlarm.addAlarmAction(new actions.SnsAction(this.qualityTopic));
  }
}
