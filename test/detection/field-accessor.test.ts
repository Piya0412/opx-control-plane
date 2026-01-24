/**
 * CP-3: Field Accessor Tests
 */

import { describe, it, expect } from 'vitest';
import { getFieldValue, fieldExists } from '../../src/detection/field-accessor.js';

describe('CP-3: Field Accessor', () => {
  describe('getFieldValue', () => {
    it('should access simple property', () => {
      const obj = { severity: 'HIGH' };
      expect(getFieldValue(obj, 'severity')).toBe('HIGH');
    });

    it('should access nested property', () => {
      const obj = { metadata: { tags: { environment: 'prod' } } };
      expect(getFieldValue(obj, 'metadata.tags.environment')).toBe('prod');
    });

    it('should access array element', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(getFieldValue(obj, 'items[0]')).toBe('a');
      expect(getFieldValue(obj, 'items[1]')).toBe('b');
      expect(getFieldValue(obj, 'items[2]')).toBe('c');
    });

    it('should access nested array element property', () => {
      const obj = {
        resourceRefs: [
          { refType: 'aws-arn', refValue: 'arn:aws:...' },
          { refType: 'name', refValue: 'my-resource' },
        ],
      };
      expect(getFieldValue(obj, 'resourceRefs[0].refValue')).toBe('arn:aws:...');
      expect(getFieldValue(obj, 'resourceRefs[1].refType')).toBe('name');
    });

    it('should return undefined for missing property', () => {
      const obj = { severity: 'HIGH' };
      expect(getFieldValue(obj, 'missing')).toBeUndefined();
    });

    it('should return undefined for missing nested property', () => {
      const obj = { metadata: {} };
      expect(getFieldValue(obj, 'metadata.tags.environment')).toBeUndefined();
    });

    it('should return undefined for out-of-bounds array index', () => {
      const obj = { items: ['a', 'b'] };
      expect(getFieldValue(obj, 'items[5]')).toBeUndefined();
    });

    it('should return undefined for null object', () => {
      expect(getFieldValue(null, 'severity')).toBeUndefined();
    });

    it('should return undefined for undefined object', () => {
      expect(getFieldValue(undefined, 'severity')).toBeUndefined();
    });

    it('should return undefined when accessing array on non-array', () => {
      const obj = { items: 'not-an-array' };
      expect(getFieldValue(obj, 'items[0]')).toBeUndefined();
    });
  });

  describe('fieldExists', () => {
    it('should return true for existing field', () => {
      const obj = { severity: 'HIGH' };
      expect(fieldExists(obj, 'severity')).toBe(true);
    });

    it('should return false for missing field', () => {
      const obj = { severity: 'HIGH' };
      expect(fieldExists(obj, 'missing')).toBe(false);
    });

    it('should return true for null value (field exists but is null)', () => {
      const obj = { value: null };
      // fieldExists returns true because the field exists (even if null)
      // The 'exists' operator in rule-evaluator has different semantics
      expect(fieldExists(obj, 'value')).toBe(true);
    });

    it('should return true for falsy values', () => {
      const obj = { zero: 0, empty: '', falsy: false };
      expect(fieldExists(obj, 'zero')).toBe(true);
      expect(fieldExists(obj, 'empty')).toBe(true);
      expect(fieldExists(obj, 'falsy')).toBe(true);
    });
  });
});
