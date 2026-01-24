/**
 * Validation Utilities Tests
 * 
 * 🔒 PHASE 1 CONSTRAINT: Test validation rejection only. No business logic.
 */

import { describe, it, expect } from 'vitest';
import {
  validateUUID,
  validateEnum,
  validatePositiveInt,
  validateStringLength,
  validateIdempotencyKey,
  validateRequiredFields,
  validateRange,
} from '../../src/controller/validation.js';
import { ValidationError } from '../../src/domain/errors.js';

describe('Validation Utilities', () => {
  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(() => validateUUID('550e8400-e29b-41d4-a716-446655440000', 'incidentId')).not.toThrow();
      expect(() => validateUUID('123e4567-e89b-12d3-a456-426614174000', 'incidentId')).not.toThrow();
    });

    it('should reject invalid UUID format', () => {
      expect(() => validateUUID('not-a-uuid', 'incidentId')).toThrow(ValidationError);
      expect(() => validateUUID('123', 'incidentId')).toThrow(ValidationError);
      expect(() => validateUUID('550e8400-e29b-41d4-a716', 'incidentId')).toThrow(ValidationError);
    });

    it('should reject empty string', () => {
      expect(() => validateUUID('', 'incidentId')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      try {
        validateUUID('invalid', 'testField');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('testField');
      }
    });
  });

  describe('validateEnum', () => {
    const validStates = ['CREATED', 'ANALYZING', 'DECIDED'] as const;

    it('should accept valid enum values', () => {
      expect(() => validateEnum('CREATED', validStates, 'state')).not.toThrow();
      expect(() => validateEnum('ANALYZING', validStates, 'state')).not.toThrow();
      expect(() => validateEnum('DECIDED', validStates, 'state')).not.toThrow();
    });

    it('should reject invalid enum values', () => {
      expect(() => validateEnum('INVALID', validStates, 'state')).toThrow(ValidationError);
      expect(() => validateEnum('created', validStates, 'state')).toThrow(ValidationError); // case sensitive
    });

    it('should reject empty string', () => {
      expect(() => validateEnum('', validStates, 'state')).toThrow(ValidationError);
    });

    it('should include allowed values in error', () => {
      try {
        validateEnum('INVALID', validStates, 'state');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('CREATED');
        expect((error as ValidationError).message).toContain('ANALYZING');
        expect((error as ValidationError).message).toContain('DECIDED');
      }
    });
  });

  describe('validatePositiveInt', () => {
    it('should accept valid positive integers', () => {
      expect(validatePositiveInt('1', 'limit')).toBe(1);
      expect(validatePositiveInt('100', 'limit')).toBe(100);
      expect(validatePositiveInt('999999', 'limit')).toBe(999999);
    });

    it('should reject zero', () => {
      expect(() => validatePositiveInt('0', 'limit')).toThrow(ValidationError);
    });

    it('should reject negative numbers', () => {
      expect(() => validatePositiveInt('-1', 'limit')).toThrow(ValidationError);
      expect(() => validatePositiveInt('-100', 'limit')).toThrow(ValidationError);
    });

    it('should reject non-numeric strings', () => {
      expect(() => validatePositiveInt('abc', 'limit')).toThrow(ValidationError);
      expect(() => validatePositiveInt('12.34', 'limit')).toThrow(ValidationError);
    });

    it('should reject decimal numbers', () => {
      expect(() => validatePositiveInt('1.5', 'limit')).toThrow(ValidationError);
    });

    it('should reject empty string', () => {
      expect(() => validatePositiveInt('', 'limit')).toThrow(ValidationError);
    });
  });

  describe('validateStringLength', () => {
    it('should accept valid string lengths', () => {
      expect(() => validateStringLength('hello', 1, 10, 'title')).not.toThrow();
      expect(() => validateStringLength('a', 1, 10, 'title')).not.toThrow();
      expect(() => validateStringLength('1234567890', 1, 10, 'title')).not.toThrow();
    });

    it('should reject strings that are too short', () => {
      expect(() => validateStringLength('', 1, 10, 'title')).toThrow(ValidationError);
      expect(() => validateStringLength('ab', 3, 10, 'title')).toThrow(ValidationError);
    });

    it('should reject strings that are too long', () => {
      expect(() => validateStringLength('12345678901', 1, 10, 'title')).toThrow(ValidationError);
    });

    it('should reject null or undefined', () => {
      expect(() => validateStringLength(null as any, 1, 10, 'title')).toThrow(ValidationError);
      expect(() => validateStringLength(undefined as any, 1, 10, 'title')).toThrow(ValidationError);
    });

    it('should include expected range in error', () => {
      try {
        validateStringLength('', 5, 10, 'title');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('5');
      }
    });
  });

  describe('validateIdempotencyKey', () => {
    it('should accept valid UUID', () => {
      expect(() => validateIdempotencyKey('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('should accept valid SHA-256 hex (64 characters)', () => {
      expect(() => validateIdempotencyKey('a'.repeat(64))).not.toThrow();
      expect(() => validateIdempotencyKey('0123456789abcdef'.repeat(4))).not.toThrow();
    });

    it('should reject invalid formats', () => {
      expect(() => validateIdempotencyKey('not-valid')).toThrow(ValidationError);
      expect(() => validateIdempotencyKey('123')).toThrow(ValidationError);
    });

    it('should reject SHA-256 hex with wrong length', () => {
      expect(() => validateIdempotencyKey('a'.repeat(63))).toThrow(ValidationError); // too short
      expect(() => validateIdempotencyKey('a'.repeat(65))).toThrow(ValidationError); // too long
    });

    it('should reject empty string', () => {
      expect(() => validateIdempotencyKey('')).toThrow(ValidationError);
    });
  });

  describe('validateRequiredFields', () => {
    it('should accept object with all required fields', () => {
      const obj = { name: 'test', age: 25, email: 'test@example.com' };
      expect(() => validateRequiredFields(obj, ['name', 'age', 'email'])).not.toThrow();
    });

    it('should reject object with missing fields', () => {
      const obj = { name: 'test' };
      expect(() => validateRequiredFields(obj, ['name', 'age'])).toThrow(ValidationError);
    });

    it('should reject object with null fields', () => {
      const obj = { name: 'test', age: null };
      expect(() => validateRequiredFields(obj, ['name', 'age'])).toThrow(ValidationError);
    });

    it('should reject object with undefined fields', () => {
      const obj = { name: 'test', age: undefined };
      expect(() => validateRequiredFields(obj, ['name', 'age'])).toThrow(ValidationError);
    });

    it('should reject object with empty string fields', () => {
      const obj = { name: 'test', age: '' };
      expect(() => validateRequiredFields(obj, ['name', 'age'])).toThrow(ValidationError);
    });

    it('should include missing field names in error', () => {
      const obj = { name: 'test' };
      try {
        validateRequiredFields(obj, ['name', 'age', 'email']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('age');
        expect((error as ValidationError).message).toContain('email');
      }
    });
  });

  describe('validateRange', () => {
    it('should accept values within range', () => {
      expect(() => validateRange(5, 1, 10, 'limit')).not.toThrow();
      expect(() => validateRange(1, 1, 10, 'limit')).not.toThrow();
      expect(() => validateRange(10, 1, 10, 'limit')).not.toThrow();
    });

    it('should reject values below minimum', () => {
      expect(() => validateRange(0, 1, 10, 'limit')).toThrow(ValidationError);
      expect(() => validateRange(-5, 1, 10, 'limit')).toThrow(ValidationError);
    });

    it('should reject values above maximum', () => {
      expect(() => validateRange(11, 1, 10, 'limit')).toThrow(ValidationError);
      expect(() => validateRange(100, 1, 10, 'limit')).toThrow(ValidationError);
    });

    it('should include expected range in error', () => {
      try {
        validateRange(100, 1, 10, 'limit');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('1');
        expect((error as ValidationError).message).toContain('10');
      }
    });
  });
});
