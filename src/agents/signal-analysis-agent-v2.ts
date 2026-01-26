/**
 * Phase 6 Step 2: Signal Analysis Agent (Corrected)
 * 
 * Correlates pre-aggregated signal summaries to identify root cause patterns.
 * 
 * CORRECTIONS APPLIED:
 * - Uses evidence bundles, NOT live CloudWatch/Logs
 * - Validates input with Zod
 * - Fail-closed output parsing
 * - Normalized confidence
 * - Deterministic cost estimation
 * - Versioned output
 * - Explicit disclaimer
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { TokenEstimator } from './token-estimator.js';
import { OutputParser } from './output-parser.js';
import { ConfidenceNormalizer } from './confidence-normalizer.js';
import { ObservabilityAdapter } from './observability-adapter.js';
import {
  SignalAnalysisInputSchema,
  AgentRecommendationSchema,
  type SignalAnalysisInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

// Version constants
export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class SignalAnalysisAgent {
  async analyze(input: SignalAnalysisInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = SignalAnalysisInputSchema.parse(input);

    // 2. Build prompt from evidence bundle (NOT live data)
    const prompt = this.buildPrompt(validatedInput);

    // 3. Invoke LLM
    const llmResponse = await this.invokeLLM(prompt);

    // 4. Parse and validate output (fail-closed)
    const parsed = outputParser.parse(llmResponse, AgentRecommendationSchema.partial());

    // 5. Normalize confidence
    const normalizedConfidence = confidenceNormalizer.normalize(
      parsed.hypothesis?.confidence?.confidence_estimate || 0,
      parsed.hypothesis?.confidence?.confidence_basis || ['assumption']
    );

    // 6. Estimate cost
    const estimated_cost_usd = tokenEstimator.estimateCost(prompt, llmResponse);

    return {
      agentId: 'signal-analysis',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: parsed.hypothesis?.type || 'ROOT_CAUSE',
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

  private buildPrompt(input: SignalAnalysisInput): string {
    const { incidentSnapshot, evidenceBundle } = input;

    // Use pre-aggregated summaries, NOT raw data
    const signalSummaries = evidenceBundle.signalSummaries
      .slice(0, 10) // Limit for token budget
      .map((s, idx) => `
${idx + 1}. Signal ${s.signalId}
   - Type: ${s.signalType}
   - Severity: ${s.summary.severity}
   - Count: ${s.summary.count}
   - Samples: ${s.summary.sampleMessages?.join('; ') || 'N/A'}
   - Metrics: ${JSON.stringify(s.summary.aggregatedMetrics || [])}
`)
      .join('\n');

    return `You are an expert SRE analyzing an incident using PRE-AGGREGATED data.

**CRITICAL:** You are analyzing FROZEN, TIMESTAMPED data. This is NOT live infrastructure.

**Incident Context:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Status: ${incidentSnapshot.status}
- Created: ${incidentSnapshot.createdAt}

**Evidence Bundle (Captured at ${evidenceBundle.bundledAt}):**
${signalSummaries}

**Your Task:**
Analyze the pre-aggregated signal summaries to form a ROOT CAUSE HYPOTHESIS.

**IMPORTANT:**
- Your output is a HYPOTHESIS, not truth
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- Provide supporting AND contradicting evidence
- Recommendations are NON-AUTHORITATIVE suggestions only

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "ROOT_CAUSE",
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
    "supporting_evidence": ["evidence1", "evidence2"],
    "contradicting_evidence": ["contradiction1"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION",
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
    const startTime = Date.now();
    let success = false;
    let response = '';
    let error: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
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
          temperature: 0.1, // Low temperature for deterministic output
        }),
      });

      const llmResponse = await bedrock.send(command);
      const responseBody = JSON.parse(
        Buffer.from(llmResponse.body).toString()
      );

      response = responseBody.content[0].text;
      inputTokens = responseBody.usage?.input_tokens || 0;
      outputTokens = responseBody.usage?.output_tokens || 0;
      success = true;

      return response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      // CORRECTION 3: Log with redaction (hash + summary only)
      await ObservabilityAdapter.logRedactedLLMInvocation({
        agentId: 'signal-analysis',
        incidentId: 'unknown', // Will be set by orchestrator context
        modelId: MODEL_ID,
        prompt,
        response,
        inputTokens,
        outputTokens,
        cost: tokenEstimator.estimateCost(prompt, response),
        durationMs: Date.now() - startTime,
        success,
        error,
      });
    }
  }
}

export async function handler(
  event: SignalAnalysisInput
): Promise<AgentRecommendation> {
  const agent = new SignalAnalysisAgent();
  return await agent.analyze(event);
}
