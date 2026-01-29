import { CostCalculator } from './cost-calculator';

/**
 * Token usage data
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelId: string;
  agentId: string;
  timestamp: string;
}

/**
 * Token analytics data
 */
export interface TokenAnalytics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  efficiency: number;
  modelId: string;
  modelName: string;
  agentId: string;
  timestamp: string;
}

/**
 * Token Tracker
 * Phase 8.4: Track token usage and calculate analytics
 */
export class TokenTracker {
  /**
   * Track token usage and calculate analytics
   */
  static track(usage: TokenUsage): TokenAnalytics {
    const totalTokens = usage.inputTokens + usage.outputTokens;

    // Calculate cost
    const cost = CostCalculator.calculateCost({
      modelId: usage.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    // Calculate efficiency
    const efficiency = CostCalculator.calculateEfficiency({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    // Get model name
    const modelName = CostCalculator.getModelName(usage.modelId);

    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens,
      cost,
      efficiency,
      modelId: usage.modelId,
      modelName,
      agentId: usage.agentId,
      timestamp: usage.timestamp,
    };
  }

  /**
   * Aggregate multiple token usages
   */
  static aggregate(usages: TokenUsage[]): TokenAnalytics {
    if (usages.length === 0) {
      throw new Error('Cannot aggregate empty usages array');
    }

    const totalInputTokens = usages.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = usages.reduce((sum, u) => sum + u.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;

    // Calculate total cost
    const totalCost = usages.reduce((sum, u) => {
      return sum + CostCalculator.calculateCost({
        modelId: u.modelId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
      });
    }, 0);

    // Calculate average efficiency
    const efficiency = CostCalculator.calculateEfficiency({
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Use first usage for metadata
    const first = usages[0];

    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      cost: totalCost,
      efficiency,
      modelId: first.modelId,
      modelName: CostCalculator.getModelName(first.modelId),
      agentId: first.agentId,
      timestamp: first.timestamp,
    };
  }
}
