# Phase 6 Step 3: Advanced Agent Implementation

**Status:** 📋 DESIGN - AWAITING APPROVAL  
**Estimated Effort:** 2-3 weeks  
**Dependencies:** Phase 6 Step 2 complete  
**Risk:** MEDIUM-HIGH (complex analysis, RAG integration)

---

## Objective

Implement the three advanced agents that provide sophisticated incident intelligence:
1. Risk & Blast Radius Agent
2. Knowledge (RAG) Agent
3. Execution Proposal Agent

---

## Scope

### In Scope
- Risk assessment and blast radius calculation
- Service dependency graph analysis
- RAG-based knowledge retrieval
- Document vector search
- Action synthesis and prioritization
- Execution plan generation
- Integration with core agents (Step 2)

### Out of Scope
- Service dependency graph creation (assumes exists)
- Document ingestion pipeline (Phase 7)
- Action execution (Phase 5)
- Human approval workflow (Phase 5)
- Advanced observability (Step 4)

---

## Agent 4: Risk & Blast Radius Agent

### Purpose
Estimate incident impact and predict propagation paths through service dependencies.

### Implementation

**File:** `src/agents/risk-blast-radius-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetItemCommand } from '@aws-sdk/lib-dynamodb';

const bedrock = new BedrockRuntimeClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface RiskBlastRadiusInput {
  incidentId: string;
  service: string;
  severity: string;
  evidenceId: string;
}

export interface RiskBlastRadiusOutput {
  agentId: 'risk-blast-radius';
  incidentId: string;
  blastRadius: {
    scope: 'SINGLE_SERVICE' | 'MULTI_SERVICE' | 'INFRASTRUCTURE';
    affectedServices: string[];
    estimatedUsers: number;
    estimatedRequests: number;
    propagationPaths: Array<{
      from: string;
      to: string;
      probability: number;
      latency: number; // minutes
    }>;
  };
  riskAssessment: {
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    businessImpact: string;
    technicalImpact: string;
  };
  mitigationPriority: Array<{
    action: string;
    priority: number;
    expectedImpact: string;
  }>;
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class RiskBlastRadiusAgent {
  async analyze(input: RiskBlastRadiusInput): Promise<RiskBlastRadiusOutput> {
    const startTime = Date.now();

    // 1. Fetch service dependency graph
    const dependencyGraph = await this.fetchDependencyGraph(input.service);

    // 2. Fetch service metrics (traffic, error rates)
    const serviceMetrics = await this.fetchServiceMetrics(input.service);

    // 3. Build prompt for LLM
    const prompt = this.buildPrompt(input, dependencyGraph, serviceMetrics);

    // 4. Invoke LLM for risk analysis
    const llmResponse = await this.invokeLLM(prompt);

    // 5. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 6. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'risk-blast-radius',
      incidentId: input.incidentId,
      blastRadius: analysis.blastRadius,
      riskAssessment: analysis.riskAssessment,
      mitigationPriority: analysis.mitigationPriority,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private async fetchDependencyGraph(service: string): Promise<any> {
    // Fetch service dependency graph from DynamoDB
    // NOTE: Assumes a service-graph table exists
    try {
      const command = new GetItemCommand({
        TableName: 'opx-service-graph',
        Key: {
          service,
        },
      });

      const response = await dynamodb.send(command);
      return response.Item || {
        service,
        dependencies: [],
        dependents: [],
      };
    } catch (error) {
      console.warn('Failed to fetch dependency graph', error);
      return {
        service,
        dependencies: [],
        dependents: [],
      };
    }
  }

  private async fetchServiceMetrics(service: string): Promise<any> {
    // Fetch service traffic and error metrics
    // For now, return mock data
    return {
      requestsPerMinute: 1000,
      errorRate: 0.05,
      activeUsers: 5000,
      p99Latency: 250,
    };
  }

  private buildPrompt(
    input: RiskBlastRadiusInput,
    dependencyGraph: any,
    serviceMetrics: any
  ): string {
    return `You are an expert SRE analyzing incident blast radius and risk.

**Incident:**
- Service: ${input.service}
- Severity: ${input.severity}

**Service Dependency Graph:**
${JSON.stringify(dependencyGraph, null, 2)}

**Service Metrics:**
- Requests/min: ${serviceMetrics.requestsPerMinute}
- Error Rate: ${(serviceMetrics.errorRate * 100).toFixed(2)}%
- Active Users: ${serviceMetrics.activeUsers}
- P99 Latency: ${serviceMetrics.p99Latency}ms

**Your Task:**
Analyze the incident to determine:
1. Blast radius scope (SINGLE_SERVICE, MULTI_SERVICE, INFRASTRUCTURE)
2. Affected services (based on dependency graph)
3. Estimated user impact
4. Propagation paths (how failure spreads)
5. Risk assessment (severity, urgency, impact)
6. Mitigation priorities

**Output Format (JSON):**
{
  "blastRadius": {
    "scope": "SINGLE_SERVICE" | "MULTI_SERVICE" | "INFRASTRUCTURE",
    "affectedServices": ["service1", "service2"],
    "estimatedUsers": number,
    "estimatedRequests": number,
    "propagationPaths": [
      {
        "from": "service1",
        "to": "service2",
        "probability": number,
        "latency": number
      }
    ]
  },
  "riskAssessment": {
    "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "businessImpact": "string",
    "technicalImpact": "string"
  },
  "mitigationPriority": [
    {
      "action": "string",
      "priority": number,
      "expectedImpact": "string"
    }
  ]
}

Provide ONLY the JSON output, no additional text.`;
  }

  private async invokeLLM(prompt: string): Promise<any> {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString());

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    return {
      blastRadius: llmResponse.blastRadius || {
        scope: 'SINGLE_SERVICE',
        affectedServices: [],
        estimatedUsers: 0,
        estimatedRequests: 0,
        propagationPaths: [],
      },
      riskAssessment: llmResponse.riskAssessment || {
        severity: 'MEDIUM',
        urgency: 'MEDIUM',
        businessImpact: 'Unknown',
        technicalImpact: 'Unknown',
      },
      mitigationPriority: Array.isArray(llmResponse.mitigationPriority)
        ? llmResponse.mitigationPriority
        : [],
    };
  }

  private calculateCost(llmResponse: any): number {
    const inputTokens = llmResponse.usage?.input_tokens || 1000;
    const outputTokens = llmResponse.usage?.output_tokens || 700;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }
}

export async function handler(
  event: RiskBlastRadiusInput
): Promise<RiskBlastRadiusOutput> {
  const agent = new RiskBlastRadiusAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Fetches service dependency graph
- [ ] Fetches service metrics
- [ ] Calculates blast radius
- [ ] Estimates user impact
- [ ] Identifies propagation paths
- [ ] Returns structured output

---

## Agent 5: Knowledge (RAG) Agent

### Purpose
Search runbooks, postmortems, and documentation using vector similarity.

### Implementation

**File:** `src/agents/knowledge-rag-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const bedrock = new BedrockRuntimeClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface KnowledgeRAGInput {
  incidentId: string;
  service: string;
  classification: string;
  errorPatterns: string[];
  searchQuery: string;
}

export interface KnowledgeRAGOutput {
  agentId: 'knowledge-rag';
  incidentId: string;
  relevantDocuments: Array<{
    documentId: string;
    type: 'RUNBOOK' | 'POSTMORTEM' | 'ARCHITECTURE' | 'PLAYBOOK';
    title: string;
    relevanceScore: number;
    excerpt: string;
    url: string;
    lastUpdated: string;
    citations: Array<{
      section: string;
      content: string;
      relevance: number;
    }>;
  }>;
  suggestedRunbooks: string[];
  relatedPostmortems: string[];
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class KnowledgeRAGAgent {
  async analyze(input: KnowledgeRAGInput): Promise<KnowledgeRAGOutput> {
    const startTime = Date.now();

    // 1. Generate embedding for search query
    const queryEmbedding = await this.generateEmbedding(input.searchQuery);

    // 2. Vector search for similar documents
    const similarDocuments = await this.vectorSearch(
      queryEmbedding,
      input.service
    );

    // 3. Build prompt for LLM (with retrieved documents)
    const prompt = this.buildPrompt(input, similarDocuments);

    // 4. Invoke LLM for relevance ranking and citation extraction
    const llmResponse = await this.invokeLLM(prompt);

    // 5. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 6. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'knowledge-rag',
      incidentId: input.incidentId,
      relevantDocuments: analysis.relevantDocuments,
      suggestedRunbooks: analysis.suggestedRunbooks,
      relatedPostmortems: analysis.relatedPostmortems,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Generate embedding using Bedrock Titan Embeddings
    const command = new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString());

    return responseBody.embedding;
  }

  private async vectorSearch(
    embedding: number[],
    service: string
  ): Promise<any[]> {
    // Vector search in document store
    // NOTE: This assumes a vector-enabled document store
    // For now, return mock documents

    // TODO: Implement real vector search (OpenSearch, FAISS, Pinecone)
    return [
      {
        documentId: 'runbook-001',
        type: 'RUNBOOK',
        title: `${service} Incident Response Runbook`,
        content: 'Steps to diagnose and resolve common issues...',
        url: `https://docs.example.com/runbooks/${service}`,
        lastUpdated: '2026-01-15',
        similarity: 0.85,
      },
      {
        documentId: 'postmortem-042',
        type: 'POSTMORTEM',
        title: `${service} Outage - December 2025`,
        content: 'Root cause: Database connection pool exhaustion...',
        url: `https://docs.example.com/postmortems/042`,
        lastUpdated: '2025-12-20',
        similarity: 0.78,
      },
    ];
  }

  private buildPrompt(
    input: KnowledgeRAGInput,
    documents: any[]
  ): string {
    return `You are an expert SRE analyzing incident documentation.

**Incident:**
- Service: ${input.service}
- Classification: ${input.classification}
- Error Patterns: ${input.errorPatterns.join(', ')}
- Search Query: ${input.searchQuery}

**Retrieved Documents (${documents.length} total):**
${documents
  .map(
    (doc, idx) => `
${idx + 1}. ${doc.type}: ${doc.title}
   - Similarity: ${(doc.similarity * 100).toFixed(1)}%
   - Last Updated: ${doc.lastUpdated}
   - URL: ${doc.url}
   - Content: ${doc.content.substring(0, 500)}...
`
  )
  .join('\n')}

**Your Task:**
Analyze the documents to:
1. Rank by relevance to the current incident (0.0 to 1.0)
2. Extract relevant citations (specific sections)
3. Suggest applicable runbooks
4. Identify related postmortems

**Output Format (JSON):**
{
  "relevantDocuments": [
    {
      "documentId": "string",
      "type": "RUNBOOK" | "POSTMORTEM" | "ARCHITECTURE" | "PLAYBOOK",
      "title": "string",
      "relevanceScore": number,
      "excerpt": "string",
      "url": "string",
      "lastUpdated": "string",
      "citations": [
        {
          "section": "string",
          "content": "string",
          "relevance": number
        }
      ]
    }
  ],
  "suggestedRunbooks": ["runbook1", "runbook2"],
  "relatedPostmortems": ["postmortem1", "postmortem2"]
}

Provide ONLY the JSON output, no additional text.`;
  }

  private async invokeLLM(prompt: string): Promise<any> {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString());

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    return {
      relevantDocuments: Array.isArray(llmResponse.relevantDocuments)
        ? llmResponse.relevantDocuments.filter(
            (doc: any) => doc.relevanceScore >= 0.6
          )
        : [],
      suggestedRunbooks: Array.isArray(llmResponse.suggestedRunbooks)
        ? llmResponse.suggestedRunbooks
        : [],
      relatedPostmortems: Array.isArray(llmResponse.relatedPostmortems)
        ? llmResponse.relatedPostmortems
        : [],
    };
  }

  private calculateCost(llmResponse: any): number {
    const inputTokens = llmResponse.usage?.input_tokens || 2000;
    const outputTokens = llmResponse.usage?.output_tokens || 1000;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    // Add embedding cost (Titan Embeddings: ~$0.0001 per 1K tokens)
    const embeddingCost = 0.0001;

    return inputCost + outputCost + embeddingCost;
  }
}

export async function handler(
  event: KnowledgeRAGInput
): Promise<KnowledgeRAGOutput> {
  const agent = new KnowledgeRAGAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Generates embeddings for search query
- [ ] Performs vector search
- [ ] Ranks documents by relevance
- [ ] Extracts citations
- [ ] Filters by minimum relevance (0.6)
- [ ] Returns structured output

---

## Agent 6: Execution Proposal Agent

### Purpose
Synthesize all agent outputs into prioritized action recommendations.

### Implementation

**File:** `src/agents/execution-proposal-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({});

export interface ExecutionProposalInput {
  incidentId: string;
  service: string;
  severity: string;
  agentResults: Array<{
    agentId: string;
    success: boolean;
    output?: any;
  }>;
}

export interface ExecutionProposalOutput {
  agentId: 'execution-proposal';
  incidentId: string;
  proposedActions: Array<{
    actionId: string;
    type: 'ROLLBACK' | 'SCALE' | 'RESTART' | 'CONFIG_CHANGE' | 'MANUAL';
    priority: number; // 1-10
    description: string;
    targetService: string;
    estimatedImpact: {
      successProbability: number;
      timeToEffect: number; // minutes
      risk: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    prerequisites: string[];
    rollbackPlan: string;
    approvalRequired: boolean;
  }>;
  executionPlan: {
    steps: Array<{
      stepNumber: number;
      action: string;
      parallelizable: boolean;
      dependencies: number[];
    }>;
    estimatedDuration: number; // minutes
    criticalPath: number[];
  };
  reasoning: string;
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class ExecutionProposalAgent {
  async analyze(
    input: ExecutionProposalInput
  ): Promise<ExecutionProposalOutput> {
    const startTime = Date.now();

    // 1. Extract successful agent results
    const successfulResults = input.agentResults.filter((r) => r.success);

    // 2. Build comprehensive prompt with all agent outputs
    const prompt = this.buildPrompt(input, successfulResults);

    // 3. Invoke LLM for action synthesis
    const llmResponse = await this.invokeLLM(prompt);

    // 4. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 5. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'execution-proposal',
      incidentId: input.incidentId,
      proposedActions: analysis.proposedActions,
      executionPlan: analysis.executionPlan,
      reasoning: analysis.reasoning,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private buildPrompt(
    input: ExecutionProposalInput,
    agentResults: any[]
  ): string {
    return `You are an expert SRE synthesizing incident response recommendations.

**Incident:**
- Service: ${input.service}
- Severity: ${input.severity}

**Agent Analysis Results:**
${agentResults
  .map(
    (result) => `
### ${result.agentId}
${JSON.stringify(result.output, null, 2)}
`
  )
  .join('\n')}

**Your Task:**
Synthesize all agent outputs to create:
1. Prioritized action recommendations (1-10 priority)
2. Estimated impact for each action
3. Prerequisites and dependencies
4. Rollback plans
5. Execution plan with critical path

**Critical Rules:**
- All actions require human approval
- Conservative risk estimates (fail-safe)
- Idempotent actions preferred
- Rollback plan mandatory
- No multi-step autonomous execution

**Output Format (JSON):**
{
  "proposedActions": [
    {
      "actionId": "string",
      "type": "ROLLBACK" | "SCALE" | "RESTART" | "CONFIG_CHANGE" | "MANUAL",
      "priority": number,
      "description": "string",
      "targetService": "string",
      "estimatedImpact": {
        "successProbability": number,
        "timeToEffect": number,
        "risk": "LOW" | "MEDIUM" | "HIGH"
      },
      "prerequisites": ["string"],
      "rollbackPlan": "string",
      "approvalRequired": true
    }
  ],
  "executionPlan": {
    "steps": [
      {
        "stepNumber": number,
        "action": "string",
        "parallelizable": boolean,
        "dependencies": [number]
      }
    ],
    "estimatedDuration": number,
    "criticalPath": [number]
  },
  "reasoning": "string"
}

Provide ONLY the JSON output, no additional text.`;
  }

  private async invokeLLM(prompt: string): Promise<any> {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString());

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    // Enforce approval requirement on all actions
    const proposedActions = Array.isArray(llmResponse.proposedActions)
      ? llmResponse.proposedActions.map((action: any) => ({
          ...action,
          approvalRequired: true, // ALWAYS true
        }))
      : [];

    return {
      proposedActions,
      executionPlan: llmResponse.executionPlan || {
        steps: [],
        estimatedDuration: 0,
        criticalPath: [],
      },
      reasoning: llmResponse.reasoning || 'No reasoning provided',
    };
  }

  private calculateCost(llmResponse: any): number {
    const inputTokens = llmResponse.usage?.input_tokens || 2500;
    const outputTokens = llmResponse.usage?.output_tokens || 1200;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }
}

export async function handler(
  event: ExecutionProposalInput
): Promise<ExecutionProposalOutput> {
  const agent = new ExecutionProposalAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Synthesizes all agent outputs
- [ ] Prioritizes actions (1-10)
- [ ] Estimates impact and risk
- [ ] Generates execution plan
- [ ] Enforces approval requirement
- [ ] Returns structured output

---

## Integration with Orchestrator

### Update Orchestrator (from Step 1)

**File:** `src/agents/orchestrator.ts` (update)

```typescript
// Add execution proposal agent to AGENT_CONFIGS
const AGENT_CONFIGS = [
  { name: 'signal-analysis', timeout: 30000 },
  { name: 'historical-incident', timeout: 20000 },
  { name: 'change-intelligence', timeout: 25000 },
  { name: 'risk-blast-radius', timeout: 20000 },
  { name: 'knowledge-rag', timeout: 15000 },
  // execution-proposal runs AFTER others, not in parallel
];

// Update orchestrate method to invoke execution-proposal last
async orchestrate(input: AgentInput): Promise<OrchestratorResult> {
  // ... existing code ...

  // Invoke first 5 agents in parallel
  const agentPromises = AGENT_CONFIGS.map((config) =>
    this.invokeAgent(config.name, input, config.timeout)
  );

  const agentResults = await Promise.race([
    Promise.allSettled(agentPromises),
    this.globalTimeout(GLOBAL_TIMEOUT),
  ]);

  const processedResults = this.processAgentResults(agentResults);

  // Invoke execution proposal agent (synthesizes all results)
  const aggregatedRecommendation = await this.invokeExecutionProposal(
    input,
    processedResults
  );

  // ... rest of code ...
}
```

---

## Testing Strategy

### Unit Tests
- Dependency graph parsing
- Vector search logic
- Action prioritization
- Execution plan generation
- Output validation

### Integration Tests
- End-to-end agent execution
- Bedrock integration
- DynamoDB access
- Vector search (mocked)
- Result synthesis

### Manual Tests
1. Create test incident
2. Invoke each agent manually
3. Verify output structure
4. Check action priorities
5. Validate execution plan

---

## Success Criteria

- [ ] All 3 advanced agents implemented
- [ ] Risk assessment accurate
- [ ] Vector search working (or mocked)
- [ ] Action synthesis logical
- [ ] Execution plans valid
- [ ] All tests passing
- [ ] Cost per incident < $0.50 (total)

---

## Rollback Plan

If issues arise:
1. Disable advanced agents in orchestrator
2. Fall back to core agents only
3. Document issues
4. Retain data for debugging

---

## Next Steps

After Step 3 completion:
- **Step 4:** Add observability and governance (dashboards, cost tracking, alerting)

---

**Status:** AWAITING APPROVAL  
**Estimated Duration:** 2-3 weeks  
**Risk:** MEDIUM-HIGH (complex analysis, RAG integration)
