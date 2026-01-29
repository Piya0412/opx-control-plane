import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TraceProcessorLambdaProps {
  readonly tracesTable: dynamodb.ITable;
  readonly eventBus: events.IEventBus;
}

/**
 * Trace Processor Lambda (Phase 8.1)
 * 
 * Processes LLM trace events from EventBridge and stores them in DynamoDB.
 * 
 * CRITICAL ARCHITECTURE:
 * - Native EventBridge format (event['detail']), NOT SQS
 * - Non-blocking: failures never propagate to agents
 * - Best-effort delivery: log errors but return success
 */
export class TraceProcessorLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly rule: events.Rule;

  constructor(scope: Construct, id: string, props: TraceProcessorLambdaProps) {
    super(scope, id);

    // CloudWatch Logs
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/aws/lambda/opx-trace-processor',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda function
    this.function = new lambda.Function(this, 'Function', {
      functionName: 'opx-trace-processor',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'trace-processor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/tracing')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TRACES_TABLE_NAME: props.tracesTable.tableName,
      },
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
      description: 'Process LLM trace events from EventBridge (Phase 8.1)',
    });

    // Grant write access to traces table
    props.tracesTable.grantWriteData(this.function);

    // EventBridge Rule: LLMTraceEvent → Trace Processor
    this.rule = new events.Rule(this, 'Rule', {
      ruleName: 'opx-llm-trace-to-processor',
      eventBus: props.eventBus,
      eventPattern: {
        source: ['opx.langgraph'],
        detailType: ['LLMTraceEvent'],
      },
      description: 'Route LLM trace events to processor Lambda (Phase 8.1)',
      enabled: true,
    });

    // Add Lambda as target
    this.rule.addTarget(new targets.LambdaFunction(this.function, {
      retryAttempts: 2,
      maxEventAge: cdk.Duration.hours(1),
    }));

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.function.functionName,
      description: 'Trace processor Lambda function name (Phase 8.1)',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Trace processor Lambda function ARN (Phase 8.1)',
    });

    new cdk.CfnOutput(this, 'RuleName', {
      value: this.rule.ruleName,
      description: 'EventBridge rule name for trace processing (Phase 8.1)',
    });
  }
}
