/**
 * Phase 5 - Step 2: Pattern Extraction Lambda
 * 
 * Lambda function for automated pattern extraction from closed incidents.
 */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PatternExtractionLambdaProps {
  outcomeTableName: string;
  summaryTableName: string;
  auditTableName: string;
}

export class PatternExtractionLambda extends Construct {
  public readonly function: lambda.Function;
  
  constructor(scope: Construct, id: string, props: PatternExtractionLambdaProps) {
    super(scope, id);
    
    // Log group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/aws/lambda/opx-pattern-extraction-handler',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    
    // Lambda function
    this.function = new nodejs.NodejsFunction(this, 'Function', {
      functionName: 'opx-pattern-extraction-handler',
      entry: path.join(__dirname, '../../src/automation/handlers/pattern-extraction-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        OUTCOME_TABLE_NAME: props.outcomeTableName,
        SUMMARY_TABLE_NAME: props.summaryTableName,
        AUDIT_TABLE_NAME: props.auditTableName,
        LOG_LEVEL: 'INFO',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
      deadLetterQueueEnabled: true, // Mandatory DLQ for async invocations
    });
    
    // Grant DynamoDB permissions
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
        ],
        resources: [
          `arn:aws:dynamodb:*:*:table/${props.outcomeTableName}`,
          `arn:aws:dynamodb:*:*:table/${props.outcomeTableName}/index/*`,
          `arn:aws:dynamodb:*:*:table/${props.summaryTableName}`,
          `arn:aws:dynamodb:*:*:table/${props.auditTableName}`,
          `arn:aws:dynamodb:*:*:table/${props.auditTableName}/index/*`,
        ],
      })
    );
    
    // Grant CloudWatch permissions
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );
  }
}
