/**
 * CP-3: Determinism Tests
 * 
 * CRITICAL: Verify same input + same rule version → same result
 */

import { describe, it, expect } from 'vitest';
import { RuleEvaluator } from '../../src/detection/rule-evaluator.js';
import { computeDetectionId, DETECTION_VERSION } from '../../src/detection/detection-result.js';
import { DetectionRule } from '../../src/detection/rule-schema.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

describe('CP-3: Determinism (CRITICAL)', () => {
  const evaluator = new RuleEvaluator();

  const createSignal = (): NormalizedSignal => ({
    normalizedSignalId: 'test-signal-abc123',
    sourceSignalId: 'source-123',
    signalType: 'alarm-opx-lambda-error-rate',
    source: 'cloudwatch-alarm',
    severity: 'HIGH',
    confidence: 'DEFINITIVE',
    timestamp: '2026-01-16T10:00:00.000Z',
    resourceRefs: [
      { refType: 'aws-arn', refValue: 'arn:aws:lambda:us-east-1:123:function:test', sourceField: 'tags.arn' },
    ],
    environmentRefs: [
      { envType: 'region', value: 'us-east-1', sourceField: 'tags.region' },
    ],
    evidenceRefs: [{ evidenceType: 'raw-signal', refId: 'source-123', checksum: 'abc123' }],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:00:01.000Z',
  });

  const createRule = (): DetectionRule => ({
    ruleId: 'lambda-error-rate',
    ruleVersion: '1.0.0',
    name: 'Lambda Error Rate Detection',
    description: 'Detects Lambda error rate alarms',
    owner: 'platform-team',
    signalMatcher: {
      signalTypes: ['alarm-opx-lambda-error-rate'],
      sources: ['cloudwatch-alarm'],
    },
    conditions: [
      { conditionId: 'severity-check', field: 'severity', operator: 'in', value: ['HIGH', 'CRITICAL'] },
    ],
    outputSeverity: 'HIGH',
    outputConfidence: 'DEFINITIVE',
  });

  it('should produce identical detectionId for same inputs', () => {
    const signal = createSignal();
    const rule = createRule();

    const id1 = computeDetectionId(rule.ruleId, rule.ruleVersion, signal.normalizedSignalId);
    const id2 = computeDetectionId(rule.ruleId, rule.ruleVersion, signal.normalizedSignalId);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
  });

  it('should produce different detectionId for different signals', () => {
    const signal1 = createSignal();
    const signal2 = { ...createSignal(), normalizedSignalId: 'different-signal-xyz' };
    const rule = createRule();

    const id1 = computeDetectionId(rule.ruleId, rule.ruleVersion, signal1.normalizedSignalId);
    const id2 = computeDetectionId(rule.ruleId, rule.ruleVersion, signal2.normalizedSignalId);

    expect(id1).not.toBe(id2);
  });

  it('should produce different detectionId for different rule versions', () => {
    const signal = createSignal();
    const rule1 = createRule();
    const rule2 = { ...createRule(), ruleVersion: '1.1.0' };

    const id1 = computeDetectionId(rule1.ruleId, rule1.ruleVersion, signal.normalizedSignalId);
    const id2 = computeDetectionId(rule2.ruleId, rule2.ruleVersion, signal.normalizedSignalId);

    expect(id1).not.toBe(id2);
  });

  it('should produce identical evaluation result for same inputs', () => {
    const signal = createSignal();
    const rule = createRule();

    const result1 = evaluator.evaluate(signal, rule);
    const result2 = evaluator.evaluate(signal, rule);

    expect(result1.matches).toBe(result2.matches);
    expect(result1.trace).toEqual(result2.trace);
  });

  it('should produce identical trace for same inputs', () => {
    const signal = createSignal();
    const rule = createRule();

    const result1 = evaluator.evaluate(signal, rule);
    const result2 = evaluator.evaluate(signal, rule);

    // Byte-for-byte comparison
    expect(JSON.stringify(result1.trace)).toBe(JSON.stringify(result2.trace));
  });

  it('should be stateless (no memory between calls)', () => {
    const signal1 = createSignal();
    const signal2 = { ...createSignal(), normalizedSignalId: 'signal-2', severity: 'LOW' as const };
    const rule = createRule();

    // Evaluate signal1
    const result1a = evaluator.evaluate(signal1, rule);

    // Evaluate signal2 (should not affect signal1)
    const result2 = evaluator.evaluate(signal2, rule);

    // Evaluate signal1 again (should produce same result)
    const result1b = evaluator.evaluate(signal1, rule);

    expect(result1a.matches).toBe(result1b.matches);
    expect(result1a.trace).toEqual(result1b.trace);
    expect(result1a.matches).not.toBe(result2.matches); // Different signals
  });

  it('should handle replay scenario (reprocess historical signals)', () => {
    const historicalSignal = createSignal();
    historicalSignal.timestamp = '2026-01-01T00:00:00.000Z'; // Old timestamp
    const rule = createRule();

    // Process now
    const result1 = evaluator.evaluate(historicalSignal, rule);

    // Simulate replay (process same signal again later)
    const result2 = evaluator.evaluate(historicalSignal, rule);

    // Results must be identical
    expect(result1.matches).toBe(result2.matches);
    expect(JSON.stringify(result1.trace)).toBe(JSON.stringify(result2.trace));
  });

  it('should have consistent DETECTION_VERSION', () => {
    expect(DETECTION_VERSION).toBe('v1');
  });
});
