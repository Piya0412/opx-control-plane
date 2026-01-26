/**
 * Phase 6 Step 3: Knowledge Recommendation Agent (Corrected)
 * 
 * Suggests relevant documentation using pre-indexed knowledge chunks.
 * 
 * CORRECTIONS APPLIED:
 * - Uses knowledge projections, NOT vector search
 * - No Bedrock embeddings (Phase 7 responsibility)
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
  KnowledgeRecommendationInputSchema,
  AgentRecommendationSchema,
  type KnowledgeRecommendationInput,
  type AgentRecommendation,
} from './schemas.js';

const bedrock = new BedrockRuntimeClient({});
const tokenEstimator = new TokenEstimator();
const outputParser = new OutputParser();
const confidenceNormalizer = new ConfidenceNormalizer();

export const AGENT_VERSION = 'v1.0.0';
export const SCHEMA_VERSION = '2026-01';
export const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export class KnowledgeRecommendationAgent {
  async analyze(input: KnowledgeRecommendationInput): Promise<AgentRecommendation> {
    const startTime = Date.now();

    // 1. Validate input
    const validatedInput = KnowledgeRecommendationInputSchema.parse(input);

    // 2. Build prompt from knowledge projections (NOT vector search)
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
      agentId: 'knowledge-recommendation',
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      modelId: MODEL_ID,
      modelVersion: '20241022',
      incidentId: validatedInput.incidentSnapshot.incidentId,
      hypothesis: {
        type: 'PATTERN',
        description: parsed.hypothesis?.description || 'Unable to analyze knowledge relevance',
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

  private buildPrompt(input: KnowledgeRecommendationInput): string {
    const { incidentSnapshot, knowledgeChunks, searchContext } = input;

    // Use pre-indexed knowledge chunks, NOT vector search
    const knowledgeSummary = knowledgeChunks
      .slice(0, 10) // Limit for token budget
      .map((chunk, idx) => `
${idx + 1}. ${chunk.documentType}: ${chunk.title}
   - Relevance Score: ${(chunk.relevanceScore * 100).toFixed(1)}%
   - Keywords: ${chunk.keywords.join(', ')}
   - Excerpt: ${chunk.excerpt}
   - URL: ${chunk.url}
   - Last Updated: ${chunk.lastUpdated}
   - Source: ${chunk.source}
`)
      .join('\n');

    return `You are an expert SRE analyzing incident documentation using PRE-INDEXED knowledge.

**CRITICAL:** You are analyzing PRE-INDEXED, TIMESTAMPED knowledge chunks, not live vector search.

**Incident:**
- Service: ${incidentSnapshot.service}
- Severity: ${incidentSnapshot.severity}
- Classification: ${searchContext.classification}
- Error Patterns: ${searchContext.errorPatterns.join(', ')}

**Knowledge Chunks (${knowledgeChunks.length} total, showing 10):**
${knowledgeSummary}

**Your Task:**
Analyze the pre-indexed knowledge chunks to form a hypothesis about relevant documentation.

**IMPORTANT:**
- Your output is a HYPOTHESIS about document relevance, not certainty
- Mark confidence basis: 'data', 'pattern', or 'assumption'
- Recommendations are NON-AUTHORITATIVE suggestions only
- You may suggest which docs to review, NOT what actions to take

**Output Format (JSON):**
{
  "hypothesis": {
    "type": "PATTERN",
    "description": "string (max 500 chars) - describe knowledge relevance hypothesis",
    "confidence": {
      "confidence_estimate": number (0.0-1.0),
      "confidence_basis": ["data", "pattern", "assumption"],
      "confidence_breakdown": {
        "data_quality": number (0.0-1.0),
        "pattern_strength": number (0.0-1.0),
        "assumption_count": number
      }
    },
    "supporting_evidence": ["relevant document IDs"],
    "contradicting_evidence": ["reasons for low relevance"]
  },
  "recommendations": [
    {
      "type": "INVESTIGATION",
      "description": "string (max 300 chars) - suggest which docs to review",
      "risk_estimate": "LOW",
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
  event: KnowledgeRecommendationInput
): Promise<AgentRecommendation> {
  const agent = new KnowledgeRecommendationAgent();
  return await agent.analyze(event);
}
