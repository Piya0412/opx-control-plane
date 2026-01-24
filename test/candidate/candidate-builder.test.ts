/**
 * CP-5: Candidate Builder Tests
 */

import { describe, it, expect } from 'vitest';
import { CandidateBuilder } from '../../src/candidate/candidate-builder.js';
import { CorrelationRule } from '../../src/candidate/correlation-rule.schema.js';
import { DetectionResult } from '../../src/detection/detection-result.js';
import { EvidenceGraph } from '../../src/evidence/evidence-graph.schema.js';
import { NormalizedSignal } from '../../src/normalization/normalized-signal.schema.js';
import { CANDIDATE_VERSION } from '../../src/candidate/candidate.schema.js';

describe('CP-5: Candidate Builder', () => {
  const builder = new CandidateBuilder();

  // Test fixtures
  const createDetection = (overrides: Partial<DetectionResult> = {}): DetectionResult => ({
    detectionId: 'det-' + Math.random().toString(36).substring(7),
    ruleId: 'lambda-error-rate',
    ruleVersion: '1.0.0',
    normalizedSignalId: 'sig-' + Math.random().toString(36).substring(7),
    signalTimestamp: '2026-01-16T10:30:00.000Z',
    decision: 'MATCH',
    severity: 'SEV2',
    confidence: 'HIGH',
    evaluationTrace: [],
    detectionVersion: 'v1',
    ...overrides,
  });

  const createSignal = (overrides: Partial<NormalizedSignal> = {}): NormalizedSignal => ({
    normalizedSignalId: 'sig-' + Math.random().toString(36).substring(7),
    sourceSignalId: 'raw-' + Math.random().toString(36).substring(7),
    signalType: 'error',
    source: 'cloudwatch',
    severity: 'SEV2',
    confidence: 'HIGH',
    timestamp: '2026-01-16T10:30:00.000Z',
    resourceRefs: [],
    environmentRefs: [],
    evidenceRefs: [],
    normalizationVersion: 'v1',
    normalizedAt: '2026-01-16T10:30:01.000Z',
    ...overrides,
  });

  const createGraph = (detectionId: string): EvidenceGraph => ({
    graphId: 'g'.repeat(64),
    detectionId,
    nodes: [
      {
        nodeId: `node-detection-${detectionId}`,
        nodeType: 'DETECTION_RESULT',
        ref: { entityType: 'DetectionResult', entityId: detectionId, storeLocation: 'opx-detections' },
        timestamp: '2026-01-16T10:30:00.000Z',
      },
    ],
    edges: [],
    graphVersion: 'v1',
  });

  const createRule = (overrides: Partial<CorrelationRule> = {}): CorrelationRule => ({
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
    confidenceBoost: {
      multipleDetections: 0.2,
      highSeverityRule: 0.3,
    },
    ...overrides,
  });

  describe('build', () => {
    it('should build candidate with correct structure', () => {
      const detection = createDetection({ detectionId: 'det-1', normalizedSignalId: 'sig-1' });
      const signal = createSignal({ normalizedSignalId: 'sig-1' });
      const graph = createGraph('det-1');
      const rule = createRule();

      const candidate = builder.build({
        detections: [detection],
        graphs: [graph],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.candidateId).toHaveLength(64);
      expect(candidate.candidateVersion).toBe(CANDIDATE_VERSION);
      expect(candidate.correlationRule).toBe('service-cascade');
      expect(candidate.correlationRuleVersion).toBe('1.0.0');
      expect(candidate.detectionIds).toContain('det-1');
      expect(candidate.primaryDetectionId).toBe('det-1');
      expect(candidate.suggestedSeverity).toBe('SEV2');
    });

    it('should throw for zero detections', () => {
      const rule = createRule();

      expect(() =>
        builder.build({
          detections: [],
          graphs: [],
          signals: [],
          rule,
          windowStart: '2026-01-16T10:00:00.000Z',
          windowEnd: '2026-01-16T11:00:00.000Z',
        })
      ).toThrow('Cannot build candidate with zero detections');
    });
  });

  describe('primary selection (HARDENING #2)', () => {
    it('should select highest severity', () => {
      const det1 = createDetection({ detectionId: 'det-1', severity: 'SEV3', signalTimestamp: '2026-01-16T10:00:00.000Z' });
      const det2 = createDetection({ detectionId: 'det-2', severity: 'SEV1', signalTimestamp: '2026-01-16T10:30:00.000Z' });
      const det3 = createDetection({ detectionId: 'det-3', severity: 'SEV2', signalTimestamp: '2026-01-16T10:15:00.000Z' });

      const sig1 = createSignal({ normalizedSignalId: det1.normalizedSignalId });
      const sig2 = createSignal({ normalizedSignalId: det2.normalizedSignalId });
      const sig3 = createSignal({ normalizedSignalId: det3.normalizedSignalId });

      const candidate = builder.build({
        detections: [det1, det2, det3],
        graphs: [createGraph('det-1'), createGraph('det-2'), createGraph('det-3')],
        signals: [sig1, sig2, sig3],
        rule: createRule(),
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.primaryDetectionId).toBe('det-2'); // SEV1 is highest
      expect(candidate.suggestedSeverity).toBe('SEV1');
    });

    it('should use earliest timestamp as tiebreaker', () => {
      const det1 = createDetection({ detectionId: 'det-1', severity: 'SEV2', signalTimestamp: '2026-01-16T10:30:00.000Z' });
      const det2 = createDetection({ detectionId: 'det-2', severity: 'SEV2', signalTimestamp: '2026-01-16T10:00:00.000Z' });

      const sig1 = createSignal({ normalizedSignalId: det1.normalizedSignalId });
      const sig2 = createSignal({ normalizedSignalId: det2.normalizedSignalId });

      const candidate = builder.build({
        detections: [det1, det2],
        graphs: [createGraph('det-1'), createGraph('det-2')],
        signals: [sig1, sig2],
        rule: createRule(),
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.primaryDetectionId).toBe('det-2'); // Earlier timestamp
    });

    it('should use lexical ID as final tiebreaker', () => {
      const det1 = createDetection({ detectionId: 'det-b', severity: 'SEV2', signalTimestamp: '2026-01-16T10:00:00.000Z' });
      const det2 = createDetection({ detectionId: 'det-a', severity: 'SEV2', signalTimestamp: '2026-01-16T10:00:00.000Z' });

      const sig1 = createSignal({ normalizedSignalId: det1.normalizedSignalId });
      const sig2 = createSignal({ normalizedSignalId: det2.normalizedSignalId });

      const candidate = builder.build({
        detections: [det1, det2],
        graphs: [createGraph('det-b'), createGraph('det-a')],
        signals: [sig1, sig2],
        rule: createRule(),
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.primaryDetectionId).toBe('det-a'); // Lexically smaller
    });
  });

  describe('window truncation', () => {
    it('should truncate to minute', () => {
      const detection = createDetection({ signalTimestamp: '2026-01-16T10:35:45.123Z' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule({
        matcher: { windowMinutes: 15, windowTruncation: 'minute', minDetections: 1, maxDetections: 100 },
      });

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:35:45.123Z',
        windowEnd: '2026-01-16T10:35:45.123Z',
      });

      // Trace should show truncation
      const truncateStep = candidate.generationTrace.find(s => s.action === 'truncate_window');
      expect(truncateStep?.output).toMatch(/2026-01-16T10:35:00/);
    });

    it('should truncate to hour', () => {
      const detection = createDetection({ signalTimestamp: '2026-01-16T10:35:45.123Z' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule({
        matcher: { windowMinutes: 60, windowTruncation: 'hour', minDetections: 1, maxDetections: 100 },
      });

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:35:45.123Z',
        windowEnd: '2026-01-16T10:35:45.123Z',
      });

      // The truncation is applied to windowStart for correlation key computation
      // Check that the keyFields trace shows the truncated window
      const keyFieldsStep = candidate.generationTrace.find(s => s.action === 'resolve_key_fields');
      expect(keyFieldsStep?.output).toMatch(/windowTruncated=2026-01-16T10:00:00/);
    });
  });

  describe('confidence scoring', () => {
    it('should have base confidence of MEDIUM', () => {
      const detection = createDetection({ severity: 'SEV4', confidence: 'LOW' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule({ confidenceBoost: undefined });

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.confidence).toBe('MEDIUM'); // Base 0.5
    });

    it('should boost for multiple detections', () => {
      const det1 = createDetection({ severity: 'SEV4' });
      const det2 = createDetection({ severity: 'SEV4' });
      const sig1 = createSignal({ normalizedSignalId: det1.normalizedSignalId });
      const sig2 = createSignal({ normalizedSignalId: det2.normalizedSignalId });
      const rule = createRule({ confidenceBoost: { multipleDetections: 0.2 } });

      const candidate = builder.build({
        detections: [det1, det2],
        graphs: [createGraph(det1.detectionId), createGraph(det2.detectionId)],
        signals: [sig1, sig2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.confidenceFactors.some(f => f.factor === 'multiple_detections')).toBe(true);
    });

    it('should boost for high severity', () => {
      const detection = createDetection({ severity: 'SEV1' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule({ confidenceBoost: { highSeverityRule: 0.3 } });

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.confidenceFactors.some(f => f.factor === 'high_severity_rule')).toBe(true);
    });
  });

  describe('blast radius', () => {
    it('should estimate SINGLE_SERVICE for one source', () => {
      const detection = createDetection();
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId, source: 'payment-service' });
      const rule = createRule();

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.blastRadius.scope).toBe('SINGLE_SERVICE');
    });

    it('should estimate MULTI_SERVICE for multiple sources', () => {
      const det1 = createDetection();
      const det2 = createDetection();
      const sig1 = createSignal({ normalizedSignalId: det1.normalizedSignalId, source: 'payment-service' });
      const sig2 = createSignal({ normalizedSignalId: det2.normalizedSignalId, source: 'order-service' });
      const rule = createRule();

      const candidate = builder.build({
        detections: [det1, det2],
        graphs: [createGraph(det1.detectionId), createGraph(det2.detectionId)],
        signals: [sig1, sig2],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.blastRadius.scope).toBe('MULTI_SERVICE');
    });

    it('should estimate CRITICAL impact for SEV1', () => {
      const detection = createDetection({ severity: 'SEV1' });
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule();

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      expect(candidate.blastRadius.estimatedImpact).toBe('CRITICAL');
    });
  });

  describe('generation trace', () => {
    it('should include all steps', () => {
      const detection = createDetection();
      const signal = createSignal({ normalizedSignalId: detection.normalizedSignalId });
      const rule = createRule();

      const candidate = builder.build({
        detections: [detection],
        graphs: [createGraph(detection.detectionId)],
        signals: [signal],
        rule,
        windowStart: '2026-01-16T10:00:00.000Z',
        windowEnd: '2026-01-16T11:00:00.000Z',
      });

      const actions = candidate.generationTrace.map(s => s.action);
      expect(actions).toContain('validate_inputs');
      expect(actions).toContain('truncate_window');
      expect(actions).toContain('select_primary_detection');
      expect(actions).toContain('resolve_key_fields');
      expect(actions).toContain('compute_correlation_key');
      expect(actions).toContain('compute_confidence');
      expect(actions).toContain('estimate_blast_radius');
      expect(actions).toContain('compute_candidate_id');
    });
  });
});
