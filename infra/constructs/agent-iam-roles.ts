/**
 * Phase 6 Step 1: Agent IAM Roles
 * 
 * IAM roles with read-only enforcement for AI agents.
 */

import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AgentIamRolesProps {
  incidentTable: dynamodb.Table;
  evidenceTable: dynamodb.Table;
  recommendationsTable: dynamodb.Table;
  executionsTable: dynamodb.Table;
}

export class AgentIamRoles extends Construct {
  public readonly orchestratorRole: iam.Role;
  public readonly agentExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentIamRolesProps) {
    super(scope, id);

    // Orchestrator role - can invoke agents and write recommendations
    this.orchestratorRole = new iam.Role(this, 'OrchestratorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Read incidents and evidence
    props.incidentTable.grantReadData(this.orchestratorRole);
    props.evidenceTable.grantReadData(this.orchestratorRole);

    // Write recommendations
    props.recommendationsTable.grantWriteData(this.orchestratorRole);

    // Invoke agent lambdas
    this.orchestratorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: ['arn:aws:lambda:*:*:function:opx-agent-*'],
    }));

    // Agent execution role - read-only with explicit denies
    this.agentExecutionRole = new iam.Role(this, 'AgentExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Read-only access to data sources
    props.incidentTable.grantReadData(this.agentExecutionRole);
    props.evidenceTable.grantReadData(this.agentExecutionRole);

    // Write to executions table (observability)
    props.executionsTable.grantWriteData(this.agentExecutionRole);

    // Bedrock access (read-only model invocation)
    this.agentExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/*'],
    }));

    // CloudWatch read-only (for signal analysis)
    this.agentExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricData',
        'cloudwatch:GetMetricStatistics',
        'logs:FilterLogEvents',
        'logs:GetLogEvents',
      ],
      resources: ['*'],
    }));

    // EXPLICIT DENY on write operations
    this.agentExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'cloudwatch:PutMetricAlarm',
        'cloudwatch:DeleteAlarms',
        'lambda:InvokeFunction',
      ],
      resources: [
        props.incidentTable.tableArn,
        props.evidenceTable.tableArn,
        'arn:aws:cloudwatch:*:*:alarm:*',
      ],
    }));
  }
}
