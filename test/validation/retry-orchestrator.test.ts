import { describe, it, expect, beforeEach } from 'vitest';
import { RetryOrchestrator } from '../../src/validation/retry-orchestrator';
import { ValidationError } from '../../src/validation/validation.schema';

describe('RetryOrchestrator', () => {
  let orchestrator: RetryOrchestrator;

  beforeEach(() => {
    orchestrator = new RetryOrchestrator();
  });

  describe('generateRetryPrompt', () => {
    const originalPrompt = 'Analyze this signal';
    const errors: ValidationError[] = [
      { layer: 'schema', message: 'Invalid field', details: {} },
    ];

    it('should generate clarification prompt for first retry', () => {
      const prompt = orchestrator.generateRetryPrompt(1, originalPrompt, errors);
      
      expect(prompt).toContain(originalPrompt);
      expect(prompt).toContain('Previous response did not meet required format');
      expect(prompt).toContain('strictly follow the schema');
      // ✅ Correction 3: Should NOT contain raw error details
      expect(prompt).not.toContain('Invalid field');
    });

    it('should generate simplification prompt for second retry', () => {
      const prompt = orchestrator.generateRetryPrompt(2, originalPrompt, errors);
      
      expect(prompt).toContain(originalPrompt);
      expect(prompt).toContain('simplified response');
      expect(prompt).toContain('strictly adheres');
      // ✅ Correction 3: Should NOT contain raw error details
      expect(prompt).not.toContain('Invalid field');
    });

    it('should never include raw validation errors in prompt', () => {
      const detailedErrors: ValidationError[] = [
        { layer: 'schema', message: 'Field "confidence" is required', details: { path: ['confidence'] } },
        { layer: 'business', message: 'Reasoning too short', details: { length: 5 } },
      ];

      const prompt1 = orchestrator.generateRetryPrompt(1, originalPrompt, detailedErrors);
      const prompt2 = orchestrator.generateRetryPrompt(2, originalPrompt, detailedErrors);
      
      // Should not contain any error details
      expect(prompt1).not.toContain('confidence');
      expect(prompt1).not.toContain('Reasoning too short');
      expect(prompt2).not.toContain('confidence');
      expect(prompt2).not.toContain('Reasoning too short');
    });
  });

  describe('shouldRetry', () => {
    it('should allow retries up to max attempts', () => {
      expect(orchestrator.shouldRetry(0)).toBe(true);
      expect(orchestrator.shouldRetry(1)).toBe(true);
      expect(orchestrator.shouldRetry(2)).toBe(true);
    });

    it('should not allow retries beyond max attempts', () => {
      expect(orchestrator.shouldRetry(3)).toBe(false);
      expect(orchestrator.shouldRetry(4)).toBe(false);
    });
  });

  describe('getAttemptBucket', () => {
    it('should return "first" for attempt 0', () => {
      expect(orchestrator.getAttemptBucket(0)).toBe('first');
    });

    it('should return "second" for attempt 1', () => {
      expect(orchestrator.getAttemptBucket(1)).toBe('second');
    });

    it('should return "fallback" for attempt 2+', () => {
      expect(orchestrator.getAttemptBucket(2)).toBe('fallback');
      expect(orchestrator.getAttemptBucket(3)).toBe('fallback');
      expect(orchestrator.getAttemptBucket(10)).toBe('fallback');
    });
  });

  describe('getRetryStrategy', () => {
    it('should return correct strategy for each attempt', () => {
      expect(orchestrator.getRetryStrategy(0)).toBe('clarify');
      expect(orchestrator.getRetryStrategy(1)).toBe('simplify');
      expect(orchestrator.getRetryStrategy(2)).toBe('fallback');
    });
  });

  describe('custom max attempts', () => {
    it('should respect custom max attempts', () => {
      const customOrchestrator = new RetryOrchestrator({ maxAttempts: 2 });
      
      expect(customOrchestrator.shouldRetry(0)).toBe(true);
      expect(customOrchestrator.shouldRetry(1)).toBe(true);
      expect(customOrchestrator.shouldRetry(2)).toBe(false);
    });
  });
});
