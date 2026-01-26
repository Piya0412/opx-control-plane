/**
 * Phase 6 Step 3: Risk & Blast Radius Agent (Corrected)
 * 
 * Estimates incident impact using pre-computed dependency snapshots.
 * 
 * CORRECTIONS APPLIED:
 * - Uses dependency snapshots, NOT live DynamoDB
 * - Uses traffic summaries, NOT live CloudWatch
 * - Validates input with Zod
 * - Fail-closed output parsing
 * - Normalized confidence
 * - Deterministic cost estimation
 * - Versioned output
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { TokenEstimator } from './token-estimator.js';
import { OutputParser } from './output-parser.js';
import { ConfidenceNormalizer } from './confidence-normalizer.js';
import {
  RiskBlastRadiusInputSchema,
  AgentRecommendationSchema,
  type RiskBlastRadiusInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class RiskBlastRadiusAgent {
  async analyze(input: RiskBlastRadiusInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = RiskBlastRadiusInputSchema.parse(input);

    // 2. Build prompt from snapshots (NOT live data)
    const prompt = this.buildPrompt(validatedInput);

    // 3. Invoke LLM
    const llmResponse = await this.invokeLLM(prompt);

    // 4. Parse and validate output
    const parsed = outputParser.parse(llmResponse, AgentRecommendationSchema.partial());

    // 5. Normalize confidence
    const normalizedConfidence = confidenceNormalizer.normalize(
      parsed.hypothesis?.confidence?.confidence_estimate || 0,
      parsed.hypothesis?.confidence?.confidence_basis || ['assumption']
    );

    // 6. Estimate cost
    const estimated_cost_usd = tokenEstimator.estimateCost(prompt, llmResponse);

    return {
      agentId: 'risk-blast-radius',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: 'CORRELATION',
        description: parsed.hypothesis?.description || 'Unable to analyze blast radius',
        confidence: normalizedConfidence,
        supporting_evidence: parsed.hypothesis?.supporting_evidence || [],
        contradicting_evidence: parsed.hypothesis?.contradicting_evidence || [],
      },
      recommendations: parsed.recommendations || [],
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      estimated_cost_usd,
      disclaimer: 'HYPOTHESIS_ONLY_NOT_AUTHORITATIVE',
    };
  }

  private buildPrompt(input: RiskBlastRadiusInput): string {
    const { incidentSnapshot, dependencySnapshot, trafficImpact } = input;

    // Use pre-computed snapshots, NOT live queries
    const dependencySummary = `
**Dependencies (${dependencySnapshot.dependencies.length}):**
${dependencySnapshot.dependencies.slice(0, 10).map(d => 
  `- ${d.service} (${d.type}, ${d.criticality})`
).join('\n')}

**Dependents (${dependencySnapshot.dependents.length}):**
${dependencySnapshot.dependents.slice(0, 10).map(d => 
  `- ${d.service} (${d.type}, ${d.criticality})`
).join('\n')}
`;

    const trafficSummary = `
**Traffic Summary (Snapshot at ${dependencySnapshot.snapshotAt}):**
- Requests/min: ${dependencySnapshot.trafficSummary.requestsPerMinute}
- Error Rate: ${(dependencySnapshot.trafficSummary.errorRate * 100).toFixed(2)}%
- Active Users: ${dependencySnapshot.trafficSummary.activeUsers}
- P99 Latency: ${dependencySnapshot.trafficSummary.p99Latency}ms
`;

    const impactSummary = `
**Impact Analysis (Summarized at ${trafficImpact.summarizedAt}):**
- Estimated Affected Users: ${trafficImpact.estimatedAffectedUsers}
- Estimated Affected Requests: ${trafficImpact.estimatedAffectedRequests}
- Error Rate Increase: ${(trafficImpact.errorRateIncrease * 100).toFixed(2)}%
- Latency Increase: ${trafficImpact.latencyIncrease}ms

**Propagation Paths:**
${trafficImpact.propagationPaths.slice(0, 5).map(p => 
  `- ${p.from} → ${p.to} (probability: ${(p.probability * 100).toFixed(1)}%, latency: ${p.estimatedLatency}min)`
).join('\n')}
`;

    return `You are an expert SRE analyzing incident blast radius using PRE-COMPUTED snapshots.

**CRITICAL:** You are analyzing FROZEN, TIMESTAMPED snapshots, not live infrastructure.

**Incident:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Status: ${incidentSnapshot.status}

${dependencySummary}

${trafficSummary}

${impactSummary}

**Your Task:**
Analyze the pre-computed snapshots to form a hypothesis about blast radius and impact.

**IMPORTANT:**
- Your output is a HYPOTHESIS about impact, not certainty
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- Recommendations are NON-AUTHORITATIVE suggestions only
- You may suggest investigation priorities, NOT execution plans

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "CORRELATION",
    "description": "string (max 500 chars) - describe blast radius hypothesis",
    "confidence": {
      "confidence_estimate": number (0.0-1.0),
      "confidence_basis": ["data", "pattern", "assumption"],
      "confidence_breakdown": {
        "data_quality": number (0.0-1.0),
        "pattern_strength": number (0.0-1.0),
        "assumption_count": number
      }
    },
    "supporting_evidence": ["affected services", "propagation paths"],
    "contradicting_evidence": ["reasons for limited impact"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION",
      "description": "string (max 300 chars) - suggest what to investigate",
      "risk_estimate": "LOW" | "MEDIUM" | "HIGH",
      "confidence": { ... },
      "rationale": "string (max 200 chars)"
    }
  ]
}

Provide ONLY the JSON output, no additional text.`;
  }

  private async invokeLLM(prompt: string): Promise<string> {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
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

    return responseBody.content[0].text;
  }
}

export async function handler(
  event: RiskBlastRadiusInput
): Promise<AgentRecommendation> {
  const agent = new RiskBlastRadiusAgent();
  return await agent.analyze(event);
}
