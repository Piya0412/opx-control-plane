/**
 * Cost Calculator
 * Phase 8.4: Token cost calculation
 */

export interface ModelPricing {
  inputTokensPer1M: number; // USD per 1M input tokens
  outputTokensPer1M: number; // USD per 1M output tokens
}

/**
 * Bedrock model pricing (as of 2026)
 * Source: AWS Bedrock pricing page
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 3.5 Sonnet
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    inputTokensPer1M: 3.00,
    outputTokensPer1M: 15.00,
  },
  // Claude 3 Sonnet
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    inputTokensPer1M: 3.00,
    outputTokensPer1M: 15.00,
  },
  // Claude 3 Haiku
  'anthropic.claude-3-haiku-20240307-v1:0': {
    inputTokensPer1M: 0.25,
    outputTokensPer1M: 1.25,
  },
};

export class CostCalculator {
  /**
   * Calculate cost for token usage
   */
  static calculateCost(params: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
  }): number {
    const pricing = MODEL_PRICING[params.modelId];
    
    if (!pricing) {
      // Unknown model - use Claude 3.5 Sonnet pricing as default
      const defaultPricing = MODEL_PRICING['anthropic.claude-3-5-sonnet-20241022-v2:0'];
      return this.calculateCostWithPricing(params, defaultPricing);
    }

    return this.calculateCostWithPricing(params, pricing);
  }

  /**
   * Calculate cost with specific pricing
   */
  private static calculateCostWithPricing(
    params: { inputTokens: number; outputTokens: number },
    pricing: ModelPricing
  ): number {
    const inputCost = (params.inputTokens / 1_000_000) * pricing.inputTokensPer1M;
    const outputCost = (params.outputTokens / 1_000_000) * pricing.outputTokensPer1M;
    
    return inputCost + outputCost;
  }

  /**
   * Calculate token efficiency (output/input ratio)
   */
  static calculateEfficiency(params: {
    inputTokens: number;
    outputTokens: number;
  }): number {
    if (params.inputTokens === 0) {
      return 0;
    }

    return params.outputTokens / params.inputTokens;
  }

  /**
   * Get model name from model ID
   */
  static getModelName(modelId: string): string {
    if (modelId.includes('claude-3-5-sonnet')) {
      return 'claude-3.5-sonnet';
    }
    if (modelId.includes('claude-3-sonnet')) {
      return 'claude-3-sonnet';
    }
    if (modelId.includes('claude-3-haiku')) {
      return 'claude-3-haiku';
    }
    return 'unknown';
  }
}
