/**
 * Phase 6 Step 2: Token Estimator
 * 
 * Deterministic token estimation for cost tracking.
 * 
 * CORRECTION 4: Uses character count heuristic, not unreliable usage.input_tokens
 */

export class TokenEstimator {
  /**
   * Estimate tokens using character count heuristic
   * Claude tokenizer: ~4 chars per token (conservative)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Estimate cost for Claude 3.5 Sonnet
   * 
   * Pricing (as of 2026-01):
   * - Input: $0.003 per 1K tokens
   * - Output: $0.015 per 1K tokens
   */
  estimateCost(inputText: string, outputText: string): number {
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);
    
    const INPUT_COST_PER_1K = 0.003;
    const OUTPUT_COST_PER_1K = 0.015;
    
    const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K;
    const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K;
    
    return inputCost + outputCost;
  }
}
