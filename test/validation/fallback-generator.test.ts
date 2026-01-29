import { describe, it, expect } from 'vitest';
import { FallbackGenerator } from '../../src/validation/fallback-generator';

describe('FallbackGenerator', () => {
  let generator: FallbackGenerator;

  beforeEach(() => {
    generator = new FallbackGenerator();
  });

  describe('generateFallback', () => {
    it('should generate fallback with confidence 0.0', () => {
      const template = {
        confidence: 0.5,
        reasoning: 'Original reasoning',
        recommendations: ['rec1', 'rec2'],
      };

      const fallback = generator.generateFallback({
        agentId: 'test-agent',
        sessionId: 'test-session',
        attempts: 3,
        template,
      });

      expect(fallback.confidence).toBe(0.0);
      expect(fallback.reasoning).toContain('Unable to generate valid response');
      expect(fallback.reasoning).toContain('3 attempts');
    });

    it('should clear arrays to empty', () => {
      const template = {
        confidence: 0.5,
        reasoning: 'Original',
        recommendations: ['rec1', 'rec2'],
        citations: [{ source: 'doc1', content: 'content' }],
      };

      const fallback = generator.generateFallback({
        agentId: 'test-agent',
        sessionId: 'test-session',
        attempts: 3,
        template,
      });

      expect(fallback.recommendations).toEqual([]);
      expect(fallback.citations).toEqual([]);
    });

    it('should preserve template structure', () => {
      const template = {
        confidence: 0.5,
        reasoning: 'Original',
        customField: 'value',
        nestedObject: { key: 'value' },
      };

      const fallback = generator.generateFallback({
        agentId: 'test-agent',
        sessionId: 'test-session',
        attempts: 3,
        template,
      });

      expect(fallback).toHaveProperty('customField');
      expect(fallback).toHaveProperty('nestedObject');
    });
  });

  describe('generateSignalAnalysisFallback', () => {
    it('should generate signal analysis fallback', () => {
      const fallback = generator.generateSignalAnalysisFallback({
        sessionId: 'test-session',
        attempts: 3,
      });

      expect(fallback.confidence).toBe(0.0);
      expect(fallback.reasoning).toContain('Unable to analyze signal');
      expect(fallback.severity).toBe('unknown');
      expect(fallback.recommendations).toEqual([]);
      expect(fallback.citations).toEqual([]);
    });
  });

  describe('generateHistoricalPatternFallback', () => {
    it('should generate historical pattern fallback', () => {
      const fallback = generator.generateHistoricalPatternFallback({
        sessionId: 'test-session',
        attempts: 3,
      });

      expect(fallback.confidence).toBe(0.0);
      expect(fallback.reasoning).toContain('Unable to identify patterns');
      expect(fallback.patterns).toEqual([]);
      expect(fallback.citations).toEqual([]);
    });
  });

  describe('generateRiskAssessmentFallback', () => {
    it('should generate risk assessment fallback', () => {
      const fallback = generator.generateRiskAssessmentFallback({
        sessionId: 'test-session',
        attempts: 3,
      });

      expect(fallback.confidence).toBe(0.0);
      expect(fallback.reasoning).toContain('Unable to assess risk');
      expect(fallback.riskLevel).toBe('unknown');
      expect(fallback.mitigations).toEqual([]);
      expect(fallback.citations).toEqual([]);
    });
  });

  describe('fallback honesty', () => {
    it('should always be honest about inability to generate response', () => {
      const fallbacks = [
        generator.generateSignalAnalysisFallback({ sessionId: 'test', attempts: 3 }),
        generator.generateHistoricalPatternFallback({ sessionId: 'test', attempts: 3 }),
        generator.generateRiskAssessmentFallback({ sessionId: 'test', attempts: 3 }),
      ];

      fallbacks.forEach(fallback => {
        expect(fallback.confidence).toBe(0.0);
        expect(fallback.reasoning).toMatch(/unable/i);
        expect(fallback.reasoning).not.toContain('high confidence');
        expect(fallback.reasoning).not.toContain('successfully');
      });
    });

    it('should never mislead downstream systems', () => {
      const fallback = generator.generateSignalAnalysisFallback({
        sessionId: 'test',
        attempts: 3,
      });

      // Should not have positive indicators
      expect(fallback.confidence).not.toBeGreaterThan(0);
      expect(fallback.severity).not.toBe('critical');
      expect(fallback.severity).not.toBe('high');
      expect(fallback.recommendations.length).toBe(0);
    });
  });
});
