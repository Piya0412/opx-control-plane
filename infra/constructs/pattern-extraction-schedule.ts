/**
 * Phase 5 - Step 2: Pattern Extraction Schedule
 * 
 * EventBridge rules for scheduled pattern extraction.
 */

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class PatternExtractionSchedule extends Construct {
  public readonly dailyRule: events.Rule;
  public readonly weeklyRule: events.Rule;
  
  constructor(
    scope: Construct,
    id: string,
    handler: lambda.Function
  ) {
    super(scope, id);
    
    // Daily extraction at 2 AM UTC
    this.dailyRule = new events.Rule(this, 'DailyPatternExtraction', {
      ruleName: 'opx-daily-pattern-extraction',
      description: 'Daily pattern extraction from closed incidents',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: false, // Start disabled for safe deployment
      targets: [
        new targets.LambdaFunction(handler, {
          event: events.RuleTargetInput.fromObject({
            timeWindow: 'DAILY',
          }),
        }),
      ],
    });
    
    // Weekly extraction at 3 AM UTC on Sundays
    this.weeklyRule = new events.Rule(this, 'WeeklyPatternExtraction', {
      ruleName: 'opx-weekly-pattern-extraction',
      description: 'Weekly pattern extraction from closed incidents',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '3',
        weekDay: 'SUN',
        month: '*',
        year: '*',
      }),
      enabled: false, // Start disabled for safe deployment
      targets: [
        new targets.LambdaFunction(handler, {
          event: events.RuleTargetInput.fromObject({
            timeWindow: 'WEEKLY',
          }),
        }),
      ],
    });
  }
}
