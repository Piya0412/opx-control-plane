/**
 * CP-5: Correlation Rule Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CorrelationRuleSchema,
  CorrelationMatcherSchema,
  parseCorrelationRule,
} from '../../src/candidate/correlation-rule.schema.js';
import {
  InMemoryCorrelationRuleLoader,
  FileCorrelationRuleLoader,
} from '../../src/candidate/correlation-rule-loader.js';

describe('CP-5: Correlation Rule Schema', () => {
  describe('CorrelationMatcherSchema', () => {
    it('should accept valid matcher with required fields', () => {
      const valid = {
        windowMinutes: 60,
        windowTruncation: 'hour',
      };
      expect(CorrelationMatcherSchema.parse(valid)).toMatchObject(valid);
    });

    it('should reject missing windowMinutes (HARDENING #3)', () => {
      const invalid = {
        windowTruncation: 'hour',
      };
      expect(() => CorrelationMatcherSchema.parse(invalid)).toThrow();
    });

    it('should reject missing windowTruncation (HARDENING #3)', () => {
      const invalid = {
        windowMinutes: 60,
      };
      expect(() => CorrelationMatcherSchema.parse(invalid)).toThrow();
    });

    it('should enforce max 1440 minutes (24 hours)', () => {
      const invalid = {
        windowMinutes: 1441,
        windowTruncation: 'hour',
      };
      expect(() => CorrelationMatcherSchema.parse(invalid)).toThrow();
    });

    it('should accept all optional matcher fields', () => {
      const valid = {
        sameService: true,
        sameSource: true,
        sameRuleId: true,
        signalTypes: ['error', 'warning'],
        severities: ['SEV1', 'SEV2'],
        windowMinutes: 30,
        windowTruncation: 'minute',
        minDetections: 2,
        maxDetections: 50,
      };
      expect(CorrelationMatcherSchema.parse(valid)).toMatchObject(valid);
    });

    it('should reject unknown fields (strict)', () => {
      const invalid = {
        windowMinutes: 60,
        windowTruncation: 'hour',
        unknownField: true,
      };
      expect(() => CorrelationMatcherSchema.parse(invalid)).toThrow();
    });
  });

  describe('CorrelationRuleSchema', () => {
    const validRule = {
      id: 'service-cascade',
      version: '1.0.0',
      description: 'Correlate detections from same service',
      matcher: {
        sameService: true,
        windowMinutes: 60,
        windowTruncation: 'hour',
      },
      keyFields: ['service', 'windowTruncated'],
      primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
    };

    it('should accept valid rule', () => {
      expect(CorrelationRuleSchema.parse(validRule)).toMatchObject(validRule);
    });

    it('should reject invalid ID format', () => {
      const invalid = { ...validRule, id: 'Invalid-ID' };
      expect(() => CorrelationRuleSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid version format', () => {
      const invalid = { ...validRule, version: 'v1' };
      expect(() => CorrelationRuleSchema.parse(invalid)).toThrow();
    });

    it('should require at least one keyField', () => {
      const invalid = { ...validRule, keyFields: [] };
      expect(() => CorrelationRuleSchema.parse(invalid)).toThrow();
    });

    it('should accept optional confidenceBoost', () => {
      const withBoost = {
        ...validRule,
        confidenceBoost: {
          multipleDetections: 0.2,
          highSeverityRule: 0.3,
        },
      };
      expect(CorrelationRuleSchema.parse(withBoost)).toMatchObject(withBoost);
    });

    it('should reject confidenceBoost values > 0.5', () => {
      const invalid = {
        ...validRule,
        confidenceBoost: {
          multipleDetections: 0.6,
        },
      };
      expect(() => CorrelationRuleSchema.parse(invalid)).toThrow();
    });
  });

  describe('InMemoryCorrelationRuleLoader', () => {
    let loader: InMemoryCorrelationRuleLoader;

    beforeEach(() => {
      loader = new InMemoryCorrelationRuleLoader();
    });

    it('should add and load rules', () => {
      const rule = {
        id: 'test-rule',
        version: '1.0.0',
        description: 'Test rule',
        matcher: {
          windowMinutes: 60,
          windowTruncation: 'hour' as const,
        },
        keyFields: ['windowTruncated' as const],
        primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL' as const,
      };

      loader.addRule(rule);
      const loaded = loader.loadRule('test-rule', '1.0.0');
      expect(loaded).toEqual(rule);
    });

    it('should throw for non-existent rule', () => {
      expect(() => loader.loadRule('non-existent', '1.0.0')).toThrow();
    });

    it('should list all rules', () => {
      loader.addRule({
        id: 'rule-a',
        version: '1.0.0',
        description: 'Rule A',
        matcher: { windowMinutes: 60, windowTruncation: 'hour' },
        keyFields: ['windowTruncated'],
        primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
      });
      loader.addRule({
        id: 'rule-b',
        version: '2.0.0',
        description: 'Rule B',
        matcher: { windowMinutes: 30, windowTruncation: 'minute' },
        keyFields: ['windowTruncated'],
        primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
      });

      const rules = loader.listRules();
      expect(rules).toHaveLength(2);
      expect(rules).toContainEqual({ id: 'rule-a', version: '1.0.0' });
      expect(rules).toContainEqual({ id: 'rule-b', version: '2.0.0' });
    });
  });

  describe('FileCorrelationRuleLoader', () => {
    it('should load rules from correlation-rules directory', () => {
      const loader = new FileCorrelationRuleLoader('examples/correlation-rules');
      const rules = loader.listRules();
      
      // Should find our initial rules
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.id === 'service-cascade')).toBe(true);
    });

    it('should load and validate service-cascade rule', () => {
      const loader = new FileCorrelationRuleLoader('examples/correlation-rules');
      const rule = loader.loadRule('service-cascade', '1.0.0');
      
      expect(rule.id).toBe('service-cascade');
      expect(rule.version).toBe('1.0.0');
      expect(rule.matcher.sameService).toBe(true);
      expect(rule.matcher.windowMinutes).toBe(60);
      expect(rule.matcher.windowTruncation).toBe('hour');
    });

    it('should throw for non-existent rule', () => {
      const loader = new FileCorrelationRuleLoader('correlation-rules');
      expect(() => loader.loadRule('non-existent', '1.0.0')).toThrow();
    });
  });
});
