/**
 * Phase 6 Week 3: Bedrock Agents
 * 
 * Provisions 6 Bedrock Agents with action groups and aliases.
 * 
 * CRITICAL RULES:
 * 1. Use prompts from Week 1 (prompts/{agent-id}/v1.0.0.md)
 * 2. Prepare agent (mandatory)
 * 3. Create stable alias (prod)
 * 4. Export agent_id and alias_id
 */

import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BedrockActionGroups } from './bedrock-action-groups.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BedrockAgentsProps {
  executionRole: iam.Role;
  actionGroups: BedrockActionGroups;
}

export class BedrockAgents extends Construct {
  public readonly agents: Map<string, bedrock.CfnAgent>;
  public readonly aliases: Map<string, bedrock.CfnAgentAlias>;

  constructor(scope: Construct, id: string, props: BedrockAgentsProps) {
    super(scope, id);

    this.agents = new Map();
    this.aliases = new Map();

    // ========================================================================
    // AGENT CONFIGURATIONS
    // ========================================================================
    const agentConfigs = [
      {
        id: 'signal-intelligence',
        description: 'Analyze observability signals (metrics, logs, traces)',
        actionGroups: [
          { name: 'query-metrics', description: 'Query CloudWatch metrics' },
          { name: 'search-logs', description: 'Search CloudWatch Logs' },
          { name: 'analyze-traces', description: 'Analyze X-Ray traces' },
        ],
      },
      {
        id: 'historical-pattern',
        description: 'Find similar past incidents and proven resolutions',
        actionGroups: [
          { name: 'search-incidents', description: 'Search past incidents' },
          { name: 'get-resolution-summary', description: 'Get resolution details' },
        ],
      },
      {
        id: 'change-intelligence',
        description: 'Correlate incident with deployments and config changes',
        actionGroups: [
          { name: 'query-deployments', description: 'Query deployment history' },
          { name: 'query-config-changes', description: 'Query config changes' },
        ],
      },
      {
        id: 'risk-blast-radius',
        description: 'Estimate incident impact and propagation risk',
        actionGroups: [
          { name: 'query-service-graph', description: 'Query service dependency graph' },
          { name: 'query-traffic-metrics', description: 'Query traffic metrics' },
        ],
      },
      {
        id: 'knowledge-rag',
        description: 'Search runbooks, postmortems, documentation',
        actionGroups: [
          { name: 'retrieve-knowledge', description: 'Retrieve knowledge from Knowledge Base' },
        ],
      },
      {
        id: 'response-strategy',
        description: 'Rank potential actions and estimate effectiveness',
        actionGroups: [], // Pure LLM synthesis
      },
    ];

    // Create each agent
    agentConfigs.forEach(config => {
      this.createAgent(config, props);
    });
  }

  private createAgent(
    config: {
      id: string;
      description: string;
      actionGroups: Array<{ name: string; description: string }>;
    },
    props: BedrockAgentsProps
  ): void {
    // ========================================================================
    // LOAD PROMPT FROM WEEK 1
    // ========================================================================
    // ES module equivalent of __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    // Prompts are at workspace root: prompts/{agent-id}/v1.0.0.md
    const promptPath = join(__dirname, '../../../prompts', config.id, 'v1.0.0.md');
    let instruction: string;
    
    try {
      instruction = readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn(`Warning: Could not load prompt for ${config.id}, using placeholder`);
      instruction = `You are the ${config.id} agent. ${config.description}. Return structured JSON output only.`;
    }

    // ========================================================================
    // CREATE AGENT
    // ========================================================================
    const agent = new bedrock.CfnAgent(this, `Agent-${config.id}`, {
      agentName: `opx-${config.id}`,
      agentResourceRoleArn: props.executionRole.roleArn,
      foundationModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      instruction: instruction,
      description: config.description,
      
      // Session configuration
      idleSessionTtlInSeconds: 600, // 10 minutes
      
      // Guardrail configuration (Phase 8.2)
      guardrailConfiguration: {
        guardrailIdentifier: cdk.Fn.importValue('OpxPhase6-GuardrailId'),
        guardrailVersion: 'DRAFT',
      },
      
      // Action groups (if any)
      actionGroups: config.actionGroups.length > 0 ? config.actionGroups.map(ag => {
        const lambdaFn = props.actionGroups.lambdas.get(`${config.id}-${ag.name}`);
        
        if (!lambdaFn) {
          throw new Error(`Lambda not found for ${config.id}-${ag.name}`);
        }

        return {
          actionGroupName: ag.name,
          description: ag.description,
          actionGroupExecutor: {
            lambda: lambdaFn.functionArn,
          },
          // OpenAPI schema for action group
          apiSchema: {
            payload: JSON.stringify({
              openapi: '3.0.0',
              info: {
                title: `${ag.name} API`,
                version: '1.0.0',
                description: ag.description,
              },
              paths: {
                [`/${ag.name}`]: {
                  post: {
                    summary: ag.description,
                    description: `Execute ${ag.name} action`,
                    operationId: ag.name.replace(/-/g, '_'),
                    requestBody: {
                      required: true,
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              parameters: {
                                type: 'object',
                                description: 'Action parameters',
                              },
                            },
                          },
                        },
                      },
                    },
                    responses: {
                      '200': {
                        description: 'Success',
                        content: {
                          'application/json': {
                            schema: {
                              type: 'object',
                              properties: {
                                result: {
                                  type: 'object',
                                  description: 'Action result',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
        };
      }) : undefined,
      
      // For agents with no action groups (like response-strategy),
      // configure to skip action group orchestration
      skipResourceInUseCheckOnDelete: true,
    });

    this.agents.set(config.id, agent);

    // ========================================================================
    // CREATE ALIAS (STABLE)
    // ========================================================================
    const alias = new bedrock.CfnAgentAlias(this, `Alias-${config.id}`, {
      agentId: agent.attrAgentId,
      agentAliasName: 'prod',
      description: `Production alias for ${config.id} agent`,
    });

    // Alias depends on agent
    alias.addDependency(agent);

    this.aliases.set(config.id, alias);

    // ========================================================================
    // OUTPUTS (FOR LANGGRAPH WIRING)
    // ========================================================================
    new cdk.CfnOutput(this, `${config.id}-agent-id`, {
      value: agent.attrAgentId,
      description: `Agent ID for ${config.id}`,
      exportName: `${config.id}-agent-id`,
    });

    new cdk.CfnOutput(this, `${config.id}-alias-id`, {
      value: alias.attrAgentAliasId,
      description: `Alias ID for ${config.id}`,
      exportName: `${config.id}-alias-id`,
    });

    new cdk.CfnOutput(this, `${config.id}-agent-arn`, {
      value: agent.attrAgentArn,
      description: `Agent ARN for ${config.id}`,
      exportName: `${config.id}-agent-arn`,
    });
  }
}
