/**
 * Phase 2.2 Week 4: End-to-End Integration Test
 * 
 * MANDATORY TEST: signals → correlation → candidate stored
 * 
 * NOT a Lambda test. NOT EventBridge. Pure in-process test.
 * 
 * Proves:
 * - The pipeline is complete
 * - The system is no longer theoretical
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorrelationExecutor, type CorrelationDataProvider } from '../../src/correlation/correlation-executor.js';
import { CorrelationEngine, type SignalQuery } from '../../src/correlation/correlation-engine.js';
import { CandidateOrchestrator } from '../../src/candidate/candidate-orchestrator.js';
import { CandidateStore } from '../../src/candidate/candidate-store.js';
import type { SignalEvent } from '../../src/signal/signal-event.schema.js';
import type { CorrelationRule } from '../../src/correlation/correlation-rule.schema.js';
import type { DetectionResult } from '../../src/detection/detection-result.js';
import type { EvidenceGraph } from '../../src/evidence/evidence-graph.schema.js';
import type { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

// Mock stores
vi.mock('../../src/candidate/candidate-store.js');

describe('End-to-End: Signal → Correlation → Candidate', () => {
  let executor: CorrelationExecutor;
  let mockStore: CandidateStore;
  let mockSignalQuery: SignalQuery;
  let mockDataProvider: CorrelationDataProvider;

  beforeEach(() => {
    // Mock CandidateStore
    mockStore = {
      store: vi.fn().mockResolvedValue({ success: true }),
    } as any;

    // Mock SignalQuery
    mockSignalQuery = {
      querySignalsInWindow: vi.fn().mockResolvedValue([]),
    };

    // Mock CorrelationDataProvider
    mockDataProvider = {
      getDetections: vi.fn().mockResolvedValue([createDetection()]),
      getGraphs: vi.fn().mockResolvedValue([createGraph()]),
      getNormalizedSignals: vi.fn().mockResolvedValue([createNormalizedSignal()]),
    };

    // Build executor
    const engine = new CorrelationEngine(mockSignalQuery);
    const orchestrator = new CandidateOrchestrator(mockStore);
    executor = new CorrelationExecutor(engine, orchestrator, mockDataProvider);
  });

  describe('Complete Pipeline', () => {
    it('should generate candidate when correlation threshold met', async () => {
      // Setup: 3 signals that will correlate
      const signal1 = createSignal({ signalId: 'sig-1', observedAt: '2026-01-19T10:00:00.000Z' });
      const signal2 = createSignal({ signalId: 'sig-2', observedAt: '2026-01-19T10:01:00.000Z' });
      const signal3 = createSignal({ signalId: 'sig-3', observedAt: '2026-01-19T10:02:00.000Z' });

      // Mock: Window query returns correlated signals
      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue([
        signal1,
        signal2,
        signal3,
      ]);

      // Rule: Requires 3+ signals in 5-minute window
      const rule = createRule({
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      // Execute
      const result = await executor.execute(signal1, [rule]);

      // Verify: Candidate was generated
      expect(result.candidatesGenerated).toBe(1);
      expect(result.candidateIds).toHaveLength(1);
      expect(mockStore.store).toHaveBeenCalledTimes(1);

      // Verify: Candidate has correct structure
      const storedCandidate = vi.mocked(mockStore.store).mock.calls[0][0];
      expect(storedCandidate).toHaveProperty('candidateId');
      expect(storedCandidate).toHaveProperty('correlationRule');
      expect(storedCandidate.correlationRule).toBe(rule.ruleId);
    });

    it('should NOT generate candidate when threshold not met', async () => {
      // Setup: Only 2 signals (below threshold)
      const signal1 = createSignal({ signalId: 'sig-1' });
      const signal2 = createSignal({ signalId: 'sig-2' });

      // Mock: Window query returns insufficient signals
      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue([
        signal1,
        signal2,
      ]);

      // Rule: Requires 3+ signals
      const rule = createRule({
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      // Execute
      const result = await executor.execute(signal1, [rule]);

      // Verify: No candidate generated
      expect(result.candidatesGenerated).toBe(0);
      expect(result.candidateIds).toHaveLength(0);
      expect(mockStore.store).not.toHaveBeenCalled();
    });

    it('should generate same candidate on replay (idempotency)', async () => {
      // Setup: Correlated signals
      const signal1 = createSignal({ signalId: 'sig-1' });
      const signal2 = createSignal({ signalId: 'sig-2' });
      const signal3 = createSignal({ signalId: 'sig-3' });

      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue([
        signal1,
        signal2,
        signal3,
      ]);

      const rule = createRule({
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      // Execute twice (replay)
      const result1 = await executor.execute(signal1, [rule]);
      const result2 = await executor.execute(signal1, [rule]);

      // Verify: Same candidateId generated
      expect(result1.candidateIds[0]).toBe(result2.candidateIds[0]);
      expect(mockStore.store).toHaveBeenCalledTimes(2);

      // Verify: Candidates are identical
      const candidate1 = vi.mocked(mockStore.store).mock.calls[0][0];
      const candidate2 = vi.mocked(mockStore.store).mock.calls[1][0];
      expect(candidate1.candidateId).toBe(candidate2.candidateId);
    });

    it('should handle multiple rules independently', async () => {
      // Setup: Signals that match both rules
      const signals = [
        createSignal({ signalId: 'sig-1', severity: 'SEV1' }),
        createSignal({ signalId: 'sig-2', severity: 'SEV1' }),
        createSignal({ signalId: 'sig-3', severity: 'SEV1' }),
      ];

      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue(signals);

      // Two rules with different thresholds (both match SEV1)
      const rule1 = createRule({
        ruleId: 'rule-1',
        filters: {
          source: ['CLOUDWATCH_ALARM'],
          signalType: ['ALARM_STATE_CHANGE'],
          service: ['lambda'],
          severity: ['SEV1'], // Match the test signals
        },
        threshold: { minSignals: 2, maxSignals: 100 },
      });
      const rule2 = createRule({
        ruleId: 'rule-2',
        filters: {
          source: ['CLOUDWATCH_ALARM'],
          signalType: ['ALARM_STATE_CHANGE'],
          service: ['lambda'],
          severity: ['SEV1'], // Match the test signals
        },
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      // Execute
      const result = await executor.execute(signals[0], [rule1, rule2]);

      // Verify: Both rules generated candidates
      expect(result.candidatesGenerated).toBe(2);
      expect(result.candidateIds).toHaveLength(2);
      expect(mockStore.store).toHaveBeenCalledTimes(2);

      // Verify: Different candidateIds (different rules)
      expect(result.candidateIds[0]).not.toBe(result.candidateIds[1]);
    });
  });

  describe('Data Provider Integration', () => {
    it('should fetch detections for correlated signals', async () => {
      const signals = [
        createSignal({ signalId: 'sig-1' }),
        createSignal({ signalId: 'sig-2' }),
        createSignal({ signalId: 'sig-3' }),
      ];

      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue(signals);

      const rule = createRule({
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      await executor.execute(signals[0], [rule]);

      // Verify: Data provider called with signal IDs
      expect(mockDataProvider.getDetections).toHaveBeenCalledWith(['sig-1', 'sig-2', 'sig-3']);
    });

    it('should fetch graphs for detections', async () => {
      const signals = [
        createSignal({ signalId: 'sig-1' }),
        createSignal({ signalId: 'sig-2' }),
        createSignal({ signalId: 'sig-3' }),
      ];

      vi.mocked(mockSignalQuery.querySignalsInWindow).mockResolvedValue(signals);
      vi.mocked(mockDataProvider.getDetections).mockResolvedValue([
        createDetection({ detectionId: 'det-1' }),
        createDetection({ detectionId: 'det-2' }),
        createDetection({ detectionId: 'det-3' }),
      ]);

      const rule = createRule({
        threshold: { minSignals: 3, maxSignals: 100 },
      });

      await executor.execute(signals[0], [rule]);

      // Verify: Graphs fetched for detections
      expect(mockDataProvider.getGraphs).toHaveBeenCalledWith(['det-1', 'det-2', 'det-3']);
    });
  });
});

// === TEST HELPERS ===

function createSignal(overrides?: Partial<SignalEvent>): SignalEvent {
  return {
    signalId: overrides?.signalId || 'sig-' + Math.random().toString(36).substring(7),
    source: 'CLOUDWATCH_ALARM',
    signalType: 'ALARM_STATE_CHANGE',
    service: overrides?.service || 'lambda',
    severity: overrides?.severity || 'SEV2',
    observedAt: overrides?.observedAt || '2026-01-19T10:00:00.000Z',
    identityWindow: '2026-01-19T10:00Z',
    metadata: { alarmName: 'HighErrorRate' },
    ingestedAt: '2026-01-19T10:00:01.000Z',
  };
}

function createRule(overrides?: Partial<CorrelationRule>): CorrelationRule {
  return {
    ruleId: overrides?.ruleId || 'rule-lambda-high-error',
    ruleName: 'Lambda High Error Rate',
    ruleVersion: '1.0.0',
    filters: {
      source: ['CLOUDWATCH_ALARM'],
      signalType: ['ALARM_STATE_CHANGE'],
      service: ['lambda'],
      severity: ['SEV2'],
    },
    timeWindow: overrides?.timeWindow || {
      duration: 'PT5M',
      alignment: 'fixed',
    },
    groupBy: {
      service: true,
      severity: true,
      identityWindow: false,
    },
    threshold: overrides?.threshold || {
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
  };
}

function createDetection(overrides?: Partial<DetectionResult>): DetectionResult {
  return {
    ruleId: 'test-detection-rule',
    ruleVersion: '1.0.0',
    detectionId: overrides?.detectionId || 'det-' + Math.random().toString(36).substring(7),
    normalizedSignalId: 'norm-sig-1',
    signalTimestamp: '2026-01-19T10:00:00.000Z',
    decision: 'MATCH',
    severity: 'HIGH',
    confidence: 'HIGH',
    evaluationTrace: [],
    detectionVersion: '1.0.0',
  };
}

function createGraph(): EvidenceGraph {
  return {
    graphId: 'graph-' + Math.random().toString(36).substring(7),
    graphVersion: '1.0.0',
    detectionIds: ['det-1'],
    normalizedSignalIds: ['norm-sig-1'],
    rawSignalIds: ['sig-1'],
    primaryDetectionId: 'det-1',
    createdAt: '2026-01-19T10:00:00.000Z',
  };
}

function createNormalizedSignal(overrides?: Partial<NormalizedSignal>): NormalizedSignal {
  return {
    normalizedSignalId: overrides?.normalizedSignalId || 'norm-sig-' + Math.random().toString(36).substring(7),
    sourceSignalId: overrides?.sourceSignalId || 'sig-1',
    signalType: overrides?.signalType || 'alarm-state-change',
    source: overrides?.source || 'cloudwatch-alarm',
    severity: overrides?.severity || 'SEV2',
    confidence: overrides?.confidence || 'HIGH',
    timestamp: overrides?.timestamp || '2026-01-19T10:00:00.000Z',
    resourceRefs: overrides?.resourceRefs || [],
    environmentRefs: overrides?.environmentRefs || [],
    evidenceRefs: overrides?.evidenceRefs || [],
    normalizationVersion: overrides?.normalizationVersion || '1.0.0',
    normalizedAt: overrides?.normalizedAt || '2026-01-19T10:00:00.000Z',
  };
}
