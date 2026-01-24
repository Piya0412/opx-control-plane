/**
 * CP-3: Rule Evaluator Tests
 */

import { describe, it, expect } from 'vitest';
import { RuleEvaluator } from '../../src/detection/rule-evaluator.js';
import { DetectionRule } from '../../src/detection/rule-schema.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

describe('CP-3: Rule Evaluator', () => {
  const evaluator = new RuleEvaluator();

  const createSignal = (overrides: Partial<NormalizedSignal> = {}): NormalizedSignal => ({
    normalizedSignalId: 'test-signal-123',
    sourceSignalId: 'source-123',
    signalType: 'alarm-test',
    source: 'cloudwatch-alarm',
    severity: 'HIGH',
    confidence: 'DEFINITIVE',
    timestamp: '2026-01-16T10:00:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [{ evidenceType: 'raw-signal', refId: 'source-123', checksum: 'abc123' }],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:00:01.000Z',
    ...overrides,
  });

  const createRule = (overrides: Partial<DetectionRule> = {}): DetectionRule => ({
    ruleId: 'test-rule',
    ruleVersion: '1.0.0',
    name: 'Test Rule',
    description: 'A test rule',
    owner: 'test-team',
    signalMatcher: {},
    conditions: [],
    outputSeverity: 'HIGH',
    outputConfidence: 'DEFINITIVE',
    ...overrides,
  });

  describe('empty conditions (unconditional match)', () => {
    it('should match when conditions are empty', () => {
      const signal = createSignal();
      const rule = createRule({ conditions: [] });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
      expect(result.trace).toHaveLength(1);
      expect(result.trace[0].conditionId).toBe('UNCONDITIONAL');
    });
  });

  describe('equals operator', () => {
    it('should match when values are equal', () => {
      const signal = createSignal({ severity: 'HIGH' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'equals', value: 'HIGH' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
      expect(result.trace[0].result).toBe(true);
    });

    it('should not match when values differ', () => {
      const signal = createSignal({ severity: 'LOW' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'equals', value: 'HIGH' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(false);
      expect(result.trace[0].result).toBe(false);
    });
  });

  describe('not_equals operator', () => {
    it('should match when values differ', () => {
      const signal = createSignal({ severity: 'LOW' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'not_equals', value: 'HIGH' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });
  });

  describe('in operator', () => {
    it('should match when value is in array', () => {
      const signal = createSignal({ severity: 'HIGH' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'in', value: ['HIGH', 'CRITICAL'] },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });

    it('should not match when value is not in array', () => {
      const signal = createSignal({ severity: 'LOW' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'in', value: ['HIGH', 'CRITICAL'] },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('should match when string contains substring', () => {
      const signal = createSignal({ signalType: 'alarm-opx-lambda-error-rate' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'signalType', operator: 'contains', value: 'lambda' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });
  });

  describe('exists operator', () => {
    it('should match when field exists', () => {
      const signal = createSignal({ severity: 'HIGH' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'exists', value: null },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });

    it('should not match when field is missing', () => {
      const signal = createSignal();
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'missingField', operator: 'exists', value: null },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(false);
    });
  });

  describe('not_exists operator', () => {
    it('should match when field is missing', () => {
      const signal = createSignal();
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'missingField', operator: 'not_exists', value: null },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });
  });

  describe('numeric operators', () => {
    it('should handle greater_than', () => {
      const signal = createSignal();
      // Add a numeric field via resourceRefs
      (signal as any).errorRate = 10;

      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'errorRate', operator: 'greater_than', value: 5 },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });

    it('should handle less_than', () => {
      const signal = createSignal();
      (signal as any).errorRate = 3;

      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'errorRate', operator: 'less_than', value: 5 },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });
  });

  describe('matches_regex operator', () => {
    it('should match when regex matches', () => {
      const signal = createSignal({ signalType: 'alarm-opx-lambda-error-rate' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'signalType', operator: 'matches_regex', value: '^alarm-.*' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });

    it('should not match when regex does not match', () => {
      const signal = createSignal({ signalType: 'metric-cpu-usage' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'signalType', operator: 'matches_regex', value: '^alarm-.*' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(false);
    });
  });

  describe('AND logic', () => {
    it('should require all conditions to match', () => {
      const signal = createSignal({ severity: 'HIGH', confidence: 'DEFINITIVE' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'equals', value: 'HIGH' },
          { conditionId: 'c2', field: 'confidence', operator: 'equals', value: 'DEFINITIVE' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
      expect(result.trace).toHaveLength(2);
      expect(result.trace[0].result).toBe(true);
      expect(result.trace[1].result).toBe(true);
    });

    it('should fail if any condition fails', () => {
      const signal = createSignal({ severity: 'HIGH', confidence: 'LOW' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'equals', value: 'HIGH' },
          { conditionId: 'c2', field: 'confidence', operator: 'equals', value: 'DEFINITIVE' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(false);
      expect(result.trace[0].result).toBe(true);
      expect(result.trace[1].result).toBe(false);
    });
  });

  describe('trace generation', () => {
    it('should record all evaluation steps', () => {
      const signal = createSignal({ severity: 'HIGH' });
      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'severity', operator: 'equals', value: 'HIGH' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.trace).toHaveLength(1);
      expect(result.trace[0]).toEqual({
        stepIndex: 0,
        conditionId: 'c1',
        field: 'severity',
        operator: 'equals',
        expected: 'HIGH',
        actual: 'HIGH',
        result: true,
      });
    });

    it('should truncate trace at MAX_TRACE_STEPS', () => {
      const signal = createSignal();
      const conditions = Array.from({ length: 25 }, (_, i) => ({
        conditionId: `c${i}`,
        field: 'severity',
        operator: 'equals' as const,
        value: 'HIGH',
      }));

      const rule = createRule({ conditions });

      const result = evaluator.evaluate(signal, rule);

      // Should have 20 steps + 1 TRUNCATED marker
      expect(result.trace.length).toBeLessThanOrEqual(21);
      expect(result.trace[result.trace.length - 1].conditionId).toBe('TRUNCATED');
    });
  });

  describe('nested field access', () => {
    it('should access array element properties', () => {
      const signal = createSignal({
        resourceRefs: [
          { refType: 'aws-arn', refValue: 'arn:aws:lambda:us-east-1:123:function:test', sourceField: 'tags.arn' },
        ],
      });

      const rule = createRule({
        conditions: [
          { conditionId: 'c1', field: 'resourceRefs[0].refType', operator: 'equals', value: 'aws-arn' },
        ],
      });

      const result = evaluator.evaluate(signal, rule);

      expect(result.matches).toBe(true);
    });
  });
});
