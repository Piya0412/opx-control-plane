/**
 * Correlation Rule Schema Tests
 * 
 * Phase 2.2: Signal Correlation
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 */

import { describe, it, expect } from 'vitest';
import {
  validateCorrelationRule,
  computeGroupKey,
  normalizeGroupKey,
  signalMatchesRule,
  parseDuration,
  computeWindowBoundaries,
  type CorrelationRule,
} from '../../src/correlation/correlation-rule.schema.js';

describe('Correlation Rule Schema', () => {
  const validRule: CorrelationRule = {
    ruleId: 'rule-lambda-high-error',
    ruleName: 'Lambda High Error Rate',
    ruleVersion: '1.0.0',
    filters: {
      source: ['CLOUDWATCH_ALARM'],
      signalType: ['ALARM_STATE_CHANGE'],
      service: ['lambda'],
      severity: ['SEV2'],
    },
    timeWindow: {
      duration: 'PT5M',
      alignment: 'fixed',
    },
    groupBy: {
      service: true,
      severity: true,
      identityWindow: false,
    },
    threshold: {
      minSignals: 2,
      maxSignals: 10,
    },
    candidateTemplate: {
      title: 'Lambda service experiencing high error rate',
      description: '{{signalCount}} alarms detected for lambda service',
      tags: ['auto-correlated', 'lambda'],
    },
    createdAt: '2026-01-17T00:00:00Z',
    createdBy: 'system',
    enabled: true,
  };

  describe('validateCorrelationRule', () => {
    it('should validate valid rule', () => {
      const result = validateCorrelationRule(validRule);
      expect(result).toEqual(validRule);
    });

    it('should reject invalid ruleId format', () => {
      const invalidRule = { ...validRule, ruleId: 'InvalidRuleId' };
      expect(() => validateCorrelationRule(invalidRule)).toThrow();
    });

    it('should reject invalid ruleVersion format', () => {
      const invalidRule = { ...validRule, ruleVersion: '1.0' };
      expect(() => validateCorrelationRule(invalidRule)).toThrow();
    });

    it('should reject invalid duration format', () => {
      const invalidRule = {
        ...validRule,
        timeWindow: { duration: '5M', alignment: 'fixed' as const },
      };
      expect(() => validateCorrelationRule(invalidRule)).toThrow();
    });

    it('should reject maxSignals < minSignals', () => {
      const invalidRule = {
        ...validRule,
        threshold: { minSignals: 5, maxSignals: 3 },
      };
      expect(() => validateCorrelationRule(invalidRule)).toThrow();
    });

    it('should accept rule without optional fields', () => {
      const minimalRule = {
        ruleId: 'rule-minimal',
        ruleName: 'Minimal Rule',
        ruleVersion: '1.0.0',
        filters: {},
        timeWindow: { duration: 'PT5M', alignment: 'fixed' as const },
        groupBy: { service: true, severity: true, identityWindow: false },
        threshold: { minSignals: 1 },
        candidateTemplate: {
          title: 'Test',
          description: 'Test description',
        },
        createdAt: '2026-01-17T00:00:00Z',
        createdBy: 'system',
        enabled: true,
      };

      const result = validateCorrelationRule(minimalRule);
      expect(result.ruleId).toBe('rule-minimal');
    });
  });

  describe('computeGroupKey', () => {
    const signal = {
      service: 'lambda',
      severity: 'SEV2',
      identityWindow: '2026-01-17T10:23Z',
    };

    it('should compute group key with all dimensions', () => {
      const rule = {
        ...validRule,
        groupBy: { service: true, severity: true, identityWindow: true },
      };

      const groupKey = computeGroupKey(signal, rule);

      expect(groupKey).toEqual({
        service: 'lambda',
        severity: 'SEV2',
        identityWindow: '2026-01-17T10:23Z',
      });
    });

    it('should compute group key with service only', () => {
      const rule = {
        ...validRule,
        groupBy: { service: true, severity: false, identityWindow: false },
      };

      const groupKey = computeGroupKey(signal, rule);

      expect(groupKey).toEqual({
        service: 'lambda',
      });
    });

    it('should compute empty group key', () => {
      const rule = {
        ...validRule,
        groupBy: { service: false, severity: false, identityWindow: false },
      };

      const groupKey = computeGroupKey(signal, rule);

      expect(groupKey).toEqual({});
    });
  });

  describe('normalizeGroupKey', () => {
    it('should normalize group key deterministically', () => {
      const groupKey1 = { service: 'lambda', severity: 'SEV2' };
      const groupKey2 = { severity: 'SEV2', service: 'lambda' }; // Different order

      const normalized1 = normalizeGroupKey(groupKey1);
      const normalized2 = normalizeGroupKey(groupKey2);

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe('service=lambda&severity=SEV2');
    });

    it('should handle empty group key', () => {
      const groupKey = {};
      const normalized = normalizeGroupKey(groupKey);
      expect(normalized).toBe('');
    });

    it('should handle single key', () => {
      const groupKey = { service: 'lambda' };
      const normalized = normalizeGroupKey(groupKey);
      expect(normalized).toBe('service=lambda');
    });
  });

  describe('signalMatchesRule', () => {
    const signal = {
      source: 'CLOUDWATCH_ALARM',
      signalType: 'ALARM_STATE_CHANGE',
      service: 'lambda',
      severity: 'SEV2',
    };

    it('should match signal with all filters', () => {
      const matches = signalMatchesRule(signal, validRule);
      expect(matches).toBe(true);
    });

    it('should reject signal with wrong source', () => {
      const wrongSignal = { ...signal, source: 'CUSTOM_API' };
      const matches = signalMatchesRule(wrongSignal, validRule);
      expect(matches).toBe(false);
    });

    it('should reject signal with wrong signalType', () => {
      const wrongSignal = { ...signal, signalType: 'METRIC_BREACH' };
      const matches = signalMatchesRule(wrongSignal, validRule);
      expect(matches).toBe(false);
    });

    it('should reject signal with wrong service', () => {
      const wrongSignal = { ...signal, service: 'dynamodb' };
      const matches = signalMatchesRule(wrongSignal, validRule);
      expect(matches).toBe(false);
    });

    it('should reject signal with wrong severity', () => {
      const wrongSignal = { ...signal, severity: 'SEV1' };
      const matches = signalMatchesRule(wrongSignal, validRule);
      expect(matches).toBe(false);
    });

    it('should match signal with no filters', () => {
      const noFilterRule = { ...validRule, filters: {} };
      const matches = signalMatchesRule(signal, noFilterRule);
      expect(matches).toBe(true);
    });

    it('should match signal with multiple values in filter', () => {
      const multiFilterRule = {
        ...validRule,
        filters: {
          ...validRule.filters,
          service: ['lambda', 'dynamodb'],
        },
      };

      const matches = signalMatchesRule(signal, multiFilterRule);
      expect(matches).toBe(true);
    });
  });

  describe('parseDuration', () => {
    it('should parse seconds', () => {
      expect(parseDuration('PT30S')).toBe(30 * 1000);
    });

    it('should parse minutes', () => {
      expect(parseDuration('PT5M')).toBe(5 * 60 * 1000);
    });

    it('should parse hours', () => {
      expect(parseDuration('PT2H')).toBe(2 * 60 * 60 * 1000);
    });

    it('should reject invalid format', () => {
      expect(() => parseDuration('5M')).toThrow();
      expect(() => parseDuration('PT5')).toThrow();
      expect(() => parseDuration('PT5D')).toThrow();
    });
  });

  describe('computeWindowBoundaries', () => {
    describe('fixed windows', () => {
      const timeWindow = { duration: 'PT5M', alignment: 'fixed' as const };

      it('should align to 5-minute boundaries', () => {
        const observedAt = '2026-01-17T10:23:45.123Z';
        const { start, end } = computeWindowBoundaries(observedAt, timeWindow);

        expect(start).toBe('2026-01-17T10:20:00.000Z');
        expect(end).toBe('2026-01-17T10:25:00.000Z');
      });

      it('should handle exact boundary', () => {
        const observedAt = '2026-01-17T10:25:00.000Z';
        const { start, end } = computeWindowBoundaries(observedAt, timeWindow);

        expect(start).toBe('2026-01-17T10:25:00.000Z');
        expect(end).toBe('2026-01-17T10:30:00.000Z');
      });

      it('should handle different durations', () => {
        const observedAt = '2026-01-17T10:23:45.123Z';

        // 1 minute
        const window1M = { duration: 'PT1M', alignment: 'fixed' as const };
        const result1M = computeWindowBoundaries(observedAt, window1M);
        expect(result1M.start).toBe('2026-01-17T10:23:00.000Z');
        expect(result1M.end).toBe('2026-01-17T10:24:00.000Z');

        // 15 minutes
        const window15M = { duration: 'PT15M', alignment: 'fixed' as const };
        const result15M = computeWindowBoundaries(observedAt, window15M);
        expect(result15M.start).toBe('2026-01-17T10:15:00.000Z');
        expect(result15M.end).toBe('2026-01-17T10:30:00.000Z');
      });
    });

    describe('sliding windows', () => {
      const timeWindow = { duration: 'PT5M', alignment: 'sliding' as const };

      it('should anchor on observedAt', () => {
        const observedAt = '2026-01-17T10:23:45.123Z';
        const { start, end } = computeWindowBoundaries(observedAt, timeWindow);

        expect(end).toBe('2026-01-17T10:23:45.123Z');
        expect(start).toBe('2026-01-17T10:18:45.123Z');
      });

      it('should preserve milliseconds', () => {
        const observedAt = '2026-01-17T10:23:45.999Z';
        const { start, end } = computeWindowBoundaries(observedAt, timeWindow);

        expect(end).toBe('2026-01-17T10:23:45.999Z');
        expect(start).toBe('2026-01-17T10:18:45.999Z');
      });

      it('should handle different durations', () => {
        const observedAt = '2026-01-17T10:23:45.123Z';

        // 1 minute
        const window1M = { duration: 'PT1M', alignment: 'sliding' as const };
        const result1M = computeWindowBoundaries(observedAt, window1M);
        expect(result1M.end).toBe('2026-01-17T10:23:45.123Z');
        expect(result1M.start).toBe('2026-01-17T10:22:45.123Z');

        // 1 hour
        const window1H = { duration: 'PT1H', alignment: 'sliding' as const };
        const result1H = computeWindowBoundaries(observedAt, window1H);
        expect(result1H.end).toBe('2026-01-17T10:23:45.123Z');
        expect(result1H.start).toBe('2026-01-17T09:23:45.123Z');
      });
    });

    describe('window boundary semantics', () => {
      it('should use inclusive-start, exclusive-end', () => {
        const timeWindow = { duration: 'PT5M', alignment: 'fixed' as const };
        const observedAt = '2026-01-17T10:23:45.123Z';
        const { start, end } = computeWindowBoundaries(observedAt, timeWindow);

        // Window is [10:20:00, 10:25:00)
        // Signal at 10:20:00.000 is included
        // Signal at 10:24:59.999 is included
        // Signal at 10:25:00.000 is excluded (next window)

        expect(start).toBe('2026-01-17T10:20:00.000Z');
        expect(end).toBe('2026-01-17T10:25:00.000Z');
      });
    });
  });
});

