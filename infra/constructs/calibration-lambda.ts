/**
 * Phase 5 - Step 3: Calibration Lambda
 * 
 * Lambda function for automated confidence calibration.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface CalibrationLambdaProps {
  outcomeTableName: string;
  calibrationTableName: string;
  auditTableName: string;
  configTableName: string;
  alertTopicArn?: string;
}

export class CalibrationLambda extends Construct {
  public readonly function: lambda.IFunction;
  public readonly dlq: sqs.IQueue;
  
  constructor(scope: Construct, id: string, props: CalibrationLambdaProps) {
    super(scope, id);
    
    // Dead letter queue
    this.dlq = new sqs.Queue(this, 'CalibrationDLQ', {
      queueName: 'opx-calibration-handler-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });
    
    // Lambda function
    this.function = new nodejs.NodejsFunction(this, 'CalibrationFunction', {
      functionName: 'opx-calibration-handler',
      entry: 'src/automation/handlers/calibration-handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        OUTCOME_TABLE_NAME: props.outcomeTableName,
        CALIBRATION_TABLE_NAME: props.calibrationTableName,
        AUDIT_TABLE_NAME: props.auditTableName,
        CONFIG_TABLE_NAME: props.configTableName,
        ALERT_TOPIC_ARN: props.alertTopicArn || '',
        LOG_LEVEL: 'INFO',
      },
      deadLetterQueue: this.dlq,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2020',
      },
    });
    
    // Grant DynamoDB permissions
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:UpdateItem',
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.outcomeTableName}`,
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.calibrationTableName}`,
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.auditTableName}`,
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.configTableName}`,
        ],
      })
    );
    
    // Grant CloudWatch permissions
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );
    
    // Grant SNS permissions (if alert topic provided)
    if (props.alertTopicArn) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sns:Publish'],
          resources: [props.alertTopicArn],
        })
      );
    }
    
    // CloudFormation outputs
    new cdk.CfnOutput(this, 'CalibrationFunctionName', {
      value: this.function.functionName,
      description: 'Calibration handler Lambda function name',
    });
    
    new cdk.CfnOutput(this, 'CalibrationFunctionArn', {
      value: this.function.functionArn,
      description: 'Calibration handler Lambda function ARN',
    });
  }
}
