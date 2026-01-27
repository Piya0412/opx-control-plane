/**
 * Phase 6 Week 3: Bedrock Action Groups
 * 
 * Lambda functions backing Bedrock Agent action groups.
 * Week 3: Stub implementations (return mock data)
 * Week 4: Real implementations (read-only operations)
 * 
 * CRITICAL RULES:
 * 1. Read-only operations only
 * 2. Deterministic responses
 * 3. JSON schema enforced
 * 4. Timeouts < agent timeout
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BedrockActionGroupsProps {
  /**
   * Knowledge Base ID for knowledge retrieval action group (Phase 7.4)
   */
  knowledgeBaseId?: string;
}

export class BedrockActionGroups extends Construct {
  public readonly lambdas: Map<string, lambda.Function>;

  constructor(scope: Construct, id: string, props?: BedrockActionGroupsProps) {
    super(scope, id);

    this.lambdas = new Map();

    // ========================================================================
    // SIGNAL INTELLIGENCE ACTION GROUPS (3)
    // ========================================================================
    this.createActionGroupLambda(
      'query-metrics',
      'signal-intelligence',
      'Query CloudWatch metrics for anomaly detection'
    );

    this.createActionGroupLambda(
      'search-logs',
      'signal-intelligence',
      'Search CloudWatch Logs for error patterns'
    );

    this.createActionGroupLambda(
      'analyze-traces',
      'signal-intelligence',
      'Analyze X-Ray traces for latency issues'
    );

    // ========================================================================
    // HISTORICAL PATTERN ACTION GROUPS (2)
    // ========================================================================
    this.createActionGroupLambda(
      'search-incidents',
      'historical-pattern',
      'Search past incidents for similar patterns'
    );

    this.createActionGroupLambda(
      'get-resolution-summary',
      'historical-pattern',
      'Get resolution details for past incidents'
    );

    // ========================================================================
    // CHANGE INTELLIGENCE ACTION GROUPS (2)
    // ========================================================================
    this.createActionGroupLambda(
      'query-deployments',
      'change-intelligence',
      'Query deployment history for correlation'
    );

    this.createActionGroupLambda(
      'query-config-changes',
      'change-intelligence',
      'Query configuration changes for correlation'
    );

    // ========================================================================
    // RISK & BLAST RADIUS ACTION GROUPS (2)
    // ========================================================================
    this.createActionGroupLambda(
      'query-service-graph',
      'risk-blast-radius',
      'Query service dependency graph'
    );

    this.createActionGroupLambda(
      'query-traffic-metrics',
      'risk-blast-radius',
      'Query traffic metrics for impact estimation'
    );

    // ========================================================================
    // KNOWLEDGE RAG ACTION GROUP (1) - Phase 7.4
    // ========================================================================
    if (props?.knowledgeBaseId) {
      this.createKnowledgeRetrievalLambda(props.knowledgeBaseId);
    }
  }

  private createActionGroupLambda(
    actionName: string,
    agentId: string,
    description: string
  ): lambda.Function {
    // Create Lambda function
    const fn = new lambda.Function(this, `${agentId}-${actionName}`, {
      functionName: `opx-${agentId}-tool-${actionName}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import time
from datetime import datetime

def handler(event, context):
    """
    Action group stub for ${actionName}.
    
    Week 3: Returns mock data for agent testing.
    Week 4: Implement real read-only logic.
    
    Args:
        event: Bedrock Agent action group event
        context: Lambda context
    
    Returns:
        Action group response with mock data
    """
    print(f"Action group invoked: ${actionName}")
    print(f"Event: {json.dumps(event)}")
    
    # Extract parameters from event
    agent_id = event.get('agent', {}).get('id', 'unknown')
    action_group = event.get('actionGroup', 'unknown')
    api_path = event.get('apiPath', 'unknown')
    parameters = event.get('parameters', [])
    
    # Mock response based on action
    mock_data = generate_mock_data("${actionName}", parameters)
    
    # Return action group response
    response = {
        'messageVersion': '1.0',
        'response': {
            'actionGroup': action_group,
            'apiPath': api_path,
            'httpMethod': 'POST',
            'httpStatusCode': 200,
            'responseBody': {
                'application/json': {
                    'body': json.dumps(mock_data)
                }
            }
        }
    }
    
    print(f"Response: {json.dumps(response)}")
    return response

def generate_mock_data(action_name, parameters):
    """Generate mock data based on action name."""
    
    timestamp = datetime.utcnow().isoformat()
    
    # Action-specific mock data
    if action_name == 'query-metrics':
        return {
            'metrics': [
                {
                    'name': 'CPUUtilization',
                    'namespace': 'AWS/EC2',
                    'value': 85.5,
                    'unit': 'Percent',
                    'timestamp': timestamp,
                },
                {
                    'name': 'ErrorRate',
                    'namespace': 'Custom/Application',
                    'value': 12.3,
                    'unit': 'Count',
                    'timestamp': timestamp,
                }
            ],
            'source': 'STUB',
            'message': 'Mock metrics data - implement in Week 4'
        }
    
    elif action_name == 'search-logs':
        return {
            'logs': [
                {
                    'timestamp': timestamp,
                    'message': 'ERROR: Connection timeout to database',
                    'logGroup': '/aws/lambda/api-handler',
                    'logStream': 'mock-stream-1',
                }
            ],
            'source': 'STUB',
            'message': 'Mock log data - implement in Week 4'
        }
    
    elif action_name == 'analyze-traces':
        return {
            'traces': [
                {
                    'traceId': 'mock-trace-123',
                    'duration': 2500,
                    'segments': 5,
                    'errors': 1,
                }
            ],
            'source': 'STUB',
            'message': 'Mock trace data - implement in Week 4'
        }
    
    elif action_name == 'search-incidents':
        return {
            'incidents': [
                {
                    'incidentId': 'INC-2025-001',
                    'similarity': 0.85,
                    'service': 'api-gateway',
                    'resolution': 'Increased timeout configuration',
                }
            ],
            'source': 'STUB',
            'message': 'Mock incident data - implement in Week 4'
        }
    
    elif action_name == 'get-resolution-summary':
        return {
            'resolution': {
                'type': 'CONFIGURATION_CHANGE',
                'summary': 'Increased connection pool size',
                'timeToResolve': 45,
                'resolvedBy': 'oncall-engineer',
            },
            'source': 'STUB',
            'message': 'Mock resolution data - implement in Week 4'
        }
    
    elif action_name == 'query-deployments':
        return {
            'deployments': [
                {
                    'deploymentId': 'deploy-123',
                    'service': 'api-service',
                    'version': 'v2.3.1',
                    'timestamp': timestamp,
                    'timeDelta': 15,
                }
            ],
            'source': 'STUB',
            'message': 'Mock deployment data - implement in Week 4'
        }
    
    elif action_name == 'query-config-changes':
        return {
            'changes': [
                {
                    'changeId': 'config-456',
                    'configKey': 'database.timeout',
                    'oldValue': '30',
                    'newValue': '60',
                    'timestamp': timestamp,
                }
            ],
            'source': 'STUB',
            'message': 'Mock config data - implement in Week 4'
        }
    
    elif action_name == 'query-service-graph':
        return {
            'graph': {
                'nodes': ['api-gateway', 'api-service', 'database'],
                'edges': [
                    {'from': 'api-gateway', 'to': 'api-service'},
                    {'from': 'api-service', 'to': 'database'},
                ],
            },
            'source': 'STUB',
            'message': 'Mock service graph - implement in Week 4'
        }
    
    elif action_name == 'query-traffic-metrics':
        return {
            'traffic': {
                'requestsPerSecond': 1250,
                'errorRate': 0.05,
                'p99Latency': 450,
            },
            'source': 'STUB',
            'message': 'Mock traffic data - implement in Week 4'
        }
    
    else:
        return {
            'result': 'STUB_DATA',
            'source': 'STUB',
            'message': f'Action group stub for {action_name} - implement in Week 4'
        }
      `),
      description: description,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        ACTION_NAME: actionName,
        AGENT_ID: agentId,
      },
    });

    // Grant Bedrock permission to invoke Lambda
    fn.grantInvoke(new iam.ServicePrincipal('bedrock.amazonaws.com'));

    // Store in map
    this.lambdas.set(`${agentId}-${actionName}`, fn);

    // Output Lambda ARN
    new cdk.CfnOutput(this, `${agentId}-${actionName}-arn`, {
      value: fn.functionArn,
      description: `ARN of ${actionName} action group for ${agentId}`,
      exportName: `${agentId}-${actionName}-arn`,
    });

    return fn;
  }

  private createKnowledgeRetrievalLambda(knowledgeBaseId: string): lambda.Function {
    // Load Python code from file
    const codePath = join(__dirname, '../../../src/langgraph/action_groups/knowledge_retrieval.py');
    let code: string;
    
    try {
      code = readFileSync(codePath, 'utf-8');
    } catch (error) {
      console.warn('Warning: Could not load knowledge_retrieval.py, using inline stub');
      code = `
import json
import os

def lambda_handler(event, context):
    return {
        'messageVersion': '1.0',
        'response': {
            'actionGroup': event.get('actionGroup'),
            'apiPath': event.get('apiPath'),
            'httpMethod': 'POST',
            'httpStatusCode': 200,
            'responseBody': {
                'application/json': {
                    'body': json.dumps({'results': []})
                }
            }
        }
    }
      `;
    }

    // Create Lambda function
    const fn = new lambda.Function(this, 'knowledge-rag-retrieve-knowledge', {
      functionName: 'opx-knowledge-rag-tool-retrieve-knowledge',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromInline(code),
      description: 'Retrieve knowledge from Bedrock Knowledge Base',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseId,
        ACTION_NAME: 'retrieve-knowledge',
        AGENT_ID: 'knowledge-rag',
      },
    });

    // Grant Bedrock permission to invoke Lambda
    fn.grantInvoke(new iam.ServicePrincipal('bedrock.amazonaws.com'));

    // Grant Lambda permission to retrieve from Knowledge Base
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:Retrieve'],
      resources: [`arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/${knowledgeBaseId}`],
    }));

    // Explicitly deny ingestion permissions
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        'bedrock:CreateDataSource',
        'bedrock:UpdateDataSource',
        'bedrock:DeleteDataSource',
        'bedrock:StartIngestionJob',
      ],
      resources: ['*'],
    }));

    // Store in map
    this.lambdas.set('knowledge-rag-retrieve-knowledge', fn);

    // Output Lambda ARN
    new cdk.CfnOutput(this, 'knowledge-rag-retrieve-knowledge-arn', {
      value: fn.functionArn,
      description: 'ARN of retrieve-knowledge action group for knowledge-rag',
      exportName: 'knowledge-rag-retrieve-knowledge-arn',
    });

    return fn;
  }
}
