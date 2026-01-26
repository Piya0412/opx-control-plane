/**
 * Phase 6 Invocation Lambda Construct
 * 
 * Lambda function that receives IncidentCreated events and invokes Phase 6 intelligence.
 * 
 * CRITICAL RULES:
 * - Read-only access to incidents and evidence
 * - Can invoke Phase 6 executor Lambda
 * - Can write to advisory table
 * - No state mutation
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface Phase6InvocationLambdaProps {
  /**
   * Incidents table
   */
  incidentsTable: dynamodb.ITable;

  /**
   * Evidence bundles table
   */
  evidenceTable: dynamodb.ITable;

  /**
   * Advisory recommendations table
   */
  advisoryTable: dynamodb.ITable;

  /**
   * Phase 6 executor Lambda ARN
   */
  phase6ExecutorLambdaArn: string;
}

/**
 * Phase 6 Invocation Lambda
 * 
 * Receives IncidentCreated events and invokes Phase 6 intelligence layer.
 */
export class Phase6InvocationLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: Phase6InvocationLambdaProps) {
    super(scope, id);

    // ========================================================================
    // LAMBDA FUNCTION
    // ========================================================================

    this.function = new nodejs.NodejsFunction(this, 'Function', {
      entry: 'src/advisory/phase6-invocation-handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(2), // Phase 6 can take up to 5 min, but we invoke async
      memorySize: 512,
      environment: {
        INCIDENTS_TABLE_NAME: props.incidentsTable.tableName,
        EVIDENCE_TABLE_NAME: props.evidenceTable.tableName,
        ADVISORY_TABLE_NAME: props.advisoryTable.tableName,
        PHASE6_EXECUTOR_LAMBDA_ARN: props.phase6ExecutorLambdaArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2020',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: ['aws-sdk'],
      },
    });

    // ========================================================================
    // IAM PERMISSIONS
    // ========================================================================

    // Read-only access to incidents table
    props.incidentsTable.grantReadData(this.function);

    // Read-only access to evidence table
    props.evidenceTable.grantReadData(this.function);

    // Write access to advisory table
    props.advisoryTable.grantWriteData(this.function);

    // Permission to invoke Phase 6 executor Lambda
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.phase6ExecutorLambdaArn],
      })
    );

    // Explicit DENY on write operations to incidents and evidence
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [
          props.incidentsTable.tableArn,
          props.evidenceTable.tableArn,
        ],
      })
    );

    // ========================================================================
    // OUTPUTS
    // ========================================================================

    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.function.functionName,
      description: 'Phase 6 invocation Lambda function name',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Phase 6 invocation Lambda function ARN',
    });
  }
}
