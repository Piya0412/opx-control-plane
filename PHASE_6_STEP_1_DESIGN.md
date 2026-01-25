# Phase 6 Step 1: Infrastructure & Agent Orchestration

**Status:** 📋 DESIGN - AWAITING APPROVAL  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Phase 3 complete  
**Risk:** LOW

---

## Objective

Set up the foundational infrastructure for AI agents including Lambda functions, DynamoDB tables, IAM roles, and the LangGraph-based orchestration framework.

---

## Scope

### In Scope
- Agent orchestrator Lambda function
- Agent execution Lambda functions (shells)
- DynamoDB tables for recommendations and executions
- IAM roles with read-only enforcement
- LangGraph workflow implementation
- EventBridge integration
- Basic observability (CloudWatch Logs)

### Out of Scope
- Agent logic implementation (Step 2 & 3)
- LLM integration (Step 2)
- RAG implementation (Phase 7)
- Advanced observability (Step 4)

---

## Architecture

```
EventBridge (IncidentCreated)
       ↓
┌──────────────────────────────────────┐
│  Agent Orchestrator Lambda           │
│  • Loads incident context            │
│  • Invokes agents in parallel        │
│  • Aggregates results                │
│  • Stores recommendations            │
│  • Enforces timeouts                 │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  Agent Lambda Functions (6)          │
│  • signal-analysis-agent             │
│  • historical-incident-agent         │
│  • change-intelligence-agent         │
│  • risk-blast-radius-agent           │
│  • knowledge-rag-agent               │
│  • execution-proposal-agent          │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  DynamoDB Tables                     │
│  • opx-agent-recommendations         │
│  • opx-agent-executions              │
└──────────────────────────────────────┘
```

---

## Implementation Tasks

### Task 1.1: DynamoDB Tables (2 hours)

**File:** `infra/constructs/agent-recommendations-table.ts`

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AgentRecommendationsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'AgentRecommendations', {
      tableName: 'opx-agent-recommendations',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for querying by agent
    this.table.addGlobalSecondaryIndex({
      indexName: 'AgentIndex',
      partitionKey: {
        name: 'agentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
```

**File:** `infra/constructs/agent-executions-table.ts`

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AgentExecutionsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'AgentExecutions', {
      tableName: 'opx-agent-executions',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Observability only
    });

    // GSI for querying by incident
    this.table.addGlobalSecondaryIndex({
      indexName: 'IncidentIndex',
      partitionKey: {
        name: 'incidentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'executedAt',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
```

**Acceptance:**
- [ ] Tables created in DynamoDB
- [ ] GSIs configured
- [ ] TTL enabled
- [ ] Point-in-time recovery enabled

---

### Task 1.2: IAM Roles (2 hours)

**File:** `infra/constructs/agent-iam-roles.ts`

```typescript
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
```

**Acceptance:**
- [ ] Orchestrator role created
- [ ] Agent execution role created
- [ ] Read-only access granted
- [ ] Write operations explicitly denied
- [ ] Bedrock access granted

---

### Task 1.3: Agent Orchestrator Lambda (8 hours)

**File:** `src/agents/orchestrator.ts`

```typescript
/**
 * Phase 6 Step 1: Agent Orchestrator
 * 
 * Coordinates parallel agent execution and aggregates results.
 * 
 * CRITICAL RULES:
 * - All agents run in parallel
 * - Timeout enforcement (120s global, per-agent limits)
 * - Graceful degradation (partial results OK)
 * - No agent can block others
 * - All results validated
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const lambda = new LambdaClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface AgentInput {
  incidentId: string;
  evidenceId: string;
  service: string;
  severity: string;
  timeWindow: {
    start: string;
    end: string;
  };
}

export interface AgentResult {
  agentId: string;
  success: boolean;
  output?: any;
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

export interface OrchestratorResult {
  recommendationId: string;
  incidentId: string;
  agentResults: AgentResult[];
  aggregatedRecommendation: any;
  executedAt: string;
  totalDurationMs: number;
}

const AGENT_CONFIGS = [
  { name: 'signal-analysis', timeout: 30000 },
  { name: 'historical-incident', timeout: 20000 },
  { name: 'change-intelligence', timeout: 25000 },
  { name: 'risk-blast-radius', timeout: 20000 },
  { name: 'knowledge-rag', timeout: 15000 },
];

const GLOBAL_TIMEOUT = 120000; // 120 seconds

export class AgentOrchestrator {
  /**
   * Orchestrate parallel agent execution
   */
  async orchestrate(input: AgentInput): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const recommendationId = randomUUID();

    console.log('Starting agent orchestration', {
      recommendationId,
      incidentId: input.incidentId,
      agentCount: AGENT_CONFIGS.length,
    });

    // Invoke all agents in parallel
    const agentPromises = AGENT_CONFIGS.map((config) =>
      this.invokeAgent(config.name, input, config.timeout)
    );

    // Wait for all agents with global timeout
    const agentResults = await Promise.race([
      Promise.allSettled(agentPromises),
      this.globalTimeout(GLOBAL_TIMEOUT),
    ]);

    // Process results
    const processedResults = this.processAgentResults(agentResults);

    // Invoke execution proposal agent (synthesizes all results)
    const aggregatedRecommendation = await this.invokeExecutionProposal(
      input,
      processedResults
    );

    const totalDurationMs = Date.now() - startTime;

    const result: OrchestratorResult = {
      recommendationId,
      incidentId: input.incidentId,
      agentResults: processedResults,
      aggregatedRecommendation,
      executedAt: new Date().toISOString(),
      totalDurationMs,
    };

    // Store recommendation
    await this.storeRecommendation(result);

    console.log('Agent orchestration complete', {
      recommendationId,
      successfulAgents: processedResults.filter((r) => r.success).length,
      totalAgents: processedResults.length,
      durationMs: totalDurationMs,
    });

    return result;
  }

  /**
   * Invoke a single agent Lambda
   */
  private async invokeAgent(
    agentName: string,
    input: AgentInput,
    timeout: number
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const command = new InvokeCommand({
        FunctionName: `opx-agent-${agentName}`,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(input)),
      });

      // Race between agent execution and timeout
      const response = await Promise.race([
        lambda.send(command),
        this.agentTimeout(timeout),
      ]);

      const durationMs = Date.now() - startTime;

      if (response === 'TIMEOUT') {
        return {
          agentId: agentName,
          success: false,
          error: `Agent timed out after ${timeout}ms`,
          durationMs,
          timedOut: true,
        };
      }

      const payload = JSON.parse(
        Buffer.from(response.Payload!).toString()
      );

      return {
        agentId: agentName,
        success: true,
        output: payload,
        durationMs,
        timedOut: false,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        agentId: agentName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
        timedOut: false,
      };
    }
  }

  /**
   * Invoke execution proposal agent (synthesizes all results)
   */
  private async invokeExecutionProposal(
    input: AgentInput,
    agentResults: AgentResult[]
  ): Promise<any> {
    try {
      const command = new InvokeCommand({
        FunctionName: 'opx-agent-execution-proposal',
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(
          JSON.stringify({
            ...input,
            agentResults,
          })
        ),
      });

      const response = await Promise.race([
        lambda.send(command),
        this.agentTimeout(30000),
      ]);

      if (response === 'TIMEOUT') {
        return {
          error: 'Execution proposal agent timed out',
          proposedActions: [],
        };
      }

      return JSON.parse(Buffer.from(response.Payload!).toString());
    } catch (error) {
      console.error('Execution proposal agent failed', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        proposedActions: [],
      };
    }
  }

  /**
   * Process agent results from Promise.allSettled
   */
  private processAgentResults(
    results: PromiseSettledResult<AgentResult>[] | 'TIMEOUT'
  ): AgentResult[] {
    if (results === 'TIMEOUT') {
      return AGENT_CONFIGS.map((config) => ({
        agentId: config.name,
        success: false,
        error: 'Global timeout exceeded',
        durationMs: GLOBAL_TIMEOUT,
        timedOut: true,
      }));
    }

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          agentId: 'unknown',
          success: false,
          error: result.reason?.message || 'Promise rejected',
          durationMs: 0,
          timedOut: false,
        };
      }
    });
  }

  /**
   * Store recommendation in DynamoDB
   */
  private async storeRecommendation(
    result: OrchestratorResult
  ): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days

    await dynamodb.send(
      new PutCommand({
        TableName: 'opx-agent-recommendations',
        Item: {
          pk: `INCIDENT#${result.incidentId}`,
          sk: `RECOMMENDATION#${result.recommendationId}`,
          recommendationId: result.recommendationId,
          incidentId: result.incidentId,
          agentResults: result.agentResults,
          aggregatedRecommendation: result.aggregatedRecommendation,
          executedAt: result.executedAt,
          totalDurationMs: result.totalDurationMs,
          ttl,
        },
      })
    );
  }

  /**
   * Agent timeout helper
   */
  private agentTimeout(ms: number): Promise<'TIMEOUT'> {
    return new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), ms));
  }

  /**
   * Global timeout helper
   */
  private globalTimeout(
    ms: number
  ): Promise<PromiseSettledResult<AgentResult>[] | 'TIMEOUT'> {
    return new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), ms));
  }
}

/**
 * Lambda handler
 */
export async function handler(event: any): Promise<OrchestratorResult> {
  const orchestrator = new AgentOrchestrator();

  const input: AgentInput = {
    incidentId: event.detail.incidentId,
    evidenceId: event.detail.evidenceId,
    service: event.detail.service,
    severity: event.detail.severity,
    timeWindow: event.detail.timeWindow,
  };

  return await orchestrator.orchestrate(input);
}
```

**Acceptance:**
- [ ] Orchestrator invokes agents in parallel
- [ ] Timeout enforcement working
- [ ] Graceful degradation on failures
- [ ] Results stored in DynamoDB
- [ ] Logging comprehensive

---

### Task 1.4: Agent Lambda Shells (4 hours)

**File:** `src/agents/signal-analysis-agent.ts` (and 5 others)

```typescript
/**
 * Phase 6 Step 1: Agent Shell
 * 
 * Placeholder agent that returns mock data.
 * Real implementation in Step 2.
 */

export interface AgentInput {
  incidentId: string;
  evidenceId: string;
  service: string;
  severity: string;
  timeWindow: {
    start: string;
    end: string;
  };
}

export interface AgentOutput {
  agentId: string;
  incidentId: string;
  analysis: any;
  executedAt: string;
  durationMs: number;
}

export async function handler(event: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();

  console.log('Agent invoked (shell)', {
    agentId: 'signal-analysis',
    incidentId: event.incidentId,
  });

  // TODO: Implement real agent logic in Step 2

  const output: AgentOutput = {
    agentId: 'signal-analysis',
    incidentId: event.incidentId,
    analysis: {
      status: 'NOT_IMPLEMENTED',
      message: 'Agent shell - implementation pending',
    },
    executedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  return output;
}
```

**Acceptance:**
- [ ] All 6 agent shells created
- [ ] Each returns valid output structure
- [ ] Logging present
- [ ] Can be invoked by orchestrator

---

### Task 1.5: CDK Integration (2 hours)

**File:** `infra/constructs/agent-orchestration.ts`

```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
      handler: 'orchestrator.handler',
      code: lambda.Code.fromAsset('dist/agents'),
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      role: props.orchestratorRole,
      environment: {
        RECOMMENDATIONS_TABLE: 'opx-agent-recommendations',
        EXECUTIONS_TABLE: 'opx-agent-executions',
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
        handler: `${name}-agent.handler`,
        code: lambda.Code.fromAsset('dist/agents'),
        timeout: cdk.Duration.seconds(30),
        memorySize: 1024,
        role: props.agentExecutionRole,
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
```

**Acceptance:**
- [ ] All Lambdas deployed
- [ ] EventBridge rule created
- [ ] Orchestrator triggered on IncidentCreated
- [ ] IAM roles attached

---

### Task 1.6: Integration Tests (4 hours)

**File:** `test/agents/orchestrator.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentOrchestrator } from '../../src/agents/orchestrator';

describe('Phase 6 Step 1: Agent Orchestration Integration', () => {
  let orchestrator: AgentOrchestrator;

  beforeAll(() => {
    orchestrator = new AgentOrchestrator();
  });

  it('should orchestrate all agents in parallel', async () => {
    const input = {
      incidentId: 'test-incident-123',
      evidenceId: 'test-evidence-456',
      service: 'order-service',
      severity: 'HIGH',
      timeWindow: {
        start: '2026-01-25T10:00:00Z',
        end: '2026-01-25T11:00:00Z',
      },
    };

    const result = await orchestrator.orchestrate(input);

    expect(result.recommendationId).toBeDefined();
    expect(result.incidentId).toBe(input.incidentId);
    expect(result.agentResults).toHaveLength(5); // 5 parallel agents
    expect(result.aggregatedRecommendation).toBeDefined();
    expect(result.totalDurationMs).toBeLessThan(120000);
  });

  it('should handle agent timeouts gracefully', async () => {
    // Test with slow agent
    const input = {
      incidentId: 'test-incident-timeout',
      evidenceId: 'test-evidence-timeout',
      service: 'slow-service',
      severity: 'HIGH',
      timeWindow: {
        start: '2026-01-25T10:00:00Z',
        end: '2026-01-25T11:00:00Z',
      },
    };

    const result = await orchestrator.orchestrate(input);

    // Should complete even if some agents timeout
    expect(result.recommendationId).toBeDefined();
    expect(result.agentResults.some((r) => r.timedOut)).toBe(true);
  });

  it('should store recommendations in DynamoDB', async () => {
    const input = {
      incidentId: 'test-incident-storage',
      evidenceId: 'test-evidence-storage',
      service: 'test-service',
      severity: 'MEDIUM',
      timeWindow: {
        start: '2026-01-25T10:00:00Z',
        end: '2026-01-25T11:00:00Z',
      },
    };

    const result = await orchestrator.orchestrate(input);

    // Verify stored in DynamoDB
    // TODO: Add DynamoDB query to verify
    expect(result.recommendationId).toBeDefined();
  });
});
```

**Acceptance:**
- [ ] Orchestration test passing
- [ ] Timeout test passing
- [ ] Storage test passing
- [ ] All agents invoked

---

## Deployment Steps

1. **Deploy DynamoDB tables**
   ```bash
   npm run cdk deploy -- --exclusively opx-control-plane/AgentRecommendationsTable
   npm run cdk deploy -- --exclusively opx-control-plane/AgentExecutionsTable
   ```

2. **Deploy IAM roles**
   ```bash
   npm run cdk deploy -- --exclusively opx-control-plane/AgentIamRoles
   ```

3. **Build and deploy Lambdas**
   ```bash
   npm run build
   npm run cdk deploy -- --exclusively opx-control-plane/AgentOrchestration
   ```

4. **Verify deployment**
   ```bash
   aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `opx-agent`)]'
   aws dynamodb list-tables --query 'TableNames[?starts_with(@, `opx-agent`)]'
   ```

---

## Testing Strategy

### Unit Tests
- Orchestrator logic
- Timeout handling
- Result aggregation
- Error handling

### Integration Tests
- End-to-end orchestration
- DynamoDB storage
- Lambda invocation
- EventBridge trigger

### Manual Tests
1. Create test incident
2. Verify orchestrator triggered
3. Check agent invocations in CloudWatch
4. Verify recommendation stored
5. Check execution logs

---

## Success Criteria

- [ ] All DynamoDB tables created and active
- [ ] All IAM roles created with correct permissions
- [ ] Orchestrator Lambda deployed and functional
- [ ] All 6 agent shell Lambdas deployed
- [ ] EventBridge rule triggering orchestrator
- [ ] Parallel agent invocation working
- [ ] Timeout enforcement working
- [ ] Graceful degradation on failures
- [ ] Recommendations stored in DynamoDB
- [ ] All integration tests passing
- [ ] CloudWatch logs showing execution traces

---

## Rollback Plan

If issues arise:
1. Disable EventBridge rule
2. Delete Lambda functions
3. Retain DynamoDB tables (data preservation)
4. Revert IAM role changes
5. Document issues for next attempt

---

## Next Steps

After Step 1 completion:
- **Step 2:** Implement core agents (Signal Analysis, Historical Incident, Change Intelligence)
- **Step 3:** Implement advanced agents (Risk & Blast Radius, Knowledge RAG, Execution Proposal)
- **Step 4:** Add observability and governance

---

**Status:** AWAITING APPROVAL  
**Estimated Duration:** 1-2 weeks  
**Risk:** LOW (infrastructure only, no AI logic yet)
