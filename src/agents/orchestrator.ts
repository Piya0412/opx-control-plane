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
import { ObservabilityAdapter, BudgetStatus } from './observability-adapter.js';
import { AgentGuardrails } from './guardrails.js';

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
  budgetStatus: BudgetStatus;
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
    const timestamp = new Date().toISOString();
    const recommendationId = randomUUID();

    console.log('Starting agent orchestration', {
      recommendationId,
      incidentId: input.incidentId,
      agentCount: AGENT_CONFIGS.length,
    });

    // CORRECTION 2: Check budget status (returns signal, does not throw)
    const estimatedCost = 0.50; // Estimate based on 6 agents
    const budgetStatus: BudgetStatus = await ObservabilityAdapter.checkBudgetStatus(
      input.incidentId,
      estimatedCost
    );

    if (!budgetStatus.allowed) {
      console.warn('Budget limit would be exceeded', {
        incidentId: input.incidentId,
        reason: budgetStatus.reason,
        currentIncidentCost: budgetStatus.currentIncidentCost,
        currentMonthlyCost: budgetStatus.currentMonthlyCost,
      });

      // Return result with budget signal (Phase 5 decides what to do)
      return {
        recommendationId,
        incidentId: input.incidentId,
        agentResults: [],
        aggregatedRecommendation: {
          error: 'Budget limit exceeded',
          proposedActions: [],
        },
        budgetStatus,
        executedAt: timestamp,
        totalDurationMs: Date.now() - startTime,
      };
    }

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

    // Calculate actual cost
    const actualCost = processedResults.reduce((sum, r) => sum + (r.output?.cost || 0), 0);

    // Record cost via adapter
    await ObservabilityAdapter.recordCost(input.incidentId, 'orchestrator', actualCost);

    // Publish orchestration metrics
    await ObservabilityAdapter.publishMetrics({
      agentId: 'orchestrator',
      incidentId: input.incidentId,
      durationMs: totalDurationMs,
      success: processedResults.filter((r) => !r.success).length === 0,
      timedOut: false,
      cost: actualCost,
      timestamp,
    });

    // Publish recommendation metrics
    const actionCount = processedResults.reduce(
      (sum, r) => sum + (r.output?.proposedActions?.length || 0),
      0
    );

    await ObservabilityAdapter.publishRecommendationMetrics({
      incidentId: input.incidentId,
      recommendationId,
      actionCount,
      totalCost: actualCost,
      totalDurationMs,
    });

    const result: OrchestratorResult = {
      recommendationId,
      incidentId: input.incidentId,
      agentResults: processedResults,
      aggregatedRecommendation,
      budgetStatus,
      executedAt: timestamp,
      totalDurationMs,
    };

    // Store recommendation
    await this.storeRecommendation(result);

    console.log('Agent orchestration complete', {
      recommendationId,
      successfulAgents: processedResults.filter((r) => r.success).length,
      totalAgents: processedResults.length,
      durationMs: totalDurationMs,
      cost: actualCost,
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
    const timestamp = new Date().toISOString();
    let success = false;
    let timedOut = false;
    let cost = 0;
    let error: string | undefined;

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
        timedOut = true;
        error = `Agent timed out after ${timeout}ms`;
        
        return {
          agentId: agentName,
          success: false,
          error,
          durationMs,
          timedOut: true,
        };
      }

      const payload = JSON.parse(
        Buffer.from(response.Payload!).toString()
      );

      // Validate guardrails
      const violations = AgentGuardrails.validateOutput(agentName, payload);

      if (violations.some((v: { severity: string }) => v.severity === 'ERROR')) {
        await AgentGuardrails.logViolations(agentName, input.incidentId, violations);
        error = 'Guardrail violations detected';
        
        return {
          agentId: agentName,
          success: false,
          error,
          durationMs,
          timedOut: false,
        };
      }

      if (violations.length > 0) {
        await AgentGuardrails.logViolations(agentName, input.incidentId, violations);
      }

      success = true;
      cost = payload.cost || 0;

      return {
        agentId: agentName,
        success: true,
        output: payload,
        durationMs,
        timedOut: false,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      error = err instanceof Error ? err.message : 'Unknown error';
      
      return {
        agentId: agentName,
        success: false,
        error,
        durationMs,
        timedOut: false,
      };
    } finally {
      // Publish agent metrics via adapter
      await ObservabilityAdapter.publishMetrics({
        agentId: agentName,
        incidentId: input.incidentId,
        durationMs: Date.now() - startTime,
        success,
        timedOut,
        cost,
        timestamp,
      });
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
