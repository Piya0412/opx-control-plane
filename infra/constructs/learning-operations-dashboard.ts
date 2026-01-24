/**
 * Phase 5 - Step 6: Learning Operations Dashboard
 * 
 * CloudWatch dashboard for monitoring automated learning operations.
 * 
 * MANDATORY FIXES APPLIED:
 * - FIX 6.2: ErrorRate derived from raw counts (not emitted directly)
 * 
 * REMINDERS:
 * - Emit raw metrics only (Success, Failure, Duration)
 * - Derive rates in alarms (MathExpression)
 * - Dashboards separate OperationType and TriggerType
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const VERSION = '1.0.0';

export interface LearningOperationsDashboardProps {
  /**
   * Log groups for each operation handler
   */
  patternExtractionLogGroup: logs.ILogGroup;
  calibrationLogGroup: logs.ILogGroup;
  snapshotLogGroup: logs.ILogGroup;
  
  /**
   * CloudWatch namespace for metrics
   */
  namespace?: string;
}

/**
 * CloudWatch dashboard for learning operations
 */
export class LearningOperationsDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: LearningOperationsDashboardProps) {
    super(scope, id);

    const namespace = props.namespace || 'LearningOperations';

    // Create dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'opx-learning-operations',
      defaultInterval: cdk.Duration.hours(24),
    });

    // Row 1: Success/Failure counts by operation type
    this.dashboard.addWidgets(
      this.createSuccessFailureWidget(namespace, 'PATTERN_EXTRACTION', 'Pattern Extraction'),
      this.createSuccessFailureWidget(namespace, 'CALIBRATION', 'Calibration'),
      this.createSuccessFailureWidget(namespace, 'SNAPSHOT', 'Snapshot'),
    );

    // Row 2: Error rates (derived) by operation type
    this.dashboard.addWidgets(
      this.createErrorRateWidget(namespace, 'PATTERN_EXTRACTION', 'Pattern Extraction Error Rate'),
      this.createErrorRateWidget(namespace, 'CALIBRATION', 'Calibration Error Rate'),
      this.createErrorRateWidget(namespace, 'SNAPSHOT', 'Snapshot Error Rate'),
    );

    // Row 3: Duration by operation type
    this.dashboard.addWidgets(
      this.createDurationWidget(namespace, 'PATTERN_EXTRACTION', 'Pattern Extraction Duration'),
      this.createDurationWidget(namespace, 'CALIBRATION', 'Calibration Duration'),
      this.createDurationWidget(namespace, 'SNAPSHOT', 'Snapshot Duration'),
    );

    // Row 4: Trigger type breakdown
    this.dashboard.addWidgets(
      this.createTriggerTypeWidget(namespace, 'Scheduled Operations'),
      this.createTriggerTypeWidget(namespace, 'Manual Operations', 'MANUAL'),
    );

    // Row 5: Calibration drift
    this.dashboard.addWidgets(
      this.createDriftWidget(namespace),
      this.createCalibrationDetailsWidget(namespace),
    );

    // Row 6: Recent operations (log insights)
    this.dashboard.addWidgets(
      this.createRecentOperationsWidget([
        props.patternExtractionLogGroup,
        props.calibrationLogGroup,
        props.snapshotLogGroup,
      ]),
    );
  }

  /**
   * Create success/failure count widget
   */
  private createSuccessFailureWidget(
    namespace: string,
    operationType: string,
    title: string
  ): cloudwatch.GraphWidget {
    const successMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Success',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.GraphWidget({
      title,
      width: 8,
      left: [successMetric, failureMetric],
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
      legendPosition: cloudwatch.LegendPosition.BOTTOM,
    });
  }

  /**
   * FIX 6.2: Create error rate widget (derived from raw counts)
   */
  private createErrorRateWidget(
    namespace: string,
    operationType: string,
    title: string
  ): cloudwatch.GraphWidget {
    const successMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Success',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    const failureMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Failure',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });

    // FIX 6.2: Derive error rate from raw counts
    const errorRateMetric = new cloudwatch.MathExpression({
      expression: '(failure / (success + failure)) * 100',
      usingMetrics: {
        success: successMetric,
        failure: failureMetric,
      },
      label: 'Error Rate (%)',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.GraphWidget({
      title,
      width: 8,
      left: [errorRateMetric],
      leftYAxis: {
        label: 'Percent',
        min: 0,
        max: 100,
        showUnits: false,
      },
      legendPosition: cloudwatch.LegendPosition.BOTTOM,
    });
  }

  /**
   * Create duration widget
   */
  private createDurationWidget(
    namespace: string,
    operationType: string,
    title: string
  ): cloudwatch.GraphWidget {
    const durationMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Duration',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'Average',
      period: cdk.Duration.hours(1),
    });

    const p99Metric = new cloudwatch.Metric({
      namespace,
      metricName: 'Duration',
      dimensionsMap: {
        OperationType: operationType,
      },
      statistic: 'p99',
      period: cdk.Duration.hours(1),
    });

    return new cloudwatch.GraphWidget({
      title,
      width: 8,
      left: [durationMetric, p99Metric],
      leftYAxis: {
        label: 'Milliseconds',
        showUnits: false,
      },
      legendPosition: cloudwatch.LegendPosition.BOTTOM,
    });
  }

  /**
   * Create trigger type breakdown widget
   */
  private createTriggerTypeWidget(
    namespace: string,
    title: string,
    triggerType?: string
  ): cloudwatch.GraphWidget {
    const metrics: cloudwatch.IMetric[] = [];

    const operationTypes = ['PATTERN_EXTRACTION', 'CALIBRATION', 'SNAPSHOT'];

    for (const opType of operationTypes) {
      const dimensions: Record<string, string> = {
        OperationType: opType,
      };

      if (triggerType) {
        dimensions.TriggerType = triggerType;
      }

      metrics.push(
        new cloudwatch.Metric({
          namespace,
          metricName: 'Success',
          dimensionsMap: dimensions,
          statistic: 'Sum',
          period: cdk.Duration.hours(1),
          label: opType,
        })
      );
    }

    return new cloudwatch.GraphWidget({
      title,
      width: 12,
      left: metrics,
      leftYAxis: {
        label: 'Count',
        showUnits: false,
      },
      legendPosition: cloudwatch.LegendPosition.RIGHT,
    });
  }

  /**
   * Create drift widget
   */
  private createDriftWidget(namespace: string): cloudwatch.GraphWidget {
    const driftMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'Drift',
      dimensionsMap: {
        OperationType: 'CALIBRATION',
      },
      statistic: 'Average',
      period: cdk.Duration.days(1),
    });

    return new cloudwatch.GraphWidget({
      title: 'Calibration Drift',
      width: 12,
      left: [driftMetric],
      leftYAxis: {
        label: 'Drift',
        showUnits: false,
      },
      leftAnnotations: [
        {
          value: 0.15,
          label: 'Drift Threshold',
          color: cloudwatch.Color.RED,
        },
        {
          value: -0.15,
          label: 'Drift Threshold',
          color: cloudwatch.Color.RED,
        },
      ],
      legendPosition: cloudwatch.LegendPosition.BOTTOM,
    });
  }

  /**
   * Create calibration details widget
   */
  private createCalibrationDetailsWidget(namespace: string): cloudwatch.GraphWidget {
    const outcomeCountMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'OutcomeCount',
      dimensionsMap: {
        OperationType: 'CALIBRATION',
      },
      statistic: 'Average',
      period: cdk.Duration.days(1),
    });

    const skippedMetric = new cloudwatch.Metric({
      namespace,
      metricName: 'CalibrationSkipped',
      dimensionsMap: {
        Reason: 'INSUFFICIENT_DATA',
      },
      statistic: 'Sum',
      period: cdk.Duration.days(1),
    });

    return new cloudwatch.GraphWidget({
      title: 'Calibration Details',
      width: 12,
      left: [outcomeCountMetric],
      right: [skippedMetric],
      leftYAxis: {
        label: 'Outcome Count',
        showUnits: false,
      },
      rightYAxis: {
        label: 'Skipped Count',
        showUnits: false,
      },
      legendPosition: cloudwatch.LegendPosition.BOTTOM,
    });
  }

  /**
   * Create recent operations widget (log insights)
   */
  private createRecentOperationsWidget(logGroups: logs.ILogGroup[]): cloudwatch.LogQueryWidget {
    return new cloudwatch.LogQueryWidget({
      title: 'Recent Operations (Last 20)',
      width: 24,
      logGroupNames: logGroups.map(lg => lg.logGroupName),
      queryLines: [
        'fields @timestamp, operationType, triggerType, status, duration, auditId',
        'filter ispresent(auditId)',
        'sort @timestamp desc',
        'limit 20',
      ],
    });
  }
}
