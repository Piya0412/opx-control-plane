/**
 * CP-5: Determinism Tests
 * 
 * Verifies that candidate generation is deterministic and replayable.
 */

import { describe, it, expect } from 'vitest';
import { CandidateBuilder } from '../../src/candidate/candidate-builder.js';
import { computeCorrelationKey, ResolvedKeyFields } from '../../src/candidate/candidate.schema.js';
import { CorrelationRule } from '../../src/candidate/correlation-rule.schema.js';
import { DetectionResult } from '../../src/detection/detection-result.js';
import { EvidenceGraph } from '../../src/evidence/evidence-graph.schema.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';

describe('CP-5: Determinism', () => {
  const builder = new CandidateBuilder();

  // Fixed test fixtures
  const detection1: DetectionResult = {
    detectionId: 'det-fixed-1',
    ruleId: 'lambda-error-rate',
    ruleVersion: '1.0.0',
    normalizedSignalId: 'sig-fixed-1',
    signalTimestamp: '2026-01-16T10:30:00.000Z',
    decision: 'MATCH',
    severity: 'SEV2',
    confidence: 'HIGH',
    evaluationTrace: [],
    detectionVersion: 'v1',
  };

  const detection2: DetectionResult = {
    detectionId: 'det-fixed-2',
    ruleId: 'lambda-error-rate',
    ruleVersion: '1.0.0',
    normalizedSignalId: 'sig-fixed-2',
    signalTimestamp: '2026-01-16T10:35:00.000Z',
    decision: 'MATCH',
    severity: 'SEV3',
    confidence: 'MEDIUM',
    evaluationTrace: [],
    detectionVersion: 'v1',
  };

  const signal1: NormalizedSignal = {
    normalizedSignalId: 'sig-fixed-1',
    sourceSignalId: 'raw-1',
    signalType: 'error',
    source: 'payment-service',
    severity: 'SEV2',
    confidence: 'HIGH',
    timestamp: '2026-01-16T10:30:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:30:01.000Z',
  };

  const signal2: NormalizedSignal = {
    normalizedSignalId: 'sig-fixed-2',
    sourceSignalId: 'raw-2',
    signalType: 'error',
    source: 'payment-service',
    severity: 'SEV3',
    confidence: 'MEDIUM',
    timestamp: '2026-01-16T10:35:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:35:01.000Z',
  };

  const graph1: EvidenceGraph = {
    graphId: 'g'.repeat(64),
    detectionId: 'det-fixed-1',
    nodes: [{
      nodeId: 'node-detection-det-fixed-1',
      nodeType: 'DETECTION_RESULT',
      ref: { entityType: 'DetectionResult', entityId: 'det-fixed-1', storeLocation: 'opx-detections' },
      timestamp: '2026-01-16T10:30:00.000Z',
    }],
    edges: [],
    graphVersion: 'v1',
  };

  const graph2: EvidenceGraph = {
    graphId: 'h'.repeat(64),
    detectionId: 'det-fixed-2',
    nodes: [{
      nodeId: 'node-detection-det-fixed-2',
      nodeType: 'DETECTION_RESULT',
      ref: { entityType: 'DetectionResult', entityId: 'det-fixed-2', storeLocation: 'opx-detections' },
      timestamp: '2026-01-16T10:35:00.000Z',
    }],
    edges: [],
    graphVersion: 'v1',
  };

  const rule: CorrelationRule = {
    id: 'service-cascade',
    version: '1.0.0',
    description: 'Test rule',
    matcher: {
      sameService: true,
      windowMinutes: 60,
      windowTruncation: 'hour',
      minDetections: 1,
      maxDetections: 100,
    },
    keyFields: ['service', 'windowTruncated'],
    primarySelection: 'HIGHEST_SEVERITY_THEN_EARLIEST_THEN_LEXICAL',
    confidenceBoost: { multipleDetections: 0.2 },
  };

  describe('same inputs → same output', () => {
    it('should produce same candidateId', () => {
      const input = {
        detections: [detection1, detection2],
        graphs: [graph1, graph2],
        signals: [signal1, signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input);
      const candidate2 = builder.build(input);

      expect(candidate1.candidateId).toBe(candidate2.candidateId);
    });

    it('should produce same correlationKey', () => {
      const input = {
        detections: [detection1, detection2],
        graphs: [graph1, graph2],
        signals: [signal1, signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input);
      const candidate2 = builder.build(input);

      expect(candidate1.correlationKey).toBe(candidate2.correlationKey);
    });

    it('should produce same confidence', () => {
      const input = {
        detections: [detection1, detection2],
        graphs: [graph1, graph2],
        signals: [signal1, signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input);
      const candidate2 = builder.build(input);

      expect(candidate1.confidence).toBe(candidate2.confidence);
      expect(candidate1.confidenceFactors).toEqual(candidate2.confidenceFactors);
    });

    it('should produce same blast radius', () => {
      const input = {
        detections: [detection1, detection2],
        graphs: [graph1, graph2],
        signals: [signal1, signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input);
      const candidate2 = builder.build(input);

      expect(candidate1.blastRadius).toEqual(candidate2.blastRadius);
    });
  });

  describe('order independence (HARDENING #1)', () => {
    it('should produce same candidate regardless of detection order', () => {
      const input1 = {
        detections: [detection1, detection2],
        graphs: [graph1, graph2],
        signals: [signal1, signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const input2 = {
        detections: [detection2, detection1], // Reversed order
        graphs: [graph2, graph1],
        signals: [signal2, signal1],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input1);
      const candidate2 = builder.build(input2);

      expect(candidate1.candidateId).toBe(candidate2.candidateId);
      expect(candidate1.correlationKey).toBe(candidate2.correlationKey);
      expect(candidate1.primaryDetectionId).toBe(candidate2.primaryDetectionId);
    });
  });

  describe('replay produces identical candidate', () => {
    it('should produce byte-identical candidate (excluding createdAt)', () => {
      const input = {
        detections: [detection1],
        graphs: [graph1],
        signals: [signal1],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      };

      const candidate1 = builder.build(input);
      const candidate2 = builder.build(input);

      // Compare all fields except createdAt
      const { createdAt: _, ...rest1 } = candidate1;
      const { createdAt: __, ...rest2 } = candidate2;

      expect(rest1).toEqual(rest2);
    });
  });

  describe('keyFields affect correlation key (FIX-A mandatory test)', () => {
    it('should produce different candidateIds for different keyFields', () => {
      // Same detections, same window, different keyFields → different candidateIds
      const keyFields1: ResolvedKeyFields = {
        service: 'payment',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const keyFields2: ResolvedKeyFields = {
        ruleId: 'lambda-error',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };

      const key1 = computeCorrelationKey(
        ['det-1', 'det-2'],
        'service-cascade',
        '1.0.0',
        keyFields1
      );
      const key2 = computeCorrelationKey(
        ['det-1', 'det-2'],
        'service-cascade',
        '1.0.0',
        keyFields2
      );

      expect(key1).not.toBe(key2);
    });

    it('should produce different candidateIds for different service values', () => {
      const keyFields1: ResolvedKeyFields = {
        service: 'payment-service',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const keyFields2: ResolvedKeyFields = {
        service: 'order-service',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };

      const key1 = computeCorrelationKey(['det-1'], 'rule-1', '1.0.0', keyFields1);
      const key2 = computeCorrelationKey(['det-1'], 'rule-1', '1.0.0', keyFields2);

      expect(key1).not.toBe(key2);
    });

    it('should serialize keyFields deterministically', () => {
      // Order of fields in ResolvedKeyFields should not matter
      const keyFields1: ResolvedKeyFields = {
        service: 'payment',
        source: 'cloudwatch',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };
      const keyFields2: ResolvedKeyFields = {
        source: 'cloudwatch',
        service: 'payment',
        windowTruncated: '2026-01-16T10:00:00.000Z',
      };

      const key1 = computeCorrelationKey(['det-1'], 'rule-1', '1.0.0', keyFields1);
      const key2 = computeCorrelationKey(['det-1'], 'rule-1', '1.0.0', keyFields2);

      expect(key1).toBe(key2);
    });
  });

  describe('stateless (no memory between calls)', () => {
    it('should not retain state between builds', () => {
      // Build with one set of inputs
      builder.build({
        detections: [detection1],
        graphs: [graph1],
        signals: [signal1],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      // Build with different inputs
      const candidate = builder.build({
        detections: [detection2],
        graphs: [graph2],
        signals: [signal2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      // Should only contain detection2
      expect(candidate.detectionIds).toEqual(['det-fixed-2']);
      expect(candidate.primaryDetectionId).toBe('det-fixed-2');
    });
  });
});
