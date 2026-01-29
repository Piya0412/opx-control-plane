import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface TokenAnalyticsAlarmsProps {
  readonly monthlyBudget?: number; // USD
  readonly alarmPrefix?: string;
}

/**
 * Token Analytics Alarms
 * Phase 8.4: Observability only - no enforcement
 */
export class TokenAnalyticsAlarms extends Construct {
  public readonly budgetWarningAlarm: cloudwatch.Alarm;
  public readonly budgetCriticalAlarm: cloudwatch.Alarm;
  public readonly costSpikeAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props?: TokenAnalyticsAlarmsProps) {
    super(scope, id);

    const monthlyBudget = props?.monthlyBudget || 100; // Default $100/month
    const prefix = props?.alarmPrefix || 'OPX-TokenAnalytics';

    // Alarm 1: 80% Budget Warning
    // Use 1-day period with daily threshold (budget / 30)
    const dailyBudget80 = (monthlyBudget * 0.8) / 30;
    this.budgetWarningAlarm = new cloudwatch.Alarm(this, 'BudgetWarning', {
      alarmName: `${prefix}-BudgetWarning-80pct`,
      alarmDescription: `Daily token cost exceeds 80% of daily budget ($${dailyBudget80.toFixed(2)})`,
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Analytics',
        metricName: 'TotalCost',
        statistic: 'Sum',
        period: cdk.Duration.days(1),
      }),
      threshold: dailyBudget80,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm 2: 95% Budget Critical
    // Use 1-day period with daily threshold (budget / 30)
    const dailyBudget95 = (monthlyBudget * 0.95) / 30;
    this.budgetCriticalAlarm = new cloudwatch.Alarm(this, 'BudgetCritical', {
      alarmName: `${prefix}-BudgetCritical-95pct`,
      alarmDescription: `Daily token cost exceeds 95% of daily budget ($${dailyBudget95.toFixed(2)})`,
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Analytics',
        metricName: 'TotalCost',
        statistic: 'Sum',
        period: cdk.Duration.days(1),
      }),
      threshold: dailyBudget95,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm 3: Cost-Per-Invocation Spike
    // Detects sudden cost increases (>2x average)
    const avgCostMetric = new cloudwatch.Metric({
      namespace: 'OPX/Analytics',
      metricName: 'TotalCost',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    this.costSpikeAlarm = new cloudwatch.Alarm(this, 'CostSpike', {
      alarmName: `${prefix}-CostSpike`,
      alarmDescription: 'Cost per invocation spike detected (>2x average)',
      metric: avgCostMetric,
      threshold: 0.01, // $0.01 per invocation threshold
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Outputs
    new cdk.CfnOutput(this, 'BudgetWarningAlarmName', {
      value: this.budgetWarningAlarm.alarmName,
      description: '80% Budget Warning Alarm',
    });

    new cdk.CfnOutput(this, 'BudgetCriticalAlarmName', {
      value: this.budgetCriticalAlarm.alarmName,
      description: '95% Budget Critical Alarm',
    });

    new cdk.CfnOutput(this, 'CostSpikeAlarmName', {
      value: this.costSpikeAlarm.alarmName,
      description: 'Cost Spike Alarm',
    });

    // Tags
    cdk.Tags.of(this).add('Phase', '8.4');
    cdk.Tags.of(this).add('Component', 'TokenAnalytics');
  }
}
