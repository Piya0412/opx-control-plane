/**
 * Phase 6 Step 2: Historical Incident Agent (Corrected)
 * 
 * Finds similar past incidents using read-only projections.
 * 
 * CORRECTIONS APPLIED:
 * - Uses incident projections, NOT live DynamoDB
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
  HistoricalIncidentInputSchema,
  AgentRecommendationSchema,
  type HistoricalIncidentInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class HistoricalIncidentAgent {
  async analyze(input: HistoricalIncidentInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = HistoricalIncidentInputSchema.parse(input);

    // 2. Build prompt from projections (NOT live DynamoDB)
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
      agentId: 'historical-incident',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: parsed.hypothesis?.type || 'PATTERN',
        description: parsed.hypothesis?.description || 'Unable to analyze',
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

  private buildPrompt(input: HistoricalIncidentInput): string {
    const { incidentSnapshot, historicalProjections } = input;

    // Use read-only projections, NOT live incident table
    const projectionSummaries = historicalProjections
      .slice(0, 10) // Limit to 10 for token budget
      .map((proj, idx) => `
${idx + 1}. Incident ${proj.incidentId}
   - Service: ${proj.service}
   - Severity: ${proj.severity}
   - Status: ${proj.status}
   - Resolution: ${proj.resolutionSummary?.type || 'Unknown'}
   - Time to Resolve: ${proj.resolutionSummary?.timeToResolveMinutes || 'Unknown'} minutes
   - Actions: ${proj.resolutionSummary?.actions.join(', ') || 'None'}
   - Projected at: ${proj.projectedAt}
`)
      .join('\n');

    return `You are an expert SRE analyzing incident patterns using HISTORICAL PROJECTIONS.

**CRITICAL:** You are analyzing READ-ONLY PROJECTIONS, not live incident data.

**Current Incident:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Status: ${incidentSnapshot.status}

**Historical Projections (${historicalProjections.length} total, showing 10):**
${projectionSummaries}

**Your Task:**
Identify PATTERNS and SIMILARITIES to form a hypothesis about resolution strategies.

**IMPORTANT:**
- Your output is a HYPOTHESIS based on historical patterns
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- Recommendations are NON-AUTHORITATIVE suggestions only

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "PATTERN",
    "description": "string (max 500 chars)",
    "confidence": {
      "confidence_estimate": number (0.0-1.0),
      "confidence_basis": ["data", "pattern", "assumption"],
      "confidence_breakdown": {
        "data_quality": number (0.0-1.0),
        "pattern_strength": number (0.0-1.0),
        "assumption_count": number
      }
    },
    "supporting_evidence": ["similar incident IDs"],
    "contradicting_evidence": ["differences"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION" | "MITIGATION",
      "description": "string (max 300 chars)",
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
  event: HistoricalIncidentInput
): Promise<AgentRecommendation> {
  const agent = new HistoricalIncidentAgent();
  return await agent.analyze(event);
}
