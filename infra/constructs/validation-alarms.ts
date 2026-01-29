import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ValidationAlarmsProps {
  readonly alarmPrefix?: string;
}

export class ValidationAlarms extends Construct {
  public readonly highFailureRateAlarm: cloudwatch.Alarm;
  public readonly highRetryRateAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props?: ValidationAlarmsProps) {
    super(scope, id);

    const prefix = props?.alarmPrefix || 'OPX-Validation';

    // Alarm: High validation failure rate
    this.highFailureRateAlarm = new cloudwatch.Alarm(this, 'HighFailureRate', {
      alarmName: `${prefix}-HighFailureRate`,
      alarmDescription: 'Validation failure rate exceeds threshold',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Validation',
        metricName: 'ValidationAttempt',
        dimensionsMap: {
          Success: 'false',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // ≥10 failures in 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm: High retry rate (indicates quality issues)
    this.highRetryRateAlarm = new cloudwatch.Alarm(this, 'HighRetryRate', {
      alarmName: `${prefix}-HighRetryRate`,
      alarmDescription: 'Retry rate exceeds threshold (quality issue)',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Validation',
        metricName: 'ValidationAttempt',
        dimensionsMap: {
          Attempt: 'second', // Second attempts indicate retries
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // ≥5 retries in 5 minutes
      evaluationPeriods: 2, // 2 consecutive periods
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Tags
    cdk.Tags.of(this).add('Phase', '8.3');
    cdk.Tags.of(this).add('Component', 'Validation');
  }
}
