import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface TokenAnalyticsDashboardProps {
  readonly dashboardName?: string;
  readonly monthlyBudget?: number; // USD
}

/**
 * Token Analytics Dashboard
 * Phase 8.4: Observability only - no enforcement
 * ✅ Correction 2: CostPerInvocation uses MathExpression
 */
export class TokenAnalyticsDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props?: TokenAnalyticsDashboardProps) {
    super(scope, id);

    const dashboardName = props?.dashboardName || 'OPX-Token-Analytics';
    const monthlyBudget = props?.monthlyBudget || 100; // Default $100/month

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName,
    });

    // Widget 1: Token Usage (Input + Output)
    const tokenUsageWidget = new cloudwatch.GraphWidget({
      title: 'Token Usage by Agent',
      left: [
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'InputTokens',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'OutputTokens',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Widget 2: Cost by Agent
    const costByAgentWidget = new cloudwatch.GraphWidget({
      title: 'Cost by Agent (USD)',
      left: [
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'TotalCost',
          statistic: 'Sum',
          period: cdk.Duration.hours(1),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Widget 3: Token Efficiency (Output/Input ratio)
    const efficiencyWidget = new cloudwatch.GraphWidget({
      title: 'Token Efficiency (Output/Input Ratio)',
      left: [
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'TokenEfficiency',
          statistic: 'Average',
          period: cdk.Duration.minutes(15),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Widget 4: Cost Trend (24 hours)
    const costTrendWidget = new cloudwatch.GraphWidget({
      title: 'Cost Trend (24 Hours)',
      left: [
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'TotalCost',
          statistic: 'Sum',
          period: cdk.Duration.hours(1),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Widget 5: Budget Utilization
    const budgetUtilizationWidget = new cloudwatch.SingleValueWidget({
      title: 'Monthly Budget Utilization',
      metrics: [
        new cloudwatch.Metric({
          namespace: 'OPX/Analytics',
          metricName: 'TotalCost',
          statistic: 'Sum',
          period: cdk.Duration.days(30),
        }),
      ],
      width: 6,
      height: 6,
    });

    // Widget 6: Cost Per Invocation
    // ✅ Correction 2: Use MathExpression for correct calculation
    const totalCostMetric = new cloudwatch.Metric({
      namespace: 'OPX/Analytics',
      metricName: 'TotalCost',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const invocationCountMetric = new cloudwatch.Metric({
      namespace: 'OPX/Analytics',
      metricName: 'InvocationCount',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const costPerInvocationWidget = new cloudwatch.GraphWidget({
      title: 'Cost Per Invocation (USD)',
      left: [
        new cloudwatch.MathExpression({
          expression: 'cost / invocations',
          usingMetrics: {
            cost: totalCostMetric,
            invocations: invocationCountMetric,
          },
          label: 'Cost Per Invocation',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
    });

    // Add all widgets to dashboard
    this.dashboard.addWidgets(
      tokenUsageWidget,
      costByAgentWidget
    );
    this.dashboard.addWidgets(
      efficiencyWidget,
      costTrendWidget
    );
    this.dashboard.addWidgets(
      budgetUtilizationWidget,
      costPerInvocationWidget
    );

    // Output
    new cdk.CfnOutput(this, 'DashboardName', {
      value: this.dashboard.dashboardName,
      description: 'Token Analytics Dashboard Name',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${dashboardName}`,
      description: 'Token Analytics Dashboard URL',
    });
  }
}
