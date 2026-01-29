import { describe, it, expect } from 'vitest';
import { BusinessValidator } from '../../src/validation/business-validator';

describe('BusinessValidator', () => {
  let validator: BusinessValidator;

  beforeEach(() => {
    validator = new BusinessValidator();
  });

  describe('validateConfidence', () => {
    it('should accept valid confidence values', () => {
      expect(validator.validateConfidence(0).ok).toBe(true);
      expect(validator.validateConfidence(0.5).ok).toBe(true);
      expect(validator.validateConfidence(1).ok).toBe(true);
    });

    it('should reject confidence < 0', () => {
      const result = validator.validateConfidence(-0.1);
      
      expect(result.ok).toBe(false);
      expect(result.error?.layer).toBe('business');
      expect(result.error?.message).toContain('between 0 and 1');
    });

    it('should reject confidence > 1', () => {
      const result = validator.validateConfidence(1.1);
      
      expect(result.ok).toBe(false);
      expect(result.error?.layer).toBe('business');
    });
  });

  describe('validateReasoning', () => {
    it('should accept valid reasoning', () => {
      const result = validator.validateReasoning('This is a valid reasoning with sufficient length');
      
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject empty reasoning', () => {
      const result = validator.validateReasoning('');
      
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('cannot be empty');
    });

    it('should reject reasoning that is too short', () => {
      const result = validator.validateReasoning('Too short');
      
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('at least 10 characters');
    });

    it('should trim whitespace before validation', () => {
      const result = validator.validateReasoning('   ');
      
      expect(result.ok).toBe(false);
    });
  });

  describe('validateCitations', () => {
    it('should accept valid citations', () => {
      const citations = [
        { source: 'doc1.md', content: 'Some content' },
        { source: 'doc2.md', content: 'More content' },
      ];

      const result = validator.validateCitations(citations);
      
      expect(result.ok).toBe(true);
    });

    it('should reject citations with empty source', () => {
      const citations = [
        { source: '', content: 'Some content' },
      ];

      const result = validator.validateCitations(citations);
      
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('source cannot be empty');
    });

    it('should reject citations with empty content', () => {
      const citations = [
        { source: 'doc1.md', content: '' },
      ];

      const result = validator.validateCitations(citations);
      
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('content cannot be empty');
    });

    it('should accept empty citations array', () => {
      const result = validator.validateCitations([]);
      
      expect(result.ok).toBe(true);
    });
  });

  describe('validateAgentOutput', () => {
    it('should accept valid agent output', () => {
      const output = {
        confidence: 0.8,
        reasoning: 'This is a valid reasoning with sufficient detail',
        citations: [
          { source: 'doc1.md', content: 'Supporting evidence' },
        ],
      };

      const result = validator.validateAgentOutput(output);
      
      expect(result.ok).toBe(true);
    });

    it('should reject output with invalid confidence', () => {
      const output = {
        confidence: 1.5,
        reasoning: 'Valid reasoning',
      };

      const result = validator.validateAgentOutput(output);
      
      expect(result.ok).toBe(false);
      expect(result.error?.layer).toBe('business');
    });

    it('should reject output with invalid reasoning', () => {
      const output = {
        confidence: 0.8,
        reasoning: 'Short',
      };

      const result = validator.validateAgentOutput(output);
      
      expect(result.ok).toBe(false);
    });

    it('should reject output with invalid citations', () => {
      const output = {
        confidence: 0.8,
        reasoning: 'Valid reasoning',
        citations: [
          { source: '', content: 'Invalid citation' },
        ],
      };

      const result = validator.validateAgentOutput(output);
      
      expect(result.ok).toBe(false);
    });

    it('should accept output with optional fields missing', () => {
      const output = {};

      const result = validator.validateAgentOutput(output);
      
      expect(result.ok).toBe(true);
    });
  });
});
