/**
 * Phase 7.5: Knowledge Analytics Processor
 * 
 * Lambda function that runs daily to analyze query patterns and identify knowledge gaps.
 * 
 * Schedule: Daily at 00:00 UTC
 * Output: JSON report to S3 (s3://opx-knowledge-corpus/analytics/)
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface KnowledgeAnalyticsProcessorProps {
  /**
   * DynamoDB metrics table
   */
  readonly metricsTable: dynamodb.ITable;

  /**
   * S3 bucket for analytics reports
   */
  readonly analyticsBucket: s3.IBucket;

  /**
   * Schedule expression (default: daily at 00:00 UTC)
   */
  readonly scheduleExpression?: string;
}

export class KnowledgeAnalyticsProcessor extends Construct {
  public readonly function: lambda.Function;
  public readonly schedule: events.Rule;

  constructor(scope: Construct, id: string, props: KnowledgeAnalyticsProcessorProps) {
    super(scope, id);

    // ========================================================================
    // LAMBDA FUNCTION
    // ========================================================================

    this.function = new lambda.Function(this, 'Function', {
      functionName: 'opx-knowledge-analytics-processor',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'analytics-processor.lambda_handler',
      code: lambda.Code.fromAsset('src/knowledge', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install --no-cache-dir boto3 -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        METRICS_TABLE_NAME: props.metricsTable.tableName,
        ANALYTICS_BUCKET: props.analyticsBucket.bucketName,
      },
      description: 'Phase 7.5: Daily analytics processor for Knowledge Base queries',
    });

    // ========================================================================
    // IAM PERMISSIONS
    // ========================================================================

    // Read from metrics table
    props.metricsTable.grantReadData(this.function);

    // Write to analytics bucket
    props.analyticsBucket.grantPut(this.function);

    // ========================================================================
    // EVENTBRIDGE SCHEDULE
    // ========================================================================

    const scheduleExpression = props.scheduleExpression || 'cron(0 0 * * ? *)'; // Daily at 00:00 UTC

    this.schedule = new events.Rule(this, 'Schedule', {
      ruleName: 'opx-knowledge-analytics-daily',
      description: 'Trigger Knowledge Base analytics processor daily',
      schedule: events.Schedule.expression(scheduleExpression),
    });

    this.schedule.addTarget(new events_targets.LambdaFunction(this.function));

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.function.functionName,
      description: 'Analytics Processor Function Name',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Analytics Processor Function ARN',
      exportName: 'OpxKnowledgeAnalyticsProcessorArn',
    });

    new cdk.CfnOutput(this, 'ScheduleArn', {
      value: this.schedule.ruleArn,
      description: 'Analytics Processor Schedule ARN',
    });
  }
}
