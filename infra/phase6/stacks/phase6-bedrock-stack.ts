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
import { BedrockGuardrails } from '../../constructs/bedrock-guardrails.js';
import { GuardrailViolationsTable } from '../../constructs/guardrail-violations-table.js';
import { GuardrailAlarms } from '../../constructs/guardrail-alarms.js';
import { ValidationErrorsTable } from '../../constructs/validation-errors-table.js';
import { ValidationAlarms } from '../../constructs/validation-alarms.js';
import { TokenAnalyticsDashboard } from '../../constructs/token-analytics-dashboard.js';
import { TokenAnalyticsAlarms } from '../../constructs/token-analytics-alarms.js';
import { BudgetAlertLambda } from '../../constructs/budget-alert-lambda.js';
import { AgentRecommendationsTable } from '../../constructs/agent-recommendations-table.js';

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

    // Import Knowledge Base ID from main stack (Phase 7.3)
    const knowledgeBaseId = cdk.Fn.importValue('BedrockKnowledgeBaseId');

    // Action Groups (9 Lambda stubs + 1 knowledge retrieval)
    const actionGroups = new BedrockActionGroups(this, 'BedrockActionGroups', {
      knowledgeBaseId: knowledgeBaseId,
    });

    // Bedrock Agents (6 agents with aliases)
    const agents = new BedrockAgents(this, 'BedrockAgents', {
      executionRole: iamRoles.bedrockAgentRole,
      actionGroups: actionGroups,
    });

    // ========================================================================
    // PHASE 8.2: BEDROCK GUARDRAILS
    // ========================================================================

    // Guardrail Violations Table
    const violationsTable = new GuardrailViolationsTable(this, 'GuardrailViolationsTable');

    // Bedrock Guardrails
    const guardrails = new BedrockGuardrails(this, 'BedrockGuardrails');

    // Guardrail Alarms
    new GuardrailAlarms(this, 'GuardrailAlarms');

    // Update executor Lambda with Bedrock Agent IDs and Aliases
    // These are required for LangGraph to invoke the agents
    agents.agents.forEach((agent, agentId) => {
      const alias = agents.aliases.get(agentId);
      if (alias) {
        const envPrefix = agentId.toUpperCase().replace(/-/g, '_');
        executorLambda.function.addEnvironment(`${envPrefix}_AGENT_ID`, agent.attrAgentId);
        executorLambda.function.addEnvironment(`${envPrefix}_ALIAS_ID`, alias.attrAgentAliasId);
      }
    });

    // Update executor Lambda with guardrail configuration
    executorLambda.function.addEnvironment('GUARDRAIL_ID', guardrails.guardrailId);
    executorLambda.function.addEnvironment('GUARDRAIL_VERSION', 'DRAFT');
    executorLambda.function.addEnvironment('GUARDRAIL_VIOLATIONS_TABLE', violationsTable.table.tableName);
    
    // Grant violations table write permissions
    violationsTable.table.grantWriteData(executorLambda.function);

    // ========================================================================
    // PHASE 8.3: STRUCTURED OUTPUT VALIDATION
    // ========================================================================

    // Validation Errors Table
    const validationTable = new ValidationErrorsTable(this, 'ValidationErrorsTable');

    // Validation Alarms
    new ValidationAlarms(this, 'ValidationAlarms');

    // Update executor Lambda with validation configuration
    executorLambda.function.addEnvironment('VALIDATION_ERRORS_TABLE', validationTable.table.tableName);
    
    // Grant validation table write permissions
    validationTable.table.grantWriteData(executorLambda.function);

    // Grant CloudWatch metrics permissions for validation
    executorLambda.function.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'OPX/Validation',
        },
      },
    }));

    // ========================================================================
    // PHASE 8.4: TOKEN USAGE ANALYTICS
    // ========================================================================

    // Token Analytics Dashboard
    const tokenDashboard = new TokenAnalyticsDashboard(this, 'TokenAnalyticsDashboard', {
      monthlyBudget: 100, // $100/month budget
    });

    // Token Analytics Alarms
    new TokenAnalyticsAlarms(this, 'TokenAnalyticsAlarms', {
      monthlyBudget: 100,
    });

    // Budget Alert Lambda (Optional - disabled by default)
    // ✅ Correction 4: Optional, disabled by default
    new BudgetAlertLambda(this, 'BudgetAlertLambda', {
      enabled: false, // Set to true to enable
    });

    // Grant CloudWatch metrics permissions for analytics
    executorLambda.function.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'OPX/Analytics',
        },
      },
    }));

    // ========================================================================
    // PHASE 8.7: ADVISORY RECOMMENDATION PERSISTENCE
    // ========================================================================

    // Agent Recommendations Table
    const recommendationsTable = new AgentRecommendationsTable(this, 'AgentRecommendationsTable', {
      environment: 'dev',
      ttlDays: 90,
    });

    // Update executor Lambda with recommendations configuration
    executorLambda.function.addEnvironment('RECOMMENDATIONS_TABLE', recommendationsTable.table.tableName);
    
    // Grant recommendations table write permissions (write-only)
    recommendationsTable.table.grantWriteData(executorLambda.function);

    // Grant CloudWatch metrics permissions for recommendations
    executorLambda.function.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'OPX/Recommendations',
        },
      },
    }));

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

    // Phase 8.2: Guardrail Outputs
    new cdk.CfnOutput(this, 'GuardrailId', {
      value: guardrails.guardrailId,
      description: 'Bedrock Guardrail ID (Phase 8.2)',
      exportName: 'OpxPhase6-GuardrailId',
    });

    new cdk.CfnOutput(this, 'GuardrailArn', {
      value: guardrails.guardrailArn,
      description: 'Bedrock Guardrail ARN (Phase 8.2)',
      exportName: 'OpxPhase6-GuardrailArn',
    });

    new cdk.CfnOutput(this, 'GuardrailViolationsTableName', {
      value: violationsTable.table.tableName,
      description: 'Guardrail Violations DynamoDB Table (Phase 8.2)',
      exportName: 'OpxPhase6-GuardrailViolationsTableName',
    });

    // Phase 8.3: Validation Outputs
    new cdk.CfnOutput(this, 'ValidationErrorsTableName', {
      value: validationTable.table.tableName,
      description: 'Validation Errors DynamoDB Table (Phase 8.3)',
      exportName: 'OpxPhase6-ValidationErrorsTableName',
    });

    // Phase 8.7: Recommendations Outputs
    new cdk.CfnOutput(this, 'RecommendationsTableName', {
      value: recommendationsTable.table.tableName,
      description: 'Agent Recommendations DynamoDB Table (Phase 8.7)',
      exportName: 'OpxPhase6-RecommendationsTableName',
    });
  }
}
