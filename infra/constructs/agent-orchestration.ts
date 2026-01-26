/**
 * Phase 6 Step 1: Agent Orchestration Infrastructure
 * 
 * Lambda functions and EventBridge integration for AI agents.
 */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AgentOrchestrationProps {
  orchestratorRole: iam.Role;
  agentExecutionRole: iam.Role;
}

export class AgentOrchestration extends Construct {
  public readonly orchestratorFunction: lambda.Function;
  public readonly agentFunctions: lambda.Function[];

  constructor(scope: Construct, id: string, props: AgentOrchestrationProps) {
    super(scope, id);

    // Orchestrator Lambda
    this.orchestratorFunction = new lambda.Function(this, 'Orchestrator', {
      functionName: 'opx-agent-orchestrator',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'agents/orchestrator.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      role: props.orchestratorRole,
      tracing: lambda.Tracing.ACTIVE, // CORRECTION 6: Enable X-Ray
      environment: {
        RECOMMENDATIONS_TABLE: 'opx-agent-recommendations',
        EXECUTIONS_TABLE: 'opx-agent-executions',
        AGENT_RECOMMENDATIONS_TABLE: 'opx-agent-recommendations',
        AGENT_EXECUTIONS_TABLE: 'opx-agent-executions',
      },
    });

    // Agent Lambda functions
    const agentNames = [
      'signal-analysis',
      'historical-incident',
      'change-intelligence',
      'risk-blast-radius',
      'knowledge-rag',
      'execution-proposal',
    ];

    this.agentFunctions = agentNames.map((name) =>
      new lambda.Function(this, `Agent-${name}`, {
        functionName: `opx-agent-${name}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: `agents/${name}-agent.handler`,
        code: lambda.Code.fromAsset('dist'),
        timeout: cdk.Duration.seconds(30),
        memorySize: 1024,
        role: props.agentExecutionRole,
        tracing: lambda.Tracing.ACTIVE, // CORRECTION 6: Enable X-Ray
        environment: {
          AGENT_RECOMMENDATIONS_TABLE: 'opx-agent-recommendations',
          AGENT_EXECUTIONS_TABLE: 'opx-agent-executions',
        },
      })
    );

    // EventBridge rule: Trigger on IncidentCreated
    const rule = new events.Rule(this, 'IncidentCreatedRule', {
      eventPattern: {
        source: ['opx.incidents'],
        detailType: ['IncidentCreated'],
      },
    });

    rule.addTarget(new targets.LambdaFunction(this.orchestratorFunction));
  }
}
