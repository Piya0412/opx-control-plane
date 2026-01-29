import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SchemaValidator } from '../../src/validation/schema-validator';

describe('SchemaValidator', () => {
  const TestSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  });

  describe('validate', () => {
    it('should return ok: true for valid data', () => {
      const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const result = SchemaValidator.validate(TestSchema, data);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
    });

    it('should return ok: false for invalid data', () => {
      const data = {
        name: 'John Doe',
        age: 'thirty', // Invalid: should be number
        email: 'john@example.com',
      };

      const result = SchemaValidator.validate(TestSchema, data);

      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error?.layer).toBe('schema');
    });

    it('should return ok: false for missing required fields', () => {
      const data = {
        name: 'John Doe',
        // Missing age and email
      };

      const result = SchemaValidator.validate(TestSchema, data);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should never throw exceptions', () => {
      const invalidData = null;

      expect(() => {
        SchemaValidator.validate(TestSchema, invalidData);
      }).not.toThrow();
    });

    it('should handle malformed data gracefully', () => {
      const malformed = { completely: 'wrong', structure: true };

      const result = SchemaValidator.validate(TestSchema, malformed);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getErrorSummary', () => {
    it('should return human-readable error summary', () => {
      const data = { name: 'John', age: 'thirty', email: 'invalid' };
      const parseResult = TestSchema.safeParse(data);

      if (!parseResult.success) {
        const summary = SchemaValidator.getErrorSummary(parseResult.error);
        
        expect(summary).toContain('age');
        expect(summary).toContain('email');
      }
    });
  });

  describe('getSimplifiedMessage', () => {
    it('should return simplified message for single error', () => {
      const data = { name: 'John', age: 30, email: 'invalid' };
      const parseResult = TestSchema.safeParse(data);

      if (!parseResult.success) {
        const message = SchemaValidator.getSimplifiedMessage(parseResult.error);
        
        expect(message).toContain('email');
      }
    });

    it('should return count for multiple errors', () => {
      const data = { name: 123, age: 'thirty', email: 'invalid' };
      const parseResult = TestSchema.safeParse(data);

      if (!parseResult.success) {
        const message = SchemaValidator.getSimplifiedMessage(parseResult.error);
        
        expect(message).toMatch(/\d+ validation errors found/);
      }
    });
  });
});
