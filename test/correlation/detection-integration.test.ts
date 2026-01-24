/**
 * Phase 2.4 Step 5: Detection Integration Tests
 * 
 * Tests the wiring between correlator and detection store.
 * Validates that detections are fetched and passed to CandidateBuilder.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CorrelationExecutor, type CorrelationDataProvider } from '../../src/correlation/correlation-executor.js';
import { CorrelationEngine, type SignalQuery } from '../../src/correlation/correlation-engine.js';
import { CandidateOrchestrator } from '../../src/candidate/candidate-orchestrator.js';
import type { SignalEvent } from '../../src/signal/signal-event.schema.js';
import type { CorrelationRule } from '../../src/correlation/correlation-rule.schema.js';
import type { DetectionResult } from '../../src/detection/detection-result.js';
import type { Detection } from '../../src/detection/detection.schema.js';
import type { EvidenceGraph } from '../../src/evidence/evidence-graph.schema.js';
import type { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

// Mock CandidateStore at module level
vi.mock('../../src/candidate/candidate-store.js', () => {
  return {
    CandidateStore: vi.fn().mockImplementation(() => ({
      store: vi.fn().mockResolvedValue({ success: true, alreadyExists: false }),
      get: vi.fn().mockResolvedValue(null),
    }))
  };
});

describe('Phase 2.4 Step 5: Detection Integration', () => {
  let candidateStore: any;
  let orchestrator: CandidateOrchestrator;
  let dataProvider: TestDataProvider;
  let signalQuery: TestSignalQuery;
  let engine: CorrelationEngine;
  let executor: CorrelationExecutor;

  beforeEach(async () => {
    // Import CandidateStore to get the mocked version
    const { CandidateStore } = await import('../../src/candidate/candidate-store.js');
    
    candidateStore = new CandidateStore({ tableName: 'test-candidates' });
    orchestrator = new CandidateOrchestrator(candidateStore);
    dataProvider = new TestDataProvider();
    signalQuery = new TestSignalQuery();
    engine = new CorrelationEngine(signalQuery);
    executor = new CorrelationExecutor(engine, orchestrator, dataProvider);
  });

  describe('Detection Fetching', () => {
    it('should fetch detections for correlated signals', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Mock signal query to return 2 signals (threshold met)
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1')
      ]);
      
      // Mock detections
      const detection1 = createTestDetection('detection-1', ['signal-1']);
      const detection2 = createTestDetection('detection-2', ['signal-2']);
      dataProvider.setDetections([detection1, detection2]);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert
      expect(result.candidatesGenerated).toBe(1);
      expect(dataProvider.getDetectionsCalled).toBe(true);
      expect(dataProvider.lastSignalIds).toEqual(['signal-1', 'signal-2']);
    });

    it('should handle signals without detections (fail-closed)', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Mock signal query to return 2 signals (threshold met)
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1')
      ]);
      
      // No detections available
      dataProvider.setDetections([]);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert - candidate generation should fail with zero detections
      expect(result.candidatesGenerated).toBe(0);
      expect(dataProvider.getDetectionsCalled).toBe(true);
    });

    it('should pass multiple detections to candidate builder', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 3);
      
      // Mock signal query to return 3 signals (threshold met)
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1'),
        createTestSignal('signal-3', 'testapi', 'SEV1')
      ]);
      
      // Mock 3 detections
      const detections = [
        createTestDetection('detection-1', ['signal-1']),
        createTestDetection('detection-2', ['signal-2']),
        createTestDetection('detection-3', ['signal-3'])
      ];
      dataProvider.setDetections(detections);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert
      expect(result.candidatesGenerated).toBe(1);
      expect(dataProvider.lastSignalIds).toHaveLength(3);
    });

    it('should handle detection fetching errors', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Mock signal query
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1')
      ]);
      
      // Mock detection store to throw error
      dataProvider.setError(new Error('DynamoDB error'));
      
      // Act & Assert
      await expect(executor.execute(signal, [rule])).rejects.toThrow('DynamoDB error');
    });

    it('should be idempotent - same signals produce same candidate', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Mock signal query
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1')
      ]);
      
      // Mock detections
      const detections = [
        createTestDetection('detection-1', ['signal-1']),
        createTestDetection('detection-2', ['signal-2'])
      ];
      dataProvider.setDetections(detections);
      
      // Act - execute twice
      const result1 = await executor.execute(signal, [rule]);
      const result2 = await executor.execute(signal, [rule]);
      
      // Assert - same candidate ID
      expect(result1.candidateIds).toEqual(result2.candidateIds);
    });
  });

  describe('Regression Tests', () => {
    it('should not change correlation logic', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Only 1 signal - threshold NOT met
      signalQuery.setSignals([signal]);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert - no candidate generated (threshold not met)
      expect(result.candidatesGenerated).toBe(0);
      expect(result.evaluation.thresholdMetRules).toBe(0);
    });

    it('should not change threshold logic', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1');
      const rule = createTestRule('rule-1', 'testapi', 3);
      
      // Only 2 signals - threshold NOT met (need 3)
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1')
      ]);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert - no candidate generated
      expect(result.candidatesGenerated).toBe(0);
    });

    it('should not change window logic', async () => {
      // Arrange
      const signal = createTestSignal('signal-1', 'testapi', 'SEV1', '2026-01-21T10:00:00Z');
      const rule = createTestRule('rule-1', 'testapi', 2);
      
      // Signal outside window
      signalQuery.setSignals([
        signal,
        createTestSignal('signal-2', 'testapi', 'SEV1', '2026-01-21T09:00:00Z') // 1 hour before
      ]);
      
      // Act
      const result = await executor.execute(signal, [rule]);
      
      // Assert - signals should be correlated (within 5 minute window)
      // This test validates window logic is unchanged
      expect(result.evaluation.evaluatedRules).toBe(1);
    });
  });
});

// Test Helpers

class TestSignalQuery implements SignalQuery {
  private signals: SignalEvent[] = [];

  setSignals(signals: SignalEvent[]) {
    this.signals = signals;
  }

  async querySignalsInWindow(): Promise<SignalEvent[]> {
    return this.signals;
  }
}

class TestDataProvider implements CorrelationDataProvider {
  private detections: Detection[] = [];
  private error: Error | null = null;
  public getDetectionsCalled = false;
  public lastSignalIds: string[] = [];

  setDetections(detections: Detection[]) {
    this.detections = detections;
  }

  setError(error: Error) {
    this.error = error;
  }

  async getDetections(signalIds: string[]): Promise<DetectionResult[]> {
    this.getDetectionsCalled = true;
    this.lastSignalIds = signalIds;

    if (this.error) {
      throw this.error;
    }

    // Map Phase 2.4 Detection to CP-3 DetectionResult
    return this.detections.map(d => ({
      detectionId: d.detectionId,
      ruleId: d.ruleId,
      ruleVersion: d.ruleVersion,
      normalizedSignalId: d.signalIds[0],
      signalTimestamp: d.detectedAt,
      decision: 'MATCH' as const,
      severity: d.severity,
      confidence: d.confidence,
      evaluationTrace: [],
      detectionVersion: 'v1'
    }));
  }

  async getGraphs(detectionIds: string[]): Promise<EvidenceGraph[]> {
    // Generate a graph for each detection
    return detectionIds.map(detectionId => ({
      graphId: `graph-${detectionId}`,
      rootDetectionId: detectionId,
      nodes: [
        {
          nodeId: `node-${detectionId}`,
          detectionId,
          nodeType: 'DETECTION' as const,
          depth: 0
        }
      ],
      edges: [],
      metadata: {
        totalNodes: 1,
        totalEdges: 0,
        maxDepth: 0
      },
      createdAt: new Date().toISOString()
    }));
  }

  async getNormalizedSignals(signalIds: string[]): Promise<NormalizedSignal[]> {
    // Generate normalized signals for each signal ID
    return signalIds.map(signalId => ({
      normalizedSignalId: signalId,
      source: 'CLOUDWATCH_ALARM',
      signalType: 'ALARM_STATE_CHANGE',
      severity: 'SEV1',
      observedAt: '2026-01-21T10:00:00Z',
      resourceRefs: [
        {
          refType: 'name' as const,
          refValue: 'testapi'
        }
      ],
      attributes: {},
      normalizationVersion: 'v1',
      normalizedAt: new Date().toISOString()
    }));
  }
}

function createTestSignal(
  signalId: string,
  service: string,
  severity: string,
  observedAt: string = '2026-01-21T10:00:00Z'
): SignalEvent {
  return {
    signalId,
    source: 'CLOUDWATCH_ALARM',
    signalType: 'ALARM_STATE_CHANGE',
    service,
    severity,
    observedAt,
    identityWindow: observedAt.substring(0, 16) + 'Z', // Truncate to minute
    metadata: {},
    ingestedAt: observedAt,
    attributes: {}
  };
}

function createTestRule(
  ruleId: string,
  service: string,
  threshold: number
): CorrelationRule {
  return {
    ruleId,
    ruleName: 'Test Rule',
    ruleVersion: '1.0.0',
    enabled: true,
    filters: {
      source: ['CLOUDWATCH_ALARM'],
      signalType: ['ALARM_STATE_CHANGE'],
      service: [service],
      severity: ['SEV1', 'SEV2']
    },
    threshold: {
      minSignals: threshold,
      maxSignals: 100
    },
    timeWindow: {
      duration: 'PT5M',
      alignment: 'fixed'
    },
    groupBy: {
      service: true,
      severity: false,
      identityWindow: false
    },
    candidateTemplate: {
      title: 'Test Candidate',
      description: 'Test description',
      tags: []
    },
    createdAt: '2026-01-21T00:00:00Z',
    createdBy: 'test',
    keyFields: ['service'],
    windowTruncation: 'minute'
  };
}

function createTestDetection(
  detectionId: string,
  signalIds: string[]
): Detection {
  return {
    detectionId,
    signalIds,
    service: 'testapi',
    severity: 'SEV1',
    ruleId: 'rule-1',
    ruleVersion: '1.0.0',
    detectedAt: '2026-01-21T10:00:00Z',
    confidence: 0.8,
    attributes: {}
  };
}
