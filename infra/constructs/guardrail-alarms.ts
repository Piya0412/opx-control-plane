import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface GuardrailAlarmsProps {
  readonly alarmTopic?: sns.ITopic;
}

export class GuardrailAlarms extends Construct {
  public readonly highPIIViolationAlarm: cloudwatch.Alarm;
  public readonly highContentViolationAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props?: GuardrailAlarmsProps) {
    super(scope, id);

    // Alarm 1: High PII Violation Rate
    this.highPIIViolationAlarm = new cloudwatch.Alarm(this, 'HighPIIViolationRate', {
      alarmName: 'OPX-Guardrails-HighPIIViolationRate',
      alarmDescription: 'PII violation rate exceeds 1 per 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Guardrails',
        metricName: 'ViolationCount',
        dimensionsMap: {
          ViolationType: 'PII',
          Action: 'BLOCK',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm 2: High Content Violation Rate
    this.highContentViolationAlarm = new cloudwatch.Alarm(this, 'HighContentViolationRate', {
      alarmName: 'OPX-Guardrails-HighContentViolationRate',
      alarmDescription: 'Content violation rate exceeds 10 per 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'OPX/Guardrails',
        metricName: 'ViolationCount',
        dimensionsMap: {
          ViolationType: 'CONTENT',
          Action: 'WARN',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS actions if topic provided
    if (props?.alarmTopic) {
      this.highPIIViolationAlarm.addAlarmAction(
        new cloudwatch_actions.SnsAction(props.alarmTopic)
      );
      this.highContentViolationAlarm.addAlarmAction(
        new cloudwatch_actions.SnsAction(props.alarmTopic)
      );
    }

    // Outputs
    new cdk.CfnOutput(this, 'PIIAlarmName', {
      value: this.highPIIViolationAlarm.alarmName,
      description: 'High PII Violation Alarm Name',
    });

    new cdk.CfnOutput(this, 'ContentAlarmName', {
      value: this.highContentViolationAlarm.alarmName,
      description: 'High Content Violation Alarm Name',
    });
  }
}
