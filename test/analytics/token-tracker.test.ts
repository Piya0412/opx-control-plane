import { describe, it, expect } from 'vitest';
import { TokenTracker } from '../../src/analytics/token-tracker';

describe('TokenTracker', () => {
  describe('track', () => {
    it('should track token usage and calculate analytics', () => {
      const usage = {
        inputTokens: 2000,
        outputTokens: 500,
        totalTokens: 2500,
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        agentId: 'signal-intelligence',
        timestamp: '2026-01-29T15:00:00Z',
      };

      const analytics = TokenTracker.track(usage);

      expect(analytics.inputTokens).toBe(2000);
      expect(analytics.outputTokens).toBe(500);
      expect(analytics.totalTokens).toBe(2500);
      expect(analytics.cost).toBeGreaterThan(0);
      expect(analytics.efficiency).toBe(0.25); // 500/2000
      expect(analytics.modelName).toBe('claude-3.5-sonnet');
      expect(analytics.agentId).toBe('signal-intelligence');
    });

    it('should calculate correct cost', () => {
      const usage = {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        agentId: 'test-agent',
        timestamp: '2026-01-29T15:00:00Z',
      };

      const analytics = TokenTracker.track(usage);

      // $3 for 1M input + $15 for 1M output = $18
      expect(analytics.cost).toBe(18.00);
    });

    it('should handle zero tokens', () => {
      const usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        agentId: 'test-agent',
        timestamp: '2026-01-29T15:00:00Z',
      };

      const analytics = TokenTracker.track(usage);

      expect(analytics.cost).toBe(0);
      expect(analytics.efficiency).toBe(0);
    });
  });

  describe('aggregate', () => {
    it('should aggregate multiple usages', () => {
      const usages = [
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          agentId: 'signal-intelligence',
          timestamp: '2026-01-29T15:00:00Z',
        },
        {
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          agentId: 'signal-intelligence',
          timestamp: '2026-01-29T15:01:00Z',
        },
      ];

      const analytics = TokenTracker.aggregate(usages);

      expect(analytics.inputTokens).toBe(3000);
      expect(analytics.outputTokens).toBe(1500);
      expect(analytics.totalTokens).toBe(4500);
      expect(analytics.efficiency).toBe(0.5); // 1500/3000
    });

    it('should calculate total cost correctly', () => {
      const usages = [
        {
          inputTokens: 500_000,
          outputTokens: 250_000,
          totalTokens: 750_000,
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          agentId: 'test-agent',
          timestamp: '2026-01-29T15:00:00Z',
        },
        {
          inputTokens: 500_000,
          outputTokens: 250_000,
          totalTokens: 750_000,
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          agentId: 'test-agent',
          timestamp: '2026-01-29T15:01:00Z',
        },
      ];

      const analytics = TokenTracker.aggregate(usages);

      // Each: $3 * 0.5 + $15 * 0.25 = $5.25
      // Total: $5.25 * 2 = $10.50
      expect(analytics.cost).toBe(10.50);
    });

    it('should throw error for empty array', () => {
      expect(() => {
        TokenTracker.aggregate([]);
      }).toThrow('Cannot aggregate empty usages array');
    });

    it('should use first usage for metadata', () => {
      const usages = [
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          agentId: 'agent-1',
          timestamp: '2026-01-29T15:00:00Z',
        },
        {
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
          modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
          agentId: 'agent-2',
          timestamp: '2026-01-29T15:01:00Z',
        },
      ];

      const analytics = TokenTracker.aggregate(usages);

      expect(analytics.agentId).toBe('agent-1');
      expect(analytics.modelName).toBe('claude-3.5-sonnet');
      expect(analytics.timestamp).toBe('2026-01-29T15:00:00Z');
    });
  });
});
