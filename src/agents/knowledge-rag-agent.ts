/**
 * Phase 6 Step 1: Knowledge RAG Agent Shell
 * 
 * Placeholder agent that returns mock data.
 * Real implementation in Step 3.
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
    agentId: 'knowledge-rag',
    incidentId: event.incidentId,
  });

  // TODO: Implement real agent logic in Step 3

  const output: AgentOutput = {
    agentId: 'knowledge-rag',
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
