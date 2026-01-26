/**
 * Phase 6 Step 4: Agent Dashboard
 * 
 * CloudWatch dashboard for agent performance, cost tracking, and quality metrics.
 * 
 * CORRECTION 5 APPLIED: Fixed metric math to use separate success/failure metrics.
 */

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
                metricName: 'ExecutionFailure', // CORRECTION 5: Separate metric
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
      'knowledge-recommendation',
      'response-strategy',
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

    // Row 5: Guardrails & Budget Signals
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Guardrail Violations',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Agents',
            metricName: 'GuardrailViolationCount',
            statistic: 'Sum',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Budget Exceeded Signals',
        left: [
          new cloudwatch.Metric({
            namespace: 'OPX/Budget',
            metricName: 'BudgetExceededSignal',
            statistic: 'Sum',
          }),
        ],
        width: 12,
      })
    );
  }
}
