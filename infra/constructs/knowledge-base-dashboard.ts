/**
 * Phase 7.5: Knowledge Base Monitoring Dashboard
 * 
 * Creates CloudWatch dashboard for Knowledge Base retrieval monitoring.
 * 
 * Panels:
 * 1. Performance: Latency, throughput, errors
 * 2. Quality: Relevance scores, zero results
 * 3. Usage: Query types, top queries, document citations
 * 4. Cost: Queries per day, estimated monthly cost
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface KnowledgeBaseDashboardProps {
  /**
   * Dashboard name
   */
  readonly dashboardName?: string;
}

export class KnowledgeBaseDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: KnowledgeBaseDashboardProps = {}) {
    super(scope, id);

    const dashboardName = props.dashboardName || 'opx-knowledge-base-monitoring';

    // Create dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName,
      defaultInterval: cdk.Duration.hours(24),
    });

    // ========================================================================
    // PANEL 1: PERFORMANCE (Top Left)
    // ========================================================================

    const latencyWidget = new cloudwatch.GraphWidget({
      title: 'Retrieval Latency',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalLatency',
          statistic: 'p50',
          label: 'P50',
          color: cloudwatch.Color.GREEN,
        }),
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalLatency',
          statistic: 'p95',
          label: 'P95',
          color: cloudwatch.Color.ORANGE,
        }),
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalLatency',
          statistic: 'p99',
          label: 'P99',
          color: cloudwatch.Color.RED,
        }),
      ],
      leftYAxis: {
        label: 'Milliseconds',
        showUnits: false,
      },
    });

    const throughputWidget = new cloudwatch.GraphWidget({
      title: 'Queries Per Minute',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: 'Queries/min',
          color: cloudwatch.Color.BLUE,
        }),
      ],
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
    });

    const errorRateWidget = new cloudwatch.GraphWidget({
      title: 'Error Rate',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.MathExpression({
          expression: '(errors / total) * 100',
          usingMetrics: {
            errors: new cloudwatch.Metric({
              namespace: 'OpxKnowledgeBase',
              metricName: 'KnowledgeRetrievalErrors',
              statistic: 'Sum',
            }),
            total: new cloudwatch.Metric({
              namespace: 'OpxKnowledgeBase',
              metricName: 'KnowledgeRetrievalCount',
              statistic: 'Sum',
            }),
          },
          label: 'Error Rate',
          color: cloudwatch.Color.RED,
        }),
      ],
      leftYAxis: {
        label: 'Percent',
        showUnits: false,
      },
    });

    // ========================================================================
    // PANEL 2: QUALITY (Top Right)
    // ========================================================================

    const relevanceWidget = new cloudwatch.GraphWidget({
      title: 'Average Relevance Score',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalRelevanceScore',
          statistic: 'Average',
          label: 'Avg Relevance',
          color: cloudwatch.Color.PURPLE,
        }),
      ],
      leftYAxis: {
        label: 'Score (0-1)',
        showUnits: false,
        min: 0,
        max: 1,
      },
    });

    const zeroResultsWidget = new cloudwatch.GraphWidget({
      title: 'Zero Results Rate',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.MathExpression({
          expression: '(zero / total) * 100',
          usingMetrics: {
            zero: new cloudwatch.Metric({
              namespace: 'OpxKnowledgeBase',
              metricName: 'KnowledgeRetrievalZeroResults',
              statistic: 'Sum',
            }),
            total: new cloudwatch.Metric({
              namespace: 'OpxKnowledgeBase',
              metricName: 'KnowledgeRetrievalCount',
              statistic: 'Sum',
            }),
          },
          label: 'Zero Results Rate',
          color: cloudwatch.Color.ORANGE,
        }),
      ],
      leftYAxis: {
        label: 'Percent',
        showUnits: false,
      },
    });

    const resultCountWidget = new cloudwatch.GraphWidget({
      title: 'Results Per Query',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalResultCount',
          statistic: 'Average',
          label: 'Avg Results',
          color: cloudwatch.Color.GREEN,
        }),
      ],
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
    });

    // ========================================================================
    // PANEL 3: USAGE (Bottom Left)
    // ========================================================================

    const queryTypeWidget = new cloudwatch.GraphWidget({
      title: 'Queries by Type',
      width: 12,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          dimensionsMap: { QueryType: 'runbook' },
          label: 'Runbook',
          color: cloudwatch.Color.BLUE,
        }),
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          dimensionsMap: { QueryType: 'postmortem' },
          label: 'Postmortem',
          color: cloudwatch.Color.ORANGE,
        }),
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          dimensionsMap: { QueryType: 'general' },
          label: 'General',
          color: cloudwatch.Color.GREY,
        }),
      ],
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
      view: cloudwatch.GraphWidgetView.BAR,
    });

    // ========================================================================
    // PANEL 4: COST (Bottom Right)
    // ========================================================================

    const queriesPerDayWidget = new cloudwatch.GraphWidget({
      title: 'Queries Per Day',
      width: 6,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'OpxKnowledgeBase',
          metricName: 'KnowledgeRetrievalCount',
          statistic: 'Sum',
          period: cdk.Duration.days(1),
          label: 'Queries/day',
          color: cloudwatch.Color.BLUE,
        }),
      ],
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
    });

    const monthlyCostWidget = new cloudwatch.SingleValueWidget({
      title: 'Estimated Monthly Cost',
      width: 6,
      height: 6,
      metrics: [
        new cloudwatch.MathExpression({
          expression: '(queries * 0.000005) + 350',
          usingMetrics: {
            queries: new cloudwatch.Metric({
              namespace: 'OpxKnowledgeBase',
              metricName: 'KnowledgeRetrievalCount',
              statistic: 'Sum',
              period: cdk.Duration.days(30),
            }),
          },
          label: 'Monthly Cost (USD)',
        }),
      ],
    });

    // ========================================================================
    // ADD WIDGETS TO DASHBOARD
    // ========================================================================

    // Row 1: Performance
    this.dashboard.addWidgets(latencyWidget, throughputWidget, errorRateWidget);

    // Row 2: Quality
    this.dashboard.addWidgets(relevanceWidget, zeroResultsWidget, resultCountWidget);

    // Row 3: Usage
    this.dashboard.addWidgets(queryTypeWidget);

    // Row 4: Cost
    this.dashboard.addWidgets(queriesPerDayWidget, monthlyCostWidget);
  }
}
