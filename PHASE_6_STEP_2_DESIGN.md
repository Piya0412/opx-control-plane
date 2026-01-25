# Phase 6 Step 2: Core Agent Implementation

**Status:** 📋 DESIGN - AWAITING APPROVAL  
**Estimated Effort:** 2-3 weeks  
**Dependencies:** Phase 6 Step 1 complete  
**Risk:** MEDIUM (LLM integration)

---

## Objective

Implement the three core agents that provide fundamental incident intelligence:
1. Signal Analysis Agent
2. Historical Incident Agent  
3. Change Intelligence Agent

---

## Scope

### In Scope
- LLM integration (AWS Bedrock)
- Prompt engineering for each agent
- Data source integration (CloudWatch, DynamoDB)
- Output validation
- Error handling
- Cost tracking

### Out of Scope
- Advanced agents (Step 3)
- RAG implementation (Phase 7)
- Human approval workflow (Phase 5)
- Advanced observability (Step 4)

---

## Agent 1: Signal Analysis Agent

### Purpose
Correlate metrics, logs, and traces to identify root cause patterns.

### Implementation

**File:** `src/agents/signal-analysis-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

const bedrock = new BedrockRuntimeClient({});
const cloudwatch = new CloudWatchClient({});
const logs = new CloudWatchLogsClient({});

export interface SignalAnalysisInput {
  incidentId: string;
  evidenceId: string;
  service: string;
  severity: string;
  signalIds: string[];
  timeWindow: {
    start: string;
    end: string;
  };
}

export interface SignalAnalysisOutput {
  agentId: 'signal-analysis';
  incidentId: string;
  analysis: {
    rootCauseHypothesis: string;
    confidence: number;
    supportingSignals: string[];
    anomalies: Array<{
      metric: string;
      baseline: number;
      observed: number;
      deviation: number;
    }>;
    correlations: Array<{
      signal1: string;
      signal2: string;
      correlation: number;
      interpretation: string;
    }>;
  };
  reasoning: string[];
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class SignalAnalysisAgent {
  async analyze(input: SignalAnalysisInput): Promise<SignalAnalysisOutput> {
    const startTime = Date.now();

    // 1. Fetch metrics from CloudWatch
    const metrics = await this.fetchMetrics(input);

    // 2. Fetch logs from CloudWatch Logs
    const logs = await this.fetchLogs(input);

    // 3. Build prompt for LLM
    const prompt = this.buildPrompt(input, metrics, logs);

    // 4. Invoke LLM
    const llmResponse = await this.invokeLLM(prompt);

    // 5. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 6. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'signal-analysis',
      incidentId: input.incidentId,
      analysis,
      reasoning: llmResponse.reasoning,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private async fetchMetrics(input: SignalAnalysisInput): Promise<any[]> {
    // Fetch relevant metrics for the service
    const command = new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'error_rate',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Errors',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: input.service,
                },
              ],
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        {
          Id: 'invocations',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: input.service,
                },
              ],
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
      ],
      StartTime: new Date(input.timeWindow.start),
      EndTime: new Date(input.timeWindow.end),
    });

    const response = await cloudwatch.send(command);
    return response.MetricDataResults || [];
  }

  private async fetchLogs(input: SignalAnalysisInput): Promise<any[]> {
    // Fetch error logs for the service
    const command = new FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${input.service}`,
      startTime: new Date(input.timeWindow.start).getTime(),
      endTime: new Date(input.timeWindow.end).getTime(),
      filterPattern: 'ERROR',
      limit: 100,
    });

    try {
      const response = await logs.send(command);
      return response.events || [];
    } catch (error) {
      console.warn('Failed to fetch logs', error);
      return [];
    }
  }

  private buildPrompt(
    input: SignalAnalysisInput,
    metrics: any[],
    logs: any[]
  ): string {
    return `You are an expert SRE analyzing an incident.

**Incident Context:**
- Service: ${input.service}
- Severity: ${input.severity}
- Time Window: ${input.timeWindow.start} to ${input.timeWindow.end}
- Signal Count: ${input.signalIds.length}

**Metrics Data:**
${JSON.stringify(metrics, null, 2)}

**Error Logs (sample):**
${logs.slice(0, 10).map((log) => log.message).join('\n')}

**Your Task:**
Analyze the metrics and logs to identify:
1. Root cause hypothesis (most likely explanation)
2. Confidence level (0.0 to 1.0)
3. Supporting signals (which signals support your hypothesis)
4. Anomalies (deviations from baseline)
5. Correlations (relationships between signals)

**Output Format (JSON):**
{
  "rootCauseHypothesis": "string",
  "confidence": number,
  "supportingSignals": ["signal1", "signal2"],
  "anomalies": [
    {
      "metric": "error_rate",
      "baseline": 10,
      "observed": 150,
      "deviation": 14.0
    }
  ],
  "correlations": [
    {
      "signal1": "error_rate",
      "signal2": "latency",
      "correlation": 0.95,
      "interpretation": "High error rate correlates with increased latency"
    }
  ],
  "reasoning": ["step 1", "step 2", "step 3"]
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
        temperature: 0.1, // Low temperature for deterministic output
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(
      Buffer.from(response.body).toString()
    );

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    // Validate and sanitize LLM output
    return {
      rootCauseHypothesis: llmResponse.rootCauseHypothesis || 'Unknown',
      confidence: Math.max(0, Math.min(1, llmResponse.confidence || 0)),
      supportingSignals: Array.isArray(llmResponse.supportingSignals)
        ? llmResponse.supportingSignals
        : [],
      anomalies: Array.isArray(llmResponse.anomalies)
        ? llmResponse.anomalies
        : [],
      correlations: Array.isArray(llmResponse.correlations)
        ? llmResponse.correlations
        : [],
    };
  }

  private calculateCost(llmResponse: any): number {
    // Estimate cost based on token usage
    // Claude 3.5 Sonnet: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
    const inputTokens = llmResponse.usage?.input_tokens || 1000;
    const outputTokens = llmResponse.usage?.output_tokens || 500;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }
}

export async function handler(
  event: SignalAnalysisInput
): Promise<SignalAnalysisOutput> {
  const agent = new SignalAnalysisAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Fetches metrics from CloudWatch
- [ ] Fetches logs from CloudWatch Logs
- [ ] Invokes Bedrock LLM
- [ ] Parses and validates output
- [ ] Calculates cost
- [ ] Returns structured output

---

## Agent 2: Historical Incident Agent

### Purpose
Find similar past incidents and their resolutions.

### Implementation

**File:** `src/agents/historical-incident-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const bedrock = new BedrockRuntimeClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface HistoricalIncidentInput {
  incidentId: string;
  service: string;
  severity: string;
  classification: string;
}

export interface HistoricalIncidentOutput {
  agentId: 'historical-incident';
  incidentId: string;
  similarIncidents: Array<{
    incidentId: string;
    similarity: number;
    service: string;
    severity: string;
    resolution: {
      type: string;
      summary: string;
      timeToResolve: number;
      resolvedBy: string;
    };
    relevantActions: string[];
  }>;
  patterns: Array<{
    pattern: string;
    frequency: number;
    successRate: number;
  }>;
  recommendations: string[];
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class HistoricalIncidentAgent {
  async analyze(
    input: HistoricalIncidentInput
  ): Promise<HistoricalIncidentOutput> {
    const startTime = Date.now();

    // 1. Query historical incidents
    const historicalIncidents = await this.queryHistoricalIncidents(input);

    // 2. Build prompt for LLM
    const prompt = this.buildPrompt(input, historicalIncidents);

    // 3. Invoke LLM for similarity analysis
    const llmResponse = await this.invokeLLM(prompt);

    // 4. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 5. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'historical-incident',
      incidentId: input.incidentId,
      similarIncidents: analysis.similarIncidents,
      patterns: analysis.patterns,
      recommendations: analysis.recommendations,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private async queryHistoricalIncidents(
    input: HistoricalIncidentInput
  ): Promise<any[]> {
    // Query closed incidents for the same service
    const command = new QueryCommand({
      TableName: 'opx-incidents',
      IndexName: 'ServiceIndex',
      KeyConditionExpression: 'service = :service',
      FilterExpression: '#state = :state',
      ExpressionAttributeNames: {
        '#state': 'state',
      },
      ExpressionAttributeValues: {
        ':service': input.service,
        ':state': 'CLOSED',
      },
      Limit: 20,
    });

    try {
      const response = await dynamodb.send(command);
      return response.Items || [];
    } catch (error) {
      console.warn('Failed to query historical incidents', error);
      return [];
    }
  }

  private buildPrompt(
    input: HistoricalIncidentInput,
    historicalIncidents: any[]
  ): string {
    return `You are an expert SRE analyzing incident patterns.

**Current Incident:**
- Service: ${input.service}
- Severity: ${input.severity}
- Classification: ${input.classification}

**Historical Incidents (${historicalIncidents.length} total):**
${historicalIncidents
  .map(
    (inc, idx) => `
${idx + 1}. Incident ${inc.incidentId}
   - Severity: ${inc.severity}
   - Resolution: ${inc.resolution?.type || 'Unknown'}
   - Time to Resolve: ${inc.resolution?.timeToResolve || 'Unknown'} minutes
   - Summary: ${inc.resolution?.summary || 'No summary'}
`
  )
  .join('\n')}

**Your Task:**
Analyze the historical incidents to:
1. Identify similar incidents (similarity score 0.0 to 1.0)
2. Extract common patterns
3. Calculate success rates for resolution strategies
4. Provide recommendations based on past successes

**Output Format (JSON):**
{
  "similarIncidents": [
    {
      "incidentId": "string",
      "similarity": number,
      "service": "string",
      "severity": "string",
      "resolution": {
        "type": "string",
        "summary": "string",
        "timeToResolve": number,
        "resolvedBy": "string"
      },
      "relevantActions": ["action1", "action2"]
    }
  ],
  "patterns": [
    {
      "pattern": "string",
      "frequency": number,
      "successRate": number
    }
  ],
  "recommendations": ["recommendation1", "recommendation2"]
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
    const responseBody = JSON.parse(
      Buffer.from(response.body).toString()
    );

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    return {
      similarIncidents: Array.isArray(llmResponse.similarIncidents)
        ? llmResponse.similarIncidents.filter((inc: any) => inc.similarity >= 0.7)
        : [],
      patterns: Array.isArray(llmResponse.patterns)
        ? llmResponse.patterns
        : [],
      recommendations: Array.isArray(llmResponse.recommendations)
        ? llmResponse.recommendations
        : [],
    };
  }

  private calculateCost(llmResponse: any): number {
    const inputTokens = llmResponse.usage?.input_tokens || 1500;
    const outputTokens = llmResponse.usage?.output_tokens || 800;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }
}

export async function handler(
  event: HistoricalIncidentInput
): Promise<HistoricalIncidentOutput> {
  const agent = new HistoricalIncidentAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Queries historical incidents from DynamoDB
- [ ] Invokes Bedrock LLM for similarity analysis
- [ ] Filters by minimum similarity threshold (0.7)
- [ ] Extracts patterns and recommendations
- [ ] Returns structured output

---

## Agent 3: Change Intelligence Agent

### Purpose
Correlate incident with recent deployments and configuration changes.

### Implementation

**File:** `src/agents/change-intelligence-agent.ts`

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const bedrock = new BedrockRuntimeClient({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface ChangeIntelligenceInput {
  incidentId: string;
  service: string;
  timeWindow: {
    start: string;
    end: string;
  };
}

export interface ChangeIntelligenceOutput {
  agentId: 'change-intelligence';
  incidentId: string;
  recentChanges: Array<{
    changeId: string;
    type: 'DEPLOYMENT' | 'CONFIG' | 'INFRASTRUCTURE';
    service: string;
    timestamp: string;
    timeDelta: number;
    suspicionScore: number;
    details: {
      version?: string;
      configKey?: string;
      oldValue?: string;
      newValue?: string;
    };
  }>;
  correlationAnalysis: {
    likelyTrigger: boolean;
    confidence: number;
    reasoning: string;
  };
  rollbackRecommendation: {
    recommended: boolean;
    targetVersion?: string;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  executedAt: string;
  durationMs: number;
  cost: number;
}

export class ChangeIntelligenceAgent {
  async analyze(
    input: ChangeIntelligenceInput
  ): Promise<ChangeIntelligenceOutput> {
    const startTime = Date.now();

    // 1. Query recent changes (deployments, config changes)
    const recentChanges = await this.queryRecentChanges(input);

    // 2. Build prompt for LLM
    const prompt = this.buildPrompt(input, recentChanges);

    // 3. Invoke LLM for correlation analysis
    const llmResponse = await this.invokeLLM(prompt);

    // 4. Parse and validate output
    const analysis = this.parseAnalysis(llmResponse);

    // 5. Calculate cost
    const cost = this.calculateCost(llmResponse);

    return {
      agentId: 'change-intelligence',
      incidentId: input.incidentId,
      recentChanges: analysis.recentChanges,
      correlationAnalysis: analysis.correlationAnalysis,
      rollbackRecommendation: analysis.rollbackRecommendation,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      cost,
    };
  }

  private async queryRecentChanges(
    input: ChangeIntelligenceInput
  ): Promise<any[]> {
    // Query deployment/change history
    // NOTE: This assumes a deployment tracking table exists
    // For now, return mock data
    const lookbackTime = new Date(input.timeWindow.start);
    lookbackTime.setHours(lookbackTime.getHours() - 24); // 24 hour lookback

    // TODO: Implement real deployment tracking query
    return [
      {
        changeId: 'deploy-123',
        type: 'DEPLOYMENT',
        service: input.service,
        timestamp: new Date(
          Date.now() - 30 * 60 * 1000
        ).toISOString(),
        version: 'v1.2.3',
      },
      {
        changeId: 'config-456',
        type: 'CONFIG',
        service: input.service,
        timestamp: new Date(
          Date.now() - 120 * 60 * 1000
        ).toISOString(),
        configKey: 'timeout',
        oldValue: '30',
        newValue: '10',
      },
    ];
  }

  private buildPrompt(
    input: ChangeIntelligenceInput,
    recentChanges: any[]
  ): string {
    const incidentTime = new Date(input.timeWindow.start);

    return `You are an expert SRE analyzing change correlation with incidents.

**Incident:**
- Service: ${input.service}
- Incident Time: ${input.timeWindow.start}

**Recent Changes (24h lookback):**
${recentChanges
  .map((change, idx) => {
    const changeTime = new Date(change.timestamp);
    const timeDelta = Math.floor(
      (incidentTime.getTime() - changeTime.getTime()) / 60000
    );

    return `
${idx + 1}. ${change.type} - ${change.changeId}
   - Service: ${change.service}
   - Time: ${change.timestamp} (${timeDelta} minutes before incident)
   - Details: ${JSON.stringify(change, null, 2)}
`;
  })
  .join('\n')}

**Your Task:**
Analyze the changes to determine:
1. Suspicion score for each change (0.0 to 1.0)
2. Whether any change likely triggered the incident
3. Confidence in correlation (0.0 to 1.0)
4. Rollback recommendation (if applicable)

**Output Format (JSON):**
{
  "recentChanges": [
    {
      "changeId": "string",
      "type": "DEPLOYMENT" | "CONFIG" | "INFRASTRUCTURE",
      "service": "string",
      "timestamp": "string",
      "timeDelta": number,
      "suspicionScore": number,
      "details": {}
    }
  ],
  "correlationAnalysis": {
    "likelyTrigger": boolean,
    "confidence": number,
    "reasoning": "string"
  },
  "rollbackRecommendation": {
    "recommended": boolean,
    "targetVersion": "string",
    "risk": "LOW" | "MEDIUM" | "HIGH"
  }
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
        max_tokens: 1500,
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
    const responseBody = JSON.parse(
      Buffer.from(response.body).toString()
    );

    const content = responseBody.content[0].text;
    return JSON.parse(content);
  }

  private parseAnalysis(llmResponse: any): any {
    return {
      recentChanges: Array.isArray(llmResponse.recentChanges)
        ? llmResponse.recentChanges
        : [],
      correlationAnalysis: llmResponse.correlationAnalysis || {
        likelyTrigger: false,
        confidence: 0,
        reasoning: 'No analysis available',
      },
      rollbackRecommendation: llmResponse.rollbackRecommendation || {
        recommended: false,
        risk: 'LOW',
      },
    };
  }

  private calculateCost(llmResponse: any): number {
    const inputTokens = llmResponse.usage?.input_tokens || 1200;
    const outputTokens = llmResponse.usage?.output_tokens || 600;

    const inputCost = (inputTokens / 1000) * 0.003;
    const outputCost = (outputTokens / 1000) * 0.015;

    return inputCost + outputCost;
  }
}

export async function handler(
  event: ChangeIntelligenceInput
): Promise<ChangeIntelligenceOutput> {
  const agent = new ChangeIntelligenceAgent();
  return await agent.analyze(event);
}
```

**Acceptance:**
- [ ] Queries recent changes (24h lookback)
- [ ] Calculates time delta for each change
- [ ] Invokes Bedrock LLM for correlation analysis
- [ ] Provides rollback recommendations
- [ ] Returns structured output

---

## Testing Strategy

### Unit Tests
- Prompt generation
- Output parsing
- Cost calculation
- Error handling

### Integration Tests
- End-to-end agent execution
- LLM invocation
- Data source access
- Output validation

### Manual Tests
1. Create test incident
2. Invoke each agent manually
3. Verify output structure
4. Check cost tracking
5. Validate recommendations

---

## Success Criteria

- [ ] All 3 agents implemented
- [ ] Bedrock integration working
- [ ] Output validation passing
- [ ] Cost tracking accurate
- [ ] Error handling robust
- [ ] All tests passing
- [ ] Cost per incident < $0.30

---

## Next Steps

After Step 2 completion:
- **Step 3:** Implement advanced agents (Risk & Blast Radius, Knowledge RAG, Execution Proposal)
- **Step 4:** Add observability and governance

---

**Status:** AWAITING APPROVAL  
**Estimated Duration:** 2-3 weeks  
**Risk:** MEDIUM (LLM integration, prompt engineering)
