/**
 * Phase 6 Step 2: Change Intelligence Agent (Corrected)
 * 
 * Correlates incident with pre-collected change records.
 * 
 * CORRECTIONS APPLIED:
 * - Uses pre-collected change records, NOT live queries
 * - Explicit source marking (MOCK/DERIVED/AUTHORITATIVE)
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
  ChangeIntelligenceInputSchema,
  AgentRecommendationSchema,
  type ChangeIntelligenceInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class ChangeIntelligenceAgent {
  async analyze(input: ChangeIntelligenceInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = ChangeIntelligenceInputSchema.parse(input);

    // 2. Build prompt from change records (NOT live queries)
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
      agentId: 'change-intelligence',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: parsed.hypothesis?.type || 'CORRELATION',
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

  private buildPrompt(input: ChangeIntelligenceInput): string {
    const { incidentSnapshot, changeRecords } = input;
    const incidentTime = new Date(incidentSnapshot.createdAt);

    // Use pre-collected change records with explicit source marking
    const changeSummaries = changeRecords
      .slice(0, 10) // Limit for token budget
      .map((change, idx) => {
        const changeTime = new Date(change.timestamp);
        const timeDelta = Math.floor(
          (incidentTime.getTime() - changeTime.getTime()) / 60000
        );

        return `
${idx + 1}. ${change.type} - ${change.changeId}
   - Service: ${change.service}
   - Time: ${change.timestamp} (${timeDelta} minutes before incident)
   - Source: ${change.source} ${change.sourceSystem ? `(${change.sourceSystem})` : ''}
   - Details: ${JSON.stringify(change.details)}
`;
      })
      .join('\n');

    return `You are an expert SRE analyzing change correlation using PRE-COLLECTED change records.

**CRITICAL:** You are analyzing TIMESTAMPED, PRE-COLLECTED change data, not live systems.

**Incident:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Incident Time: ${incidentSnapshot.createdAt}

**Change Records (${changeRecords.length} total, showing 10):**
${changeSummaries}

**Your Task:**
Analyze change timing and correlation to form a hypothesis about potential triggers.

**IMPORTANT:**
- Your output is a HYPOTHESIS about correlation, not causation
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- Note data source (MOCK, DERIVED, AUTHORITATIVE) in your reasoning
- Recommendations are NON-AUTHORITATIVE suggestions only

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "CORRELATION",
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
    "supporting_evidence": ["change IDs with timing"],
    "contradicting_evidence": ["reasons against correlation"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION" | "ROLLBACK",
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

    return responseBody.content[0].text;
  }
}

export async function handler(
  event: ChangeIntelligenceInput
): Promise<AgentRecommendation> {
  const agent = new ChangeIntelligenceAgent();
  return await agent.analyze(event);
}
