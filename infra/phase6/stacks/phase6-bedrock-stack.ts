/**
 * Phase 6 Bedrock Stack - Isolated from Legacy Code
 * 
 * ARCHITECTURE:
 * - Zero TypeScript imports from Phase 1-5
 * - Uses CloudFormation Fn.importValue() for cross-stack references
 * - Self-contained Bedrock Agent infrastructure
 * 
 * SAFETY:
 * - No risk to audited Phase 1-5 infrastructure
 * - Can deploy independently
 * - Legacy errors don't block this stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BedrockAgentIamRoles } from '../constructs/bedrock-agent-iam-roles.js';
import { BedrockActionGroups } from '../constructs/bedrock-action-groups.js';
import { BedrockAgents } from '../constructs/bedrock-agents.js';
import { LangGraphCheckpointTable } from '../constructs/langgraph-checkpoint-table.js';
import { Phase6ExecutorLambda } from '../constructs/phase6-executor-lambda.js';

export class Phase6BedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // PHASE 6: BEDROCK AGENT INFRASTRUCTURE (ISOLATED)
    // ========================================================================

    // Week 5: LangGraph Checkpoint Table (DynamoDB)
    const checkpointTable = new LangGraphCheckpointTable(this, 'LangGraphCheckpointTable', {
      environment: 'dev',
    });

    // Week 5: Lambda Executor (LangGraph orchestration)
    const executorLambda = new Phase6ExecutorLambda(this, 'Phase6ExecutorLambda', {
      checkpointTable: checkpointTable.table,
      environment: 'dev',
    });

    // IAM Execution Role (least-privilege, read-only)
    const iamRoles = new BedrockAgentIamRoles(this, 'BedrockAgentIamRoles');

    // Action Groups (9 Lambda stubs)
    const actionGroups = new BedrockActionGroups(this, 'BedrockActionGroups');

    // Bedrock Agents (6 agents with aliases)
    const agents = new BedrockAgents(this, 'BedrockAgents', {
      executionRole: iamRoles.bedrockAgentRole,
      actionGroups: actionGroups,
    });

    // ========================================================================
    // CROSS-STACK REFERENCES (IF NEEDED)
    // ========================================================================
    // Example: Import DynamoDB table ARN from Phase 1-5 stack
    // const signalTableArn = cdk.Fn.importValue('SignalStoreTableArn');
    // 
    // Grant read access to action group Lambdas:
    // actionGroups.lambdas.forEach(fn => {
    //   fn.addToRolePolicy(new iam.PolicyStatement({
    //     actions: ['dynamodb:GetItem', 'dynamodb:Query'],
    //     resources: [signalTableArn],
    //   }));
    // });

    // ========================================================================
    // STACK OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, 'Phase6StackStatus', {
      value: 'DEPLOYED',
      description: 'Phase 6 Bedrock Stack deployment status',
    });

    new cdk.CfnOutput(this, 'ExecutorLambdaArn', {
      value: executorLambda.function.functionArn,
      description: 'Phase 6 executor Lambda ARN',
    });

    new cdk.CfnOutput(this, 'ExecutorLambdaName', {
      value: executorLambda.function.functionName,
      description: 'Phase 6 executor Lambda name',
    });

    new cdk.CfnOutput(this, 'CheckpointTableName', {
      value: checkpointTable.table.tableName,
      description: 'LangGraph checkpoint table name',
    });

    new cdk.CfnOutput(this, 'AgentCount', {
      value: agents.agents.size.toString(),
      description: 'Number of Bedrock Agents deployed',
    });

    new cdk.CfnOutput(this, 'ActionGroupCount', {
      value: actionGroups.lambdas.size.toString(),
      description: 'Number of action group Lambdas deployed',
    });
  }
}
