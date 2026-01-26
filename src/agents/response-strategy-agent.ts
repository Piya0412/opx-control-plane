/**
 * Phase 6 Step 3: Response Strategy Agent (Corrected)
 * 
 * Ranks response options and compares tradeoffs. Does NOT build execution plans.
 * 
 * CORRECTIONS APPLIED:
 * - Synthesizes agent recommendations, NOT raw outputs
 * - Ranks options and compares tradeoffs
 * - Does NOT build execution plans, steps, or critical paths
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
  ResponseStrategyInputSchema,
  AgentRecommendationSchema,
  type ResponseStrategyInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class ResponseStrategyAgent {
  async analyze(input: ResponseStrategyInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = ResponseStrategyInputSchema.parse(input);

    // 2. Build prompt from agent recommendations (NOT raw outputs)
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
      agentId: 'response-strategy',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: 'PATTERN',
        description: parsed.hypothesis?.description || 'Unable to analyze response strategy',
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

  private buildPrompt(input: ResponseStrategyInput): string {
    const { incidentSnapshot, coreAgentRecommendations, advancedAgentRecommendations } = input;

    // Synthesize agent recommendations (NOT raw outputs)
    const allRecommendations = [
      ...coreAgentRecommendations,
      ...advancedAgentRecommendations,
    ];

    const recommendationSummary = allRecommendations
      .map((rec, idx) => `
${idx + 1}. Agent: ${rec.agentId} (v${rec.agentVersion})
   - Hypothesis: ${rec.hypothesis.description}
   - Confidence: ${(rec.hypothesis.confidence.confidence_estimate * 100).toFixed(1)}%
   - Recommendations: ${rec.recommendations.length}
   ${rec.recommendations.slice(0, 3).map(r => 
     `   * ${r.type}: ${r.description} (risk: ${r.risk_estimate})`
   ).join('\n')}
`)
      .join('\n');

    return `You are an expert SRE synthesizing incident response strategies.

**CRITICAL:** You may RANK OPTIONS and COMPARE TRADEOFFS. You may NOT build execution plans.

**Incident:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Status: ${incidentSnapshot.status}

**Agent Recommendations (${allRecommendations.length} total):**
${recommendationSummary}

**Your Task:**
Synthesize agent recommendations to form a hypothesis about response strategy priorities.

**IMPORTANT:**
- Your output is a HYPOTHESIS about strategy priorities, not an execution plan
- You may RANK options (1st choice, 2nd choice, etc.)
- You may COMPARE tradeoffs (speed vs safety, risk vs reward)
- You may HIGHLIGHT risks and dependencies
- You may NOT define execution steps, critical paths, or sequences
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- All recommendations require human approval

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "PATTERN",
    "description": "string (max 500 chars) - describe strategy ranking hypothesis",
    "confidence": {
      "confidence_estimate": number (0.0-1.0),
      "confidence_basis": ["data", "pattern", "assumption"],
      "confidence_breakdown": {
        "data_quality": number (0.0-1.0),
        "pattern_strength": number (0.0-1.0),
        "assumption_count": number
      }
    },
    "supporting_evidence": ["agent recommendations that align"],
    "contradicting_evidence": ["conflicting recommendations"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION" | "MITIGATION",
      "description": "string (max 300 chars) - rank options, compare tradeoffs",
      "risk_estimate": "LOW" | "MEDIUM" | "HIGH",
      "confidence": { ... },
      "rationale": "string (max 200 chars) - explain ranking"
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
  event: ResponseStrategyInput
): Promise<AgentRecommendation> {
  const agent = new ResponseStrategyAgent();
  return await agent.analyze(event);
}
