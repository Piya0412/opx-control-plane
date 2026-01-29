/**
 * Phase 6 Week 3: Bedrock Agent IAM Roles
 * 
 * IAM roles for Bedrock Agents with least-privilege access.
 * 
 * CRITICAL RULES:
 * 1. Trust policy: bedrock.amazonaws.com
 * 2. Read-only access to data sources
 * 3. Write access to CloudWatch Logs only
 * 4. Explicit DENY on mutation operations
 */

import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class BedrockAgentIamRoles extends Construct {
  public readonly bedrockAgentRole: iam.Role;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Bedrock Agent execution role
    this.bedrockAgentRole = new iam.Role(this, 'BedrockAgentRole', {
      roleName: 'opx-bedrock-agent-execution-role',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Execution role for OPX Bedrock Agents with read-only access',
    });

    // ========================================================================
    // BEDROCK MODEL INVOCATION (REQUIRED)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockModelInvocation',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.claude-3-5-sonnet*`,
      ],
    }));

    // ========================================================================
    // BEDROCK GUARDRAILS (PHASE 8.2)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockGuardrailsAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:ApplyGuardrail',
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:guardrail/*`,
      ],
    }));

    // ========================================================================
    // CLOUDWATCH LOGS (WRITE FOR AGENT LOGS)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsWrite',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/bedrock/agents/*`,
      ],
    }));

    // ========================================================================
    // LAMBDA INVOCATION (FOR ACTION GROUPS)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'LambdaInvocation',
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
      ],
      resources: [
        `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:opx-*-tool-*`,
      ],
    }));

    // ========================================================================
    // CLOUDWATCH METRICS (READ-ONLY FOR SIGNAL INTELLIGENCE)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchMetricsRead',
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics',
      ],
      resources: ['*'], // CloudWatch metrics don't support resource-level permissions
    }));

    // ========================================================================
    // CLOUDWATCH LOGS (READ-ONLY FOR SIGNAL INTELLIGENCE)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsRead',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:FilterLogEvents',
        'logs:GetLogEvents',
        'logs:DescribeLogStreams',
      ],
      resources: [
        `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:*`,
      ],
    }));

    // ========================================================================
    // DYNAMODB (READ-ONLY FOR HISTORICAL PATTERN)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'DynamoDBRead',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
      ],
      resources: [
        `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/opx-*`,
      ],
    }));

    // ========================================================================
    // X-RAY (READ-ONLY FOR SIGNAL INTELLIGENCE)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'XRayRead',
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:GetTraceSummaries',
        'xray:BatchGetTraces',
        'xray:GetServiceGraph',
      ],
      resources: ['*'], // X-Ray doesn't support resource-level permissions
    }));

    // ========================================================================
    // EXPLICIT DENY (DEFENSE-IN-DEPTH)
    // ========================================================================
    this.bedrockAgentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ExplicitDenyMutations',
      effect: iam.Effect.DENY,
      actions: [
        // IAM mutations
        'iam:*',
        
        // Network mutations
        'ec2:*',
        'vpc:*',
        
        // S3 mutations
        's3:Put*',
        's3:Delete*',
        's3:Create*',
        
        // DynamoDB mutations
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:BatchWriteItem',
        
        // CloudWatch mutations
        'cloudwatch:PutMetricAlarm',
        'cloudwatch:DeleteAlarms',
        'cloudwatch:PutMetricData',
        
        // Lambda mutations
        'lambda:CreateFunction',
        'lambda:UpdateFunctionCode',
        'lambda:DeleteFunction',
        
        // Bedrock mutations
        'bedrock:CreateAgent',
        'bedrock:UpdateAgent',
        'bedrock:DeleteAgent',
      ],
      resources: ['*'],
    }));

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, 'BedrockAgentRoleArn', {
      value: this.bedrockAgentRole.roleArn,
      description: 'ARN of Bedrock Agent execution role',
      exportName: 'BedrockAgentRoleArn',
    });
  }
}
