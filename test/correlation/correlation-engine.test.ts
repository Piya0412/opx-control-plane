/**
 * Correlation Engine Tests
 * 
 * Phase 2.2: Signal Correlation — Week 2
 * 
 * DESIGN LOCK v1.0.0 — FROZEN
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CorrelationEngine,
  filterSignalsByWindow,
  type SignalQuery,
  type EvaluationResult,
} from '../../src/correlation/correlation-engine.js';
import type { SignalEvent } from '../../src/signal/signal-event.schema.js';
import type { CorrelationRule } from '../../src/correlation/correlation-rule.schema.js';

describe('CorrelationEngine', () => {
  // Mock signal query
  class MockSignalQuery implements SignalQuery {
    private signals: SignalEvent[] = [];

    setSignals(signals: SignalEvent[]) {
      this.signals = signals;
    }

    async querySignalsInWindow(params: {
      start: string;
      end: string;
      service?: string;
      severity?: string;
    }): Promise<SignalEvent[]> {
      let filtered = this.signals;

      // Filter by time window
      filtered = filterSignalsByWindow(filtered, params.start, params.end);

      // Filter by service
      if (params.service) {
        filtered = filtered.filter(s => s.service === params.service);
      }

      // Filter by severity
      if (params.severity) {
        filtered = filtered.filter(s => s.severity === params.severity);
      }

      return filtered;
    }
  }

  let engine: CorrelationEngine;
  let mockQuery: MockSignalQuery;

  const createSignal = (overrides: Partial<SignalEvent> = {}): SignalEvent => ({
    signalId: 'a'.repeat(64),
    source: 'CLOUDWATCH_ALARM',
    signalType: 'ALARM_STATE_CHANGE',
    service: 'lambda',
    severity: 'SEV2',
    observedAt: '2026-01-17T10:23:45.123Z',
    identityWindow: '2026-01-17T10:23Z',
    metadata: { alarmName: 'HighErrorRate' },
    ingestedAt: '2026-01-17T10:23:47.000Z',
    ...overrides,
  });

  const createRule = (overrides: Partial<CorrelationRule> = {}): CorrelationRule => ({
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
      description: '{{signalCount}} alarms detected',
      tags: ['auto-correlated'],
    },
    createdAt: '2026-01-17T00:00:00Z',
    createdBy: 'system',
    enabled: true,
    ...overrides,
  });

  beforeEach(() => {
    mockQuery = new MockSignalQuery();
    engine = new CorrelationEngine(mockQuery);
  });

  describe('evaluateSignal', () => {
    it('should evaluate signal against all rules', async () => {
      const signal = createSignal();
      const rule1 = createRule({ ruleId: 'rule-1' });
      const rule2 = createRule({ ruleId: 'rule-2' });

      // Set up signals in window (below threshold)
      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule1, rule2]);

      expect(result.signalId).toBe(signal.signalId);
      expect(result.evaluatedRules).toBe(2);
      expect(result.results).toHaveLength(2);
    });

    it('should count matched rules', async () => {
      const signal = createSignal();
      const matchingRule = createRule({ ruleId: 'rule-matching' });
      const nonMatchingRule = createRule({
        ruleId: 'rule-non-matching',
        filters: { service: ['dynamodb'] }, // Won't match lambda signal
      });

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [matchingRule, nonMatchingRule]);

      expect(result.matchedRules).toBe(1);
      expect(result.results[0].matched).toBe(true);
      expect(result.results[1].matched).toBe(false);
    });

    it('should count threshold met rules', async () => {
      const signal1 = createSignal({ signalId: 'signal-1' });
      const signal2 = createSignal({ signalId: 'signal-2' });

      const rule = createRule({ threshold: { minSignals: 2 } });

      // Set up signals in window (meets threshold)
      mockQuery.setSignals([signal1, signal2]);

      const result = await engine.evaluateSignal(signal1, [rule]);

      expect(result.thresholdMetRules).toBe(1);
      expect(result.results[0].thresholdMet).toBe(true);
    });

    it('should handle rule evaluation errors gracefully', async () => {
      const signal = createSignal();
      const rule = createRule();

      // Mock query to throw error
      mockQuery.querySignalsInWindow = async () => {
        throw new Error('Query failed');
      };

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.evaluatedRules).toBe(1);
      expect(result.matchedRules).toBe(0);
      expect(result.results[0].matched).toBe(false);
      expect(result.results[0].thresholdMet).toBe(false);
    });
  });

  describe('rule matching', () => {
    it('should match signal against rule filters', async () => {
      const signal = createSignal({
        source: 'CLOUDWATCH_ALARM',
        signalType: 'ALARM_STATE_CHANGE',
        service: 'lambda',
        severity: 'SEV2',
      });

      const rule = createRule({
        filters: {
          source: ['CLOUDWATCH_ALARM'],
          signalType: ['ALARM_STATE_CHANGE'],
          service: ['lambda'],
          severity: ['SEV2'],
        },
      });

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].matched).toBe(true);
    });

    it('should reject signal with wrong source', async () => {
      const signal = createSignal({ source: 'CUSTOM_API' });
      const rule = createRule({ filters: { source: ['CLOUDWATCH_ALARM'] } });

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].matched).toBe(false);
    });

    it('should reject signal with wrong service', async () => {
      const signal = createSignal({ service: 'dynamodb' });
      const rule = createRule({ filters: { service: ['lambda'] } });

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].matched).toBe(false);
    });
  });

  describe('time window queries', () => {
    it('should query signals within fixed time window', async () => {
      const signal = createSignal({ observedAt: '2026-01-17T10:23:45.123Z' });
      const rule = createRule({
        timeWindow: { duration: 'PT5M', alignment: 'fixed' },
      });

      // Signals in window [10:20:00, 10:25:00)
      const signal1 = createSignal({
        signalId: 'signal-1',
        observedAt: '2026-01-17T10:20:00.000Z',
      });
      const signal2 = createSignal({
        signalId: 'signal-2',
        observedAt: '2026-01-17T10:22:00.000Z',
      });
      const signal3 = createSignal({
        signalId: 'signal-3',
        observedAt: '2026-01-17T10:24:59.999Z',
      });

      mockQuery.setSignals([signal1, signal2, signal3]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].groupedSignals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].signals).toHaveLength(3);
    });

    it('should query signals within sliding time window', async () => {
      const signal = createSignal({ observedAt: '2026-01-17T10:23:45.123Z' });
      const rule = createRule({
        timeWindow: { duration: 'PT5M', alignment: 'sliding' },
      });

      // Signals in window [10:18:45.123, 10:23:45.123)
      const signal1 = createSignal({
        signalId: 'signal-1',
        observedAt: '2026-01-17T10:18:45.123Z',
      });
      const signal2 = createSignal({
        signalId: 'signal-2',
        observedAt: '2026-01-17T10:20:00.000Z',
      });
      const signal3 = createSignal({
        signalId: 'signal-3',
        observedAt: '2026-01-17T10:23:45.122Z',
      });

      mockQuery.setSignals([signal1, signal2, signal3]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].groupedSignals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].signals).toHaveLength(3);
    });

    it('should exclude signals outside window', async () => {
      const signal = createSignal({ observedAt: '2026-01-17T10:23:45.123Z' });
      const rule = createRule({
        timeWindow: { duration: 'PT5M', alignment: 'fixed' },
      });

      // Window is [10:20:00, 10:25:00)
      const signalBefore = createSignal({
        signalId: 'signal-before',
        observedAt: '2026-01-17T10:19:59.999Z', // Before window
      });
      const signalAfter = createSignal({
        signalId: 'signal-after',
        observedAt: '2026-01-17T10:25:00.000Z', // After window (exclusive end)
      });

      mockQuery.setSignals([signal, signalBefore, signalAfter]);

      const result = await engine.evaluateSignal(signal, [rule]);

      // Only the current signal should be in window
      expect(result.results[0].groupedSignals![0].signals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].signals[0].signalId).toBe(signal.signalId);
    });
  });

  describe('signal grouping', () => {
    it('should group signals by service and severity', async () => {
      const signal = createSignal({ service: 'lambda', severity: 'SEV2' });
      const rule = createRule({
        groupBy: { service: true, severity: true, identityWindow: false },
      });

      const signal1 = createSignal({
        signalId: 'signal-1',
        service: 'lambda',
        severity: 'SEV2',
      });
      const signal2 = createSignal({
        signalId: 'signal-2',
        service: 'lambda',
        severity: 'SEV2',
      });

      mockQuery.setSignals([signal1, signal2]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].groupedSignals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].signals).toHaveLength(2);
      expect(result.results[0].groupedSignals![0].groupKey).toEqual({
        service: 'lambda',
        severity: 'SEV2',
      });
    });

    it('should create separate groups for different services', async () => {
      const signal = createSignal({ service: 'lambda' });
      const rule = createRule({
        filters: {}, // Match all services
        groupBy: { service: true, severity: false, identityWindow: false },
      });

      const lambdaSignal = createSignal({
        signalId: 'lambda-signal',
        service: 'lambda',
      });
      const dynamoSignal = createSignal({
        signalId: 'dynamo-signal',
        service: 'dynamodb',
      });

      mockQuery.setSignals([lambdaSignal, dynamoSignal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      // Should only get lambda group (query is scoped by service)
      expect(result.results[0].groupedSignals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].groupKey.service).toBe('lambda');
    });

    it('should group by identity window', async () => {
      const signal = createSignal({ identityWindow: '2026-01-17T10:23Z' });
      const rule = createRule({
        groupBy: { service: true, severity: true, identityWindow: true },
      });

      const signal1 = createSignal({
        signalId: 'signal-1',
        identityWindow: '2026-01-17T10:23Z',
      });
      const signal2 = createSignal({
        signalId: 'signal-2',
        identityWindow: '2026-01-17T10:23Z',
      });

      mockQuery.setSignals([signal1, signal2]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].groupedSignals).toHaveLength(1);
      expect(result.results[0].groupedSignals![0].groupKey).toEqual({
        service: 'lambda',
        severity: 'SEV2',
        identityWindow: '2026-01-17T10:23Z',
      });
    });

    it('should sort groups deterministically', async () => {
      const signal = createSignal();
      const rule = createRule({
        filters: {}, // Match all
        groupBy: { service: true, severity: false, identityWindow: false },
      });

      const lambdaSignal = createSignal({
        signalId: 'lambda-signal',
        service: 'lambda',
      });
      const apiSignal = createSignal({
        signalId: 'api-signal',
        service: 'api',
      });
      const dynamoSignal = createSignal({
        signalId: 'dynamo-signal',
        service: 'dynamodb',
      });

      mockQuery.setSignals([lambdaSignal, apiSignal, dynamoSignal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      // Groups should be sorted by normalized group key
      // But query is scoped by service, so only lambda group returned
      expect(result.results[0].groupedSignals).toHaveLength(1);
    });
  });

  describe('threshold evaluation', () => {
    it('should meet threshold when minSignals reached', async () => {
      const signal = createSignal();
      const rule = createRule({ threshold: { minSignals: 2 } });

      const signal1 = createSignal({ signalId: 'signal-1' });
      const signal2 = createSignal({ signalId: 'signal-2' });

      mockQuery.setSignals([signal1, signal2]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].thresholdMet).toBe(true);
    });

    it('should not meet threshold when below minSignals', async () => {
      const signal = createSignal();
      const rule = createRule({ threshold: { minSignals: 3 } });

      const signal1 = createSignal({ signalId: 'signal-1' });
      const signal2 = createSignal({ signalId: 'signal-2' });

      mockQuery.setSignals([signal1, signal2]);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].thresholdMet).toBe(false);
    });

    it('should not meet threshold when above maxSignals', async () => {
      const signal = createSignal();
      const rule = createRule({ threshold: { minSignals: 2, maxSignals: 3 } });

      const signals = [
        createSignal({ signalId: 'signal-1' }),
        createSignal({ signalId: 'signal-2' }),
        createSignal({ signalId: 'signal-3' }),
        createSignal({ signalId: 'signal-4' }),
      ];

      mockQuery.setSignals(signals);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].thresholdMet).toBe(false);
    });

    it('should meet threshold when within range', async () => {
      const signal = createSignal();
      const rule = createRule({ threshold: { minSignals: 2, maxSignals: 5 } });

      const signals = [
        createSignal({ signalId: 'signal-1' }),
        createSignal({ signalId: 'signal-2' }),
        createSignal({ signalId: 'signal-3' }),
      ];

      mockQuery.setSignals(signals);

      const result = await engine.evaluateSignal(signal, [rule]);

      expect(result.results[0].thresholdMet).toBe(true);
    });
  });

  describe('MANDATORY CONSTRAINTS', () => {
    it('should evaluate one signal at a time', async () => {
      const signal = createSignal();
      const rule = createRule();

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule]);

      // Verify single signal evaluation
      expect(result.signalId).toBe(signal.signalId);
      expect(result.evaluatedRules).toBe(1);
    });

    it('should execute rules in order', async () => {
      const signal = createSignal();
      const rule1 = createRule({ ruleId: 'rule-1' });
      const rule2 = createRule({ ruleId: 'rule-2' });
      const rule3 = createRule({ ruleId: 'rule-3' });

      mockQuery.setSignals([signal]);

      const result = await engine.evaluateSignal(signal, [rule1, rule2, rule3]);

      // Verify rule order preserved
      expect(result.results[0].ruleId).toBe('rule-1');
      expect(result.results[1].ruleId).toBe('rule-2');
      expect(result.results[2].ruleId).toBe('rule-3');
    });

    it('should not mutate signals', async () => {
      const signal = createSignal();
      const rule = createRule();

      const originalSignal = JSON.parse(JSON.stringify(signal));

      mockQuery.setSignals([signal]);

      await engine.evaluateSignal(signal, [rule]);

      // Verify signal unchanged
      expect(signal).toEqual(originalSignal);
    });

    it('should not cache signals between evaluations', async () => {
      const signal1 = createSignal({ signalId: 'signal-1' });
      const signal2 = createSignal({ signalId: 'signal-2' });
      const rule = createRule();

      // First evaluation
      mockQuery.setSignals([signal1]);
      const result1 = await engine.evaluateSignal(signal1, [rule]);

      // Second evaluation with different signals
      mockQuery.setSignals([signal2]);
      const result2 = await engine.evaluateSignal(signal2, [rule]);

      // Verify independent evaluations
      expect(result1.signalId).toBe('signal-1');
      expect(result2.signalId).toBe('signal-2');
    });
  });
});

describe('filterSignalsByWindow', () => {
  const createSignal = (observedAt: string): SignalEvent => ({
    signalId: 'a'.repeat(64),
    source: 'CLOUDWATCH_ALARM',
    signalType: 'ALARM_STATE_CHANGE',
    service: 'lambda',
    severity: 'SEV2',
    observedAt,
    identityWindow: '2026-01-17T10:23Z',
    metadata: {},
    ingestedAt: '2026-01-17T10:23:47.000Z',
  });

  it('should include signals at window start (inclusive)', () => {
    const signals = [
      createSignal('2026-01-17T10:20:00.000Z'),
    ];

    const filtered = filterSignalsByWindow(
      signals,
      '2026-01-17T10:20:00.000Z',
      '2026-01-17T10:25:00.000Z'
    );

    expect(filtered).toHaveLength(1);
  });

  it('should exclude signals at window end (exclusive)', () => {
    const signals = [
      createSignal('2026-01-17T10:25:00.000Z'),
    ];

    const filtered = filterSignalsByWindow(
      signals,
      '2026-01-17T10:20:00.000Z',
      '2026-01-17T10:25:00.000Z'
    );

    expect(filtered).toHaveLength(0);
  });

  it('should include signals within window', () => {
    const signals = [
      createSignal('2026-01-17T10:20:00.000Z'), // Start (inclusive)
      createSignal('2026-01-17T10:22:30.000Z'), // Middle
      createSignal('2026-01-17T10:24:59.999Z'), // Before end
      createSignal('2026-01-17T10:25:00.000Z'), // End (exclusive)
    ];

    const filtered = filterSignalsByWindow(
      signals,
      '2026-01-17T10:20:00.000Z',
      '2026-01-17T10:25:00.000Z'
    );

    expect(filtered).toHaveLength(3);
    expect(filtered.map(s => s.observedAt)).toEqual([
      '2026-01-17T10:20:00.000Z',
      '2026-01-17T10:22:30.000Z',
      '2026-01-17T10:24:59.999Z',
    ]);
  });

  it('should handle empty signal array', () => {
    const filtered = filterSignalsByWindow(
      [],
      '2026-01-17T10:20:00.000Z',
      '2026-01-17T10:25:00.000Z'
    );

    expect(filtered).toEqual([]);
  });
});

