import { describe, it, expect } from 'vitest';
import { CostCalculator, MODEL_PRICING } from '../../src/analytics/cost-calculator';

describe('CostCalculator', () => {
  describe('calculateCost', () => {
    it('should calculate cost for Claude 3.5 Sonnet', () => {
      const cost = CostCalculator.calculateCost({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // $3 for 1M input + $15 for 1M output = $18
      expect(cost).toBe(18.00);
    });

    it('should calculate cost for Claude 3 Haiku', () => {
      const cost = CostCalculator.calculateCost({
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // $0.25 for 1M input + $1.25 for 1M output = $1.50
      expect(cost).toBe(1.50);
    });

    it('should calculate cost for partial tokens', () => {
      const cost = CostCalculator.calculateCost({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        inputTokens: 500_000,
        outputTokens: 250_000,
      });

      // $3 * 0.5 + $15 * 0.25 = $1.50 + $3.75 = $5.25
      expect(cost).toBe(5.25);
    });

    it('should use default pricing for unknown model', () => {
      const cost = CostCalculator.calculateCost({
        modelId: 'unknown-model',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // Should use Claude 3.5 Sonnet pricing as default
      expect(cost).toBe(18.00);
    });

    it('should handle zero tokens', () => {
      const cost = CostCalculator.calculateCost({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(cost).toBe(0);
    });

    it('should calculate realistic agent invocation cost', () => {
      // Typical agent invocation: 2000 input, 500 output
      const cost = CostCalculator.calculateCost({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        inputTokens: 2000,
        outputTokens: 500,
      });

      // $3 * 0.002 + $15 * 0.0005 = $0.006 + $0.0075 = $0.0135
      expect(cost).toBeCloseTo(0.0135, 4);
    });
  });

  describe('calculateEfficiency', () => {
    it('should calculate efficiency ratio', () => {
      const efficiency = CostCalculator.calculateEfficiency({
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(efficiency).toBe(0.5);
    });

    it('should handle zero input tokens', () => {
      const efficiency = CostCalculator.calculateEfficiency({
        inputTokens: 0,
        outputTokens: 500,
      });

      expect(efficiency).toBe(0);
    });

    it('should handle output > input', () => {
      const efficiency = CostCalculator.calculateEfficiency({
        inputTokens: 500,
        outputTokens: 1000,
      });

      expect(efficiency).toBe(2.0);
    });
  });

  describe('getModelName', () => {
    it('should extract Claude 3.5 Sonnet', () => {
      const name = CostCalculator.getModelName('anthropic.claude-3-5-sonnet-20241022-v2:0');
      expect(name).toBe('claude-3.5-sonnet');
    });

    it('should extract Claude 3 Sonnet', () => {
      const name = CostCalculator.getModelName('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(name).toBe('claude-3-sonnet');
    });

    it('should extract Claude 3 Haiku', () => {
      const name = CostCalculator.getModelName('anthropic.claude-3-haiku-20240307-v1:0');
      expect(name).toBe('claude-3-haiku');
    });

    it('should return unknown for unrecognized model', () => {
      const name = CostCalculator.getModelName('unknown-model-id');
      expect(name).toBe('unknown');
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for all supported models', () => {
      expect(MODEL_PRICING).toHaveProperty('anthropic.claude-3-5-sonnet-20241022-v2:0');
      expect(MODEL_PRICING).toHaveProperty('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(MODEL_PRICING).toHaveProperty('anthropic.claude-3-haiku-20240307-v1:0');
    });

    it('should have valid pricing values', () => {
      Object.values(MODEL_PRICING).forEach(pricing => {
        expect(pricing.inputTokensPer1M).toBeGreaterThan(0);
        expect(pricing.outputTokensPer1M).toBeGreaterThan(0);
        expect(pricing.outputTokensPer1M).toBeGreaterThanOrEqual(pricing.inputTokensPer1M);
      });
    });
  });
});
