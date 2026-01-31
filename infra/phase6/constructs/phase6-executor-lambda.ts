import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Phase6ExecutorLambdaProps {
  readonly checkpointTable: dynamodb.ITable;
  readonly environment?: string;
  readonly guardrailId?: string;
  readonly guardrailVersion?: string;
  readonly violationsTable?: dynamodb.ITable;
}

export class Phase6ExecutorLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly eventRule: events.Rule;

  constructor(scope: Construct, id: string, props: Phase6ExecutorLambdaProps) {
    super(scope, id);

    const env = props.environment || 'dev';

    // Create Lambda execution role
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Phase 6 LangGraph executor Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    // Grant DynamoDB permissions (read/write to checkpoint table)
    props.checkpointTable.grantReadWriteData(executionRole);

    // Grant Bedrock Runtime permissions (InvokeModel for Claude)
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          // Allow access to Claude models
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-*`,
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-*`,
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-*`,
        ],
      })
    );

    // Grant Bedrock Agent Runtime permissions (InvokeAgent for agent invocation)
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agent-runtime:InvokeAgent',
          'bedrock-agent-runtime:Retrieve',
          'bedrock-agent-runtime:RetrieveAndGenerate',
        ],
        resources: ['*'], // Agents are identified at runtime
      })
    );

    // Grant read-only access to observability data (for action groups)
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:GetMetricData',
          'cloudwatch:GetMetricStatistics',
          'logs:FilterLogEvents',
          'logs:StartQuery',
          'logs:GetQueryResults',
          'xray:GetTraceSummaries',
          'xray:BatchGetTraces',
          'dynamodb:GetItem',
          'dynamodb:Query',
        ],
        resources: ['*'],
      })
    );

    // Explicit DENY on write operations (safety) - EXCEPT checkpoint table
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        notResources: [
          props.checkpointTable.tableArn,  // Allow writes to checkpoint table
        ],
      })
    );

    // Explicit DENY on dangerous operations
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [
          'ec2:*',
          'lambda:UpdateFunctionCode',
          'lambda:UpdateFunctionConfiguration',
        ],
        resources: ['*'],
      })
    );

    // Grant CloudWatch permissions (PutMetricData)
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Create Lambda function with optimized dependency bundling
    this.function = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      role: executionRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        LANGGRAPH_CHECKPOINT_TABLE: props.checkpointTable.tableName,
        USE_DYNAMODB_CHECKPOINTING: 'true',
        ENVIRONMENT: env,
        ...(props.guardrailId && {
          GUARDRAIL_ID: props.guardrailId,
          GUARDRAIL_VERSION: props.guardrailVersion || 'DRAFT',
          GUARDRAIL_VIOLATIONS_TABLE: props.violationsTable?.tableName || '',
        }),
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      description: 'Phase 6 LangGraph executor - processes incident intelligence requests',
    });

    // Grant violations table permissions if provided
    if (props.violationsTable) {
      props.violationsTable.grantWriteData(executionRole);
    }

    // Create EventBridge rule for IncidentCreated events
    this.eventRule = new events.Rule(this, 'EventRule', {
      description: 'Trigger Phase 6 intelligence on incident creation',
      eventPattern: {
        source: ['opx.incident'],
        detailType: ['IncidentCreated'],
      },
    });

    // Add Lambda as target
    this.eventRule.addTarget(
      new targets.LambdaFunction(this.function, {
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(1),
      })
    );

    // Add tags
    cdk.Tags.of(this.function).add('Phase', 'Phase6');
    cdk.Tags.of(this.function).add('Component', 'LangGraphExecutor');
    cdk.Tags.of(this.function).add('Environment', env);

    // Outputs
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Phase 6 executor Lambda ARN',
      exportName: `Phase6ExecutorLambdaArn-${env}`,
    });

    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.function.functionName,
      description: 'Phase 6 executor Lambda name',
      exportName: `Phase6ExecutorLambdaName-${env}`,
    });

    new cdk.CfnOutput(this, 'EventRuleArn', {
      value: this.eventRule.ruleArn,
      description: 'EventBridge rule ARN',
      exportName: `Phase6EventRuleArn-${env}`,
    });
  }
}
