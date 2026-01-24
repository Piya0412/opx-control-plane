/**
 * Phase 5 - Step 3: Calibration Schedule
 * 
 * EventBridge rule for monthly calibration execution.
 */

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface CalibrationScheduleProps {
  calibrationFunction: lambda.IFunction;
}

export class CalibrationSchedule extends Construct {
  public readonly monthlyRule: events.Rule;
  
  constructor(scope: Construct, id: string, props: CalibrationScheduleProps) {
    super(scope, id);
    
    // Monthly calibration: 1st of month, 4 AM UTC
    this.monthlyRule = new events.Rule(this, 'MonthlyCalibrationRule', {
      ruleName: 'opx-monthly-calibration',
      description: 'Trigger monthly confidence calibration',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '4',
        day: '1',
        month: '*',
        year: '*',
      }),
      enabled: false, // Start disabled for safe deployment
    });
    
    // Add Lambda target
    this.monthlyRule.addTarget(
      new targets.LambdaFunction(props.calibrationFunction, {
        event: events.RuleTargetInput.fromObject({
          detail: {
            // No explicit dates - handler will calculate previous month
          },
        }),
      })
    );
    
    // CloudFormation outputs
    new cdk.CfnOutput(this, 'MonthlyCalibrationRuleName', {
      value: this.monthlyRule.ruleName,
      description: 'Monthly calibration EventBridge rule name',
    });
  }
}
